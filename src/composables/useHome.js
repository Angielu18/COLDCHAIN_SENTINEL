import { computed, inject, ref, watch } from 'vue'
import { ROLE_LABELS, getAccessibleModules } from '../utils/modules'
import { normalizeIncidentStatus } from '../utils/format'

export function useHome() {
  const usuarioActivo = inject('usuarioActivo')
  const sensores = inject('sensores')
  const incidentes = inject('incidentes')
  const lotes = inject('lotes')
  const lotesAfectados = inject('lotesAfectados')
  const metricas = inject('metricas')
  const usuariosIAM = inject('usuariosIAM')
  const recargarUsuariosIAM = inject('recargarUsuariosIAM')
  const conectado = inject('conectado', false)

  const tabActiva = ref('inicio')
  const modulosAccesibles = computed(() => getAccessibleModules(usuarioActivo.value?.rol))

  watch([usuarioActivo, modulosAccesibles], () => {
    if (modulosAccesibles.value.length === 0) return
    if (!modulosAccesibles.value.some(m => m.id === tabActiva.value)) {
      tabActiva.value = modulosAccesibles.value[0].id
    }
  }, { immediate: true })

  const irAModulo = (id) => {
    if (modulosAccesibles.value.some(m => m.id === id)) tabActiva.value = id
  }

  const incidentesNormalizados = computed(() =>
    (incidentes.value || []).map(inc => {
      const estado = normalizeIncidentStatus(inc)
      const duracionMinutos = inc.duracionMinutos ?? (
        inc.cerradoEn && inc.creadoEn
          ? Math.max(1, Math.round((new Date(inc.cerradoEn) - new Date(inc.creadoEn)) / 60000))
          : null
      )
      return {
        ...inc,
        estado,
        duracionMinutos,
        resultado: inc.resultado || (estado === 'Cerrado'
          ? 'Resuelto / Normalizado'
          : estado === 'En revisión' ? 'Acusado en Atención' : 'Alerta Activa')
      }
    })
  )

  const incidentesActivos = computed(() => incidentesNormalizados.value.filter(i => i.estado !== 'Cerrado'))
  const lotesPendientes = computed(() => (lotesAfectados.value || []).filter(l => l.decision === 'PENDIENTE_REVISION'))
  const usuariosSuspendidos = computed(() => (usuariosIAM.value || []).filter(u => u.status !== 'ACTIVO'))

  const resumenModulos = computed(() => {
    const valores = {
      simulador: sensores.value.length,
      alertas: incidentesActivos.value.length,
      historial: incidentesNormalizados.value.length,
      auditoria: `${metricas.value.mttrMinutos} min`,
      inventario: lotesPendientes.value.length,
      iam: usuariosSuspendidos.value.length
    }
    const detalles = {
      simulador: 'equipos disponibles',
      alertas: 'incidentes activos',
      historial: 'incidencias registradas',
      auditoria: 'MTTR actual',
      inventario: 'lotes en revisión',
      iam: 'cuentas suspendidas'
    }
    return modulosAccesibles.value
      .filter(m => m.id !== 'inicio')
      .map(m => ({
        id: m.id,
        titulo: m.shortLabel,
        valor: valores[m.id] ?? 0,
        detalle: detalles[m.id] || ''
      }))
  })

  return {
    usuarioActivo,
    sensores,
    incidentes,
    lotes,
    lotesAfectados,
    metricas,
    usuariosIAM,
    recargarUsuariosIAM,
    conectado,
    nombresRoles: ROLE_LABELS,
    modulosAccesibles,
    tabActiva,
    irAModulo,
    incidentesNormalizados,
    incidentesActivos,
    lotesPendientes,
    usuariosSuspendidos,
    resumenModulos
  }
}
