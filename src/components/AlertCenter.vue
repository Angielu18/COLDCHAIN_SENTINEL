<script setup>
import { useAlertCenter } from '../composables/useAlertCenter'

const props = defineProps({
  incidentes: { type: Array, default: () => [] },
  sensores: { type: Array, default: () => [] },
  conectado: { type: Boolean, default: false }
})

const {
  alertas,
  panelAbierto,
  sonidoActivo,
  alarmaSonando,
  contenedor,
  conectado,
  alertasNoLeidas,
  abrirPanel,
  limpiarTodo,
  toggleSonido,
  probarAlarma,
  detenerAlarma,
  eliminarAlerta
} = useAlertCenter(props)
</script>

<template>
  <div class="notif-wrapper" ref="contenedor">
    <transition name="panel">
      <button v-if="alarmaSonando" type="button" class="banner-alarma" @click.stop="detenerAlarma">
        <span class="banner-texto">Alerta activa — Clic para finalizar / silenciar</span>
      </button>
    </transition>

    <button
      type="button"
      class="btn-campana"
      :class="{ 'tiene-alertas': alertasNoLeidas > 0, 'campana-sonando': alarmaSonando }"
      @click="abrirPanel"
      :title="alertasNoLeidas > 0 ? `${alertasNoLeidas} alertas nuevas` : 'Centro de alertas'"
    >
      <span class="btn-campana-label">Alertas</span>
      <span v-if="alertasNoLeidas > 0" class="badge-contador">{{ alertasNoLeidas }}</span>
    </button>

    <transition name="panel">
      <div v-if="panelAbierto" class="panel-alertas">
        <div class="panel-header">
          <div>
            <strong>Centro de Alertas</strong>
            <span class="panel-sub">Pulso armónico GxP en tiempo real</span>
          </div>
          <div class="panel-acciones">
            <button type="button" class="btn-mini" @click="probarAlarma" :title="alarmaSonando ? 'Detener prueba' : 'Probar pulso armónico'">
              {{ alarmaSonando ? 'Detener' : 'Probar' }}
            </button>
            <button type="button" class="btn-mini" @click="toggleSonido" :title="sonidoActivo ? 'Silenciar alertas' : 'Activar sonido'">
              {{ sonidoActivo ? 'Silenciar' : 'Activar' }}
            </button>
            <button type="button" class="btn-mini" @click="limpiarTodo" title="Limpiar todo">Limpiar</button>
          </div>
        </div>

        <div class="panel-body">
          <div v-if="alertas.length === 0" class="panel-vacio">
            <p v-if="conectado">Sin alertas pendientes. Equipos en rango seguro.</p>
            <p v-else>Reconectando con el servidor de telemetría...</p>
          </div>

          <div v-for="a in alertas" :key="a.id" class="alerta-item" :class="`alerta-${a.tipo}`">
            <div class="alerta-contenido">
              <span class="alerta-nivel">{{ a.nivel }}</span>
              <span class="alerta-mensaje">{{ a.mensaje }}</span>
              <span class="alerta-hora">{{ a.hora }}</span>
            </div>
            <button type="button" class="alerta-cerrar" @click="eliminarAlerta(a.id)">×</button>
          </div>
        </div>
      </div>
    </transition>

    <div class="toasts-container">
      <transition-group name="toast">
        <div v-for="a in alertas.filter(x => x.tipo === 'danger' || x.tipo === 'warning')" :key="a.id" class="toast" :class="`toast-${a.tipo}`">
          <div class="toast-texto">
            <strong>{{ a.nivel }}</strong>
            <span>{{ a.mensaje }}</span>
          </div>
          <button type="button" class="toast-cerrar" @click="detenerAlarma(); eliminarAlerta(a.id)" title="Silenciar y cerrar aviso">×</button>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<style scoped src="src/assets/alert-center.css"></style>
