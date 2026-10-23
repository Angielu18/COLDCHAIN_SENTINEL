<script setup>
import { useHistoryCharts } from '../composables/useHistoryCharts'

defineProps({
  sensores: { type: Array, default: () => [] }
})

const { canvasRef, cargando, error, metrica, rangoHoras, cambiarMetrica, cambiarRango } = useHistoryCharts()
</script>

<template>
  <div class="card charts-card fade-in-up">
    <div class="charts-header">
      <div>
        <h3>Historial de Telemetría</h3>
        <p class="card-desc">Evolución temporal de temperatura y humedad por equipo (sala room_911).</p>
      </div>
      <div class="charts-controls">
        <div class="toggle-group">
          <button :class="{ active: metrica === 'temp' }" @click="cambiarMetrica('temp')">Temperatura</button>
          <button :class="{ active: metrica === 'humedad' }" @click="cambiarMetrica('humedad')">Humedad</button>
        </div>
        <div class="toggle-group">
          <button :class="{ active: rangoHoras === 1 }" @click="cambiarRango(1)">1h</button>
          <button :class="{ active: rangoHoras === 2 }" @click="cambiarRango(2)">2h</button>
          <button :class="{ active: rangoHoras === 6 }" @click="cambiarRango(6)">6h</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="charts-error">{{ error }}</div>

    <div class="chart-container">
      <canvas ref="canvasRef"></canvas>
      <div v-if="cargando" class="chart-overlay">Cargando historial...</div>
    </div>

    <div class="charts-legend-note">
      <span>Se actualiza automáticamente cada 10 segundos</span>
      <span>Datos persistidos en <code>coldchain_sentinel2</code></span>
    </div>
  </div>
</template>

<style scoped src="src/assets/charts.css"></style>
