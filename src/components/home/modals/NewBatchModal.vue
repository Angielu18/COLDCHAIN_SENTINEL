<script setup>
defineProps({
  sensores: { type: Array, default: () => [] }
})
const modal = defineModel({ type: Object, required: true })
defineEmits(['confirm'])
</script>

<template>
  <div v-if="modal.visible" class="modal-overlay">
    <div class="modal-card">
      <h3>Registrar Nuevo Lote de Medicamento</h3>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Medicamento</label>
        <select v-model="modal.productoId" class="custom-select">
          <option :value="1">Vacuna mRNA COVID-19</option>
          <option :value="2">Insulina Glargina 100 UI/ml</option>
          <option :value="3">Anticuerpos Monoclonales</option>
          <option :value="4">Vacuna Hepatitis B</option>
        </select>
      </div>

      <div class="form-row" style="margin-top: 1rem;">
        <div class="form-group">
          <label>Número de Lote</label>
          <input v-model="modal.numeroLote" type="text" placeholder="LOT-2026-X99" class="custom-input" required />
        </div>
        <div class="form-group">
          <label>Cantidad (Unidades)</label>
          <input v-model.number="modal.cantidad" type="number" class="custom-input" required />
        </div>
      </div>

      <div class="form-row" style="margin-top: 1rem;">
        <div class="form-group">
          <label>Fecha de Vencimiento</label>
          <input v-model="modal.vencimiento" type="date" class="custom-input" required />
        </div>
        <div class="form-group">
          <label>Ubicación / Equipo</label>
          <select v-model="modal.sensorId" class="custom-select">
            <option v-for="s in sensores" :key="s.id" :value="s.id">{{ s.cuarto }}</option>
          </select>
        </div>
      </div>

      <div class="modal-buttons">
        <button class="btn-secondary" @click="modal.visible = false">Cancelar</button>
        <button class="btn-primary" @click="$emit('confirm')">Registrar Lote</button>
      </div>
    </div>
  </div>
</template>
