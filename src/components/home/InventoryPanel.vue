<script setup>
defineProps({
  lotesAfectados: { type: Array, default: () => [] },
  lotes: { type: Array, default: () => [] }
})
defineEmits(['new-medicine', 'new-batch', 'evaluate'])
</script>

<template>
  <div class="tab-panel">
    <div class="section-header">
      <div>
        <h2>Módulo 5: Gestión de Inventario &amp; Disposición 2FA</h2>
        <p class="section-desc">Control estricto de medicamentos, lotes y evaluación manual obligatoria mediante 2FA.</p>
      </div>
      <div class="header-buttons">
        <button class="btn-secondary" @click="$emit('new-medicine')">Nuevo Medicamento</button>
        <button class="btn-primary" @click="$emit('new-batch')">Registrar Nuevo Lote</button>
      </div>
    </div>

    <div class="card affected-batches-card">
      <div class="card-title-row">
        <h3>Lotes en Evaluación Técnica por Alerta Térmica</h3>
        <span class="badge-critical-notice">Regla Crítica: Disposición Manual Obligatoria con 2FA</span>
      </div>
      <p class="card-desc">
        Al generarse una alerta en un sensor, todos los lotes guardados en ese equipo pasan a estado <code>PENDIENTE_REVISION</code>.
        Ningún lote se dispone automáticamente.
      </p>

      <table v-if="lotesAfectados.length > 0" class="custom-table" style="margin-top: 1rem;">
        <thead>
          <tr>
            <th>ID Afectación</th>
            <th>N° Lote</th>
            <th>Medicamento / Insumo</th>
            <th>Cantidad</th>
            <th>Ubicación</th>
            <th>Estado Revisión</th>
            <th>Disposición / Justificación</th>
            <th>Acción 2FA</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="la in lotesAfectados" :key="la.id">
            <td><code>{{ la.id }}</code></td>
            <td><strong>{{ la.numeroLote }}</strong></td>
            <td>{{ la.productoNombre }}</td>
            <td>{{ la.cantidad.toLocaleString() }} ampollas</td>
            <td>{{ la.ubicacion }}</td>
            <td>
              <span class="status-pill" :class="la.decision.toLowerCase().replace('_', '-')">
                {{ la.decision }}
              </span>
            </td>
            <td>
              <span v-if="la.justificacion">{{ la.justificacion }} <br><small>Por: {{ la.decididoPor }}</small></span>
              <span v-else class="text-muted">Pendiente de evaluación técnica</span>
            </td>
            <td>
              <div v-if="la.decision === 'PENDIENTE_REVISION'" class="action-buttons-cell">
                <button class="btn-small btn-success" @click="$emit('evaluate', la, 'APTO')">Declarar APTO (2FA)</button>
                <button class="btn-small btn-danger" @click="$emit('evaluate', la, 'NO_APTO')">Descartar (2FA)</button>
              </div>
              <span v-else class="text-green font-bold">Dictamen Completado</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-muted" style="margin-top: 1rem;">No hay lotes con reporte de excursión térmica pendiente de evaluación.</p>
    </div>

    <div class="card" style="margin-top: 1.5rem;">
      <h3>Inventario General de Lotes en Almacenamiento</h3>
      <table class="custom-table" style="margin-top: 1rem;">
        <thead>
          <tr>
            <th>Código Insumo</th>
            <th>Medicamento</th>
            <th>Número de Lote</th>
            <th>Cantidad</th>
            <th>Vencimiento</th>
            <th>Ubicación</th>
            <th>Estado del Lote</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lotes" :key="l.id">
            <td><code>{{ l.codigo }}</code></td>
            <td>{{ l.productoNombre }}</td>
            <td><strong>{{ l.numeroLote }}</strong></td>
            <td>{{ l.cantidad.toLocaleString() }}</td>
            <td>{{ l.vencimiento }}</td>
            <td>{{ l.ubicacion }}</td>
            <td><span class="status-pill" :class="l.estado.toLowerCase().replace(/\s+/g, '-')">{{ l.estado }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
