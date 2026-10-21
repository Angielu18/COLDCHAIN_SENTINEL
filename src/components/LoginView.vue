<script setup>
import { ref } from 'vue'

const emit = defineEmits(['login-exitoso'])

const modo = ref('login') // 'login' | 'registro'
const cargando = ref(false)
const errorMsg = ref('')
const exitoMsg = ref('')

// Formulario de Login
const formLogin = ref({
  email: 'director@coldchain.com',
  password: 'admin123'
})

// Formulario de Registro
const formRegistro = ref({
  nombre: '',
  apellido: '',
  email: '',
  telefono: '',
  password: '',
  passwordConfirm: ''
})

// Acceso rápido para demostración rápida de los 4 roles pre-configurados
const usuariosDemo = [
  { label: 'Director del Laboratorio', email: 'director@coldchain.com', pass: 'admin123', rol: 'DIRECTOR', icon: '👨‍💼' },
  { label: 'Supervisora de Calidad', email: 'supervisor@coldchain.com', pass: 'supervisor123', rol: 'SUPERVISOR', icon: '👩‍⚕️' },
  { label: 'Técnico de Turno', email: 'tecnico@coldchain.com', pass: 'tecnico123', rol: 'TECNICO', icon: '👨‍🔧' },
  { label: 'Gestora de Inventario', email: 'inventario@coldchain.com', pass: 'inventario123', rol: 'INVENTARIO', icon: '📦' }
]

const seleccionarDemo = (u) => {
  modo.value = 'login'
  formLogin.value.email = u.email
  formLogin.value.password = u.pass
  errorMsg.value = ''
  exitoMsg.value = ''
}

const ejecutarLogin = async () => {
  errorMsg.value = ''
  exitoMsg.value = ''
  cargando.value = true

  try {
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formLogin.value)
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Error al iniciar sesión')
    }

    // Guardar token JWT y datos de sesión
    localStorage.setItem('coldchain_token', data.token)
    localStorage.setItem('coldchain_user', JSON.stringify(data.usuario))
    
    emit('login-exitoso', data.usuario)
  } catch (err) {
    if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.name === 'TypeError')) {
      errorMsg.value = 'No se pudo conectar con el servidor backend (puerto 3000). Asegúrese de iniciar el servidor con: npm run server'
    } else {
      errorMsg.value = err.message
    }
  } finally {
    cargando.value = false
  }
}

const ejecutarRegistro = async () => {
  errorMsg.value = ''
  exitoMsg.value = ''

  if (formRegistro.value.password !== formRegistro.value.passwordConfirm) {
    errorMsg.value = 'Las contraseñas no coinciden.'
    return
  }

  if (formRegistro.value.password.length < 6) {
    errorMsg.value = 'La contraseña debe contener al menos 6 caracteres.'
    return
  }

  cargando.value = true

  try {
    const res = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: formRegistro.value.nombre,
        apellido: formRegistro.value.apellido,
        email: formRegistro.value.email,
        telefono: formRegistro.value.telefono,
        password: formRegistro.value.password
      })
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Error en el registro')
    }

    // Notificación requerida en especificaciones
    exitoMsg.value = data.mensaje

    // Limpiar formulario y cambiar a pestaña de login con el email precargado
    formLogin.value.email = formRegistro.value.email
    formLogin.value.password = ''
    formRegistro.value = { nombre: '', apellido: '', email: '', telefono: '', password: '', passwordConfirm: '' }
    modo.value = 'login'
  } catch (err) {
    if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.name === 'TypeError')) {
      errorMsg.value = 'No se pudo conectar con el servidor backend (puerto 3000). Asegúrese de iniciar el servidor con: npm run server'
    } else {
      errorMsg.value = err.message
    }
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="login-card">
      <!-- Encabezado de la Plataforma -->
      <div class="login-header">
        <div class="logo-circle">❄️</div>
        <h2>ColdChain Sentinel</h2>
        <p class="subtitle">Monitoreo Crítico IoT · Sala <code>room_911</code></p>
        <span class="badge-gxp">Cumplimiento Normativo GxP e ISO 13485</span>
      </div>

      <!-- Selector de Modo: Login / Registro -->
      <div class="mode-tabs">
        <button 
          :class="{ active: modo === 'login' }" 
          @click="modo = 'login'; errorMsg = ''; exitoMsg = ''"
          type="button"
        >
          🔑 Iniciar Sesión
        </button>
        <button 
          :class="{ active: modo === 'registro' }" 
          @click="modo = 'registro'; errorMsg = ''; exitoMsg = ''"
          type="button"
        >
          📝 Registro Abierto
        </button>
      </div>

      <!-- Mensajes de Notificación y Alertas -->
      <div v-if="errorMsg" class="alert alert-danger">
        ⚠️ {{ errorMsg }}
      </div>

      <div v-if="exitoMsg" class="alert alert-success">
        ✅ <strong>Registro Exitoso:</strong><br>
        {{ exitoMsg }}
      </div>

      <!-- FORMULARIO 1: INICIO DE SESIÓN -->
      <form v-if="modo === 'login'" @submit.prevent="ejecutarLogin" class="form-body">
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

      <!-- FORMULARIO 2: REGISTRO ABIERTO DE USUARIOS -->
      <form v-if="modo === 'registro'" @submit.prevent="ejecutarRegistro" class="form-body">
        <div class="form-row">
          <div class="form-group">
            <label>Nombres</label>
            <input v-model="formRegistro.nombre" type="text" placeholder="Ej. Carlos" required />
          </div>
          <div class="form-group">
            <label>Apellidos</label>
            <input v-model="formRegistro.apellido" type="text" placeholder="Ej. Méndez" required />
          </div>
        </div>

        <div class="form-group">
          <label>Correo Electrónico (Gmail / Institucional)</label>
          <input v-model="formRegistro.email" type="email" placeholder="usuario@hospital.org" required />
        </div>

        <div class="form-group">
          <label>Teléfono de Contacto (SMS / Notificaciones SLA)</label>
          <input v-model="formRegistro.telefono" type="tel" placeholder="+57 300 0000000" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Contraseña</label>
            <input v-model="formRegistro.password" type="password" placeholder="Mínimo 6 carácteres" required />
          </div>
          <div class="form-group">
            <label>Confirmar</label>
            <input v-model="formRegistro.passwordConfirm" type="password" placeholder="Repita contraseña" required />
          </div>
        </div>

        <div class="info-approval-note">
          ℹ️ <strong>Nota IAM:</strong> Toda nueva cuenta queda en estado <code>PENDIENTE_APROBACION</code> hasta ser validada y asignada con su respectivo rol por el Director del Laboratorio.
        </div>

        <button type="submit" class="btn-submit btn-register" :disabled="cargando">
          {{ cargando ? 'Procesando Solicitud...' : 'Solicitar Acceso al Sistema' }}
        </button>
      </form>

      <!-- ACCESO RÁPIDO PARA PRUEBAS Y DEMOSTRACIÓN DE ROLES -->
      <div class="demo-section">
        <span class="demo-title">🧪 Acceso Rápido de Prueba (Demostración IAM):</span>
        <div class="demo-buttons">
          <button 
            v-for="u in usuariosDemo" 
            :key="u.rol" 
            type="button" 
            class="btn-demo-role" 
            @click="seleccionarDemo(u)"
            :title="'Cargar credenciales de ' + u.label"
          >
            <span>{{ u.icon }}</span>
            <strong>{{ u.label }}</strong>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0b0f19 80%);
  padding: 1.5rem;
}

.login-card {
  width: 100%;
  max-width: 480px;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 16px;
  padding: 2.25rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
}

.login-header {
  text-align: center;
  margin-bottom: 1.75rem;
}

.logo-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  background: rgba(6, 182, 212, 0.15);
  border: 2px solid rgba(6, 182, 212, 0.4);
  border-radius: 50%;
  font-size: 2rem;
  margin-bottom: 0.75rem;
}

.login-header h2 {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  background: linear-gradient(to right, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-top: 0.2rem;
}

.subtitle code {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}

.badge-gxp {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #34d399;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  text-transform: uppercase;
}

.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  background: #1f2937;
  padding: 0.3rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.mode-tabs button {
  padding: 0.6rem 0.5rem;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-tabs button.active {
  background: #0284c7;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.alert {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  line-height: 1.4;
  margin-bottom: 1.25rem;
}

.alert-danger {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid #ef4444;
  color: #fca5a5;
}

.alert-success {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid #10b981;
  color: #6ee7b7;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #cbd5e1;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.form-group input {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 0.65rem 0.85rem;
  color: #f9fafb;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-group input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.info-approval-note {
  font-size: 0.75rem;
  color: #cbd5e1;
  background: rgba(245, 158, 11, 0.1);
  border: 1px dashed rgba(245, 158, 11, 0.4);
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  line-height: 1.4;
}

.info-approval-note code {
  color: #fbbf24;
}

.btn-submit {
  margin-top: 0.5rem;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #ffffff;
  border: none;
  padding: 0.75rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}

.btn-submit:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-register {
  background: linear-gradient(135deg, #059669, #0d9488);
}

.demo-section {
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid #374151;
}

.demo-title {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #9ca3af;
  margin-bottom: 0.75rem;
}

.demo-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.btn-demo-role {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: #1f2937;
  border: 1px solid #374151;
  color: #e2e8f0;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.btn-demo-role:hover {
  background: #374151;
  border-color: #60a5fa;
  color: #ffffff;
}
</style>
