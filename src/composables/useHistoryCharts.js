import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { api } from '../services/api'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const COLORES = ['#F4EBDB', '#8E9B97', '#D9A25F', '#4F9A82', '#C05A5A']

export function useHistoryCharts() {
  const canvasRef = ref(null)
  const cargando = ref(true)
  const error = ref('')
  const metrica = ref('temp')
  const rangoHoras = ref(2)
  let chart = null
  let intervaloRecarga = null

  const cargarDatos = async () => {
    try {
      const data = await api.get('/api/lecturas/historico?limite=300')
      return data.lecturas || []
    } catch (e) {
      error.value = e.message
      return []
    }
  }

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
    const desde = Date.now() - rangoHoras.value * 60 * 60 * 1000
    const filtradas = lecturas.filter(l => new Date(l.timestamp).getTime() >= desde)
    const series = construirSeries(filtradas)
    const etiquetas = [...new Set(filtradas.map(l => new Date(l.timestamp).toLocaleTimeString('es-CO')))]

    const datasets = Object.keys(series).map((sensorId, idx) => {
      const mapa = {}
      series[sensorId].forEach(p => {
        mapa[new Date(p.timestamp).toLocaleTimeString('es-CO')] = metrica.value === 'temp' ? Number(p.temp) : Number(p.humedad)
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
              labels: { color: '#D9D2C5', font: { family: 'Inter', size: 11 }, usePointStyle: true, boxWidth: 8 }
            },
            tooltip: {
              backgroundColor: 'rgba(44, 74, 82, 0.96)',
              borderColor: '#8E9B97',
              borderWidth: 1,
              titleColor: '#F4EBDB',
              bodyColor: '#F4EBDB',
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}${metrica.value === 'temp' ? '°C' : '% HR'}`
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#D9D2C5', maxTicksLimit: 8, font: { family: 'JetBrains Mono', size: 10 } },
              grid: { color: 'rgba(142, 155, 151, 0.32)' }
            },
            y: {
              ticks: {
                color: '#D9D2C5',
                font: { family: 'JetBrains Mono', size: 10 },
                callback: (v) => `${v}${metrica.value === 'temp' ? '°C' : '%'}`
              },
              grid: { color: 'rgba(142, 155, 151, 0.32)' }
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
    intervaloRecarga = setInterval(renderizar, 10000)
  })

  onUnmounted(() => {
    if (intervaloRecarga) clearInterval(intervaloRecarga)
    if (chart) chart.destroy()
  })

  return { canvasRef, cargando, error, metrica, rangoHoras, cambiarMetrica, cambiarRango }
}
