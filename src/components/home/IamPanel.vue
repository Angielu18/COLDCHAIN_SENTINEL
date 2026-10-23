<script setup>
import { computed, ref } from 'vue'
import { ROLE_LABELS } from '../../utils/modules'

const props = defineProps({
  usuarios: { type: Array, default: () => [] },
  usuariosSuspendidos: { type: Array, default: () => [] },
  usuarioActivo: { type: Object, required: true }
})
defineEmits(['toggle-status', 'new-user'])

const filtroEstado = ref('TODOS')
const filtrados = computed(() => {
  if (filtroEstado.value === 'TODOS') return props.usuarios
  if (filtroEstado.value === 'SUSPENDIDO') return props.usuarios.filter(u => u.status !== 'ACTIVO')
  return props.usuarios.filter(u => u.status === filtroEstado.value)
})

const iniciales = (usuario) => {
  const nombre = usuario?.nombre?.charAt(0) || ''
  const apellido = usuario?.apellido?.charAt(0) || ''
  return `${nombre}${apellido}`.toUpperCase()
}
</script>

<template>
  <div class="tab-panel">
    <div class="section-header">
      <div>
        <h2>Módulo 6: Gestión de Identidad y Acceso (IAM)</h2>
        <p class="section-desc">Panel exclusivo del <strong>Director del Laboratorio</strong> para crear usuarios y cambiar su estado entre <strong>Activo</strong> y <strong>Suspendido</strong>.</p>
      </div>

      <div class="iam-header-actions">
        <button class="btn-primary btn-small" @click="$emit('new-user')">Registrar Nuevo Usuario</button>

        <div class="iam-filter-group">
          <label>Filtrar por estado:</label>
          <div class="filter-buttons">
            <button :class="{ active: filtroEstado === 'TODOS' }" @click="filtroEstado = 'TODOS'">
              Todos ({{ usuarios.length }})
            </button>
            <button
              :class="{ active: filtroEstado === 'SUSPENDIDO' }"
              @click="filtroEstado = 'SUSPENDIDO'"
              class="btn-badge-yellow"
            >
              Suspendidos ({{ usuariosSuspendidos.length }})
            </button>
            <button :class="{ active: filtroEstado === 'ACTIVO' }" @click="filtroEstado = 'ACTIVO'">
              Activos ({{ usuarios.filter(u => u.status === 'ACTIVO').length }})
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <table class="custom-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Correo Electrónico</th>
            <th>Teléfono</th>
            <th>Fecha Registro</th>
            <th>Estado de Cuenta</th>
            <th>Rol Asignado</th>
            <th>Gestión de Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filtrados" :key="u.id" :class="{ 'row-pending': u.status !== 'ACTIVO' }">
            <td>
              <div class="user-cell">
                <span class="user-avatar">{{ iniciales(u) }}</span>
                <div>
                  <strong>{{ u.nombre }} {{ u.apellido }}</strong>
                  <span v-if="u.id === usuarioActivo.id" class="badge-you">(Tú / Sesión Actual)</span>
                </div>
              </div>
            </td>
            <td><code>{{ u.email }}</code></td>
            <td>{{ u.telefono || 'No registrado' }}</td>
            <td>{{ new Date(u.creadoEn).toLocaleDateString() }}</td>
            <td>
              <span class="status-pill" :class="u.status === 'ACTIVO' ? 'activo' : 'inactivo'">
                {{ u.status === 'ACTIVO' ? 'ACTIVO' : 'SUSPENDIDO' }}
              </span>
            </td>
            <td><span class="role-chip">{{ ROLE_LABELS[u.rol] || u.rol }}</span></td>
            <td>
              <div v-if="u.id !== usuarioActivo.id" class="manage-action-box">
                <button
                  v-if="u.status === 'ACTIVO'"
                  class="btn-small btn-warning"
                  @click="$emit('toggle-status', u.id, 'INACTIVO')"
                >
                  Suspender
                </button>
                <button
                  v-else
                  class="btn-small btn-success"
                  @click="$emit('toggle-status', u.id, 'ACTIVO')"
                >
                  Activar
                </button>
              </div>
              <span v-else class="text-muted">Sesión actual</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
