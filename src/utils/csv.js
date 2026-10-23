export const INCIDENT_HEADERS = [
  'Código', 'Equipo', 'Sensor', 'Nivel SLA', 'Temp. Crítica (°C)', 'Estado',
  'Resultado', 'Causa Raíz', 'Acciones CAPA', 'Acusado Por', 'Cerrado Por',
  'Apertura', 'Cierre', 'Duración (min)'
]

export const incidentRow = (inc) => [
  inc.id,
  inc.cuarto,
  inc.sensorId,
  inc.nivel,
  inc.temperaturaCritica,
  inc.estado,
  inc.resultado,
  inc.motivo || '',
  inc.accionesCorrectivas || '',
  inc.acusadoPor || '',
  inc.cerradoPor || '',
  inc.creadoEn ? new Date(inc.creadoEn).toLocaleString('es-CO') : '',
  inc.cerradoEn ? new Date(inc.cerradoEn).toLocaleString('es-CO') : '',
  inc.duracionMinutos ?? ''
]

export const fileDate = () => new Date().toISOString().slice(0, 10)

export const downloadCsv = (nombre, filas) => {
  const contenido = filas
    .map(fila => fila.map(celda => `"${String(celda ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}
