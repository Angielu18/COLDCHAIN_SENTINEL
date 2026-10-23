<script setup>
defineProps({
  incidentes: { type: Array, default: () => [] }
})
defineEmits(['ack', 'close', 'history'])
</script>

<template>
  <div class="tab-panel">
    <div class="section-header">
      <div>
        <h2> Módulo 3: Motor de Alertas &amp; Escalamiento por SLA</h2>
        <p class="section-desc">Protocolo automatizado de escalamiento: Minuto 0 (Técnico), Minuto 5 (Supervisor), Minuto 10 (Director y Emergencia).</p>
      </div>
    </div>

    <div class="incidents-container">
      <h3> Incidentes Activos en Proceso ({{ incidentes.length }})</h3>

      <div v-if="incidentes.length === 0" class="empty-state">
        <span></span>
        <h4>Sin incidentes activos en sala room_911</h4>
        <p>Todos los sistemas operan bajo parámetros normales de 2.0°C a 8.0°C.</p>
      </div>

      <div v-for="inc in incidentes" :key="inc.id" class="incident-card" :class="{ 'incident-emergency': inc.protocoloEmergenciaActivo }">
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
             Acuse recibido por: <strong>{{ inc.acusadoPor }}</strong> el {{ new Date(inc.acusadoEn).toLocaleTimeString() }}
          </div>
        </div>

        <div class="incident-actions">
          <button v-if="inc.estado === 'Abierto'" class="btn-action btn-ack" @click="$emit('ack', inc.id)">
             Dar Acuse de Recibo (Detener SLA)
          </button>
          <button class="btn-action btn-close-inc" @click="$emit('close', inc)">
            Cerrar Incidente y Normalizar Equipo
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-title-row">
          <h3> Historial de Incidencias</h3>
          <button class="btn-secondary" @click="$emit('history')">Ver historial completo →</button>
        </div>
        <p class="card-desc">Consulta todas las incidencias registradas con filtros por texto, estado, nivel y fecha, y exporta solo la selección.</p>
      </div>
    </div>
  </div>
</template>
