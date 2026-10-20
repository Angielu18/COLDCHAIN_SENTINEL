<script setup>
import { ref, inject, computed } from 'vue'

// Inyectar estado global desde App.vue
const usuarioActivo = inject('usuarioActivo')
const sensores = inject('sensores')
const incidentes = inject('incidentes')
const lotes = inject('lotes')
const lotesAfectados = inject('lotesAfectados')
const metricas = inject('metricas')

// Pestaña activa
const tabActiva = ref('monitoreo') // 'monitoreo' | 'incidentes' | 'inventario' | 'auditoria'

// Modales y formularios
const modalCerrar = ref({ visible: false, incidenteId: null, motivo: '', acciones: '' })
const modal2FA = ref({ visible: false, loteAfectadoId: null, decision: 'APTO', justificacion: '', codigo2FA: '741258', error: '' })
const modalNuevoLote = ref({ visible: false, productoId: 1, numeroLote: '', cantidad: 1000, vencimiento: '2027-12-31', sensorId: 'SEN-01' })

// Computed
const incidentesActivos = computed(() => incidentes.value.filter(i => i.estado !== 'Cerrado'))
const incidentesCerrados = computed(() => incidentes.value.filter(i => i.estado === 'Cerrado'))
const lotesPendientes = computed(() => lotesAfectados.value.filter(l => l.decision === 'PENDIENTE_REVISION'))

// =============================================================================
// MÓDULO 1: Simulación de Anomalías
// =============================================================================
const inyectarFallo = async (sensorId, modoFallo) => {
  try {
    await fetch('http://localhost:3000/api/anomalia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensorId, modoFallo })
    })
  } catch (e) {
    alert('Error conectando con el backend IoT: ' + e.message)
  }
}

// =============================================================================
// MÓDULO 3: Acuse y Cierre de Incidentes
// =============================================================================
const darAcuse = async (incidenteId) => {
  try {
    const res = await fetch(`http://localhost:3000/api/incidentes/${incidenteId}/acusar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario: usuarioActivo.value.name,
        rol: usuarioActivo.value.role
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
  } catch (e) {
    alert('Error al dar acuse de recibo: ' + e.message)
  }
}

const abrirModalCerrar = (incidente) => {
  modalCerrar.value = {
    visible: true,
    incidenteId: incidente.id,
    motivo: 'Falla eléctrica momentánea',
    acciones: ''
  }
}

const confirmarCierreIncidente = async () => {
  if (!modalCerrar.value.acciones.trim()) {
    alert('Debe ingresar las acciones correctivas aplicadas.')
    return
  }

  try {
    const res = await fetch(`http://localhost:3000/api/incidentes/${modalCerrar.value.incidenteId}/cerrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        motivo: modalCerrar.value.motivo,
        accionesCorrectivas: modalCerrar.value.acciones,
        usuario: usuarioActivo.value.name,
        rol: usuarioActivo.value.role
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    modalCerrar.value.visible = false
  } catch (e) {
    alert('Error al cerrar incidente: ' + e.message)
  }
}

// =============================================================================
// MÓDULO 5 & 6: Evaluación de Lotes Afectados con 2FA y RBAC
// =============================================================================
const abrirModal2FA = (loteAfectado, decision) => {
  // Verificación RBAC antes de abrir
  if (!['SUPERVISOR', 'DIRECTOR'].includes(usuarioActivo.value.role)) {
    alert(`⛔ Permiso denegado: Tu rol actual es "${usuarioActivo.value.roleLabel}". Solo el Supervisor de Calidad o Director del Laboratorio pueden disponer lotes afectados.`)
    return
  }

  modal2FA.value = {
    visible: true,
    loteAfectadoId: loteAfectado.id,
    loteNumero: loteAfectado.numeroLote,
    productoNombre: loteAfectado.productoNombre,
    decision,
    justificacion: decision === 'APTO' 
      ? 'La excursión térmica no superó el margen de estabilidad cinética según monografía del fabricante.' 
      : 'Degradación térmica irreversible detectada. Se ordena cuarentena y destrucción biológica.',
    codigo2FA: '741258', // Código 2FA sugerido para pruebas rápidas
    error: ''
  }
}

const confirmarEvaluacion2FA = async () => {
  if (!modal2FA.value.codigo2FA || modal2FA.value.codigo2FA.length !== 6) {
    modal2FA.value.error = 'El código 2FA debe tener exactamente 6 dígitos.'
    return
  }

  try {
    const res = await fetch(`http://localhost:3000/api/lotes-afectados/${modal2FA.value.loteAfectadoId}/evaluar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: modal2FA.value.decision,
        justificacion: modal2FA.value.justificacion,
        codigo2FA: modal2FA.value.codigo2FA,
        usuario: usuarioActivo.value.name,
        rol: usuarioActivo.value.role
      })
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    modal2FA.value.visible = false
  } catch (e) {
    modal2FA.value.error = e.message
  }
}

// Registro de nuevo lote
const guardarNuevoLote = async () => {
  if (!modalNuevoLote.value.numeroLote) {
    alert('Ingrese el número de lote.')
    return
  }

  try {
    const res = await fetch('http://localhost:3000/api/inventario/lotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modalNuevoLote.value)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    modalNuevoLote.value.visible = false
    modalNuevoLote.value.numeroLote = ''
  } catch (e) {
    alert('Error al guardar lote: ' + e.message)
  }
}

// Exportación CSV
const descargarCSV = () => {
  window.open('http://localhost:3000/api/exportar/csv', '_blank')
}
</script>

<template>
  <div class="dashboard-container">
    <!-- BARRA SUPERIOR DE MÉTRICAS KPI -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-title">Sensores Monitoreados</span>
        <div class="kpi-value-row">
          <span class="kpi-value">{{ sensores.length }}</span>
          <span class="kpi-badge badge-green">2°C a 8°C GxP</span>
        </div>
        <span class="kpi-sub">Sala room_911 Activa</span>
      </div>

      <div class="kpi-card" :class="{ 'kpi-card-danger': metricas.incidentesActivos > 0 }">
        <span class="kpi-title">Incidentes Activos</span>
        <div class="kpi-value-row">
          <span class="kpi-value" :class="{ 'text-danger': metricas.incidentesActivos > 0 }">
            {{ metricas.incidentesActivos }}
          </span>
          <span v-if="metricas.incidentesActivos > 0" class="kpi-badge badge-red pulse-critical">Alerta SLA</span>
          <span v-else class="kpi-badge badge-green">Sin Desviaciones</span>
        </div>
        <span class="kpi-sub">Total acumulado: {{ metricas.incidentesTotales }}</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">Tiempo Medio de Respuesta (MTTR)</span>
        <div class="kpi-value-row">
          <span class="kpi-value">{{ metricas.mttrMinutos }} <small style="font-size: 1rem; color: #9ca3af;">min</small></span>
          <span class="kpi-badge badge-blue">Objetivo &lt; 15 min</span>
        </div>
        <span class="kpi-sub">Basado en {{ metricas.incidentesCerrados }} incidentes resueltos</span>
      </div>

      <div class="kpi-card" :class="{ 'kpi-card-warning': metricas.lotesEnRevision > 0 }">
        <span class="kpi-title">Lotes en Revisión Técnica</span>
        <div class="kpi-value-row">
          <span class="kpi-value" :class="{ 'text-warning': metricas.lotesEnRevision > 0 }">
            {{ metricas.lotesEnRevision }}
          </span>
          <span v-if="metricas.lotesEnRevision > 0" class="kpi-badge badge-yellow">Evaluación 2FA</span>
          <span v-else class="kpi-badge badge-green">Lotes Aptos</span>
        </div>
        <span class="kpi-sub">Cadena de frío controlada</span>
      </div>
    </section>

    <!-- PESTAÑAS DE NAVEGACIÓN -->
    <nav class="tabs-nav">
      <button :class="{ active: tabActiva === 'monitoreo' }" @click="tabActiva = 'monitoreo'">
        📡 Monitoreo IoT en Vivo
      </button>
      <button :class="{ active: tabActiva === 'incidentes' }" @click="tabActiva = 'incidentes'">
        🚨 Incidentes & Escalamiento SLA
        <span v-if="incidentesActivos.length > 0" class="counter-badge">{{ incidentesActivos.length }}</span>
      </button>
      <button :class="{ active: tabActiva === 'inventario' }" @click="tabActiva = 'inventario'">
        📦 Gestión de Inventario & Lotes
        <span v-if="lotesPendientes.length > 0" class="counter-badge badge-yellow">{{ lotesPendientes.length }}</span>
      </button>
      <button :class="{ active: tabActiva === 'auditoria' }" @click="tabActiva = 'auditoria'">
        📑 Auditoría Médica & MTTR
      </button>
    </nav>

    <!-- =======================================================================
         PESTAÑA 1: MONITOREO IOT Y SIMULACIÓN DE TELEMETRÍA (Módulos 1 & 2)
         ======================================================================= -->
    <div v-if="tabActiva === 'monitoreo'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>Sensores de Cadena de Frío en Tiempo Real</h2>
          <p class="section-desc">Telemetría transmitida por WebSockets cada 3.5 segundos. Rango permitido: <strong>2.0°C a 8.0°C</strong>.</p>
        </div>
      </div>

      <div class="sensor-grid">
        <div 
          v-for="sensor in sensores" 
          :key="sensor.id" 
          class="sensor-card"
          :class="{
            'sensor-normal': sensor.estado === 'Normal',
            'sensor-warning': sensor.estado === 'Advertencia',
            'sensor-critical pulse-critical': sensor.estado === 'Crítico'
          }"
        >
          <div class="sensor-header">
            <div>
              <span class="sensor-tag">{{ sensor.id }} · {{ sensor.tipoEquipo }}</span>
              <h3 class="sensor-title">{{ sensor.cuarto }}</h3>
            </div>
            <span class="status-pill" :class="'pill-' + sensor.estado.toLowerCase()">
              {{ sensor.estado }}
            </span>
          </div>

          <div class="temp-display">
            <span class="temp-number">{{ sensor.temp }}</span>
            <span class="temp-unit">°C</span>
          </div>

          <!-- Barra de Rango de Temperatura -->
          <div class="range-meter">
            <div class="range-labels">
              <span>0°C</span>
              <span class="range-target">2°C - 8°C (Óptimo)</span>
              <span>15°C</span>
            </div>
            <div class="meter-track">
              <div class="meter-safe-zone" style="left: 13.3%; width: 40%;"></div>
              <div 
                class="meter-needle"
                :style="{ left: Math.min(100, Math.max(0, (sensor.temp / 15) * 100)) + '%' }"
              ></div>
            </div>
          </div>

          <div class="sensor-details">
            <div class="detail-item">
              <span class="detail-label">Humedad Relativa:</span>
              <span class="detail-value">{{ sensor.humedad }}%</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Lecturas Fuera de Rango:</span>
              <span class="detail-value" :class="{ 'text-danger': sensor.lecturasFuera > 0 }">
                {{ sensor.lecturasFuera }} / 3 (Consecutivas)
              </span>
            </div>
          </div>

          <!-- MÓDULO 1: SIMULACIÓN DE ANOMALÍAS CONTROLADAS -->
          <div class="fault-injection-box">
            <span class="box-title">Inyección de Fallos Controlados:</span>
            <div class="fault-buttons">
              <button 
                class="btn-fault btn-fault-ramp"
                @click="inyectarFallo(sensor.id, 'AUMENTO_PAULATINO')"
                title="Sube progresivamente la temperatura hasta 12.5°C"
              >
                📈 Aumento Paulatino (12°C)
              </button>
              <button 
                class="btn-fault btn-fault-door"
                @click="inyectarFallo(sensor.id, 'APERTURA_PUERTA')"
                title="Simula apertura prolongada con aumento brusco térmico y humedad"
              >
                🚪 Apertura de Puerta (14°C)
              </button>
              <button 
                class="btn-fault btn-fault-reset"
                @click="inyectarFallo(sensor.id, 'NORMALIZAR')"
                title="Restaura la temperatura al rango seguro (4.5°C)"
              >
                🔄 Normalizar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- =======================================================================
         PESTAÑA 2: INCIDENTES & ESCALAMIENTO SLA (Módulo 3)
         ======================================================================= -->
    <div v-if="tabActiva === 'incidentes'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>Motor de Alertas y Escalamiento por SLA</h2>
          <p class="section-desc">
            Regla: <strong>&gt; 3 lecturas fuera de rango</strong> abre Incidente Nivel 1.
            Escalamientos automáticos sin acuse: <strong>Minuto 5 (Supervisor)</strong> $\rightarrow$ <strong>Minuto 10 (Director + Protocolo de Emergencia)</strong>.
          </p>
        </div>
      </div>

      <div v-if="incidentesActivos.length === 0" class="empty-state">
        <span class="empty-icon">🛡️</span>
        <h3>No hay incidentes activos en este momento</h3>
        <p>Todos los cuartos fríos y neveras operan dentro de los parámetros estrictos de 2°C a 8°C.</p>
      </div>

      <div v-else class="incidents-list">
        <div 
          v-for="inc in incidentesActivos" 
          :key="inc.id" 
          class="incident-card"
          :class="{ 'incident-emergency': inc.protocoloEmergenciaActivo }"
        >
          <div class="incident-top">
            <div>
              <div class="incident-badge-row">
                <span class="badge-code">{{ inc.id }}</span>
                <span class="badge-level" :class="'level-' + inc.nivel.split(' ')[0].toLowerCase()">
                  {{ inc.nivel }}
                </span>
                <span class="badge-status" :class="'status-' + inc.estado.toLowerCase().replace(' ', '-')">
                  {{ inc.estado }}
                </span>
              </div>
              <h3 class="incident-title">{{ inc.cuarto }} ({{ inc.sensorId }})</h3>
              <p class="incident-meta">
                Temperatura crítica registrada: <strong>{{ inc.temperaturaCritica }}°C</strong> ·
                Iniciado: <strong>{{ new Date(inc.creadoEn).toLocaleTimeString() }}</strong>
              </p>
            </div>

            <div class="incident-actions">
              <button 
                v-if="inc.estado === 'Abierto'"
                class="btn-action btn-ack" 
                @click="darAcuse(inc.id)"
              >
                ✋ Dar Acuse de Recibo
              </button>
              <button 
                class="btn-action btn-close-inc" 
                @click="abrirModalCerrar(inc)"
              >
                ✅ Cerrar Incidente
              </button>
            </div>
          </div>

          <!-- LÍNEA DE TIEMPO DEL SLA -->
          <div class="sla-timeline">
            <span class="sla-label">Línea de Vida SLA:</span>
            <div class="sla-steps">
              <div class="sla-step completed">
                <div class="step-circle">0</div>
                <div class="step-info">
                  <strong>Minuto 0</strong>
                  <span>Técnico de Turno notificado</span>
                </div>
              </div>

              <div class="sla-step" :class="{ completed: inc.nivel !== 'Nivel 1' }">
                <div class="step-circle">5</div>
                <div class="step-info">
                  <strong>Minuto 5</strong>
                  <span>Supervisor de Calidad</span>
                </div>
              </div>

              <div class="sla-step" :class="{ completed: inc.protocoloEmergenciaActivo }">
                <div class="step-circle">10</div>
                <div class="step-info">
                  <strong>Minuto 10</strong>
                  <span>Director & Emergencia</span>
                </div>
              </div>
            </div>
            <div class="sla-current-desc">
              📌 Estado actual SLA: <em>{{ inc.etapaSLA }}</em>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- =======================================================================
         PESTAÑA 3: GESTIÓN DE INVENTARIO & LOTES AFECTADOS (Módulo 5)
         ======================================================================= -->
    <div v-if="tabActiva === 'inventario'" class="tab-panel">
      <!-- SUBSECCIÓN: LOTES POTENCIALMENTE AFECTADOS (REGLA MÉDICA HUMANA) -->
      <div class="inventory-section">
        <div class="section-header">
          <div>
            <h2>⚠️ Lotes Marcados para Evaluación de Calidad</h2>
            <p class="section-desc">
              <strong>Regla de Negocio:</strong> Ningún lote se descarta ni se aprueba automáticamente por una alerta de temperatura.
              La disposición requiere evaluación técnica de personal autorizado con <strong>Autenticación 2FA</strong>.
            </p>
          </div>
        </div>

        <div v-if="lotesAfectados.length === 0" class="empty-state-mini">
          <span>✨ No hay lotes bajo investigación de excursión térmica.</span>
        </div>

        <div v-else class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Producto / Medicamento</th>
                <th>Unidades</th>
                <th>Ubicación</th>
                <th>Incidente</th>
                <th>Disposición</th>
                <th>Dictamen / Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="la in lotesAfectados" :key="la.id">
                <td><strong>{{ la.numeroLote }}</strong></td>
                <td>{{ la.productoNombre }}</td>
                <td>{{ la.cantidad.toLocaleString() }} amp/viales</td>
                <td>{{ la.ubicacion }}</td>
                <td><code>{{ la.incidenteId }}</code></td>
                <td>
                  <span class="badge-decision" :class="'decision-' + la.decision.toLowerCase()">
                    {{ la.decision }}
                  </span>
                </td>
                <td>
                  <div v-if="la.decision === 'PENDIENTE_REVISION'" class="action-btn-group">
                    <button class="btn-sm btn-approve" @click="abrirModal2FA(la, 'APTO')">
                      ✓ Autorizar Apto (2FA)
                    </button>
                    <button class="btn-sm btn-reject" @click="abrirModal2FA(la, 'NO_APTO')">
                      ✕ Degradar / No Apto (2FA)
                    </button>
                  </div>
                  <div v-else class="reviewed-info">
                    <span>Evaluado por: <strong>{{ la.decididoPor }}</strong></span>
                    <small>Justificación: "{{ la.justificacion }}"</small>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- SUBSECCIÓN: CATÁLOGO E INVENTARIO GENERAL -->
      <div class="inventory-section" style="margin-top: 2.5rem;">
        <div class="section-header">
          <div>
            <h2>Catálogo General de Medicamentos e Insumos en Frío</h2>
            <p class="section-desc">Lotes almacenados en neveras y cuartos fríos de room_911.</p>
          </div>
          <button class="btn-primary" @click="modalNuevoLote.visible = true">
            + Registrar Nuevo Lote
          </button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Medicamento / Insumo</th>
                <th>Número de Lote</th>
                <th>Stock Disponible</th>
                <th>Vencimiento</th>
                <th>Ubicación / Sensor</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="lote in lotes" :key="lote.id">
                <td><code>{{ lote.codigo }}</code></td>
                <td><strong>{{ lote.productoNombre }}</strong></td>
                <td>{{ lote.numeroLote }}</td>
                <td>{{ lote.cantidad.toLocaleString() }}</td>
                <td>{{ lote.vencimiento }}</td>
                <td>{{ lote.ubicacion }} ({{ lote.sensorId }})</td>
                <td>
                  <span class="badge-lote" :class="'lote-' + lote.estado.toLowerCase().replace(' ', '-')">
                    {{ lote.estado }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- =======================================================================
         PESTAÑA 4: AUDITORÍA MÉDICA & MTTR (Módulo 4)
         ======================================================================= -->
    <div v-if="tabActiva === 'auditoria'" class="tab-panel">
      <div class="section-header">
        <div>
          <h2>Auditoría y Certificaciones Médicas</h2>
          <p class="section-desc">Historial inmutable de excursiones térmicas, acuses y cálculo del tiempo medio de respuesta (MTTR).</p>
        </div>
        <button class="btn-export" @click="descargarCSV">
          📥 Descargar Historial Completo (CSV)
        </button>
      </div>

      <div class="audit-summary-grid">
        <div class="audit-card">
          <h4>MTTR (Mean Time to Resolution)</h4>
          <p class="metric-big">{{ metricas.mttrMinutos }} <small>minutos</small></p>
          <p class="metric-sub">Tiempo promedio entre detección de alarma y cierre documentado.</p>
        </div>
        <div class="audit-card">
          <h4>Tasa de Cumplimiento GxP</h4>
          <p class="metric-big text-success">99.4%</p>
          <p class="metric-sub">Temperatura sostenida entre 2.0°C y 8.0°C sin degradación no evaluada.</p>
        </div>
        <div class="audit-card">
          <h4>Resolución de Incidentes</h4>
          <p class="metric-big">{{ metricas.incidentesCerrados }} / {{ metricas.incidentesTotales }}</p>
          <p class="metric-sub">Total de desviaciones atendidas con acuse y protocolo documentado.</p>
        </div>
      </div>

      <h3 style="margin-top: 2rem; margin-bottom: 1rem;">Bitácora de Incidentes Resueltos</h3>
      <div v-if="incidentesCerrados.length === 0" class="empty-state-mini">
        No hay incidentes cerrados registrados en esta sesión.
      </div>
      <div v-else class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Equipo / Sensor</th>
              <th>Temp. Máx</th>
              <th>Apertura</th>
              <th>Cierre</th>
              <th>Acusado Por</th>
              <th>Cerrado Por</th>
              <th>Motivo de Falla</th>
              <th>Acciones Correctivas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inc in incidentesCerrados" :key="inc.id">
              <td><code>{{ inc.id }}</code></td>
              <td>{{ inc.cuarto }}</td>
              <td class="text-danger"><strong>{{ inc.temperaturaCritica }}°C</strong></td>
              <td>{{ new Date(inc.creadoEn).toLocaleTimeString() }}</td>
              <td>{{ new Date(inc.cerradoEn).toLocaleTimeString() }}</td>
              <td>{{ inc.acusadoPor || 'No registrado' }}</td>
              <td><strong>{{ inc.cerradoPor }}</strong></td>
              <td>{{ inc.motivo }}</td>
              <td>{{ inc.accionesCorrectivas }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- =======================================================================
         MODALES: CIERRE DE INCIDENTE, EVALUACIÓN 2FA, NUEVO LOTE
         ======================================================================= -->

    <!-- Modal Cierre de Incidente -->
    <div v-if="modalCerrar.visible" class="modal-backdrop">
      <div class="modal-card">
        <h3>Cerrar Incidente <code>{{ modalCerrar.incidenteId }}</code></h3>
        <p class="modal-subtitle">Requerido por normativas de auditoría médica para documentar la causa raíz y medidas correctivas.</p>

        <div class="form-group">
          <label>Motivo de la Falla:</label>
          <select v-model="modalCerrar.motivo" class="form-control">
            <option>Falla eléctrica momentánea</option>
            <option>Puerta mal cerrada por operador</option>
            <option>Falla mecánica del compresor</option>
            <option>Sensor térmico descalibrado</option>
            <option>Mantenimiento preventivo no notificado</option>
            <option>Otro</option>
          </select>
        </div>

        <div class="form-group">
          <label>Acciones Correctivas Aplicadas:</label>
          <textarea 
            v-model="modalCerrar.acciones" 
            rows="3" 
            class="form-control" 
            placeholder="Ej: Se activó el sistema de enfriamiento de contingencia por hielo seco y se verificó el sello hermético..."
          ></textarea>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" @click="modalCerrar.visible = false">Cancelar</button>
          <button class="btn-confirm-green" @click="confirmarCierreIncidente">Registrar Cierre Oficial</button>
        </div>
      </div>
    </div>

    <!-- Modal Autorización 2FA para Lotes Afectados -->
    <div v-if="modal2FA.visible" class="modal-backdrop">
      <div class="modal-card">
        <h3>🔐 Autorización de Calidad con 2FA Obligatorio</h3>
        <p class="modal-subtitle">
          Disposición para lote <strong>{{ modal2FA.loteNumero }}</strong> ({{ modal2FA.productoNombre }}).
          Decisión a registrar: <strong :class="modal2FA.decision === 'APTO' ? 'text-success' : 'text-danger'">{{ modal2FA.decision }}</strong>.
        </p>

        <div class="form-group">
          <label>Justificación Técnica / Médica:</label>
          <textarea v-model="modal2FA.justificacion" rows="3" class="form-control"></textarea>
        </div>

        <div class="form-group">
          <label>Código de Seguridad 2FA (6 dígitos):</label>
          <div class="tfa-input-row">
            <input 
              v-model="modal2FA.codigo2FA" 
              type="text" 
              maxlength="6" 
              class="form-control tfa-input"
              placeholder="741258"
            />
            <span class="tfa-hint">💡 Código de prueba demo: <code>741258</code></span>
          </div>
        </div>

        <div v-if="modal2FA.error" class="alert-error">
          ⚠️ {{ modal2FA.error }}
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" @click="modal2FA.visible = false">Cancelar</button>
          <button 
            :class="modal2FA.decision === 'APTO' ? 'btn-confirm-green' : 'btn-confirm-red'"
            @click="confirmarEvaluacion2FA"
          >
            Firmar y Disponer Lote
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Registrar Nuevo Lote -->
    <div v-if="modalNuevoLote.visible" class="modal-backdrop">
      <div class="modal-card">
        <h3>📦 Registrar Nuevo Lote en Cadena de Frío</h3>

        <div class="form-group">
          <label>Producto:</label>
          <select v-model="modalNuevoLote.productoId" class="form-control">
            <option :value="1">Vacuna mRNA COVID-19 (MED-VAC-001)</option>
            <option :value="2">Insulina Glargina 100 UI/ml (MED-INS-002)</option>
            <option :value="3">Anticuerpos Monoclonales (MED-BIO-003)</option>
            <option :value="4">Vacuna Hepatitis B (MED-VAC-004)</option>
          </select>
        </div>

        <div class="form-group">
          <label>Número de Lote:</label>
          <input v-model="modalNuevoLote.numeroLote" type="text" class="form-control" placeholder="LOT-2026-N99" />
        </div>

        <div class="form-group">
          <label>Cantidad (Unidades):</label>
          <input v-model="modalNuevoLote.cantidad" type="number" class="form-control" />
        </div>

        <div class="form-group">
          <label>Ubicación / Equipo Asignado:</label>
          <select v-model="modalNuevoLote.sensorId" class="form-control">
            <option value="SEN-01">Cuarto Frío 1 (Vacunas)</option>
            <option value="SEN-02">Nevera 1 (Insulinas)</option>
            <option value="SEN-03">Nevera 2 (Reactivos Biológicos)</option>
          </select>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" @click="modalNuevoLote.visible = false">Cancelar</button>
          <button class="btn-confirm-green" @click="guardarNuevoLote">Guardar en Inventario</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.kpi-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: transform 0.2s;
}

.kpi-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-light);
}

.kpi-card-danger {
  border-color: var(--color-danger);
  background: rgba(239, 68, 68, 0.05);
}

.kpi-card-warning {
  border-color: var(--color-warning);
  background: rgba(245, 158, 11, 0.05);
}

.kpi-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
}

.kpi-value-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.kpi-value {
  font-size: 2rem;
  font-weight: 800;
  color: var(--text-main);
  font-family: var(--font-mono);
}

.kpi-sub {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.kpi-badge {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
}

.badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.badge-red { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.badge-yellow { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.badge-blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }

/* Tabs */
.tabs-nav {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.5rem;
}

.tabs-nav button {
  background: transparent;
  color: var(--text-muted);
  border: none;
  padding: 0.6rem 1.2rem;
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.tabs-nav button:hover {
  background: var(--bg-card);
  color: var(--text-main);
}

.tabs-nav button.active {
  background: var(--accent-blue);
  color: white;
}

.counter-badge {
  background: #dc2626;
  color: white;
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
}

/* Sections */
.tab-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.section-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

/* Sensores Grid */
.sensor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.sensor-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sensor-normal { border-top: 4px solid var(--color-normal); }
.sensor-warning { border-top: 4px solid var(--color-warning); }
.sensor-critical { border-top: 4px solid var(--color-danger); }

.sensor-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.sensor-tag {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--text-dim);
}

.sensor-title {
  font-size: 1.05rem;
  font-weight: 700;
}

.status-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
  text-transform: uppercase;
}

.pill-normal { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.pill-advertencia { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.pill-crítico { background: rgba(239, 68, 68, 0.2); color: #f87171; }

.temp-display {
  display: flex;
  align-items: baseline;
  justify-content: center;
  padding: 0.5rem 0;
}

.temp-number {
  font-size: 3.5rem;
  font-weight: 900;
  font-family: var(--font-mono);
  letter-spacing: -0.05em;
}

.temp-unit {
  font-size: 1.5rem;
  color: var(--text-muted);
  margin-left: 0.3rem;
}

.range-meter {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: var(--text-dim);
}

.range-target {
  color: #34d399;
  font-weight: 600;
}

.meter-track {
  height: 8px;
  background: #374151;
  border-radius: 4px;
  position: relative;
  overflow: visible;
}

.meter-safe-zone {
  position: absolute;
  height: 100%;
  background: rgba(16, 185, 129, 0.4);
  border-radius: 4px;
}

.meter-needle {
  position: absolute;
  top: -4px;
  width: 6px;
  height: 16px;
  background: white;
  border-radius: 3px;
  transform: translateX(-50%);
  box-shadow: 0 0 4px black;
}

.sensor-details {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.detail-item {
  display: flex;
  justify-content: space-between;
}

.detail-label { color: var(--text-muted); }
.detail-value { font-weight: 600; }

.fault-injection-box {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.box-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: 700;
}

.fault-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.btn-fault {
  border: none;
  padding: 0.45rem 0.6rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: opacity 0.2s;
}

.btn-fault:hover { opacity: 0.85; }
.btn-fault-ramp { background: #b45309; color: #fef3c7; }
.btn-fault-door { background: #b91c1c; color: #fee2e2; }
.btn-fault-reset { background: #15803d; color: #dcfce7; }

/* Incidentes */
.incident-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.incident-emergency {
  border: 2px solid #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.incident-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.incident-badge-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.3rem;
}

.badge-code {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  background: #374151;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.badge-level {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
}

.level-nivel { background: #f59e0b; color: black; }

.badge-status {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
}

.status-abierto { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.status-en-atención { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }

.incident-title {
  font-size: 1.15rem;
  font-weight: 700;
}

.incident-meta {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.incident-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-action {
  border: none;
  padding: 0.5rem 0.85rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-ack { background: #3b82f6; color: white; }
.btn-close-inc { background: #10b981; color: white; }

/* SLA Timeline */
.sla-timeline {
  background: rgba(0, 0, 0, 0.25);
  padding: 1rem;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sla-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: 700;
}

.sla-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.sla-step {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  opacity: 0.4;
}

.sla-step.completed {
  opacity: 1;
}

.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #374151;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
}

.sla-step.completed .step-circle {
  background: var(--accent-cyan);
  color: black;
}

.step-info {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
}

.sla-current-desc {
  font-size: 0.8rem;
  color: #fbbf24;
}

/* Data Tables */
.table-responsive {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.85rem;
}

.data-table th {
  background: #1e293b;
  color: var(--text-muted);
  font-weight: 600;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.badge-decision {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.decision-pendiente_revision { background: #b45309; color: #fef3c7; }
.decision-apto { background: #15803d; color: #dcfce7; }
.decision-no_apto { background: #b91c1c; color: #fee2e2; }

.badge-lote {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
}

.lote-vigente { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.lote-en-revisión { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.lote-degradado { background: rgba(239, 68, 68, 0.15); color: #f87171; }

.action-btn-group {
  display: flex;
  gap: 0.4rem;
}

.btn-sm {
  border: none;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-approve { background: #16a34a; color: white; }
.btn-reject { background: #dc2626; color: white; }

.reviewed-info {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
}

.empty-icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
.empty-state-mini { padding: 1.5rem; text-align: center; color: var(--text-muted); }

/* Auditoría */
.audit-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
  margin-bottom: 2rem;
}

.audit-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 1.25rem;
  border-radius: 8px;
}

.metric-big {
  font-size: 2.25rem;
  font-weight: 800;
  font-family: var(--font-mono);
  margin: 0.5rem 0;
}

.metric-sub {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.btn-export {
  background: #0284c7;
  color: white;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: #2563eb;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

/* Modales */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 1.75rem;
  max-width: 500px;
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
}

.modal-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-group label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.form-control {
  background: #1f2937;
  border: 1px solid #4b5563;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  outline: none;
}

.form-control:focus {
  border-color: #3b82f6;
}

.tfa-input-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tfa-input {
  width: 140px;
  font-family: var(--font-mono);
  font-size: 1.2rem;
  letter-spacing: 0.2em;
  text-align: center;
}

.tfa-hint code {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}

.alert-error {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  padding: 0.5rem;
  border-radius: 6px;
  font-size: 0.8rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-cancel {
  background: #374151;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
}

.btn-confirm-green {
  background: #16a34a;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.btn-confirm-red {
  background: #dc2626;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
</style>
