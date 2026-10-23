<script setup>
import { computed, ref } from 'vue'
import { apiUrl, authQuery } from '../../services/api'
import { filterIncidents, toggleAll, toggleSelection } from '../../utils/format'
import { INCIDENT_HEADERS, downloadCsv, fileDate, incidentRow } from '../../utils/csv'

const props = defineProps({
  sensores: { type: Array, default: () => [] },
  incidentes: { type: Array, default: () => [] },
  metricas: { type: Object, required: true },
  lotesAfectados: { type: Array, default: () => [] },
  usuario: { type: Object, required: true }
})

const filtro = ref({ texto: '', estado: 'TODOS', nivel: 'TODOS', desde: '', hasta: '' })
const seleccion = ref([])
const metricasSeleccion = ref(['mttr', 'total', 'lotes'])
const filtrados = computed(() => filterIncidents(props.incidentes, filtro.value))
const todosSeleccionados = computed(() =>
  filtrados.value.length > 0 && filtrados.value.every(i => seleccion.value.includes(i.id))
)

const alternarTodos = () => toggleAll(seleccion.value, filtrados.value.map(i => i.id))
const exportarTelemetria = () => window.open(`${apiUrl('/api/exportar/csv')}?${authQuery()}`, '_blank')
const imprimir = () => window.print()

const exportarSeleccion = () => {
  const filasMetricas = []
  if (metricasSeleccion.value.includes('mttr')) {
    filasMetricas.push(['Tiempo Medio de Respuesta (MTTR)', `${props.metricas.mttrMinutos} min`])
  }
  if (metricasSeleccion.value.includes('total')) {
    filasMetricas.push(['Total de Incidentes Registrados', props.metricas.incidentesTotales])
    filasMetricas.push(['Incidentes Cerrados', props.metricas.incidentesCerrados])
  }
  if (metricasSeleccion.value.includes('lotes')) {
    filasMetricas.push(['Lotes en Inspección 2FA', props.lotesAfectados.length])
    filasMetricas.push(['Lotes Dictaminados', props.lotesAfectados.filter(l => l.decision !== 'PENDIENTE_REVISION').length])
  }

  const registros = props.incidentes.filter(inc => seleccion.value.includes(inc.id))
  if (filasMetricas.length === 0 && registros.length === 0) {
    alert('Seleccione al menos una métrica o un registro de la bitácora para exportar.')
    return
  }

  const filas = []
  if (filasMetricas.length > 0) {
    filas.push(['MÉTRICAS SELECCIONADAS'])
    filas.push(['Métrica', 'Valor'])
    filas.push(...filasMetricas)
    filas.push([])
  }
  if (registros.length > 0) {
    filas.push(['BITÁCORA SELECCIONADA'])
    filas.push(INCIDENT_HEADERS)
    filas.push(...registros.map(incidentRow))
  }
  downloadCsv(`auditoria_seleccionada_${fileDate()}.csv`, filas)
}
</script>

<template>
  <div class="tab-panel">
    <div class="section-header">
      <div>
        <h2>Módulo 4: Auditoría Médica &amp; Métricas MTTR</h2>
        <p class="section-desc">Reportes de trazabilidad GxP, análisis de tiempo medio de resolución y exportación formal.</p>
      </div>
      <div class="header-buttons">
        <button class="btn-secondary" @click="exportarTelemetria">Exportar Telemetría (CSV)</button>
        <button class="btn-primary" @click="exportarSeleccion">Exportar selección (CSV)</button>
        <button class="btn-secondary" @click="imprimir">Imprimir / Exportar Reporte PDF</button>
      </div>
    </div>

    <div class="metrics-summary-grid">
      <div class="metric-box" :class="{ 'metric-box-selected': metricasSeleccion.includes('mttr') }">
        <label class="metric-check">
          <input type="checkbox" :checked="metricasSeleccion.includes('mttr')" @change="toggleSelection(metricasSeleccion, 'mttr')" />
          Incluir en exportación
        </label>
        <span class="m-label">Tiempo Medio de Respuesta (MTTR)</span>
        <span class="m-number">{{ metricas.mttrMinutos }} <small>minutos</small></span>
        <span class="m-status text-green">Cumplimiento GxP &lt; 15 min</span>
      </div>
      <div class="metric-box" :class="{ 'metric-box-selected': metricasSeleccion.includes('total') }">
        <label class="metric-check">
          <input type="checkbox" :checked="metricasSeleccion.includes('total')" @change="toggleSelection(metricasSeleccion, 'total')" />
          Incluir en exportación
        </label>
        <span class="m-label">Total de Incidentes Registrados</span>
        <span class="m-number">{{ metricas.incidentesTotales }}</span>
        <span class="m-status">{{ metricas.incidentesCerrados }} cerrados satisfactoriamente</span>
      </div>
      <div class="metric-box" :class="{ 'metric-box-selected': metricasSeleccion.includes('lotes') }">
        <label class="metric-check">
          <input type="checkbox" :checked="metricasSeleccion.includes('lotes')" @change="toggleSelection(metricasSeleccion, 'lotes')" />
          Incluir en exportación
        </label>
        <span class="m-label">Lotes Sometidos a Inspección 2FA</span>
        <span class="m-number">{{ lotesAfectados.length }}</span>
        <span class="m-status">{{ lotesAfectados.filter(l => l.decision !== 'PENDIENTE_REVISION').length }} dictaminados</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3>Filtros de Bitácora</h3>
        <span class="selection-count"><strong>{{ filtrados.length }}</strong> registros coinciden · <strong>{{ seleccion.length }}</strong> seleccionados</span>
      </div>
      <div class="filter-grid">
        <div class="form-group">
          <label>Buscar</label>
          <input v-model="filtro.texto" type="search" class="custom-input" placeholder="Código, equipo, causa, responsable..." />
        </div>
        <div class="form-group">
          <label>Estado</label>
          <select v-model="filtro.estado" class="custom-select">
            <option value="TODOS">Todos</option>
            <option value="Abierto">Abierto</option>
            <option value="En revisión">En revisión</option>
            <option value="Cerrado">Cerrado</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nivel SLA</label>
          <select v-model="filtro.nivel" class="custom-select">
            <option value="TODOS">Todos</option>
            <option value="Nivel 1">Nivel 1</option>
            <option value="Nivel 2">Nivel 2</option>
            <option value="Nivel 3 (Emergencia)">Nivel 3 (Emergencia)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Desde</label>
          <input v-model="filtro.desde" type="date" class="custom-input" />
        </div>
        <div class="form-group">
          <label>Hasta</label>
          <input v-model="filtro.hasta" type="date" class="custom-input" />
        </div>
      </div>
      <div class="selection-toolbar">
        <button class="btn-small btn-secondary" @click="alternarTodos">
          {{ todosSeleccionados ? 'Quitar selección' : 'Seleccionar visibles' }}
        </button>
      </div>
    </div>

    <div class="printable-audit-report">
      <div class="report-header">
        <div>
          <h3>REPORTE OFICIAL DE TRAZABILIDAD Y CADENA DE FRÍO</h3>
          <p>Laboratorio Central · Sala <strong>room_911</strong> · Estándar GxP / ISO 13485</p>
        </div>
        <div class="report-meta">
          <span>Fecha de Emisión: <strong>{{ new Date().toLocaleDateString('es-CO') }}</strong></span><br>
          <span>Auditor Responsable: <strong>{{ usuario.nombre }} {{ usuario.apellido }} ({{ usuario.rol }})</strong></span>
        </div>
      </div>

      <table class="custom-table" style="margin-top: 1.5rem;">
        <thead>
          <tr>
            <th>ID Sensor</th>
            <th>Cámara Frigorífica</th>
            <th>Rango Permitido</th>
            <th>Temperatura Actual</th>
            <th>Humedad Actual</th>
            <th>Estado GxP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sensores" :key="s.id">
            <td><code>{{ s.id }}</code></td>
            <td>{{ s.cuarto }}</td>
            <td>2.0°C a 8.0°C</td>
            <td><strong>{{ s.temp }}°C</strong></td>
            <td>{{ s.humedad }}% HR</td>
            <td><span class="status-pill" :class="s.estado.toLowerCase()">{{ s.estado }}</span></td>
          </tr>
        </tbody>
      </table>

      <h4 style="margin-top: 2rem; color: #F4EBDB;">Bitácora Consolidada de Incidencias y Resultados ({{ filtrados.length }})</h4>
      <table v-if="filtrados.length > 0" class="custom-table" style="margin-top: 0.75rem;">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th>Código</th>
            <th>Equipo</th>
            <th>Nivel SLA</th>
            <th>Temp. Crítica</th>
            <th>Estado</th>
            <th>Resultado / CAPA</th>
            <th>Responsable</th>
            <th>Apertura / Cierre</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inc in filtrados" :key="inc.id" :class="{ 'row-selected': seleccion.includes(inc.id) }">
            <td class="col-check">
              <input type="checkbox" :checked="seleccion.includes(inc.id)" @change="toggleSelection(seleccion, inc.id)" />
            </td>
            <td><code>{{ inc.id }}</code></td>
            <td>{{ inc.cuarto }}</td>
            <td>{{ inc.nivel }}</td>
            <td class="text-danger font-bold">{{ inc.temperaturaCritica }}°C</td>
            <td><span class="status-pill" :class="inc.estado.toLowerCase().replace(/\s+/g, '-')">{{ inc.estado }}</span></td>
            <td>
              <strong>{{ inc.resultado }}</strong>
              <div v-if="inc.motivo" style="font-size: 0.75rem; color: #D9D2C5;">
                {{ inc.motivo }} — {{ inc.accionesCorrectivas }}
              </div>
            </td>
            <td>{{ inc.cerradoPor || inc.acusadoPor || inc.destinatarioActual }}</td>
            <td>
              {{ new Date(inc.creadoEn).toLocaleTimeString('es-CO') }}
              <span v-if="inc.cerradoEn"> → {{ new Date(inc.cerradoEn).toLocaleTimeString('es-CO') }} ({{ inc.duracionMinutos }}m)</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-muted" style="margin-top: 0.75rem;">Sin incidencias que coincidan con los filtros de la bitácora.</p>

      <div class="report-signature-area">
        <div class="signature-box">
          <div class="signature-line"></div>
          <span>Firma Auditor / Supervisor de Calidad</span>
        </div>
        <div class="signature-box">
          <div class="signature-line"></div>
          <span>Firma y Sello Director del Laboratorio</span>
        </div>
      </div>
    </div>
  </div>
</template>
