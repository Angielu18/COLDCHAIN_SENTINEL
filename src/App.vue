<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { RouterView } from 'vue-router'

// --- Autenticación y RBAC ---
const usuarios = [
  { id: 1, name: 'Carlos Méndez', role: 'TECNICO', roleLabel: 'Técnico de Turno', avatar: '👨‍🔧' },
  { id: 2, name: 'Dra. Elena Ramos', role: 'SUPERVISOR', roleLabel: 'Supervisora de Calidad', avatar: '👩‍⚕️' },
  { id: 3, name: 'Dr. Roberto Silva', role: 'DIRECTOR', roleLabel: 'Director del Laboratorio', avatar: '👨‍💼' },
  { id: 4, name: 'Ana Gómez', role: 'INVENTARIO', roleLabel: 'Gestora de Inventario', avatar: '📦' }
]

const usuarioActivo = ref(usuarios[0])

// --- Estado Global de Telemetría e Incidentes ---
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
  lotesEnRevision: 0
})
const slaAcelerado = ref(true)

let socket = null
let reconnectInterval = null

const conectarWebSocket = () => {
  socket = new WebSocket('ws://localhost:3000')

  socket.onopen = () => {
    conectado.value = true
    console.log('✅ Conectado a ColdChain Sentinel WebSocket')
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
      }
    } catch (e) {
      console.error('Error parseando mensaje WebSocket:', e)
    }
  }

  socket.onclose = () => {
    conectado.value = false
    console.log('⚠️ WebSocket desconectado. Reintentando...')
  }

  socket.onerror = (err) => {
    conectado.value = false
    socket.close()
  }
}

const toggleSlaVelocidad = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/config/sla-acelerado', { method: 'POST' })
    const data = await res.json()
    slaAcelerado.value = data.aceleradoSLA
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  conectarWebSocket()
  reconnectInterval = setInterval(() => {
    if (!conectado.value) {
      conectarWebSocket()
    }
  }, 4000)
})

onUnmounted(() => {
  if (reconnectInterval) clearInterval(reconnectInterval)
  if (socket) socket.close()
})

// Proveer datos globales a las vistas hijas
provide('usuarioActivo', usuarioActivo)
provide('sensores', sensores)
provide('incidentes', incidentes)
provide('lotes', lotes)
provide('lotesAfectados', lotesAfectados)
provide('metricas', metricas)
provide('conectado', conectado)
</script>

<template>
  <div class="sentinel-layout">
    <!-- Header Corporativo y de Monitoreo -->
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

        <!-- Modo SLA Demo -->
        <button class="btn-demo-sla" @click="toggleSlaVelocidad" :title="'Velocidad SLA: ' + (slaAcelerado ? 'Acelerado 15s/30s' : 'Real 5m/10m')">
          ⏱️ SLA: <strong>{{ slaAcelerado ? 'Demo (15s/30s)' : 'Real (5m/10m)' }}</strong>
        </button>

        <!-- Selector de Rol RBAC (IAM) -->
        <div class="user-selector">
          <span class="role-badge">{{ usuarioActivo.avatar }} {{ usuarioActivo.roleLabel }}</span>
          <select v-model="usuarioActivo" class="select-role">
            <option v-for="u in usuarios" :key="u.id" :value="u">
              {{ u.avatar }} {{ u.name }} — {{ u.roleLabel }}
            </option>
          </select>
        </div>
      </div>
    </header>

    <!-- Banner de Alerta Crítica Global (si hay protocolo de emergencia activo) -->
    <div v-if="incidentes.some(i => i.protocoloEmergenciaActivo && i.estado !== 'Cerrado')" class="emergency-banner blink">
      ⚠️ <strong>¡ALERTA DE PROTOCOLO DE EMERGENCIA ACTIVADO (NIVEL 3)!</strong>
      Excursión térmica no acusada tras 10 minutos. Se ha notificado al Director del Laboratorio y se requiere intervención inmediata en sala <code>room_911</code>.
    </div>

    <!-- Contenedor Principal -->
    <main class="main-content">
      <RouterView />
    </main>

    <!-- Footer de Auditoría -->
    <footer class="app-footer">
      <div>
        <span>ColdChain Sentinel v2.4</span> · <span>ISO 13485 & GxP Compliance</span> ·
        <span>Base de Datos: <strong>coldchain_sentinel (PostgreSQL)</strong></span>
      </div>
      <div>
        <span>Usuario actual: <strong>{{ usuarioActivo.name }}</strong> ({{ usuarioActivo.role }})</span>
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

.user-selector {
  display: flex;
  align-items: center;
  position: relative;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 8px;
  padding: 0.2rem 0.5rem;
}

.role-badge {
  font-size: 0.8rem;
  margin-right: 0.4rem;
  font-weight: 500;
  color: #cbd5e1;
}

.select-role {
  background: transparent;
  color: white;
  border: none;
  font-size: 0.8rem;
  padding: 0.2rem;
  cursor: pointer;
  outline: none;
}

.select-role option {
  background: #1f2937;
  color: white;
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
