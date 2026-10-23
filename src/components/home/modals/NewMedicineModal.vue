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
      <h3>Registrar Medicamento / Insumo Médico</h3>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Código Único</label>
        <input v-model="modal.codigo" type="text" placeholder="Ej. MED-VAC-005" class="custom-input" required />
      </div>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Nombre del Medicamento</label>
        <input v-model="modal.nombre" type="text" placeholder="Ej. Suero Antiofídico Polivalente" class="custom-input" required />
      </div>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Equipo / Nevera Asignada</label>
        <select v-model="modal.equipoId" class="custom-select">
          <option v-for="s in sensores" :key="s.id" :value="s.id">{{ s.id }} — {{ s.cuarto }}</option>
        </select>
      </div>

      <div class="modal-buttons">
        <button class="btn-secondary" @click="modal.visible = false">Cancelar</button>
        <button class="btn-primary" @click="$emit('confirm')">Guardar Medicamento</button>
      </div>
    </div>
  </div>
</template>
