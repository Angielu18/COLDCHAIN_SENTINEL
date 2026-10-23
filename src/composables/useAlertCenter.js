import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'

export function useAlertCenter(props) {
  const alertas = ref([])
  const panelAbierto = ref(false)
  const sonidoActivo = ref(true)
  const alarmaSonando = ref(false)
  const contenedor = ref(null)
  const conectado = toRef(props, 'conectado')

  const estadoPrevio = new Map()
  const estadoSensores = new Map()
  let inicializado = false
  let sensoresInicializados = false

  let audioCtx = null
  let bucleAlarma = null
  let finAlarma = 0
  const nodosActivos = new Set()
  const timersToast = new Map()

  const obtenerContexto = () => {
    try {
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      }
      if (audioCtx.state === 'suspended') audioCtx.resume()
      return audioCtx
    } catch {
      return null
    }
  }

  const pulsoArmonico = (notas = [523.25, 659.25], volumen = 0.18) => {
    const ctx = obtenerContexto()
    if (!ctx) return
    const ahora = ctx.currentTime
    notas.forEach((frec, i) => {
      const inicio = ahora + i * 0.16
      const duracion = 0.38
      const osc = ctx.createOscillator()
      const filtro = ctx.createBiquadFilter()
      const gain = ctx.createGain()

      osc.type = i % 2 === 0 ? 'sine' : 'triangle'
      osc.frequency.setValueAtTime(frec, inicio)
      filtro.type = 'lowpass'
      filtro.frequency.setValueAtTime(1600, inicio)
      gain.gain.setValueAtTime(0.0001, inicio)
      gain.gain.linearRampToValueAtTime(volumen, inicio + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion)

      osc.connect(filtro)
      filtro.connect(gain)
      gain.connect(ctx.destination)

      const registro = { osc, gain, filtro }
      nodosActivos.add(registro)
      osc.onended = () => {
        try {
          osc.disconnect()
          filtro.disconnect()
          gain.disconnect()
        } catch {
          // Nodo ya liberado
        }
        nodosActivos.delete(registro)
      }
      osc.start(inicio)
      osc.stop(inicio + duracion + 0.02)
    })
  }

  const detenerAlarma = () => {
    if (bucleAlarma) {
      clearInterval(bucleAlarma)
      bucleAlarma = null
    }
    finAlarma = 0
    alarmaSonando.value = false
    nodosActivos.forEach(({ osc, gain, filtro }) => {
      try {
        osc.onended = null
        osc.stop()
        osc.disconnect()
        filtro.disconnect()
        gain.disconnect()
      } catch {
        // Nodo ya liberado
      }
    })
    nodosActivos.clear()
  }

  const lanzarAlarma = (nivel = 'Nivel 1') => {
    if (!sonidoActivo.value) return
    detenerAlarma()

    const esEmergencia = nivel.includes('Emergencia') || nivel.includes('Nivel 3')
    const esNivel2 = nivel.includes('Nivel 2')
    const notas = esEmergencia
      ? [523.25, 659.25, 783.99]
      : esNivel2 ? [440.0, 554.37, 659.25] : [440.0, 523.25]
    const volumen = esEmergencia ? 0.22 : esNivel2 ? 0.18 : 0.14
    const intervalo = esEmergencia ? 1400 : esNivel2 ? 1800 : 2200
    const duracionMax = esEmergencia ? 16000 : esNivel2 ? 12000 : 8000

    finAlarma = Date.now() + duracionMax
    alarmaSonando.value = true
    const disparar = () => {
      if (!alarmaSonando.value || !sonidoActivo.value || Date.now() > finAlarma) {
        detenerAlarma()
        return
      }
      pulsoArmonico(notas, volumen)
    }
    disparar()
    bucleAlarma = setInterval(disparar, intervalo)
  }

  const estaAtendido = (inc) => {
    const raw = (inc.estado || inc.status || '').toString().toLowerCase().trim()
    return ['finalizo', 'finalizado', 'cerrado', 'en revisión', 'en revision'].includes(raw) ||
      Boolean(inc.acusadoPor) || Boolean(inc.cerradoPor)
  }

  const eliminarAlerta = (id) => {
    const timer = timersToast.get(id)
    if (timer) {
      clearTimeout(timer)
      timersToast.delete(id)
    }
    alertas.value = alertas.value.filter(a => a.id !== id)
  }

  const agregarAlerta = (incidente, tipoCambio) => {
    const nivel = incidente.nivel || 'Nivel 1'
    const equipo = incidente.cuarto || incidente.sensorId
    let mensaje = ''
    let tipo = 'info'

    if (tipoCambio === 'nuevo') {
      mensaje = `Excursión térmica en ${equipo} (${incidente.temperaturaCritica}°C)`
      tipo = nivel.includes('Emergencia') ? 'danger' : 'warning'
    } else if (tipoCambio === 'escalado') {
      mensaje = `Escalamiento ${nivel}: ${equipo} → ${incidente.destinatarioActual}`
      tipo = nivel.includes('Emergencia') ? 'danger' : 'warning'
    } else if (tipoCambio === 'cerrado') {
      mensaje = `Incidente ${incidente.id} finalizado (${incidente.cerradoPor || incidente.acusadoPor || 'Equipo Técnico'})`
      tipo = 'success'
    }

    const alerta = {
      id: `${incidente.id}-${tipoCambio}-${Date.now()}`,
      incidenteId: incidente.id,
      nivel,
      mensaje,
      tipo,
      hora: new Date().toLocaleTimeString('es-CO'),
      leida: false
    }
    alertas.value.unshift(alerta)
    if (alertas.value.length > 30) alertas.value.pop()

    if (tipoCambio === 'cerrado') detenerAlarma()
    else lanzarAlarma(nivel)

    const timer = setTimeout(() => eliminarAlerta(alerta.id), tipoCambio === 'cerrado' ? 4500 : 10000)
    timersToast.set(alerta.id, timer)
  }

  const agregarAlertaSensor = (sensor) => {
    const alerta = {
      id: `sensor-${sensor.id}-${Date.now()}`,
      incidenteId: null,
      sensorId: sensor.id,
      nivel: 'Advertencia de telemetría',
      mensaje: `Lectura fuera de rango en ${sensor.cuarto}: ${sensor.temp}°C (rango ${sensor.tempMin}°C a ${sensor.tempMax}°C)`,
      tipo: 'warning',
      hora: new Date().toLocaleTimeString('es-CO'),
      leida: false
    }
    alertas.value.unshift(alerta)
    if (alertas.value.length > 30) alertas.value.pop()
    lanzarAlarma('Advertencia')
    const timer = setTimeout(() => eliminarAlerta(alerta.id), 8000)
    timersToast.set(alerta.id, timer)
  }

  watch(
    () => props.sensores,
    (lista) => {
      if (!Array.isArray(lista)) return
      if (!sensoresInicializados) {
        lista.forEach(sensor => estadoSensores.set(sensor.id, sensor.estado))
        sensoresInicializados = true
        return
      }
      lista.forEach(sensor => {
        const previo = estadoSensores.get(sensor.id)
        if (sensor.estado === 'Advertencia' && previo !== 'Advertencia') agregarAlertaSensor(sensor)
        if (sensor.estado === 'Normal' && previo === 'Advertencia') {
          alertas.value = alertas.value.filter(a => a.sensorId !== sensor.id)
        }
        estadoSensores.set(sensor.id, sensor.estado)
      })
    },
    { deep: true }
  )

  watch(
    () => props.incidentes,
    (nuevos) => {
      if (!Array.isArray(nuevos)) return
      if (!inicializado) {
        nuevos.forEach(inc => estadoPrevio.set(inc.id, { nivel: inc.nivel, atendido: estaAtendido(inc) }))
        inicializado = true
        return
      }
      nuevos.forEach(inc => {
        const atendidoAhora = estaAtendido(inc)
        const previo = estadoPrevio.get(inc.id)
        if (!previo) {
          estadoPrevio.set(inc.id, { nivel: inc.nivel, atendido: atendidoAhora })
          if (!atendidoAhora) agregarAlerta(inc, 'nuevo')
          return
        }
        if (!previo.atendido && atendidoAhora) {
          estadoPrevio.set(inc.id, { nivel: inc.nivel, atendido: true })
          alertas.value = alertas.value.filter(a => a.incidenteId !== inc.id || a.tipo === 'success')
          agregarAlerta(inc, 'cerrado')
          return
        }
        if (!atendidoAhora && previo.nivel !== inc.nivel) {
          estadoPrevio.set(inc.id, { nivel: inc.nivel, atendido: false })
          agregarAlerta(inc, 'escalado')
        }
      })
      if (!nuevos.some(i => !estaAtendido(i))) detenerAlarma()
    },
    { deep: true }
  )

  const alertasNoLeidas = computed(() => alertas.value.filter(a => !a.leida).length)

  const abrirPanel = () => {
    panelAbierto.value = !panelAbierto.value
    if (panelAbierto.value) {
      alertas.value.forEach(a => (a.leida = true))
      detenerAlarma()
    }
  }

  const limpiarTodo = () => {
    timersToast.forEach(t => clearTimeout(t))
    timersToast.clear()
    alertas.value = []
    detenerAlarma()
  }

  const toggleSonido = () => {
    sonidoActivo.value = !sonidoActivo.value
    if (sonidoActivo.value) pulsoArmonico([523.25, 659.25], 0.14)
    else detenerAlarma()
  }

  const probarAlarma = () => {
    if (alarmaSonando.value) detenerAlarma()
    else lanzarAlarma('Nivel 2')
  }

  const manejarClicFuera = (e) => {
    if (contenedor.value && !contenedor.value.contains(e.target)) panelAbierto.value = false
  }

  const desbloquearAudio = () => {
    if (sonidoActivo.value) obtenerContexto()
  }

  onMounted(() => {
    document.addEventListener('click', manejarClicFuera)
    document.addEventListener('click', desbloquearAudio, { once: true })
    document.addEventListener('keydown', desbloquearAudio, { once: true })
  })

  onUnmounted(() => {
    document.removeEventListener('click', manejarClicFuera)
    document.removeEventListener('click', desbloquearAudio)
    document.removeEventListener('keydown', desbloquearAudio)
    limpiarTodo()
    if (audioCtx && audioCtx.state !== 'closed') {
      try { audioCtx.close() } catch {
        // Contexto ya cerrado
      }
    }
  })

  return {
    alertas,
    panelAbierto,
    sonidoActivo,
    alarmaSonando,
    contenedor,
    conectado,
    alertasNoLeidas,
    abrirPanel,
    limpiarTodo,
    toggleSonido,
    probarAlarma,
    detenerAlarma,
    eliminarAlerta
  }
}
