<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const props = defineProps({
  sensores: { type: Array, default: () => [] }
})

const canvasRef = ref(null)
const cargando = ref(true)
const error = ref('')
const metrica = ref('temp') // 'temp' | 'humedad'
const rangoHoras = ref(2)
let chart = null
let intervaloRecarga = null

const COLORES = ['#22d3ee', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444']

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('coldchain_token')}`
})

// Carga las lecturas históricas desde el backend
const cargarDatos = async () => {
  try {
    const res = await fetch(
      `http://localhost:3000/api/lecturas/historico?limite=300`,
      { headers: getAuthHeaders() }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error cargando historial')
    return data.lecturas || []
  } catch (e) {
    error.value = e.message
    return []
  }
}

// Agrupa las lecturas por sensor en series temporales
const construirSeries = (lecturas) => {
  const porSensor = {}
  lecturas.forEach(l => {
    if (!porSensor[l.sensorId]) porSensor[l.sensorId] = []
    porSensor[l.sensorId].push(l)
  })
  return porSensor
}

const renderizar = async () => {
  cargando.value = true
  error.value = ''
  const lecturas = await cargarDatos()

  const ahora = Date.now()
  const desde = ahora - rangoHoras.value * 60 * 60 * 1000
  const filtradas = lecturas.filter(l => new Date(l.timestamp).getTime() >= desde)

  const series = construirSeries(filtradas)
  const etiquetas = [...new Set(filtradas.map(l => new Date(l.timestamp).toLocaleTimeString('es-CO')))]

  // Construye un dataset por sensor
  const datasets = Object.keys(series).map((sensorId, idx) => {
    const puntos = series[sensorId]
    // Mapa hora -> valor
    const mapa = {}
    puntos.forEach(p => {
      const key = new Date(p.timestamp).toLocaleTimeString('es-CO')
      mapa[key] = metrica.value === 'temp' ? Number(p.temp) : Number(p.humedad)
    })
    return {
      label: sensorId,
      data: etiquetas.map(e => (mapa[e] !== undefined ? mapa[e] : null)),
      borderColor: COLORES[idx % COLORES.length],
      backgroundColor: COLORES[idx % COLORES.length] + '22',
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 5,
      spanGaps: true,
      fill: true
    }
  })

  await nextTick()

  if (chart) {
    chart.data.labels = etiquetas
    chart.data.datasets = datasets
    chart.update('none')
  } else if (canvasRef.value) {
    chart = new Chart(canvasRef.value, {
      type: 'line',
      data: { labels: etiquetas, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true, boxWidth: 8 }
          },
          tooltip: {
            backgroundColor: 'rgba(14, 21, 34, 0.95)',
            borderColor: '#263349',
            borderWidth: 1,
            titleColor: '#f1f5f9',
            bodyColor: '#cbd5e1',
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}${metrica.value === 'temp' ? '°C' : '% HR'}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#64748b', maxTicksLimit: 8, font: { family: 'JetBrains Mono', size: 10 } },
            grid: { color: 'rgba(38, 51, 73, 0.5)' }
          },
          y: {
            ticks: {
              color: '#64748b',
              font: { family: 'JetBrains Mono', size: 10 },
              callback: (v) => `${v}${metrica.value === 'temp' ? '°C' : '%'}`
            },
            grid: { color: 'rgba(38, 51, 73, 0.5)' }
          }
        }
      }
    })
  }

  cargando.value = false
}

const cambiarMetrica = (m) => {
  metrica.value = m
  renderizar()
}

const cambiarRango = (h) => {
  rangoHoras.value = h
  renderizar()
}

onMounted(() => {
  renderizar()
  // Refresca el gráfico cada 10 segundos
  intervaloRecarga = setInterval(renderizar, 10000)
})

onUnmounted(() => {
  if (intervaloRecarga) clearInterval(intervaloRecarga)
  if (chart) chart.destroy()
})
</script>

<template>
  <div class="card charts-card fade-in-up">
    <div class="charts-header">
      <div>
        <h3>📈 Historial de Telemetría</h3>
        <p class="card-desc">Evolución temporal de temperatura y humedad por equipo (sala room_911).</p>
      </div>
      <div class="charts-controls">
        <div class="toggle-group">
          <button :class="{ active: metrica === 'temp' }" @click="cambiarMetrica('temp')">🌡️ Temperatura</button>
          <button :class="{ active: metrica === 'humedad' }" @click="cambiarMetrica('humedad')">💧 Humedad</button>
        </div>
        <div class="toggle-group">
          <button :class="{ active: rangoHoras === 1 }" @click="cambiarRango(1)">1h</button>
          <button :class="{ active: rangoHoras === 2 }" @click="cambiarRango(2)">2h</button>
          <button :class="{ active: rangoHoras === 6 }" @click="cambiarRango(6)">6h</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="charts-error">⚠️ {{ error }}</div>

    <div class="chart-container">
      <canvas ref="canvasRef"></canvas>
      <div v-if="cargando" class="chart-overlay">Cargando historial...</div>
    </div>

    <div class="charts-legend-note">
      <span>🔄 Se actualiza automáticamente cada 10 segundos</span>
      <span>📊 Datos persistidos en <code>coldchain_sentinel2</code></span>
    </div>
  </div>
</template>

<style scoped>
.charts-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-md);
}

.charts-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.charts-header h3 { font-size: 1rem; margin-bottom: 0.2rem; }
.card-desc { font-size: 0.8rem; color: var(--text-muted); }

.charts-controls { display: flex; gap: 0.75rem; flex-wrap: wrap; }

.toggle-group {
  display: inline-flex;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.2rem;
  gap: 0.15rem;
}
.toggle-group button {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 0.35rem 0.7rem;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.toggle-group button:hover { color: var(--text-main); }
.toggle-group button.active {
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
  color: #04121f;
}

.chart-container {
  position: relative;
  height: 280px;
}
.chart-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  font-size: 0.85rem;
  background: rgba(20, 29, 46, 0.6);
  border-radius: var(--radius-md);
}
.charts-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  margin-bottom: 0.75rem;
}

.charts-legend-note {
  display: flex;
  justify-content: space-between;
  margin-top: 0.85rem;
  font-size: 0.72rem;
  color: var(--text-dim);
  flex-wrap: wrap;
  gap: 0.5rem;
}
.charts-legend-note code {
  color: var(--accent-cyan);
  font-family: var(--font-mono);
}
</style>
