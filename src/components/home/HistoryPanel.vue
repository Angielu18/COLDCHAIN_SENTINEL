<script setup>
import { computed, ref } from 'vue'
import { filterIncidents, toggleAll, toggleSelection } from '../../utils/format'
import { INCIDENT_HEADERS, downloadCsv, fileDate, incidentRow } from '../../utils/csv'

const props = defineProps({
  incidentes: { type: Array, default: () => [] }
})

const filtro = ref({ texto: '', estado: 'TODOS', nivel: 'TODOS', desde: '', hasta: '' })
const seleccion = ref([])
const filtrados = computed(() => filterIncidents(props.incidentes, filtro.value))
const todosSeleccionados = computed(() =>
  filtrados.value.length > 0 && filtrados.value.every(i => seleccion.value.includes(i.id))
)

const alternarTodos = () => toggleAll(seleccion.value, filtrados.value.map(i => i.id))

const exportar = () => {
  if (seleccion.value.length === 0) {
    alert('Seleccione al menos una incidencia para exportar.')
    return
  }
  const seleccionadas = props.incidentes.filter(inc => seleccion.value.includes(inc.id))
  downloadCsv(
    `incidencias_seleccionadas_${fileDate()}.csv`,
    [INCIDENT_HEADERS, ...seleccionadas.map(incidentRow)]
  )
}
</script>

<template>
  <div class="tab-panel">
    <div class="section-header">
      <div>
        <h2>Módulo 3: Historial de Incidencias</h2>
        <p class="section-desc">Explora todas las incidencias registradas, filtra por criterios y exporta únicamente las seleccionadas.</p>
      </div>
      <div class="header-buttons">
        <button class="btn-secondary" @click="exportar">Exportar selección (CSV)</button>
      </div>
    </div>

    <div class="card">
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
        <span><strong>{{ filtrados.length }}</strong> incidencias coinciden · <strong>{{ seleccion.length }}</strong> seleccionadas</span>
        <button class="btn-small btn-secondary" @click="alternarTodos">
          {{ todosSeleccionados ? 'Quitar selección' : 'Seleccionar visibles' }}
        </button>
      </div>

      <div class="table-scroll">
        <table v-if="filtrados.length > 0" class="custom-table">
          <thead>
            <tr>
              <th class="col-check"></th>
              <th>Código</th>
              <th>Equipo</th>
              <th>Nivel</th>
              <th>Temp. Crítica</th>
              <th>Estado</th>
              <th>Resultado</th>
              <th>Causa Raíz / CAPA</th>
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
              <td>{{ inc.cuarto }} <small>({{ inc.sensorId }})</small></td>
              <td>{{ inc.nivel }}</td>
              <td class="text-danger font-bold">{{ inc.temperaturaCritica }}°C</td>
              <td><span class="status-pill" :class="inc.estado.toLowerCase().replace(/\s+/g, '-')">{{ inc.estado }}</span></td>
              <td>{{ inc.resultado }}</td>
              <td>
                <strong>{{ inc.motivo || 'Normalización operativa' }}</strong>
                <div v-if="inc.accionesCorrectivas" style="font-size: 0.75rem; color: #D9D2C5;">{{ inc.accionesCorrectivas }}</div>
              </td>
              <td>{{ inc.cerradoPor || inc.acusadoPor || inc.destinatarioActual || '-' }}</td>
              <td>
                {{ inc.creadoEn ? new Date(inc.creadoEn).toLocaleString('es-CO') : '-' }}
                <div v-if="inc.cerradoEn" style="font-size: 0.75rem; color: #D9D2C5;">→ {{ new Date(inc.cerradoEn).toLocaleString('es-CO') }}</div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-muted">No hay incidencias que coincidan con los filtros aplicados.</p>
      </div>
    </div>
  </div>
</template>
