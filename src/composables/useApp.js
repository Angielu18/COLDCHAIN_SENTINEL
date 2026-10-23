import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { api } from '../services/api'
import { ALERT_ROLES, ROLE_LABELS, tieneRol } from '../utils/modules'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'

export function useApp() {
  const usuarioActivo = ref(null)
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
    usuariosSuspendidos: 0
  })
  const usuariosIAM = ref([])
  const slaAcelerado = ref(true)

  let socket = null
  let reconnectInterval = null

  const aplicarEstado = (data) => {
    if (!data) return
    if (Array.isArray(data.sensores)) sensores.value = data.sensores
    if (Array.isArray(data.incidentes)) incidentes.value = data.incidentes
    if (Array.isArray(data.lotes)) lotes.value = data.lotes
    if (Array.isArray(data.lotesAfectados)) lotesAfectados.value = data.lotesAfectados
    if (data.metricas) metricas.value = data.metricas
    if (Array.isArray(data.usuariosIAM)) usuariosIAM.value = data.usuariosIAM
  }

  const sincronizarEstado = async () => {
    if (!localStorage.getItem('coldchain_token')) return
    try {
      aplicarEstado(await api.get('/api/estado'))
    } catch (e) {
      console.error('Error sincronizando estado:', e)
    }
  }

  const conectarWebSocket = () => {
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return
    socket = new WebSocket(WS_URL)
    socket.onopen = () => {
      conectado.value = true
      sincronizarEstado()
    }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.tipo === 'ACTUALIZACION_COMPLETA') aplicarEstado(data)
      } catch (e) {
        console.error('Error parseando WebSocket:', e)
      }
    }
    socket.onclose = () => { conectado.value = false }
    socket.onerror = () => {
      conectado.value = false
      if (socket) socket.close()
    }
  }

  const recargarUsuariosIAM = async () => {
    if (!usuarioActivo.value || usuarioActivo.value.rol !== 'DIRECTOR') return
    try {
      const data = await api.get('/api/iam/usuarios')
      if (data.usuarios) usuariosIAM.value = data.usuarios
    } catch (e) {
      console.error('Error cargando usuarios IAM:', e)
    }
  }

  const cerrarSesion = () => {
    localStorage.removeItem('coldchain_token')
    localStorage.removeItem('coldchain_user')
    usuarioActivo.value = null
    if (socket) {
      socket.close()
      socket = null
    }
  }

  const verificarSesion = async () => {
    if (!localStorage.getItem('coldchain_token')) {
      usuarioActivo.value = null
      return
    }
    try {
      const data = await api.get('/api/auth/me')
      if (!data.usuario) throw new Error('Sesión inválida')
      usuarioActivo.value = data.usuario
      conectarWebSocket()
      if (data.usuario.rol === 'DIRECTOR') recargarUsuariosIAM()
    } catch (err) {
      if (err.status) {
        cerrarSesion()
      } else {
        const saved = localStorage.getItem('coldchain_user')
        if (saved) usuarioActivo.value = JSON.parse(saved)
      }
    }
  }

  const handleLoginSuccess = (usuario) => {
    usuarioActivo.value = usuario
    conectarWebSocket()
    if (usuario.rol === 'DIRECTOR') recargarUsuariosIAM()
  }

  const toggleSlaVelocidad = async () => {
    try {
      const data = await api.post('/api/config/sla-acelerado', { acelerado: !slaAcelerado.value })
      slaAcelerado.value = data.aceleradoSLA
    } catch (e) {
      console.error(e)
    }
  }

  const sincronizarSla = async () => {
    try {
      const data = await api.get('/api/config/sla-acelerado', { auth: false })
      slaAcelerado.value = data.aceleradoSLA
    } catch (e) {
      console.error(e)
    }
  }

  const puedeVerAlertas = computed(() => tieneRol(usuarioActivo.value, ALERT_ROLES))
  const puedeConfigurarSla = computed(() => tieneRol(usuarioActivo.value, ALERT_ROLES))

  onMounted(() => {
    verificarSesion()
    sincronizarSla()
    reconnectInterval = setInterval(() => {
      if (usuarioActivo.value && !conectado.value) conectarWebSocket()
    }, 4000)
  })

  onUnmounted(() => {
    if (reconnectInterval) clearInterval(reconnectInterval)
    if (socket) socket.close()
  })

  provide('usuarioActivo', usuarioActivo)
  provide('sensores', sensores)
  provide('incidentes', incidentes)
  provide('lotes', lotes)
  provide('lotesAfectados', lotesAfectados)
  provide('metricas', metricas)
  provide('usuariosIAM', usuariosIAM)
  provide('recargarUsuariosIAM', recargarUsuariosIAM)
  provide('aplicarEstado', aplicarEstado)
  provide('sincronizarEstado', sincronizarEstado)
  provide('conectado', conectado)

  return {
    usuarioActivo,
    conectado,
    sensores,
    incidentes,
    slaAcelerado,
    rolEtiquetas: ROLE_LABELS,
    puedeVerAlertas,
    puedeConfigurarSla,
    handleLoginSuccess,
    cerrarSesion,
    toggleSlaVelocidad
  }
}
