export const normalizeIncidentStatus = (incidente) => {
  const raw = (typeof incidente === 'object' ? (incidente?.estado || incidente?.status) : incidente) || ''
  const estado = raw.toString().toLowerCase().trim()
  if (['finalizo', 'finalizado', 'cerrado'].includes(estado)) return 'Cerrado'
  if (['en revisión', 'en revision'].includes(estado)) return 'En revisión'
  return 'Abierto'
}

export const normalizeText = (value) => (value ?? '').toString().toLowerCase()

export const filterIncidents = (incidentes, filtro) => {
  const texto = normalizeText(filtro.texto)
  return (incidentes || []).filter(inc => {
    if (texto) {
      const contenido = normalizeText([
        inc.id, inc.cuarto, inc.sensorId, inc.nivel, inc.estado, inc.resultado,
        inc.motivo, inc.accionesCorrectivas, inc.acusadoPor, inc.cerradoPor,
        inc.destinatarioActual
      ].join(' '))
      if (!contenido.includes(texto)) return false
    }
    if (filtro.estado !== 'TODOS' && inc.estado !== filtro.estado) return false
    if (filtro.nivel !== 'TODOS' && inc.nivel !== filtro.nivel) return false

    const creado = inc.creadoEn ? new Date(inc.creadoEn) : null
    if (filtro.desde && creado && creado < new Date(`${filtro.desde}T00:00:00`)) return false
    if (filtro.hasta && creado && creado > new Date(`${filtro.hasta}T23:59:59`)) return false
    return true
  })
}

export const toggleSelection = (lista, id) => {
  const indice = lista.indexOf(id)
  if (indice >= 0) lista.splice(indice, 1)
  else lista.push(id)
}

export const toggleAll = (lista, ids) => {
  const todos = ids.length > 0 && ids.every(id => lista.includes(id))
  if (todos) lista.splice(0, lista.length)
  else lista.splice(0, lista.length, ...ids)
}
