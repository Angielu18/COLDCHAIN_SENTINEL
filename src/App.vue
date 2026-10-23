<script setup>
import LoginView from './components/LoginView.vue'
import HomeView from './views/HomeView.vue'
import AlertCenter from './components/AlertCenter.vue'
import { useApp } from './composables/useApp'

const {
  usuarioActivo,
  conectado,
  sensores,
  incidentes,
  slaAcelerado,
  rolEtiquetas,
  puedeVerAlertas,
  puedeConfigurarSla,
  handleLoginSuccess,
  cerrarSesion,
  toggleSlaVelocidad
} = useApp()

const inicialesUsuario = (usuario) => {
  const nombre = usuario?.nombre?.charAt(0) || ''
  const apellido = usuario?.apellido?.charAt(0) || ''
  return `${nombre}${apellido}`.toUpperCase()
}
</script>

<template>
  <LoginView v-if="!usuarioActivo" @login-exitoso="handleLoginSuccess" />

  <div v-else class="sentinel-layout">
    <header class="top-nav">
      <div class="nav-left">
        <div class="brand">
          <span class="brand-icon" aria-hidden="true">CC</span>
          <div>
            <h1 class="brand-title">ColdChain Sentinel</h1>
            <p class="brand-subtitle">Monitoreo IoT y Cadena de Frío · Sala <code>room_911</code></p>
          </div>
        </div>
      </div>

      <div class="nav-right">
        <div class="status-indicator" :class="{ online: conectado, offline: !conectado }">
          <span class="dot"></span>
          <span>{{ conectado ? 'Telemetría en Vivo' : 'Reconectando IoT...' }}</span>
        </div>

        <button
          v-if="puedeConfigurarSla"
          class="btn-demo-sla"
          @click="toggleSlaVelocidad"
          :title="'Velocidad SLA: ' + (slaAcelerado ? 'Acelerado 15s/30s' : 'Tiempo Real 5m/10m')"
        >
          SLA: <strong>{{ slaAcelerado ? 'Demostración (15s/30s)' : 'Tiempo Real (5m/10m)' }}</strong>
        </button>

        <AlertCenter
          v-if="puedeVerAlertas"
          :incidentes="incidentes"
          :sensores="sensores"
          :conectado="conectado"
        />

        <div class="user-profile-badge">
          <span class="user-avatar">{{ inicialesUsuario(usuarioActivo) }}</span>
          <div class="user-info">
            <span class="user-name">{{ usuarioActivo.nombre }} {{ usuarioActivo.apellido }}</span>
            <span class="role-tag" :class="usuarioActivo.rol.toLowerCase()">{{ rolEtiquetas[usuarioActivo.rol] || usuarioActivo.rol }}</span>
          </div>
        </div>

        <button class="btn-logout" @click="cerrarSesion" title="Cerrar Sesión Segura">Cerrar Sesión</button>
      </div>
    </header>

    <div v-if="incidentes.some(i => i.protocoloEmergenciaActivo && (i.estado || i.status) !== 'Cerrado' && (i.estado || i.status) !== 'Finalizo')" class="emergency-banner blink">
      <strong>¡ALERTA DE PROTOCOLO DE EMERGENCIA ACTIVADO (NIVEL 3)!</strong>
      Excursión térmica no acusada tras 10 minutos. Se ha notificado al Director del Laboratorio y se requiere intervención inmediata en sala <code>room_911</code>.
    </div>

    <main class="main-content">
      <HomeView />
    </main>

    <footer class="app-footer">
      <div>
        <span>ColdChain Sentinel v3.0</span> · <span>Cumplimiento Normativo GxP e ISO 13485</span> ·
        <span>Base de Datos: <strong>coldchain_sentinel2 (PostgreSQL)</strong></span> ·
        <span>Sala: <strong>room_911</strong></span>
      </div>
      <div>
        <span>Sesión activa: <strong>{{ usuarioActivo.email }}</strong> · Rol: <strong>{{ rolEtiquetas[usuarioActivo.rol] || usuarioActivo.rol }}</strong></span>
      </div>
    </footer>
  </div>
</template>

<style scoped src="src/assets/app.css"></style>
