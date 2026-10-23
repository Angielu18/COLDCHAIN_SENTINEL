<script setup>
const modal = defineModel({ type: Object, required: true })
defineEmits(['confirm'])
</script>

<template>
  <div v-if="modal.visible" class="modal-overlay">
    <div class="modal-card">
      <h3>Cierre de Incidente Crítico</h3>
      <p class="modal-subtitle">Registro obligatorio de causa raíz y mitigación técnica para cumplimiento GxP.</p>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Causa Raíz Identificada</label>
        <input v-model="modal.motivo" type="text" class="custom-input" required />
      </div>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Acciones Correctivas y Preventivas (CAPA)</label>
        <textarea v-model="modal.acciones" rows="3" class="custom-textarea" placeholder="Ej. Cambio de termostato y verificación de sellado magnético..." required></textarea>
      </div>

      <div class="modal-buttons">
        <button class="btn-secondary" @click="modal.visible = false">Cancelar</button>
        <button class="btn-primary" @click="$emit('confirm')">Confirmar Cierre y Normalizar Sensor</button>
      </div>
    </div>
  </div>
</template>
