<script setup>
const modal = defineModel({ type: Object, required: true })
defineEmits(['confirm'])
</script>

<template>
  <div v-if="modal.visible" class="modal-overlay">
    <div class="modal-card">
      <div class="modal-title-2fa">
        <span></span>
        <h3>Autenticación 2FA: Disposición Médica de Lote</h3>
      </div>
      <p class="modal-subtitle">
        Disposición final de <strong>{{ modal.loteNumero }}</strong> ({{ modal.productoNombre }}) como
        <strong :class="modal.decision === 'APTO' ? 'text-green' : 'text-danger'">{{ modal.decision }}</strong>.
      </p>

      <div v-if="modal.error" class="alert alert-danger" style="margin-top: 1rem;">
        {{ modal.error }}
      </div>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Justificación Médica / Técnica (Mínimo 10 carácteres)</label>
        <textarea v-model="modal.justificacion" rows="3" class="custom-textarea" required></textarea>
      </div>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Código de Seguridad 2FA (6 Dígitos TOTP)</label>
        <input
          v-model="modal.codigo2FA"
          type="text"
          maxlength="6"
          class="custom-input input-2fa"
          placeholder="741258"
          required
        />
        <span class="field-hint">Código de prueba sugerido para demostración: <code>741258</code></span>
      </div>

      <div class="modal-buttons">
        <button class="btn-secondary" @click="modal.visible = false">Cancelar</button>
        <button
          class="btn-primary"
          :class="modal.decision === 'APTO' ? 'btn-success' : 'btn-danger'"
          @click="$emit('confirm')"
        >
          Confirmar Disposición con 2FA
        </button>
      </div>
    </div>
  </div>
</template>
