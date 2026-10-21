<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import LoginView from './components/LoginView.vue'
import HomeView from './views/HomeView.vue'
import AlertCenter from './components/AlertCenter.vue'

// --- ESTADO DE AUTENTICACIÓN (IAM) ---
const usuarioActivo = ref(null)
const cargandoSesion = ref(true)

// --- ESTADO GLOBAL DE TELEMETRÍA E INCIDENTES ---
const conectado = ref(false)
const sensores = ref([])
const incidentes = ref([])
const lotes = ref([])
const lotesAfectados = ref([])
const metricas = ref({
  incidentesTotales: 0,
  incidentesActivos: 0,
  incidentesCerrados: 0,
  mttrMinutos: 0,
  lotesEnRevision: 0,
  usuariosPendientes: 0
})
const usuariosIAM = ref([])
const slaAcelerado = ref(true)

const rolEtiquetas = {
  DIRECTOR: 'Director del Laboratorio',
  SUPERVISOR: 'Supervisora de Calidad',
  TECNICO: 'Técnico de Turno',
  INVENTARIO: 'Gestora de Inventario'
}

let socket = null
let reconnectInterval = null

// Conexión en tiempo real por WebSocket
const conectarWebSocket = () => {
  if (socket && socket.readyState === 1) return

  socket = new WebSocket('ws://localhost:3000')

  socket.onopen = () => {
    conectado.value = true
    console.log('✅ WebSocket conectado a ColdChain Sentinel')
  }

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.tipo === 'ACTUALIZACION_COMPLETA') {
        sensores.value = data.sensores || []
        incidentes.value = data.incidentes || []
        lotes.value = data.lotes || []
        lotesAfectados.value = data.lotesAfectados || []
        metricas.value = data.metricas || metricas.value
        if (data.usuariosIAM) {
          usuariosIAM.value = data.usuariosIAM
        }
      }
    } catch (e) {
      console.error('Error parseando WebSocket:', e)
    }
  }

  socket.onclose = () => {
    conectado.value = false
  }

  socket.onerror = () => {
    conectado.value = false
    if (socket) socket.close()
  }
}

// Cargar usuarios IAM para la vista del Director
const recargarUsuariosIAM = async () => {
  const token = localStorage.getItem('coldchain_token')
  if (!token || !usuarioActivo.value || usuarioActivo.value.rol !== 'DIRECTOR') return

  try {
    const res = await fetch('http://localhost:3000/api/iam/usuarios', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    const data = await res.json()
    if (res.ok && data.usuarios) {
      usuariosIAM.value = data.usuarios
    }
  } catch (e) {
    console.error('Error cargando usuarios IAM:', e)
  }
}

// Verificar sesión JWT al iniciar la aplicación
const verificarSesion = async () => {
  const token = localStorage.getItem('coldchain_token')
  if (!token) {
    usuarioActivo.value = null
    cargandoSesion.value = false
    return
  }

  try {
    const res = await fetch('http://localhost:3000/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    const data = await res.json()

    if (res.ok && data.usuario) {
      usuarioActivo.value = data.usuario
      conectarWebSocket()
      if (data.usuario.rol === 'DIRECTOR') {
        recargarUsuariosIAM()
      }
    } else {
      cerrarSesion()
    }
  } catch (err) {
    console.error('Error validando token JWT:', err)
    // En caso de que el backend no responda temporalmente pero haya usuario en localStorage
    const saved = localStorage.getItem('coldchain_user')
    if (saved) {
      usuarioActivo.value = JSON.parse(saved)
    }
  } finally {
    cargandoSesion.value = false
  }
}

const handleLoginSuccess = (usuario) => {
  usuarioActivo.value = usuario
  conectarWebSocket()
  if (usuario.rol === 'DIRECTOR') {
    recargarUsuariosIAM()
  }
}

const cerrarSesion = () => {
  localStorage.removeItem('coldchain_token')
  localStorage.removeItem('coldchain_user')
  usuarioActivo.value = null
  if (socket) {
    socket.close()
  }
}

const toggleSlaVelocidad = async () => {
  const token = localStorage.getItem('coldchain_token')
  try {
    const res = await fetch('http://localhost:3000/api/config/sla-acelerado', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      // Fijamos explícitamente el estado deseado (evita desincronizaciones)
      body: JSON.stringify({ acelerado: !slaAcelerado.value })
    })
    const data = await res.json()
    slaAcelerado.value = data.aceleradoSLA
  } catch (e) {
    console.error(e)
  }
}

// Sincroniza el indicador de la interfaz con el estado real del backend (solo lectura)
const sincronizarSla = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/config/sla-acelerado')
    const data = await res.json()
    slaAcelerado.value = data.aceleradoSLA
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  verificarSesion()
  sincronizarSla()
  reconnectInterval = setInterval(() => {
    if (usuarioActivo.value && !conectado.value) {
      conectarWebSocket()
    }
  }, 4000)
})

onUnmounted(() => {
  if (reconnectInterval) clearInterval(reconnectInterval)
  if (socket) socket.close()
})

// Proveer dependencias y estados globales
provide('usuarioActivo', usuarioActivo)
provide('sensores', sensores)
provide('incidentes', incidentes)
provide('lotes', lotes)
provide('lotesAfectados', lotesAfectados)
provide('metricas', metricas)
provide('usuariosIAM', usuariosIAM)
provide('recargarUsuariosIAM', recargarUsuariosIAM)
provide('conectado', conectado)
</script>

<template>
  <!-- PANTALLA EXCLUSIVA DE LOGIN / REGISTRO SI NO ESTÁ AUTENTICADO -->
  <LoginView v-if="!usuarioActivo" @login-exitoso="handleLoginSuccess" />

  <!-- INTERFAZ PRINCIPAL DE LA PLATAFORMA PARA USUARIOS AUTENTICADOS -->
  <div v-else class="sentinel-layout">
    <!-- Header Corporativo -->
    <header class="top-nav">
      <div class="nav-left">
        <div class="brand">
          <span class="brand-icon">❄️</span>
          <div>
            <h1 class="brand-title">ColdChain Sentinel</h1>
            <p class="brand-subtitle">Monitoreo IoT y Cadena de Frío · Sala <code>room_911</code></p>
          </div>
        </div>
      </div>

      <div class="nav-right">
        <!-- Indicador de conexión en tiempo real -->
        <div class="status-indicator" :class="{ online: conectado, offline: !conectado }">
          <span class="dot"></span>
          <span>{{ conectado ? 'Telemetría en Vivo' : 'Reconectando IoT...' }}</span>
        </div>

        <!-- Modo SLA Demostración -->
        <button class="btn-demo-sla" @click="toggleSlaVelocidad" :title="'Velocidad SLA: ' + (slaAcelerado ? 'Acelerado 15s/30s' : 'Tiempo Real 5m/10m')">
          ⏱️ SLA: <strong>{{ slaAcelerado ? 'Demostración (15s/30s)' : 'Tiempo Real (5m/10m)' }}</strong>
        </button>

        <!-- Centro de Alertas en tiempo real (campana + toasts + sonido) -->
        <AlertCenter :incidentes="incidentes" :conectado="conectado" />

        <!-- Perfil del Usuario Autenticado (IAM) -->
        <div class="user-profile-badge">
          <span class="user-avatar">{{ usuarioActivo.avatar || '👤' }}</span>
          <div class="user-info">
            <span class="user-name">{{ usuarioActivo.nombre }} {{ usuarioActivo.apellido }}</span>
            <span class="role-tag" :class="usuarioActivo.rol.toLowerCase()">{{ rolEtiquetas[usuarioActivo.rol] || usuarioActivo.rol }}</span>
          </div>
        </div>

        <!-- Botón Cerrar Sesión -->
        <button class="btn-logout" @click="cerrarSesion" title="Cerrar Sesión Segura">
          🚪 Cerrar Sesión
        </button>
      </div>
    </header>

    <!-- Banner de Alerta Crítica Global (Protocolo de Emergencia Minuto 10) -->
    <div v-if="incidentes.some(i => i.protocoloEmergenciaActivo && i.estado !== 'Cerrado')" class="emergency-banner blink">
      ⚠️ <strong>¡ALERTA DE PROTOCOLO DE EMERGENCIA ACTIVADO (NIVEL 3)!</strong>
      Excursión térmica no acusada tras 10 minutos. Se ha notificado al Director del Laboratorio y se requiere intervención inmediata en sala <code>room_911</code>.
    </div>

    <!-- Contenedor Principal -->
    <main class="main-content">
      <HomeView />
    </main>

    <!-- Footer de Cumplimiento Normativo GxP -->
    <footer class="app-footer">
      <div>
        <span>ColdChain Sentinel v3.0</span> · <span>Cumplimiento Normativo GxP e ISO 13485</span> ·
        <span>Base de Datos: <strong>coldchain_sentinel (PostgreSQL)</strong></span> ·
        <span>Sala: <strong>room_911</strong></span>
      </div>
      <div>
        <span>Sesión activa: <strong>{{ usuarioActivo.email }}</strong> · Rol: <strong>{{ rolEtiquetas[usuarioActivo.rol] || usuarioActivo.rol }}</strong></span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.sentinel-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1.75rem;
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 50;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.brand-icon {
  font-size: 2rem;
  background: rgba(6, 182, 212, 0.15);
  border: 1px solid rgba(6, 182, 212, 0.4);
  padding: 0.3rem 0.5rem;
  border-radius: 8px;
}

.brand-title {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  background: linear-gradient(to right, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-subtitle {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.brand-subtitle code {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status-indicator.online {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-indicator.offline {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.status-indicator.online .dot {
  box-shadow: 0 0 8px #34d399;
}

.btn-demo-sla {
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-demo-sla:hover {
  background: #334155;
  border-color: #64748b;
}

.user-profile-badge {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 8px;
  padding: 0.3rem 0.75rem;
}

.user-avatar {
  font-size: 1.3rem;
}

.user-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.user-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: #f9fafb;
}

.role-tag {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
}

.role-tag.director { color: #f59e0b; }
.role-tag.supervisor { color: #38bdf8; }
.role-tag.tecnico { color: #34d399; }
.role-tag.inventario { color: #ec4899; }

.btn-logout {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: #ef4444;
  color: #ffffff;
}

.emergency-banner {
  background: #991b1b;
  color: #fef2f2;
  text-align: center;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  border-bottom: 2px solid #ef4444;
}

.main-content {
  flex: 1;
  padding: 1.5rem;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
}

.app-footer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  padding: 0.85rem 1.75rem;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-color);
  font-size: 0.75rem;
  color: var(--text-dim);
}
</style>
