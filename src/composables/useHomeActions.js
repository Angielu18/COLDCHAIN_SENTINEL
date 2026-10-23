import { inject, ref } from 'vue'
import { api, apiUrl, authQuery } from '../services/api'
import { getRole } from '../utils/modules'

export function useHomeActions() {
  const usuarioActivo = inject('usuarioActivo')
  const aplicarEstado = inject('aplicarEstado', () => {})
  const sincronizarEstado = inject('sincronizarEstado', async () => {})
  const recargarUsuariosIAM = inject('recargarUsuariosIAM', async () => {})

  const modalCerrar = ref({
    visible: false,
    incidenteId: null,
    motivo: 'Falla en compresor por corte eléctrico',
    acciones: ''
  })
  const modal2FA = ref({
    visible: false,
    loteAfectadoId: null,
    loteNumero: '',
    productoNombre: '',
    decision: 'APTO',
    justificacion: '',
    codigo2FA: '741258',
    error: ''
  })
  const modalNuevoMedicamento = ref({
    visible: false,
    codigo: '',
    nombre: '',
    tipo: 'MEDICAMENTO',
    equipoId: 'SEN-01',
    tempOptima: '2°C a 8°C'
  })
  const modalNuevoLote = ref({
    visible: false,
    productoId: 1,
    numeroLote: '',
    cantidad: 1000,
    vencimiento: '2027-12-31',
    sensorId: 'SEN-01'
  })
  const modalNuevoUsuario = ref({
    visible: false,
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    rol: 'TECNICO',
    password: '',
    passwordConfirm: '',
    error: ''
  })

  const actualizar = async (data) => {
    if (data?.estado) aplicarEstado(data.estado)
    else await sincronizarEstado()
  }

  const inyectarFallo = async (sensorId, modoFallo) => {
    try {
      const data = await api.post('/api/anomalia', { sensorId, modoFallo })
      await actualizar(data)
      if (modoFallo === 'NORMALIZAR') {
        alert(data.mensaje || 'Equipo normalizado e incidentes cerrados.')
      }
    } catch (e) {
      alert('Error al inyectar escenario: ' + e.message)
    }
  }

  const enviarTelemetriaManual = async (payload) => {
    try {
      const data = await api.post('/api/telemetria/manual', payload)
      await actualizar(data)
      alert(`Lectura transmitida con éxito: ${data.sensor.temp}°C hacia ${data.sensor.cuarto}`)
    } catch (e) {
      alert('Error enviando telemetría manual: ' + e.message)
    }
  }

  const darAcuse = async (incidenteId) => {
    try {
      const data = await api.post(`/api/incidentes/${incidenteId}/acusar`, {})
      await actualizar(data)
    } catch (e) {
      alert('Error al dar acuse de recibo: ' + e.message)
    }
  }

  const abrirModalCerrar = (incidente) => {
    modalCerrar.value = {
      visible: true,
      incidenteId: incidente.id,
      motivo: 'Falla mecánica del termostato / corte eléctrico',
      acciones: 'Verificación de compresor, sellado de puerta y restablecimiento a 4.5°C'
    }
  }

  const confirmarCierreIncidente = async () => {
    const modal = modalCerrar.value
    if (!modal.motivo.trim() || !modal.acciones.trim()) {
      alert('Debe registrar obligatoriamente la causa raíz y las acciones correctivas aplicadas.')
      return
    }
    try {
      const data = await api.post(`/api/incidentes/${modal.incidenteId}/cerrar`, {
        motivo: modal.motivo,
        accionesCorrectivas: modal.acciones
      })
      modalCerrar.value.visible = false
      await actualizar(data)
    } catch (e) {
      alert('Error al cerrar incidente: ' + e.message)
    }
  }

  const abrirModal2FA = (loteAfectado, decision) => {
    if (!['SUPERVISOR', 'DIRECTOR'].includes(getRole(usuarioActivo.value))) {
      alert(`Permiso Denegado: Tu rol es "${usuarioActivo.value.rol}". Se requiere Supervisor de Calidad o Director.`)
      return
    }
    modal2FA.value = {
      visible: true,
      loteAfectadoId: loteAfectado.code || loteAfectado.id,
      loteNumero: loteAfectado.numeroLote,
      productoNombre: loteAfectado.productoNombre,
      decision,
      justificacion: decision === 'APTO'
        ? 'La excursión térmica acumulada no superó el límite de estabilidad de la monografía farmacéutica.'
        : 'Degradación térmica irreversible confirmada. Se declara cuarentena para descarte biológico.',
      codigo2FA: '741258',
      error: ''
    }
  }

  const confirmarEvaluacion2FA = async () => {
    const modal = modal2FA.value
    if (!modal.codigo2FA || modal.codigo2FA.length !== 6) {
      modal.error = 'El código 2FA debe tener exactamente 6 dígitos numéricos.'
      return
    }
    try {
      const data = await api.post(`/api/lotes-afectados/${modal.loteAfectadoId}/evaluar`, {
        decision: modal.decision,
        justificacion: modal.justificacion,
        codigo2FA: modal.codigo2FA
      })
      modal2FA.value.visible = false
      await actualizar(data)
    } catch (e) {
      modal2FA.value.error = e.message
    }
  }

  const guardarNuevoMedicamento = async () => {
    const modal = modalNuevoMedicamento.value
    if (!modal.codigo || !modal.nombre) {
      alert('Ingrese código y nombre del insumo.')
      return
    }
    try {
      const data = await api.post('/api/inventario/medicamentos', modal)
      modalNuevoMedicamento.value.visible = false
      modalNuevoMedicamento.value.codigo = ''
      modalNuevoMedicamento.value.nombre = ''
      await actualizar(data)
    } catch (e) {
      alert('Error al registrar medicamento: ' + e.message)
    }
  }

  const guardarNuevoLote = async () => {
    const modal = modalNuevoLote.value
    if (!modal.numeroLote) {
      alert('Ingrese el número de lote.')
      return
    }
    try {
      const data = await api.post('/api/inventario/lotes', modal)
      modalNuevoLote.value.visible = false
      modalNuevoLote.value.numeroLote = ''
      await actualizar(data)
    } catch (e) {
      alert('Error al registrar lote: ' + e.message)
    }
  }

  const cambiarEstadoUsuario = async (usuarioId, nuevoEstado) => {
    try {
      const data = await api.post(`/api/iam/usuarios/${usuarioId}/cambiar-estado`, { status: nuevoEstado })
      if (!data) throw new Error('Sin respuesta del servidor')
      recargarUsuariosIAM()
      await sincronizarEstado()
    } catch (e) {
      alert('Error al cambiar estado: ' + e.message)
    }
  }

  const abrirModalNuevoUsuario = () => {
    modalNuevoUsuario.value = {
      visible: true,
      nombre: '',
      apellido: '',
      email: '',
      telefono: '',
      rol: 'TECNICO',
      password: '',
      passwordConfirm: '',
      error: ''
    }
  }

  const guardarNuevoUsuario = async () => {
    const f = modalNuevoUsuario.value
    f.error = ''
    if (!f.nombre.trim() || !f.apellido.trim() || !f.email.trim() || !f.password) {
      f.error = 'Nombres, apellidos, correo y contraseña son obligatorios.'
      return
    }
    if (f.password !== f.passwordConfirm) {
      f.error = 'Las contraseñas no coinciden.'
      return
    }
    if (f.password.length < 6) {
      f.error = 'La contraseña debe contener al menos 6 caracteres.'
      return
    }
    try {
      const data = await api.post('/api/iam/usuarios', {
        nombre: f.nombre.trim(),
        apellido: f.apellido.trim(),
        email: f.email.trim(),
        telefono: f.telefono.trim(),
        rol: f.rol,
        password: f.password
      })
      modalNuevoUsuario.value.visible = false
      alert(data.mensaje)
      recargarUsuariosIAM()
      await sincronizarEstado()
    } catch (e) {
      f.error = e.message
    }
  }

  const descargarCSV = () => {
    window.open(`${apiUrl('/api/exportar/csv')}?${authQuery()}`, '_blank')
  }

  const imprimirReportePDF = () => window.print()

  return {
    modalCerrar,
    modal2FA,
    modalNuevoMedicamento,
    modalNuevoLote,
    modalNuevoUsuario,
    inyectarFallo,
    enviarTelemetriaManual,
    darAcuse,
    abrirModalCerrar,
    confirmarCierreIncidente,
    abrirModal2FA,
    confirmarEvaluacion2FA,
    guardarNuevoMedicamento,
    guardarNuevoLote,
    cambiarEstadoUsuario,
    abrirModalNuevoUsuario,
    guardarNuevoUsuario,
    descargarCSV,
    imprimirReportePDF
  }
}
