<script setup>
import HistoryCharts from '../HistoryCharts.vue'

defineProps({
  sensores: { type: Array, default: () => [] },
  metricas: { type: Object, required: true },
  incidentesActivos: { type: Array, default: () => [] },
  lotesPendientes: { type: Array, default: () => [] },
  usuariosSuspendidos: { type: Array, default: () => [] },
  usuario: { type: Object, required: true },
  resumenModulos: { type: Array, default: () => [] }
})
defineEmits(['select'])
</script>

<template>
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
        <span class="kpi-value">{{ metricas.mttrMinutos }} <small style="font-size: 0.9rem; color: #D9D2C5;">minutos</small></span>
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

    <div v-if="usuario.rol === 'DIRECTOR'" class="kpi-card kpi-card-iam" :class="{ 'kpi-card-warning': usuariosSuspendidos.length > 0 }">
      <span class="kpi-title">Cuentas Suspendidas</span>
      <div class="kpi-value-row">
        <span class="kpi-value" :class="{ 'text-warning': usuariosSuspendidos.length > 0 }">
          {{ usuariosSuspendidos.length }}
        </span>
        <span v-if="usuariosSuspendidos.length > 0" class="kpi-badge badge-yellow">Revisar IAM</span>
        <span v-else class="kpi-badge badge-green">Al día</span>
      </div>
      <span class="kpi-sub">Panel Director IAM</span>
    </div>
  </section>

  <section class="module-summary">
    <div class="section-header">
      <div>
        <h2>Panel Principal</h2>
        <p class="section-desc">Resumen del estado de la cadena de frío y acceso rápido al resto de módulos.</p>
      </div>
    </div>

    <div class="module-summary-grid">
      <button
        v-for="t in resumenModulos"
        :key="t.id"
        type="button"
        class="summary-card"
        @click="$emit('select', t.id)"
      >
        <span class="summary-body">
          <strong>{{ t.titulo }}</strong>
          <span class="summary-value">{{ t.valor }}</span>
          <span class="summary-detail">{{ t.detalle }}</span>
        </span>
        <span class="summary-arrow">→</span>
      </button>
    </div>
  </section>

  <div class="tab-panel">
    <div class="section-header">
      <div>
        <h2>Monitoreo en Tiempo Real (Telemetría IoT)</h2>
        <p class="section-desc">Monitoreo continuo de sala <code>room_911</code> mediante WebSockets con semáforo de estado GxP.</p>
      </div>
    </div>

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
            Lecturas fuera de rango: <strong>{{ s.lecturasFuera }} / 3</strong>
          </div>
          <div v-else class="ok-status-badge">
            Dentro del estándar térmico
          </div>
        </div>
      </div>
    </div>

    <HistoryCharts :sensores="sensores" />
  </div>
</template>
