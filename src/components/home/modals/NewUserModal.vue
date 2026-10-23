<script setup>
const modal = defineModel({ type: Object, required: true })
defineEmits(['confirm'])
</script>

<template>
  <div v-if="modal.visible" class="modal-overlay">
    <div class="modal-card">
      <h3>Registrar Nuevo Usuario</h3>
      <p class="modal-subtitle">
        La cuenta se crea <strong>ACTIVA</strong> con el rol asignado por el Director. El registro público está deshabilitado.
      </p>

      <div v-if="modal.error" class="iam-form-error">
        {{ modal.error }}
      </div>

      <form @submit.prevent="$emit('confirm')">
        <div class="form-row" style="margin-top: 1rem;">
          <div class="form-group">
            <label>Nombres</label>
            <input v-model="modal.nombre" type="text" class="custom-input" placeholder="Ej. Carlos" required />
          </div>
          <div class="form-group">
            <label>Apellidos</label>
            <input v-model="modal.apellido" type="text" class="custom-input" placeholder="Ej. Méndez" required />
          </div>
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>Correo Electrónico (Gmail / Institucional)</label>
          <input v-model="modal.email" type="email" class="custom-input" placeholder="usuario@hospital.org" required />
        </div>

        <div class="form-row" style="margin-top: 1rem;">
          <div class="form-group">
            <label>Teléfono de Contacto</label>
            <input v-model="modal.telefono" type="tel" class="custom-input" placeholder="+57 300 0000000" />
          </div>
          <div class="form-group">
            <label>Rol Asignado</label>
            <select v-model="modal.rol" class="custom-select" required>
              <option value="TECNICO">Técnico de Turno</option>
              <option value="SUPERVISOR">Supervisor de Calidad</option>
              <option value="INVENTARIO">Gestor de Inventario</option>
              <option value="DIRECTOR">Director del Laboratorio</option>
            </select>
          </div>
        </div>

        <div class="form-row" style="margin-top: 1rem;">
          <div class="form-group">
            <label>Contraseña</label>
            <input v-model="modal.password" type="password" class="custom-input" placeholder="Mínimo 6 caracteres" required />
          </div>
          <div class="form-group">
            <label>Confirmar Contraseña</label>
            <input v-model="modal.passwordConfirm" type="password" class="custom-input" placeholder="Repita la contraseña" required />
          </div>
        </div>

        <div class="modal-buttons">
          <button type="button" class="btn-secondary" @click="modal.visible = false">Cancelar</button>
          <button type="submit" class="btn-primary">Crear Usuario</button>
        </div>
      </form>
    </div>
  </div>
</template>
