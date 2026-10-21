<script setup>
import { ref, inject, computed, watch, onMounted } from 'vue'
import HistoryCharts from '../components/HistoryCharts.vue'

// Inyección de estado global desde App.vue
const usuarioActivo = inject('usuarioActivo')
const sensores = inject('sensores')
const incidentes = inject('incidentes')
const lotes = inject('lotes')
const lotesAfectados = inject('lotesAfectados')
const metricas = inject('metricas')
const usuariosIAM = inject('usuariosIAM')
const recargarUsuariosIAM = inject('recargarUsuariosIAM')

const nombresRoles = {
  DIRECTOR: 'Director del Laboratorio',
  SUPERVISOR: 'Supervisora de Calidad',
  TECNICO: 'Técnico de Turno',
  INVENTARIO: 'Gestora de Inventario',
  PENDIENTE: 'Pendiente de Asignación'
}

// Definición canónica de módulos según Matriz RBAC
const MODULOS = [
  { 
    id: 'simulador', 
    nombre: '1. Simulador de Telemetría (IoT)', 
    shortLabel: 'Simulador IoT', 
    icon: '🧪', 
    roles: ['TECNICO', 'SUPERVISOR', 'INVENTARIO', 'DIRECTOR'],
    desc: 'Emisión de lecturas e inyección de fallos térmicos controlados.'
  },
  { 
    id: 'dashboard', 
    nombre: '2. Dashboard en Tiempo Real', 
    shortLabel: 'Dashboard en Vivo', 
    icon: '📡', 
    roles: ['TECNICO', 'SUPERVISOR', 'DIRECTOR'],
    desc: 'Visualización de sensores en sala room_911 con semáforo GxP.'
  },
  { 
    id: 'alertas', 
    nombre: '3. Motor de Alertas y SLA', 
    shortLabel: 'Alertas & SLA', 
    icon: '🚨', 
    roles: ['TECNICO', 'SUPERVISOR', 'INVENTARIO', 'DIRECTOR'],
    desc: 'Escalamiento temporal por minutos y gestión de incidentes.'
  },
  { 
    id: 'auditoria', 
    nombre: '4. Auditoría y Métricas', 
    shortLabel: 'Auditoría & Métricas', 
    icon: '📑', 
    roles: ['SUPERVISOR', 'DIRECTOR'],
    desc: 'Cálculo de MTTR y exportación de reportes médicos PDF/CSV.'
  },
  { 
    id: 'inventario', 
    nombre: '5. Gestión de Inventario', 
    shortLabel: 'Inventario & Lotes', 
    icon: '📦', 
    roles: ['INVENTARIO', 'DIRECTOR'],
    desc: 'CRUD de insumos y evaluación manual de lotes afectados con 2FA.'
  },
  { 
    id: 'iam', 
    nombre: '6. Gestión IAM (Permisos)', 
    shortLabel: 'Gestión IAM', 
    icon: '👥', 
    roles: ['DIRECTOR'],
    desc: 'Panel exclusivo del Director para aprobación y asignación de roles.'
  }
]

// Filtrado de pestañas accesibles según el rol del usuario.
// Tolerante a mayúsculas/minúsculas y a roles que lleguen vacíos:
// si el rol no coincide con ninguno conocido, se muestra el conjunto básico
// (Simulador y Motor de Alertas) para que la plataforma nunca quede bloqueada.
const modulosAccesibles = computed(() => {
  const rol = (usuarioActivo.value?.rol || '').toString().trim().toUpperCase()
  const accesibles = MODULOS.filter(m => m.roles.map(r => r.toUpperCase()).includes(rol))
  if (accesibles.length > 0) return accesibles
  // Fallback: módulos universales
  return MODULOS.filter(m => m.roles.includes('TECNICO'))
})

const tabActiva = ref('dashboard')

// Ajuste automático si el usuario cambia de rol o no tiene permiso en la pestaña actual
watch([usuarioActivo, modulosAccesibles], () => {
  if (modulosAccesibles.value.length > 0) {
    const tieneAcceso = modulosAccesibles.value.some(m => m.id === tabActiva.value)
    if (!tieneAcceso) {
      tabActiva.value = modulosAccesibles.value[0].id
    }
  }
}, { immediate: true })

// Helper de token JWT
const getAuthHeaders = () => {
  const token = localStorage.getItem('coldchain_token')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
}

// -----------------------------------------------------------------------------
// ESTADOS LOCALES, MODALES Y FORMULARIOS
// -----------------------------------------------------------------------------
const modalCerrar = ref({ visible: false, incidenteId: null, motivo: 'Falla en compresor por corte eléctrico', acciones: '' })
const modal2FA = ref({ 
  visible: false, 
  loteAfectadoId: null, 
  loteNumero: '', 
  productoNombre: '', 
  decision: 'APTO', 
  justificacion: '', 
  codigo2FA: '741258', 
  error: '' 
})
const modalNuevoMedicamento = ref({ visible: false, codigo: '', nombre: '', tipo: 'MEDICAMENTO', equipoId: 'SEN-01', tempOptima: '2°C a 8°C' })
const modalNuevoLote = ref({ visible: false, productoId: 1, numeroLote: '', cantidad: 1000, vencimiento: '2027-12-31', sensorId: 'SEN-01' })

// Formulario de lectura manual IoT
const telemetriaManual = ref({ sensorId: 'SEN-01', temp: 9.5, humedad: 65 })

// Filtro IAM
const filtroEstadoIAM = ref('TODOS') // 'TODOS' | 'PENDIENTE' | 'ACTIVO'
const rolSeleccionadoParaAprobar = ref({}) // map idUsuario -> rol

// Mapea los estados que devuelve PostgreSQL a las etiquetas que usa la interfaz.
// Backend: 'Acontece' (abierto) | 'En revisión' (acusado) | 'Finalizo' (cerrado)
const normalizarEstadoIncidente = (estado) => {
  const e = (estado || '').toString().toLowerCase()
  if (e === 'finalizo' || e === 'finalizado' || e === 'cerrado') return 'Cerrado'
  if (e === 'en revisión' || e === 'en revision') return 'En revisión'
  return 'Abierto'
}

// Computed
const incidentesActivos = computed(() =>
  incidentes.value
    .map(i => ({ ...i, estado: normalizarEstadoIncidente(i.estado) }))
    .filter(i => i.estado !== 'Cerrado')
)
const incidentesCerrados = computed(() =>
  incidentes.value
    .map(i => ({ ...i, estado: normalizarEstadoIncidente(i.estado) }))
    .filter(i => i.estado === 'Cerrado')
)
const lotesPendientes = computed(() => lotesAfectados.value.filter(l => l.decision === 'PENDIENTE_REVISION'))

const usuariosFiltradosIAM = computed(() => {
  if (!usuariosIAM.value) return []
  if (filtroEstadoIAM.value === 'TODOS') return usuariosIAM.value
  return usuariosIAM.value.filter(u => u.status === filtroEstadoIAM.value)
})

// =============================================================================
// MÓDULO 1: SIMULADOR DE TELEMETRÍA (IoT)
// =============================================================================
const inyectarFallo = async (sensorId, modoFallo) => {
  try {
    const res = await fetch('http://localhost:3000/api/anomalia', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ sensorId, modoFallo })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    // Normalizar cierra la anomalía por completo: se informa lo ocurrido.
    if (modoFallo === 'NORMALIZAR') {
      alert('✅ ' + (data.mensaje || 'Equipo normalizado. Incidentes cerrados y lotes liberados.'))
    }
  } catch (e) {
    alert('Error al inyectar escenario: ' + e.message)
  }
}

const enviarTelemetriaManual = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/telemetria/manual', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(telemetriaManual.value)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    alert(`Lectura transmitida con éxito: ${data.sensor.temp}°C hacia ${data.sensor.cuarto}`)
  } catch (e) {
    alert('Error enviando telemetría manual: ' + e.message)
  }
}

// =============================================================================
// MÓDULO 3: MOTOR DE ALERTAS Y SLA
// =============================================================================
const darAcuse = async (incidenteId) => {
  try {
    const res = await fetch(`http://localhost:3000/api/incidentes/${incidenteId}/acusar`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({})
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    alert(`✅ Acuse registrado. Los recordatorios automáticos del incidente ${incidenteId} fueron detenidos.`)
  } catch (e) {
    alert('Error al dar acuse de recibo: ' + e.message)
  }
}

const abrirModalCerrar = (incidente) => {
  modalCerrar.value = {
    visible: true,
    incidenteId: incidente.id,
    motivo: 'Falla mecánica del termostato / corte eléctrico',
    acciones: ''
  }
}

const confirmarCierreIncidente = async () => {
  if (!modalCerrar.value.motivo.trim()) {
    alert('Debe indicar el motivo de la falla (ej. "Falla eléctrica", "Puerta mal cerrada").')
    return
  }
  if (!modalCerrar.value.acciones.trim()) {
    alert('Debe registrar obligatoriamente las acciones correctivas aplicadas.')
    return
  }

  try {
    const res = await fetch(`http://localhost:3000/api/incidentes/${modalCerrar.value.incidenteId}/cerrar`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        motivo: modalCerrar.value.motivo,
        accionesCorrectivas: modalCerrar.value.acciones
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    modalCerrar.value.visible = false
    alert('✅ ' + (data.mensaje || `Incidente ${modalCerrar.value.incidenteId} cerrado y archivado en el historial.`))
  } catch (e) {
    alert('Error al cerrar incidente: ' + e.message)
  }
}

// =============================================================================
// MÓDULO 4: AUDITORÍA Y MÉTRICAS
// =============================================================================
const descargarCSV = async () => {
  const token = localStorage.getItem('coldchain_token')
  window.open(`http://localhost:3000/api/exportar/csv?token=${token}`, '_blank')
}

const imprimirReportePDF = () => {
  window.print()
}

// =============================================================================
// MÓDULO 5: GESTIÓN DE INVENTARIO Y 2FA
// =============================================================================
const abrirModal2FA = (loteAfectado, decision) => {
  if (!['SUPERVISOR', 'DIRECTOR'].includes(usuarioActivo.value.rol)) {
    alert(`⛔ Permiso Denegado: Tu rol es "${usuarioActivo.value.rol}". La disposición médica de lotes afectados con 2FA está restringida al Supervisor de Calidad o Director del Laboratorio.`)
    return
  }

  modal2FA.value = {
    visible: true,
    loteAfectadoId: loteAfectado.id,
    loteNumero: loteAfectado.numeroLote,
    productoNombre: loteAfectado.productoNombre,
    decision,
    justificacion: decision === 'APTO' 
      ? 'La excursión térmica acumulada no superó el límite de estabilidad de la monografía farmacéutica.' 
      : 'Degradación térmica irreversible confirmada. Se declara cuarentena para descarte biológico.',
    codigo2FA: '741258', // Código 2FA sugerido para pruebas rápidas
    error: ''
  }
}

const confirmarEvaluacion2FA = async () => {
  if (!modal2FA.value.codigo2FA || modal2FA.value.codigo2FA.length !== 6) {
    modal2FA.value.error = 'El código 2FA debe tener exactamente 6 dígitos numéricos.'
    return
  }

  try {
    const res = await fetch(`http://localhost:3000/api/lotes-afectados/${modal2FA.value.loteAfectadoId}/evaluar`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        decision: modal2FA.value.decision,
        justificacion: modal2FA.value.justificacion,
        codigo2FA: modal2FA.value.codigo2FA
      })
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    modal2FA.value.visible = false
  } catch (e) {
    modal2FA.value.error = e.message
  }
}

const guardarNuevoMedicamento = async () => {
  if (!modalNuevoMedicamento.value.codigo || !modalNuevoMedicamento.value.nombre) {
    alert('Ingrese código y nombre del insumo.')
    return
  }

  try {
    const res = await fetch('http://localhost:3000/api/inventario/medicamentos', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(modalNuevoMedicamento.value)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    modalNuevoMedicamento.value.visible = false
    modalNuevoMedicamento.value.codigo = ''
    modalNuevoMedicamento.value.nombre = ''
  } catch (e) {
    alert('Error al registrar medicamento: ' + e.message)
  }
}

const guardarNuevoLote = async () => {
  if (!modalNuevoLote.value.numeroLote) {
    alert('Ingrese el número de lote.')
    return
  }

  try {
    const res = await fetch('http://localhost:3000/api/inventario/lotes', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(modalNuevoLote.value)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    modalNuevoLote.value.visible = false
    modalNuevoLote.value.numeroLote = ''
  } catch (e) {
    alert('Error al registrar lote: ' + e.message)
  }
}

// =============================================================================
// MÓDULO 6: GESTIÓN IAM (PANEL EXCLUSIVO DEL DIRECTOR)
// =============================================================================
const aprobarUsuario = async (usuarioId) => {
  const rol = rolSeleccionadoParaAprobar.value[usuarioId] || 'TECNICO'
  try {
    const res = await fetch(`http://localhost:3000/api/iam/usuarios/${usuarioId}/aprobar`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ rol })
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    alert(data.mensaje)
    recargarUsuariosIAM()
  } catch (e) {
    alert('Error al aprobar usuario: ' + e.message)
  }
}

const cambiarEstadoUsuario = async (usuarioId, nuevoEstado) => {
  try {
    const res = await fetch(`http://localhost:3000/api/iam/usuarios/${usuarioId}/cambiar-estado`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: nuevoEstado })
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    recargarUsuariosIAM()
  } catch (e) {
    alert('Error al cambiar estado: ' + e.message)
  }
}
</script>

<template>
  <div class="dashboard-wrapper">
    <!-- BARRA SUPERIOR DE INDICADORES KPI -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-title">Sensores Monitoreados</span>
        <div class="kpi-value-row">
          <span class="kpi-value">{{ sensores.length }}</span>
          <span class="kpi-badge badge-green">2°C a 8°C</span>
        </div>
        <span class="kpi-sub">Sala room_911 Activa</span>
      </div>

      <div class="kpi-card" :class="{ 'kpi-card-danger': metricas.incidentesActivos > 0 }">
        <span class="kpi-title">Incidentes Activos</span>
        <div class="kpi-value-row">
          <span class="kpi-value" :class="{ 'text-danger': metricas.incidentesActivos > 0 }">
            {{ metricas.incidentesActivos }}
          </span>
          <span v-if="metricas.incidentesActivos > 0" class="kpi-badge badge-red pulse-critical">Alerta SLA</span>
          <span v-else class="kpi-badge badge-green">Sin Desviaciones</span>
        </div>
        <span class="kpi-sub">Total acumulado: {{ metricas.incidentesTotales }}</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">Tiempo Medio de Respuesta (MTTR)</span>
        <div class="kpi-value-row">
          <span class="kpi-value">{{ metricas.mttrMinutos }} <small style="font-size: 0.9rem; color: #9ca3af;">minutos</small></span>
          <span class="kpi-badge badge-blue">Objetivo &lt; 15 min</span>
        </div>
        <span class="kpi-sub">Basado en {{ metricas.incidentesCerrados }} resueltos</span>
      </div>

      <div class="kpi-card" :class="{ 'kpi-card-warning': metricas.lotesEnRevision > 0 }">
        <span class="kpi-title">Lotes en Revisión Técnica</span>
        <div class="kpi-value-row">
          <span class="kpi-value" :class="{ 'text-warning': metricas.lotesEnRevision > 0 }">
            {{ metricas.lotesEnRevision }}
          </span>
          <span v-if="metricas.lotesEnRevision > 0" class="kpi-badge badge-yellow">Evaluación 2FA</span>
          <span v-else class="kpi-badge badge-green">Lotes Aptos</span>
        </div>
        <span class="kpi-sub">Cadena de frío controlada</span>
      </div>

      <!-- Widget IAM para el Director -->
      <div v-if="usuarioActivo.rol === 'DIRECTOR'" class="kpi-card kpi-card-iam" :class="{ 'kpi-card-warning': metricas.usuariosPendientes > 0 }">
        <span class="kpi-title">Solicitudes IAM Pendientes</span>
        <div class="kpi-value-row">
          <span class="kpi-value" :class="{ 'text-warning': metricas.usuariosPendientes > 0 }">
            {{ metricas.usuariosPendientes || 0 }}
          </span>
          <span v-if="metricas.usuariosPendientes > 0" class="kpi-badge badge-yellow">Requiere Aprobación</span>
          <span v-else class="kpi-badge badge-green">Al día</span>
        </div>
        <span class="kpi-sub">Panel Director IAM</span>
      </div>
    </section>

    <!-- NAVEGACIÓN DINÁMICA ESTRICTAMENTE FILTRADA POR ROLES (RBAC) -->
    <nav class="tabs-nav">
      <button 
        v-for="m in modulosAccesibles" 
        :key="m.id"
        :class="{ active: tabActiva === m.id }" 
        @click="tabActiva = m.id"
      >
        <span>{{ m.icon }}</span>
        <span>{{ m.nombre }}</span>
        
        <!-- Badges reactivos según módulo -->
        <span v-if="m.id === 'alertas' && incidentesActivos.length > 0" class="counter-badge badge-red">
          {{ incidentesActivos.length }}
        </span>
        <span v-if="m.id === 'inventario' && lotesPendientes.length > 0" class="counter-badge badge-yellow">
          {{ lotesPendientes.length }}
        </span>
        <span v-if="m.id === 'iam' && metricas.usuariosPendientes > 0" class="counter-badge badge-yellow">
          {{ metricas.usuariosPendientes }}
        </span>
      </button>
    </nav>

    <!-- =======================================================================
         MÓDULO 1: SIMULADOR DE TELEMETRÍA (IoT) - ACCESO TODOS LOS ROLES
         ======================================================================= -->
    <div v-if="tabActiva === 'simulador'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>🧪 Módulo 1: Simulador de Telemetría IoT</h2>
          <p class="section-desc">Inyección controlada de fallos para validación de la Regla de Negocio 1 (3 lecturas consecutivas fuera de rango).</p>
        </div>
      </div>

      <div class="simulator-grid">
        <!-- Tarjeta de Escenarios Automatizados -->
        <div class="card sim-card">
          <h3>⚡ Inyección de Fallos Térmicos Rápidos</h3>
          <p class="card-desc">Seleccione un equipo para forzar una desviación de temperatura y evaluar la respuesta del motor de reglas.</p>
          
          <div class="sim-sensors-list">
            <div v-for="s in sensores" :key="s.id" class="sim-sensor-item">
              <div class="sim-sensor-info">
                <strong>{{ s.id }} · {{ s.cuarto }}</strong>
                <span class="subtext">Actual: <code>{{ s.temp }}°C</code> · {{ s.humedad }}% HR · Estado: <strong>{{ s.estado }}</strong></span>
              </div>
              <div class="sim-actions-row">
                <button class="btn-sim btn-warning" @click="inyectarFallo(s.id, 'AUMENTO_PAULATINO')" title="Incrementa +0.5°C por ciclo">
                  📈 Aumento Paulatino
                </button>
                <button class="btn-sim btn-danger" @click="inyectarFallo(s.id, 'APERTURA_PUERTA')" title="Sube a 14.2°C inmediato">
                  🚪 Apertura de Puerta
                </button>
                <button class="btn-sim btn-success" @click="inyectarFallo(s.id, 'NORMALIZAR')" title="Restaura a 4.5°C">
                  ✅ Normalizar (4.5°C)
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Emisión Manual Personalizada -->
        <div class="card sim-card">
          <h3>📡 Emisión Manual de Telemetría IoT</h3>
          <p class="card-desc">Transmita una lectura calibrada exacta para verificar el disparo de alertas tras 3 lecturas.</p>
          
          <form @submit.prevent="enviarTelemetriaManual" class="manual-form">
            <div class="form-group">
              <label>Equipo / Sensor Destino</label>
              <select v-model="telemetriaManual.sensorId" class="custom-select">
                <option v-for="s in sensores" :key="s.id" :value="s.id">{{ s.id }} — {{ s.cuarto }}</option>
              </select>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Temperatura (°C)</label>
                <input v-model.number="telemetriaManual.temp" type="number" step="0.1" required class="custom-input" />
                <span class="field-hint">Rango seguro: 2.0°C a 8.0°C</span>
              </div>
              <div class="form-group">
                <label>Humedad (% HR)</label>
                <input v-model.number="telemetriaManual.humedad" type="number" min="0" max="100" class="custom-input" />
              </div>
            </div>

            <button type="submit" class="btn-primary" style="margin-top: 1rem;">
              📤 Emitir Lectura IoT a Sala room_911
            </button>
          </form>

          <div class="info-box-rule">
            <strong>📋 Regla de Negocio 1:</strong> Se genera una alerta crítica de <em>Nivel 1</em> y se apertura un incidente cuando la temperatura se sale del rango de 2°C a 8°C durante <strong>3 lecturas consecutivas</strong>.
          </div>
        </div>
      </div>
    </div>

    <!-- =======================================================================
         MÓDULO 2: DASHBOARD EN TIEMPO REAL - TÉCNICO, SUPERVISOR, DIRECTOR
         ======================================================================= -->
    <div v-if="tabActiva === 'dashboard'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>📡 Módulo 2: Monitoreo en Tiempo Real (Telemetría IoT)</h2>
          <p class="section-desc">Monitoreo continuo de sala <code>room_911</code> mediante WebSockets con semáforo de estado GxP.</p>
        </div>
      </div>

      <!-- Cuadrícula de Sensores con Semáforo -->
      <div class="sensors-grid">
        <div 
          v-for="s in sensores" 
          :key="s.id" 
          class="sensor-card" 
          :class="{
            'card-normal': s.estado === 'Normal',
            'card-warning': s.estado === 'Advertencia',
            'card-critical': s.estado === 'Crítico'
          }"
        >
          <div class="sensor-card-header">
            <div>
              <span class="sensor-tag">{{ s.id }}</span>
              <h3 class="sensor-title">{{ s.cuarto }}</h3>
              <span class="sensor-type">{{ s.tipoEquipo }} · {{ s.ubicacion }}</span>
            </div>

            <!-- Semáforo de Estado -->
            <div class="traffic-light-badge" :class="s.estado.toLowerCase()">
              <span class="light-dot"></span>
              <span>{{ s.estado }}</span>
            </div>
          </div>

          <div class="sensor-readings">
            <div class="temp-display">
              <span class="temp-number">{{ s.temp }}</span>
              <span class="temp-unit">°C</span>
            </div>
            <div class="humidity-display">
              <span class="sub-label">Humedad Relativa:</span>
              <span class="sub-val">{{ s.humedad }}% HR</span>
            </div>
          </div>

          <div class="sensor-range-bar">
            <div class="range-labels">
              <span>Mín: {{ s.tempMin }}°C</span>
              <span class="ideal-range">Rango GxP: 2.0°C - 8.0°C</span>
              <span>Máx: {{ s.tempMax }}°C</span>
            </div>
            <div class="range-track">
              <div class="range-zone"></div>
              <div 
                class="current-indicator" 
                :style="{ left: Math.min(100, Math.max(0, ((s.temp - 0) / 16) * 100)) + '%' }"
              ></div>
            </div>
          </div>

          <div class="sensor-footer">
            <div v-if="s.lecturasFuera > 0" class="alert-counter-badge">
              ⚠️ Lecturas fuera de rango: <strong>{{ s.lecturasFuera }} / 3</strong>
            </div>
            <div v-else class="ok-status-badge">
              ✅ Dentro del estándar térmico
            </div>
          </div>
        </div>
      </div>

      <!-- Gráficas históricas de temperatura y humedad -->
      <HistoryCharts :sensores="sensores" />
    </div>

    <!-- =======================================================================
         MÓDULO 3: MOTOR DE ALERTAS Y SLA - ACCESO TODOS LOS ROLES
         ======================================================================= -->
    <div v-if="tabActiva === 'alertas'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>🚨 Módulo 3: Motor de Alertas & Escalamiento por SLA</h2>
          <p class="section-desc">Protocolo automatizado de escalamiento: Minuto 0 (Técnico), Minuto 5 (Supervisor), Minuto 10 (Director y Emergencia).</p>
        </div>
      </div>

      <!-- Incidentes Abiertos o en Atención -->
      <div class="incidents-container">
        <h3>⚠️ Incidentes Activos en Proceso ({{ incidentesActivos.length }})</h3>

        <div v-if="incidentesActivos.length === 0" class="empty-state">
          <span>🛡️</span>
          <h4>Sin incidentes activos en sala room_911</h4>
          <p>Todos los sistemas operan bajo parámetros normales de 2.0°C a 8.0°C.</p>
        </div>

        <div v-for="inc in incidentesActivos" :key="inc.id" class="incident-card" :class="{ 'incident-emergency': inc.protocoloEmergenciaActivo }">
          <div class="incident-header">
            <div class="incident-title-area">
              <span class="incident-id">{{ inc.id }}</span>
              <h4>{{ inc.cuarto }} ({{ inc.sensorId }})</h4>
              <span class="sla-level-badge" :class="inc.nivel.toLowerCase().replace(/[^a-z0-9]+/g, '-')">
                {{ inc.nivel }}
              </span>
            </div>
            <span class="status-pill" :class="inc.estado.toLowerCase().replace(/\s+/g, '-')">{{ inc.estado }}</span>
          </div>

          <div class="incident-sla-timeline">
            <div class="sla-step active">
              <span class="sla-dot"></span>
              <div class="sla-text">
                <strong>Minuto 0</strong>
                <span>Técnico de Turno</span>
              </div>
            </div>
            <div class="sla-step" :class="{ active: inc.nivel.includes('Nivel 2') || inc.nivel.includes('Emergencia') }">
              <span class="sla-dot"></span>
              <div class="sla-text">
                <strong>Minuto 5 (Sin acuse)</strong>
                <span>Supervisor de Calidad</span>
              </div>
            </div>
            <div class="sla-step" :class="{ active: inc.nivel.includes('Emergencia') }">
              <span class="sla-dot"></span>
              <div class="sla-text">
                <strong>Minuto 10 (Sin acuse)</strong>
                <span>Director / Protocolo Emergencia</span>
              </div>
            </div>
          </div>

          <div class="incident-body">
            <div class="incident-info-row">
              <div>
                <span class="label">Temperatura Registrada:</span>
                <span class="val text-danger"><strong>{{ inc.temperaturaCritica }}°C</strong> (Límite: 8.0°C)</span>
              </div>
              <div>
                <span class="label">Etapa SLA Actual:</span>
                <span class="val">{{ inc.etapaSLA }}</span>
              </div>
              <div>
                <span class="label">Destinatario Notificado:</span>
                <span class="val"><strong>{{ inc.destinatarioActual }}</strong></span>
              </div>
            </div>

            <div v-if="inc.acusadoPor" class="ack-info">
              ✅ Acuse recibido por: <strong>{{ inc.acusadoPor }}</strong> el {{ new Date(inc.acusadoEn).toLocaleTimeString() }}
            </div>
          </div>

          <div class="incident-actions">
            <button 
              v-if="inc.estado === 'Abierto'" 
              class="btn-action btn-ack" 
              @click="darAcuse(inc.id)"
            >
              ✋ Dar Acuse de Recibo (Detener SLA)
            </button>
            <button 
              class="btn-action btn-close-inc" 
              @click="abrirModalCerrar(inc)"
            >
              ✔️ Cerrar Incidente y Normalizar Equipo
            </button>
          </div>
        </div>

        <!-- Historial de Incidentes Resueltos -->
        <div class="closed-incidents-section">
          <h3>📁 Historial de Incidentes Resueltos ({{ incidentesCerrados.length }})</h3>
          
          <table v-if="incidentesCerrados.length > 0" class="custom-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Equipo</th>
                <th>Temp. Crítica</th>
                <th>Causa Raíz</th>
                <th>Acciones Correctivas</th>
                <th>Cerrado Por</th>
                <th>Fecha Cierre</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in incidentesCerrados" :key="c.id">
                <td><code>{{ c.id }}</code></td>
                <td>{{ c.cuarto }}</td>
                <td class="text-danger font-bold">{{ c.temperaturaCritica }}°C</td>
                <td>{{ c.motivo }}</td>
                <td>{{ c.accionesCorrectivas }}</td>
                <td>{{ c.cerradoPor }}</td>
                <td>{{ new Date(c.cerradoEn).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-muted">No hay incidentes archivados todavía.</p>
        </div>
      </div>
    </div>

    <!-- =======================================================================
         MÓDULO 4: AUDITORÍA Y MÉTRICAS - SUPERVISOR DE CALIDAD Y DIRECTOR
         ======================================================================= -->
    <div v-if="tabActiva === 'auditoria'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>📑 Módulo 4: Auditoría Médica & Métricas MTTR</h2>
          <p class="section-desc">Reportes de trazabilidad GxP, análisis de tiempo medio de resolución y exportación formal.</p>
        </div>
        <div class="header-buttons">
          <button class="btn-secondary" @click="descargarCSV">
            📥 Exportar Telemetría (CSV)
          </button>
          <button class="btn-primary" @click="imprimirReportePDF">
            🖨️ Imprimir / Exportar Reporte PDF
          </button>
        </div>
      </div>

      <!-- Cuadro de Métricas MTTR -->
      <div class="metrics-summary-grid">
        <div class="metric-box">
          <span class="m-label">Tiempo Medio de Respuesta (MTTR)</span>
          <span class="m-number">{{ metricas.mttrMinutos }} <small>minutos</small></span>
          <span class="m-status text-green">Cumplimiento GxP &lt; 15 min</span>
        </div>
        <div class="metric-box">
          <span class="m-label">Total de Incidentes Registrados</span>
          <span class="m-number">{{ metricas.incidentesTotales }}</span>
          <span class="m-status">{{ metricas.incidentesCerrados }} cerrados satisfactoriamente</span>
        </div>
        <div class="metric-box">
          <span class="m-label">Lotes Sometidos a Inspección 2FA</span>
          <span class="m-number">{{ lotesAfectados.length }}</span>
          <span class="m-status">{{ lotesAfectados.filter(l => l.decision !== 'PENDIENTE_REVISION').length }} dictaminados</span>
        </div>
      </div>

      <!-- Formato de Reporte Médico Imprimible -->
      <div class="printable-audit-report">
        <div class="report-header">
          <div>
            <h3>REPORTE OFICIAL DE TRAZABILIDAD Y CADENA DE FRÍO</h3>
            <p>Laboratorio Central · Sala <strong>room_911</strong> · Estándar GxP / ISO 13485</p>
          </div>
          <div class="report-meta">
            <span>Fecha de Emisión: <strong>{{ new Date().toLocaleDateString() }}</strong></span><br>
            <span>Auditor Responsable: <strong>{{ usuarioActivo.nombre }} {{ usuarioActivo.apellido }} ({{ usuarioActivo.rol }})</strong></span>
          </div>
        </div>

        <table class="custom-table" style="margin-top: 1.5rem;">
          <thead>
            <tr>
              <th>ID Sensor</th>
              <th>Cámara Frigorífica</th>
              <th>Rango Permitido</th>
              <th>Temperatura Actual</th>
              <th>Humedad Actual</th>
              <th>Estado GxP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sensores" :key="s.id">
              <td><code>{{ s.id }}</code></td>
              <td>{{ s.cuarto }}</td>
              <td>2.0°C a 8.0°C</td>
              <td><strong>{{ s.temp }}°C</strong></td>
              <td>{{ s.humedad }}% HR</td>
              <td>
                <span class="status-pill" :class="s.estado.toLowerCase()">{{ s.estado }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="report-signature-area">
          <div class="signature-box">
            <div class="signature-line"></div>
            <span>Firma Auditor / Supervisor de Calidad</span>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <span>Firma y Sello Director del Laboratorio</span>
          </div>
        </div>
      </div>
    </div>

    <!-- =======================================================================
         MÓDULO 5: GESTIÓN DE INVENTARIO - GESTOR DE INVENTARIO Y DIRECTOR
         ======================================================================= -->
    <div v-if="tabActiva === 'inventario'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>📦 Módulo 5: Gestión de Inventario & Disposición 2FA</h2>
          <p class="section-desc">Control estricto de medicamentos, lotes y evaluación manual obligatoria mediante 2FA.</p>
        </div>
        <div class="header-buttons">
          <button class="btn-secondary" @click="modalNuevoMedicamento.visible = true">
            ➕ Nuevo Medicamento
          </button>
          <button class="btn-primary" @click="modalNuevoLote.visible = true">
            ➕ Registrar Nuevo Lote
          </button>
        </div>
      </div>

      <!-- SECCIÓN CRÍTICA: LOTES POTENCIALMENTE AFECTADOS POR EXCURSIONES TÉRMICAS -->
      <div class="card affected-batches-card">
        <div class="card-title-row">
          <h3>⚠️ Lotes en Evaluación Técnica por Alerta Térmica</h3>
          <span class="badge-critical-notice">Regla Crítica: Disposición Manual Obligatoria con 2FA</span>
        </div>
        <p class="card-desc">
          Al generarse una alerta en un sensor, todos los lotes guardados en ese equipo pasan a estado <code>PENDIENTE_REVISION</code>.
          Ningún lote se dispone automáticamente.
        </p>

        <table v-if="lotesAfectados.length > 0" class="custom-table" style="margin-top: 1rem;">
          <thead>
            <tr>
              <th>ID Afectación</th>
              <th>N° Lote</th>
              <th>Medicamento / Insumo</th>
              <th>Cantidad</th>
              <th>Ubicación</th>
              <th>Estado Revisión</th>
              <th>Disposición / Justificación</th>
              <th>Acción 2FA</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="la in lotesAfectados" :key="la.id">
              <td><code>{{ la.id }}</code></td>
              <td><strong>{{ la.numeroLote }}</strong></td>
              <td>{{ la.productoNombre }}</td>
              <td>{{ la.cantidad.toLocaleString() }} ampollas</td>
              <td>{{ la.ubicacion }}</td>
              <td>
                <span class="status-pill" :class="la.decision.toLowerCase().replace('_', '-')">
                  {{ la.decision }}
                </span>
              </td>
              <td>
                <span v-if="la.justificacion">{{ la.justificacion }} <br><small>Por: {{ la.decididoPor }}</small></span>
                <span v-else class="text-muted">Pendiente de evaluación técnica</span>
              </td>
              <td>
                <div v-if="la.decision === 'PENDIENTE_REVISION'" class="action-buttons-cell">
                  <button class="btn-small btn-success" @click="abrirModal2FA(la, 'APTO')">
                    ✔️ Declarar APTO (2FA)
                  </button>
                  <button class="btn-small btn-danger" @click="abrirModal2FA(la, 'NO_APTO')">
                    ❌ Descartar (2FA)
                  </button>
                </div>
                <span v-else class="text-green font-bold">✅ Dictamen Completado</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-muted" style="margin-top: 1rem;">No hay lotes con reporte de excursión térmica pendiente de evaluación.</p>
      </div>

      <!-- INVENTARIO GENERAL DE LOTES VIGENTES -->
      <div class="card" style="margin-top: 1.5rem;">
        <h3>📋 Inventario General de Lotes en Almacenamiento</h3>
        <table class="custom-table" style="margin-top: 1rem;">
          <thead>
            <tr>
              <th>Código Insumo</th>
              <th>Medicamento</th>
              <th>Número de Lote</th>
              <th>Cantidad</th>
              <th>Vencimiento</th>
              <th>Ubicación</th>
              <th>Estado del Lote</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lotes" :key="l.id">
              <td><code>{{ l.codigo }}</code></td>
              <td>{{ l.productoNombre }}</td>
              <td><strong>{{ l.numeroLote }}</strong></td>
              <td>{{ l.cantidad.toLocaleString() }}</td>
              <td>{{ l.vencimiento }}</td>
              <td>{{ l.ubicacion }}</td>
              <td>
                <span class="status-pill" :class="l.estado.toLowerCase().replace(/\s+/g, '-')">
                  {{ l.estado }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- =======================================================================
         MÓDULO 6: GESTIÓN IAM (PERMISOS) - EXCLUSIVO DEL DIRECTOR DEL LABORATORIO
         ======================================================================= -->
    <div v-if="tabActiva === 'iam'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>👥 Módulo 6: Gestión de Identidad y Acceso (IAM)</h2>
          <p class="section-desc">Panel exclusivo del <strong>Director del Laboratorio</strong> para aprobación de cuentas y asignación de roles.</p>
        </div>

        <!-- Filtro por Estado -->
        <div class="iam-filter-group">
          <label>Filtrar por estado:</label>
          <div class="filter-buttons">
            <button 
              :class="{ active: filtroEstadoIAM === 'TODOS' }" 
              @click="filtroEstadoIAM = 'TODOS'"
            >
              Todos ({{ usuariosIAM.length }})
            </button>
            <button 
              :class="{ active: filtroEstadoIAM === 'PENDIENTE' }" 
              @click="filtroEstadoIAM = 'PENDIENTE'"
              class="btn-badge-yellow"
            >
              ⏳ Pendientes de Aprobación ({{ usuariosIAM.filter(u => u.status === 'PENDIENTE').length }})
            </button>
            <button 
              :class="{ active: filtroEstadoIAM === 'ACTIVO' }" 
              @click="filtroEstadoIAM = 'ACTIVO'"
            >
              Activos ({{ usuariosIAM.filter(u => u.status === 'ACTIVO').length }})
            </button>
          </div>
        </div>
      </div>

      <!-- Tabla de Usuarios Registrados -->
      <div class="card">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Correo Electrónico</th>
              <th>Teléfono</th>
              <th>Fecha Registro</th>
              <th>Estado IAM</th>
              <th>Rol Asignado</th>
              <th>Aprobación / Gestión Director</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in usuariosFiltradosIAM" :key="u.id" :class="{ 'row-pending': u.status === 'PENDIENTE' }">
              <td>
                <div class="user-cell">
                  <span class="user-avatar">{{ u.avatar || '👤' }}</span>
                  <div>
                    <strong>{{ u.nombre }} {{ u.apellido }}</strong>
                    <span v-if="u.id === usuarioActivo.id" class="badge-you">(Tú / Sesión Actual)</span>
                  </div>
                </div>
              </td>
              <td><code>{{ u.email }}</code></td>
              <td>{{ u.telefono || 'No registrado' }}</td>
              <td>{{ new Date(u.creadoEn).toLocaleDateString() }}</td>
              <td>
                <span class="status-pill" :class="u.status.toLowerCase()">
                  {{ u.status === 'PENDIENTE' ? 'PENDIENTE DE APROBACIÓN' : u.status }}
                </span>
              </td>
              <td>
                <span v-if="u.status === 'ACTIVO'" class="role-chip">{{ nombresRoles[u.rol] || u.rol }}</span>
                <span v-else class="text-muted font-italic">Sin rol asignado</span>
              </td>
              <td>
                <!-- Si el usuario está pendiente: Selector de Rol + Botón Aprobar -->
                <div v-if="u.status === 'PENDIENTE'" class="approval-action-box">
                  <select v-model="rolSeleccionadoParaAprobar[u.id]" class="select-role-inline">
                    <option disabled value="">Seleccionar Rol...</option>
                    <option value="TECNICO">👨‍🔧 TÉCNICO DE TURNO</option>
                    <option value="SUPERVISOR">👩‍⚕️ SUPERVISOR DE CALIDAD</option>
                    <option value="INVENTARIO">📦 GESTOR DE INVENTARIO</option>
                    <option value="DIRECTOR">👨‍💼 DIRECTOR DEL LABORATORIO</option>
                  </select>
                  <button class="btn-small btn-primary" @click="aprobarUsuario(u.id)">
                    ✅ Aprobar Acceso
                  </button>
                </div>

                <!-- Si el usuario ya está activo: Posibilidad de cambiar estado -->
                <div v-else-if="u.id !== usuarioActivo.id" class="manage-action-box">
                  <button 
                    v-if="u.status === 'ACTIVO'" 
                    class="btn-small btn-warning" 
                    @click="cambiarEstadoUsuario(u.id, 'INACTIVO')"
                  >
                    Suspender
                  </button>
                  <button 
                    v-else 
                    class="btn-small btn-success" 
                    @click="cambiarEstadoUsuario(u.id, 'ACTIVO')"
                  >
                    Reactivar
                  </button>
                </div>
                <span v-else class="text-muted">Director Principal</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- =======================================================================
         MODALES DE OPERACIÓN
         ======================================================================= -->

    <!-- MODAL 1: Cierre de Incidente (Causa Raíz & Acciones Correctivas) -->
    <div v-if="modalCerrar.visible" class="modal-overlay">
      <div class="modal-card">
        <h3>✔️ Cierre de Incidente Crítico</h3>
        <p class="modal-subtitle">Registro obligatorio de causa raíz y mitigación técnica para cumplimiento GxP.</p>

        <div class="form-group" style="margin-top: 1rem;">
          <label>Causa Raíz Identificada</label>
          <input v-model="modalCerrar.motivo" type="text" class="custom-input" required />
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>Acciones Correctivas y Preventivas (CAPA)</label>
          <textarea v-model="modalCerrar.acciones" rows="3" class="custom-textarea" placeholder="Ej. Cambio de termostato y verificación de sellado magnético..." required></textarea>
        </div>

        <div class="modal-buttons">
          <button class="btn-secondary" @click="modalCerrar.visible = false">Cancelar</button>
          <button class="btn-primary" @click="confirmarCierreIncidente">Confirmar Cierre y Normalizar Sensor</button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: Evaluación 2FA de Lote Afectado -->
    <div v-if="modal2FA.visible" class="modal-overlay">
      <div class="modal-card">
        <div class="modal-title-2fa">
          <span>🔐</span>
          <h3>Autenticación 2FA: Disposición Médica de Lote</h3>
        </div>
        <p class="modal-subtitle">
          Disposición final de <strong>{{ modal2FA.loteNumero }}</strong> ({{ modal2FA.productoNombre }}) como 
          <strong :class="modal2FA.decision === 'APTO' ? 'text-green' : 'text-danger'">{{ modal2FA.decision }}</strong>.
        </p>

        <div v-if="modal2FA.error" class="alert alert-danger" style="margin-top: 1rem;">
          ⚠️ {{ modal2FA.error }}
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>Justificación Médica / Técnica (Mínimo 10 carácteres)</label>
          <textarea v-model="modal2FA.justificacion" rows="3" class="custom-textarea" required></textarea>
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>Código de Seguridad 2FA (6 Dígitos TOTP)</label>
          <input 
            v-model="modal2FA.codigo2FA" 
            type="text" 
            maxlength="6" 
            class="custom-input input-2fa" 
            placeholder="741258" 
            required 
          />
          <span class="field-hint">Código de prueba sugerido para demostración: <code>741258</code></span>
        </div>

        <div class="modal-buttons">
          <button class="btn-secondary" @click="modal2FA.visible = false">Cancelar</button>
          <button 
            class="btn-primary" 
            :class="modal2FA.decision === 'APTO' ? 'btn-success' : 'btn-danger'" 
            @click="confirmarEvaluacion2FA"
          >
            Confirmar Disposición con 2FA
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL 3: Nuevo Medicamento -->
    <div v-if="modalNuevoMedicamento.visible" class="modal-overlay">
      <div class="modal-card">
        <h3>➕ Registrar Medicamento / Insumo Médico</h3>
        
        <div class="form-group" style="margin-top: 1rem;">
          <label>Código Único</label>
          <input v-model="modalNuevoMedicamento.codigo" type="text" placeholder="Ej. MED-VAC-005" class="custom-input" required />
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>Nombre del Medicamento</label>
          <input v-model="modalNuevoMedicamento.nombre" type="text" placeholder="Ej. Suero Antiofídico Polivalente" class="custom-input" required />
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>Equipo / Nevera Asignada</label>
          <select v-model="modalNuevoMedicamento.equipoId" class="custom-select">
            <option v-for="s in sensores" :key="s.id" :value="s.id">{{ s.id }} — {{ s.cuarto }}</option>
          </select>
        </div>

        <div class="modal-buttons">
          <button class="btn-secondary" @click="modalNuevoMedicamento.visible = false">Cancelar</button>
          <button class="btn-primary" @click="guardarNuevoMedicamento">Guardar Medicamento</button>
        </div>
      </div>
    </div>

    <!-- MODAL 4: Nuevo Lote -->
    <div v-if="modalNuevoLote.visible" class="modal-overlay">
      <div class="modal-card">
        <h3>➕ Registrar Nuevo Lote de Medicamento</h3>
        
        <div class="form-group" style="margin-top: 1rem;">
          <label>Medicamento</label>
          <select v-model="modalNuevoLote.productoId" class="custom-select">
            <option :value="1">Vacuna mRNA COVID-19</option>
            <option :value="2">Insulina Glargina 100 UI/ml</option>
            <option :value="3">Anticuerpos Monoclonales</option>
            <option :value="4">Vacuna Hepatitis B</option>
          </select>
        </div>

        <div class="form-row" style="margin-top: 1rem;">
          <div class="form-group">
            <label>Número de Lote</label>
            <input v-model="modalNuevoLote.numeroLote" type="text" placeholder="LOT-2026-X99" class="custom-input" required />
          </div>
          <div class="form-group">
            <label>Cantidad (Unidades)</label>
            <input v-model.number="modalNuevoLote.cantidad" type="number" class="custom-input" required />
          </div>
        </div>

        <div class="form-row" style="margin-top: 1rem;">
          <div class="form-group">
            <label>Fecha de Vencimiento</label>
            <input v-model="modalNuevoLote.vencimiento" type="date" class="custom-input" required />
          </div>
          <div class="form-group">
            <label>Ubicación / Equipo</label>
            <select v-model="modalNuevoLote.sensorId" class="custom-select">
              <option v-for="s in sensores" :key="s.id" :value="s.id">{{ s.cuarto }}</option>
            </select>
          </div>
        </div>

        <div class="modal-buttons">
          <button class="btn-secondary" @click="modalNuevoLote.visible = false">Cancelar</button>
          <button class="btn-primary" @click="guardarNuevoLote">Registrar Lote</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* KPI GRID */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.kpi-card {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: transform 0.2s, border-color 0.2s;
}

.kpi-card:hover {
  transform: translateY(-2px);
  border-color: #4b5563;
}

.kpi-card-danger {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.kpi-card-warning {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
}

.kpi-card-iam {
  border-left: 4px solid #38bdf8;
}

.kpi-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kpi-value-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.kpi-value {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}

.kpi-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  text-transform: uppercase;
}

.badge-green {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.badge-blue {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.badge-yellow {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.badge-red {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.kpi-sub {
  font-size: 0.75rem;
  color: #6b7280;
}

/* TABS DE NAVEGACIÓN RBAC */
.tabs-nav {
  display: flex;
  gap: 0.5rem;
  background: #111827;
  padding: 0.4rem;
  border: 1px solid #374151;
  border-radius: 10px;
  overflow-x: auto;
}

.tabs-nav button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1.1rem;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #9ca3af;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.tabs-nav button:hover {
  background: #1f2937;
  color: #ffffff;
}

.tabs-nav button.active {
  background: #0284c7;
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
}

.counter-badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.45rem;
  border-radius: 10px;
  font-weight: 700;
}

/* TAB PANEL & HEADERS */
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
}

.section-header h2 {
  font-size: 1.35rem;
  font-weight: 700;
  color: #f9fafb;
}

.section-desc {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-top: 0.2rem;
}

.header-buttons {
  display: flex;
  gap: 0.75rem;
}

/* CARDS GENERALES */
.card {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 1.5rem;
}

.card h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #f9fafb;
}

.card-desc {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-top: 0.25rem;
  margin-bottom: 1rem;
}

/* SIMULATOR GRID */
.simulator-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 1.5rem;
}

.sim-sensors-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.sim-sensor-item {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sim-sensor-info strong {
  color: #f9fafb;
  font-size: 0.95rem;
}

.sim-sensor-info .subtext {
  display: block;
  font-size: 0.8rem;
  color: #9ca3af;
  margin-top: 0.2rem;
}

.sim-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.btn-sim {
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sim.btn-warning {
  background: rgba(245, 158, 11, 0.15);
  border-color: #f59e0b;
  color: #fbbf24;
}

.btn-sim.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #fca5a5;
}

.btn-sim.btn-success {
  background: rgba(16, 185, 129, 0.15);
  border-color: #10b981;
  color: #6ee7b7;
}

.btn-sim:hover {
  filter: brightness(1.2);
}

.info-box-rule {
  margin-top: 1.5rem;
  background: rgba(2, 132, 199, 0.1);
  border: 1px solid rgba(2, 132, 199, 0.3);
  padding: 0.85rem;
  border-radius: 8px;
  font-size: 0.8rem;
  color: #bae6fd;
  line-height: 1.4;
}

/* SENSORS GRID & TRAFFIC LIGHT (MÓDULO 2) */
.sensors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.sensor-card {
  background: #111827;
  border: 2px solid #374151;
  border-radius: 14px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  transition: all 0.3s;
}

.sensor-card.card-normal {
  border-color: rgba(16, 185, 129, 0.5);
}

.sensor-card.card-warning {
  border-color: #f59e0b;
  box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
}

.sensor-card.card-critical {
  border-color: #ef4444;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
}

.sensor-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.sensor-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: #38bdf8;
  text-transform: uppercase;
}

.sensor-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #f9fafb;
}

.sensor-type {
  font-size: 0.75rem;
  color: #9ca3af;
}

.traffic-light-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.traffic-light-badge.normal {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.traffic-light-badge.advertencia {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.traffic-light-badge.crítico {
  background: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.light-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.sensor-readings {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 1rem 0;
  border-top: 1px solid #1f2937;
  border-bottom: 1px solid #1f2937;
}

.temp-display {
  display: flex;
  align-items: baseline;
}

.temp-number {
  font-size: 3rem;
  font-weight: 900;
  letter-spacing: -0.04em;
  color: #ffffff;
}

.temp-unit {
  font-size: 1.5rem;
  color: #9ca3af;
  margin-left: 0.2rem;
}

.humidity-display {
  text-align: right;
}

.humidity-display .sub-label {
  display: block;
  font-size: 0.75rem;
  color: #9ca3af;
}

.humidity-display .sub-val {
  font-size: 1.25rem;
  font-weight: 700;
  color: #60a5fa;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: #6b7280;
  margin-bottom: 0.3rem;
}

.ideal-range {
  color: #34d399;
  font-weight: 600;
}

.range-track {
  height: 8px;
  background: #1f2937;
  border-radius: 4px;
  position: relative;
  overflow: visible;
}

.range-zone {
  position: absolute;
  left: 12.5%;
  width: 37.5%;
  height: 100%;
  background: rgba(16, 185, 129, 0.4);
  border-radius: 4px;
}

.current-indicator {
  position: absolute;
  top: -4px;
  width: 16px;
  height: 16px;
  background: #ffffff;
  border: 2px solid #0284c7;
  border-radius: 50%;
  transform: translateX(-50%);
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.5);
}

.sensor-footer {
  font-size: 0.8rem;
}

.alert-counter-badge {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  font-weight: 600;
}

.ok-status-badge {
  color: #34d399;
  font-size: 0.8rem;
}

/* INCIDENTS & SLA (MÓDULO 3) */
.incidents-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1.5rem;
  background: #111827;
  border: 1px dashed #374151;
  border-radius: 12px;
}

.empty-state span {
  font-size: 3rem;
}

.empty-state h4 {
  font-size: 1.15rem;
  margin-top: 0.5rem;
  color: #f9fafb;
}

.empty-state p {
  font-size: 0.85rem;
  color: #9ca3af;
}

.incident-card {
  background: #111827;
  border: 1px solid #ef4444;
  border-left: 6px solid #ef4444;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.incident-emergency {
  background: rgba(239, 68, 68, 0.1);
  border-color: #dc2626;
  box-shadow: 0 0 25px rgba(220, 38, 38, 0.35);
}

.incident-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.incident-title-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.incident-id {
  background: #1f2937;
  color: #38bdf8;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
}

.sla-level-badge {
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}

.sla-level-badge.nivel-1 {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.sla-level-badge.nivel-2 {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.sla-level-badge.nivel-3-emergencia,
.sla-level-badge.nivel-3 {
  background: #dc2626;
  color: #ffffff;
}

.incident-sla-timeline {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
  background: #1f2937;
  padding: 1rem;
  border-radius: 8px;
}

.sla-step {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  opacity: 0.4;
  transition: opacity 0.3s;
}

.sla-step.active {
  opacity: 1;
}

.sla-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #0284c7;
}

.sla-step.active .sla-dot {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
}

.sla-text strong {
  display: block;
  font-size: 0.8rem;
  color: #ffffff;
}

.sla-text span {
  font-size: 0.7rem;
  color: #9ca3af;
}

.incident-info-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  font-size: 0.85rem;
}

.incident-info-row .label {
  display: block;
  color: #9ca3af;
  font-size: 0.75rem;
}

.incident-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn-action {
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-ack {
  background: #f59e0b;
  color: #111827;
}

.btn-close-inc {
  background: #10b981;
  color: #ffffff;
}

/* INVENTORY & 2FA (MÓDULO 5) */
.affected-batches-card {
  border-left: 6px solid #f59e0b;
}

.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.badge-critical-notice {
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.action-buttons-cell {
  display: flex;
  gap: 0.5rem;
}

.btn-small {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-small:hover {
  opacity: 0.85;
}

/* IAM (MÓDULO 6) */
.iam-filter-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.filter-buttons {
  display: flex;
  gap: 0.4rem;
  background: #1f2937;
  padding: 0.25rem;
  border-radius: 8px;
}

.filter-buttons button {
  background: transparent;
  border: none;
  color: #9ca3af;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.filter-buttons button.active {
  background: #0284c7;
  color: #ffffff;
}

.btn-badge-yellow.active {
  background: #d97706 !important;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.user-avatar {
  font-size: 1.4rem;
}

.badge-you {
  font-size: 0.7rem;
  background: #374151;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  margin-left: 0.3rem;
}

.role-chip {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}

.row-pending {
  background: rgba(245, 158, 11, 0.05);
}

.approval-action-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.select-role-inline {
  background: #1f2937;
  border: 1px solid #4b5563;
  color: #ffffff;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  outline: none;
}

/* AUDITORÍA & REPORTES */
.metrics-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.metric-box {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.m-label {
  font-size: 0.75rem;
  color: #9ca3af;
  text-transform: uppercase;
}

.m-number {
  font-size: 1.85rem;
  font-weight: 800;
  color: #ffffff;
}

.m-status {
  font-size: 0.75rem;
  color: #6b7280;
}

.printable-audit-report {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 2rem;
  margin-top: 1.5rem;
}

.report-header {
  display: flex;
  justify-content: space-between;
  border-bottom: 2px solid #374151;
  padding-bottom: 1rem;
}

.report-meta {
  font-size: 0.8rem;
  color: #9ca3af;
  text-align: right;
}

.report-signature-area {
  display: flex;
  justify-content: space-around;
  margin-top: 3.5rem;
  padding-top: 1rem;
}

.signature-box {
  text-align: center;
  width: 250px;
}

.signature-line {
  border-top: 1px solid #9ca3af;
  margin-bottom: 0.5rem;
}

.signature-box span {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* TABLAS COMUNES */
.custom-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  text-align: left;
}

.custom-table th {
  background: #1f2937;
  color: #cbd5e1;
  padding: 0.75rem 1rem;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  border-bottom: 1px solid #374151;
}

.custom-table td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #1f2937;
  color: #e2e8f0;
}

.custom-table tr:hover {
  background: rgba(31, 41, 55, 0.5);
}

.status-pill {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: 20px;
  text-transform: uppercase;
}

.status-pill.abierto { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.status-pill.en-atención { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.status-pill.cerrado { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.status-pill.vigente { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.status-pill.en-revisión { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.status-pill.pendiente-revision { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.status-pill.apto { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.status-pill.no-apto { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.status-pill.activo { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.status-pill.pendiente { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.status-pill.inactivo { background: rgba(107, 114, 128, 0.2); color: #9ca3af; }

/* MODALES */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modal-card {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 14px;
  padding: 2rem;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
}

.modal-card h3 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #f9fafb;
}

.modal-title-2fa {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.5rem;
}

.modal-subtitle {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

.modal-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.75rem;
}

.input-2fa {
  font-size: 1.5rem !important;
  font-family: var(--font-mono);
  letter-spacing: 0.3em;
  text-align: center;
  font-weight: 800;
  color: #38bdf8 !important;
}

/* FORM ELEMENTS */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #cbd5e1;
  text-transform: uppercase;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.custom-input, .custom-select, .custom-textarea {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 0.65rem 0.85rem;
  color: #f9fafb;
  font-size: 0.9rem;
  outline: none;
}

.custom-input:focus, .custom-select:focus, .custom-textarea:focus {
  border-color: #38bdf8;
}

.field-hint {
  font-size: 0.75rem;
  color: #9ca3af;
}

.field-hint code {
  color: #38bdf8;
}

.btn-primary {
  background: #0284c7;
  color: #ffffff;
  border: none;
  padding: 0.65rem 1.25rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-secondary {
  background: #374151;
  color: #ffffff;
  border: none;
  padding: 0.65rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-success { background: #059669; color: #ffffff; }
.btn-danger { background: #dc2626; color: #ffffff; }
.btn-warning { background: #d97706; color: #ffffff; }

.text-danger { color: #f87171 !important; }
.text-warning { color: #fbbf24 !important; }
.text-green { color: #34d399 !important; }
.font-bold { font-weight: 700; }
.font-italic { font-style: italic; }
</style>
