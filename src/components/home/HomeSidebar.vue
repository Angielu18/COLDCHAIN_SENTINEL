<script setup>
defineProps({
  modulos: { type: Array, default: () => [] },
  active: { type: String, default: 'inicio' },
  alertCount: { type: Number, default: 0 },
  batchCount: { type: Number, default: 0 },
  userCount: { type: Number, default: 0 },
  connected: { type: Boolean, default: false }
})
defineEmits(['select'])
</script>

<template>
  <aside class="sidebar-nav">
    <div class="sidebar-brand">
      <span class="sidebar-brand-icon" aria-hidden="true">CC</span>
      <div class="sidebar-brand-text">
        <strong>ColdChain</strong>
        <span>Sentinel</span>
      </div>
    </div>

    <p class="sidebar-label">Navegación</p>

    <nav class="sidebar-menu">
      <button
        v-for="m in modulos"
        :key="m.id"
        type="button"
        :class="{ active: active === m.id }"
        @click="$emit('select', m.id)"
      >
        <span class="sidebar-text">{{ m.nombre }}</span>

        <span v-if="m.id === 'alertas' && alertCount > 0" class="counter-badge badge-red">
          {{ alertCount }}
        </span>
        <span v-if="m.id === 'inventario' && batchCount > 0" class="counter-badge badge-yellow">
          {{ batchCount }}
        </span>
        <span v-if="m.id === 'iam' && userCount > 0" class="counter-badge badge-yellow">
          {{ userCount }}
        </span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <span class="sidebar-status" :class="connected ? 'online' : 'offline'">
        <span class="dot"></span>
        {{ connected ? 'Telemetría en vivo' : 'Reconectando...' }}
      </span>
      <span class="sidebar-sala">Sala room_911</span>
    </div>
  </aside>
</template>
