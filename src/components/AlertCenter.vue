<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  incidentes: { type: Array, default: () => [] },
  conectado: { type: Boolean, default: false }
})

// --- Lista de alertas mostradas (campana) ---
const alertas = ref([])
const panelAbierto = ref(false)
const sonidoActivo = ref(true)

// IDs de incidentes ya conocidos para detectar los nuevos
const incidentesConocidos = ref(new Set())
let inicializado = false

// --- Motor de audio (alarma insistente) ---
let audioCtx = null
let bucleAlarma = null          // setInterval maestro de la alarma
const alarmaSonando = ref(false) // reactivo: controla banner y animaciones
let finAlarma = 0               // timestamp hasta el que debe sonar la alarma activa

// Crea/reanuda el contexto de audio. Los navegadores bloquean el audio hasta
// que el usuario interactúa con la página; reanudamos en cuanto haya un clic.
const obtenerContexto = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    return audioCtx
  } catch {
    return null
  }
}

// Un "pulso" de alarma: dos tonos agudos alternados y estridentes (tipo sirena)
const pulsoSirena = (frecAlta = 1200, frecBaja = 900, volumen = 0.5) => {
  const ctx = obtenerContexto()
  if (!ctx) return
  const ahora = ctx.currentTime

  const emitir = (frec, inicio, dur) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    // Onda tipo "diente de sierra" = mucho más molesta que la senoidal
    osc.type = 'square'
    osc.frequency.setValueAtTime(frec, ahora + inicio)
    gain.gain.setValueAtTime(0.0001, ahora + inicio)
    gain.gain.exponentialRampToValueAtTime(volumen, ahora + inicio + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ahora + inicio + dur)
    osc.start(ahora + inicio)
    osc.stop(ahora + inicio + dur + 0.02)
  }

  emitir(frecAlta, 0, 0.16)
  emitir(frecBaja, 0.18, 0.16)
}

// Silencia por completo la alarma en curso
const detenerAlarma = () => {
  if (bucleAlarma) {
    clearInterval(bucleAlarma)
    bucleAlarma = null
  }
  alarmaSonando.value = false
}

// Lanza una alarma INSISTENTE que se repite hasta que el usuario la atienda.
// `duracionMs` = cuánto dura la ráfaga; el usuario puede detenerla antes
// abriendo el panel o silenciando con el botón.
const lanzarAlarma = (nivel) => {
  if (!sonidoActivo.value) return
  detenerAlarma()

  const emergencia = nivel && nivel.includes('Emergencia')
  const nivel2 = nivel && nivel.includes('Nivel 2')

  // Parámetros según gravedad: más agudo, más fuerte y más seguido = más molesto
  const frecAlta = emergencia ? 1500 : nivel2 ? 1250 : 1050
  const frecBaja = emergencia ? 1050 : nivel2 ? 900 : 750
  const volumen = emergencia ? 0.6 : nivel2 ? 0.5 : 0.4
  const intervalo = emergencia ? 380 : nivel2 ? 520 : 700 // ms entre pulsos
  const duracion = emergencia ? 14000 : nivel2 ? 10000 : 7000 // ms de ráfaga

  finAlarma = Date.now() + duracion
  alarmaSonando.value = true

  const disparar = () => {
    if (!alarmaSonando.value || !sonidoActivo.value || Date.now() > finAlarma) {
      detenerAlarma()
      return
    }
    pulsoSirena(frecAlta, frecBaja, volumen)
  }

  disparar() // suena de inmediato
  bucleAlarma = setInterval(disparar, intervalo)
}

const agregarAlerta = (incidente, tipoCambio) => {
  const nivel = incidente.nivel || 'Nivel 1'
  let mensaje = ''
  let tipo = 'info'

  if (tipoCambio === 'nuevo') {
    mensaje = `Excursión térmica detectada en ${incidente.cuarto || incidente.sensorId} (${incidente.temperaturaCritica}°C)`
    tipo = nivel.includes('Emergencia') ? 'danger' : 'warning'
  } else if (tipoCambio === 'escalado') {
    mensaje = `Escalamiento ${nivel}: ${incidente.cuarto || incidente.sensorId} → ${incidente.destinatarioActual}`
    tipo = nivel.includes('Emergencia') ? 'danger' : 'warning'
  } else if (tipoCambio === 'cerrado') {
    mensaje = `Incidente ${incidente.id} cerrado por ${incidente.cerradoPor || 'el equipo'}`
    tipo = 'success'
  }

  const alerta = {
    id: `${incidente.id}-${tipoCambio}-${Date.now()}`,
    incidenteId: incidente.id,
    nivel,
    mensaje,
    tipo,
    hora: new Date().toLocaleTimeString('es-CO'),
    leida: false
  }

  alertas.value.unshift(alerta)
  if (alertas.value.length > 30) alertas.value.pop()

  // Alarma insistente ante incidentes/escalamientos (no al cerrar)
  if (tipoCambio !== 'cerrado') lanzarAlarma(nivel)

  // Auto-ocultar los toasts después de unos segundos
  setTimeout(() => {
    alertas.value = alertas.value.filter(a => a.id !== alerta.id)
  }, tipoCambio === 'cerrado' ? 4000 : 12000)
}

// Estados que significan que el incidente ya NO requiere alarma
const estaAtendido = (inc) => {
  const e = (inc.estado || '').toString().toLowerCase()
  return e === 'finalizo' || e === 'finalizado' || e === 'cerrado' || e === 'en revisión' || e === 'en revision'
}

// Detecta cambios comparando con el estado anterior
watch(() => props.incidentes, (nuevos) => {
  if (!Array.isArray(nuevos)) return

  if (!inicializado) {
    // Primera carga: solo registra los existentes, sin disparar sonido
    nuevos.forEach(i => {
      incidentesConocidos.value.add(`${i.id}:${i.nivel}`)
      incidentesConocidos.value.add(`ack:${i.id}:${estaAtendido(i) ? '1' : '0'}`)
    })
    inicializado = true
    return
  }

  // ¿Quedó algún incidente SIN atender? Si no, la alarma debe callar.
  const hayPendientes = nuevos.some(i => !estaAtendido(i))

  nuevos.forEach(inc => {
    const claveNivel = `${inc.id}:${inc.nivel}`
    const claveAck = `ack:${inc.id}:${estaAtendido(inc) ? '1' : '0'}`

    if (estaAtendido(inc)) {
      // El incidente fue acusado o cerrado: se registra para no repetir
      incidentesConocidos.value.add(inc.id)
      incidentesConocidos.value.add(claveNivel)
      incidentesConocidos.value.add(claveAck)
      return
    }

    if (!incidentesConocidos.value.has(inc.id) && !incidentesConocidos.value.has(claveNivel)) {
      // Incidente nuevo
      incidentesConocidos.value.add(inc.id)
      incidentesConocidos.value.add(claveNivel)
      incidentesConocidos.value.add(claveAck)
      agregarAlerta(inc, 'nuevo')
    } else if (!incidentesConocidos.value.has(claveNivel)) {
      // Mismo incidente con nivel cambiado => escalamiento
      incidentesConocidos.value.add(claveNivel)
      incidentesConocidos.value.add(claveAck)
      agregarAlerta(inc, 'escalado')
    }
  })

  // Si ya no hay incidentes pendientes, se detiene cualquier alarma en curso
  // y se descartan los avisos flotantes asociados a incidentes atendidos.
  if (!hayPendientes) {
    detenerAlarma()
  }
}, { deep: true })

const alertasNoLeidas = computed(() => alertas.value.filter(a => !a.leida).length)

const abrirPanel = () => {
  panelAbierto.value = !panelAbierto.value
  if (panelAbierto.value) {
    alertas.value.forEach(a => (a.leida = true))
    detenerAlarma() // el usuario está atendiendo la alerta
  }
}

const eliminarAlerta = (id) => {
  alertas.value = alertas.value.filter(a => a.id !== id)
}

const limpiarTodo = () => {
  alertas.value = []
  detenerAlarma()
}

const toggleSonido = () => {
  sonidoActivo.value = !sonidoActivo.value
  if (sonidoActivo.value) {
    obtenerContexto()
    pulsoSirena(1000, 800, 0.3)
  } else {
    detenerAlarma()
  }
}

// Probar la alarma manualmente (útil para demostrar el sonido)
const probarAlarma = () => {
  obtenerContexto()
  lanzarAlarma('Nivel 3 (Emergencia)')
}

// Cerrar panel al hacer clic fuera
const contenedor = ref(null)
const manejarClicFuera = (e) => {
  if (contenedor.value && !contenedor.value.contains(e.target)) {
    panelAbierto.value = false
  }
}

// Reanuda el audio en la primera interacción del usuario (requisito del navegador)
const desbloquearAudio = () => {
  if (sonidoActivo.value) obtenerContexto()
}

onMounted(() => {
  document.addEventListener('click', manejarClicFuera)
  document.addEventListener('click', desbloquearAudio, { once: true })
  document.addEventListener('keydown', desbloquearAudio, { once: true })
})
onUnmounted(() => {
  document.removeEventListener('click', manejarClicFuera)
  document.removeEventListener('click', desbloquearAudio)
  document.removeEventListener('keydown', desbloquearAudio)
  detenerAlarma()
  if (audioCtx) { try { audioCtx.close() } catch {} }
})
</script>

<template>
  <div class="notif-wrapper" ref="contenedor">
    <!-- BANNER PARPADEANTE DE ALARMA ACTIVA -->
    <transition name="panel">
      <div v-if="alarmaSonando" class="banner-alarma" @click="detenerAlarma">
        <span class="banner-icono">🚨</span>
        <span class="banner-texto">ALARMA ACTIVA — clic para silenciar</span>
      </div>
    </transition>

    <!-- BOTÓN CAMPANA -->
    <button
      class="btn-campana"
      :class="{ 'tiene-alertas': alertasNoLeidas > 0, 'campana-sonando': alarmaSonando }"
      @click="abrirPanel"
      :title="alertasNoLeidas > 0 ? `${alertasNoLeidas} alertas nuevas` : 'Centro de alertas'"
    >
      🔔
      <span v-if="alertasNoLeidas > 0" class="badge-contador">{{ alertasNoLeidas }}</span>
    </button>

    <!-- PANEL DESPLEGABLE -->
    <transition name="panel">
      <div v-if="panelAbierto" class="panel-alertas">
        <div class="panel-header">
          <div>
            <strong>Centro de Alertas</strong>
            <span class="panel-sub">Monitoreo en tiempo real</span>
          </div>
          <div class="panel-acciones">
            <button class="btn-mini" @click="probarAlarma" title="Probar sonido de alarma">🔔</button>
            <button class="btn-mini" @click="toggleSonido" :title="sonidoActivo ? 'Silenciar' : 'Activar sonido'">
              {{ sonidoActivo ? '🔊' : '🔇' }}
            </button>
            <button class="btn-mini" @click="limpiarTodo" title="Limpiar todo">🗑️</button>
          </div>
        </div>

        <div class="panel-body">
          <div v-if="alertas.length === 0" class="panel-vacio">
            <span class="vacio-icon">{{ conectado ? '🛡️' : '📡' }}</span>
            <p v-if="conectado">Sin alertas. Todos los equipos en rango seguro.</p>
            <p v-else>Reconectando con el servidor de telemetría...</p>
          </div>

          <div
            v-for="a in alertas"
            :key="a.id"
            class="alerta-item"
            :class="`alerta-${a.tipo}`"
          >
            <span class="alerta-icono">
              {{ a.tipo === 'danger' ? '🚨' : a.tipo === 'warning' ? '⚠️' : a.tipo === 'success' ? '✅' : 'ℹ️' }}
            </span>
            <div class="alerta-contenido">
              <span class="alerta-nivel">{{ a.nivel }}</span>
              <span class="alerta-mensaje">{{ a.mensaje }}</span>
              <span class="alerta-hora">{{ a.hora }}</span>
            </div>
            <button class="alerta-cerrar" @click="eliminarAlerta(a.id)">×</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- TOASTS FLOTANTES (esquina inferior derecha) -->
    <div class="toasts-container">
      <transition-group name="toast">
        <div
          v-for="a in alertas.filter(x => x.tipo === 'danger' || x.tipo === 'warning')"
          :key="a.id"
          class="toast"
          :class="`toast-${a.tipo}`"
        >
          <span class="toast-icono">{{ a.tipo === 'danger' ? '🚨' : '⚠️' }}</span>
          <div class="toast-texto">
            <strong>{{ a.nivel }}</strong>
            <span>{{ a.mensaje }}</span>
          </div>
          <button class="toast-cerrar" @click="eliminarAlerta(a.id)">×</button>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<style scoped>
.notif-wrapper {
  position: relative;
}

/* Banner parpadeante de alarma activa */
.banner-alarma {
  position: fixed;
  top: 74px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--color-danger);
  color: #fff;
  border-radius: var(--radius-md);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
  z-index: 400;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  animation: alarma-parpadeo 0.7s infinite, alarma-pulso 1.4s infinite;
}
.banner-icono { font-size: 1.1rem; }

@keyframes alarma-parpadeo {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@keyframes alarma-pulso {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
  70% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

.btn-campana.campana-sonando {
  animation: campana-shake 0.5s infinite;
  border-color: var(--color-danger);
  box-shadow: var(--shadow-glow-danger);
}
@keyframes campana-shake {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(-14deg); }
  40% { transform: rotate(12deg); }
  60% { transform: rotate(-8deg); }
  80% { transform: rotate(6deg); }
}

.btn-campana {
  position: relative;
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  font-size: 1.15rem;
  cursor: pointer;
  transition: all var(--transition-base);
}
.btn-campana:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent-cyan);
  transform: translateY(-1px);
}
.btn-campana.tiene-alertas {
  border-color: var(--color-danger);
  box-shadow: var(--shadow-glow-danger);
}

.badge-contador {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--color-danger);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 800;
  min-width: 18px;
  height: 18px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  animation: soft-pulse 1.5s infinite;
}

.panel-alertas {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 360px;
  max-height: 460px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1rem;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}
.panel-header strong { font-size: 0.9rem; }
.panel-sub {
  display: block;
  font-size: 0.7rem;
  color: var(--text-dim);
}
.panel-acciones { display: flex; gap: 0.35rem; }
.btn-mini {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.2rem 0.45rem;
  font-size: 0.85rem;
  transition: all var(--transition-fast);
}
.btn-mini:hover { background: var(--bg-card-hover); color: var(--text-main); }

.panel-body {
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.panel-vacio {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--text-dim);
}
.vacio-icon { font-size: 2rem; display: block; margin-bottom: 0.5rem; }
.panel-vacio p { font-size: 0.8rem; }

.alerta-item {
  display: flex;
  gap: 0.6rem;
  padding: 0.6rem 0.7rem;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--border-light);
  background: var(--bg-surface);
  animation: fade-in-up 0.3s both;
}
.alerta-danger { border-left-color: var(--color-danger); background: rgba(239, 68, 68, 0.08); }
.alerta-warning { border-left-color: var(--color-warning); background: rgba(245, 158, 11, 0.08); }
.alerta-success { border-left-color: var(--color-normal); background: rgba(16, 185, 129, 0.08); }

.alerta-icono { font-size: 1.1rem; }
.alerta-contenido { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
.alerta-nivel {
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.alerta-mensaje { font-size: 0.8rem; color: var(--text-main); line-height: 1.35; }
.alerta-hora { font-size: 0.65rem; color: var(--text-dim); font-family: var(--font-mono); }
.alerta-cerrar {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  align-self: flex-start;
}
.alerta-cerrar:hover { color: var(--text-main); }

/* Toasts */
.toasts-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  z-index: 300;
  max-width: 380px;
}
.toast {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  border: 1px solid transparent;
  backdrop-filter: blur(6px);
}
.toast-danger {
  background: rgba(153, 27, 27, 0.95);
  border-color: var(--color-danger);
  color: #fef2f2;
}
.toast-warning {
  background: rgba(120, 53, 15, 0.95);
  border-color: var(--color-warning);
  color: #fffbeb;
}
.toast-icono { font-size: 1.2rem; }
.toast-texto { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
.toast-texto strong { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
.toast-texto span { font-size: 0.82rem; line-height: 1.35; }
.toast-cerrar {
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}
.toast-cerrar:hover { opacity: 1; }

/* Transiciones */
.panel-enter-active, .panel-leave-active { transition: all var(--transition-base); }
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateY(-10px); }

.toast-enter-active { animation: slide-in-right 0.35s ease both; }
.toast-leave-active { animation: slide-out-right 0.3s ease both; }

@media (max-width: 640px) {
  .panel-alertas { width: 92vw; right: -60px; }
  .toasts-container { left: 1rem; right: 1rem; max-width: none; }
}
</style>
