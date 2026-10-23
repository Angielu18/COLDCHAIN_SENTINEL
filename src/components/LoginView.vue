<script setup>
import { useLogin } from '../composables/useLogin'

const emit = defineEmits(['login-exitoso'])
const { cargando, errorMsg, formLogin, ejecutarLogin } = useLogin(emit)
</script>

<template>
  <div class="login-wrapper">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-circle" aria-hidden="true">CC</div>
        <h2>ColdChain Sentinel</h2>
        <p class="subtitle">Monitoreo Crítico IoT · Sala <code>room_911</code></p>
        <span class="badge-gxp">Cumplimiento Normativo GxP e ISO 13485</span>
      </div>

      <div class="info-approval-note" style="margin-bottom: 1.25rem;">
        <strong>Registro restringido:</strong> solo el <strong>Director del Laboratorio</strong> puede crear nuevas cuentas desde el módulo IAM. Si no tiene credenciales, solicítelas al Director.
      </div>

      <div v-if="errorMsg" class="alert alert-danger">{{ errorMsg }}</div>

      <form @submit.prevent="ejecutarLogin" class="form-body">
        <div class="form-group">
          <label>Correo Electrónico Institucional</label>
          <input
            v-model="formLogin.email"
            type="email"
            placeholder="ejemplo@coldchain.com"
            required
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label>Contraseña</label>
          <input
            v-model="formLogin.password"
            type="password"
            placeholder="••••••••"
            required
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="btn-submit" :disabled="cargando">
          {{ cargando ? 'Verificando Credenciales...' : 'Ingresar a la Plataforma' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped src="src/assets/login.css"></style>
