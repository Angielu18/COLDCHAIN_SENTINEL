<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  sensores: { type: Array, default: () => [] }
})
const emit = defineEmits(['inject', 'manual'])

const form = reactive({ sensorId: 'SEN-01', temp: 9.5, humedad: 65 })

watch(
  () => props.sensores,
  (lista) => {
    if (lista.length > 0 && !lista.some(s => s.id === form.sensorId)) {
      form.sensorId = lista[0].id
    }
  },
  { immediate: true }
)

const enviar = () => emit('manual', { ...form })
</script>

<template>
  <div class="tab-panel">
    <div class="section-header">
      <div>
        <h2>Módulo 1: Simulador de Telemetría IoT</h2>
        <p class="section-desc">Inyección controlada de fallos para validación de la Regla de Negocio 1 (3 lecturas consecutivas fuera de rango).</p>
      </div>
    </div>

    <div class="simulator-grid">
      <div class="card sim-card">
        <h3>Inyección de Fallos Térmicos Rápidos</h3>
        <p class="card-desc">Seleccione un equipo para forzar una desviación de temperatura y evaluar la respuesta del motor de reglas.</p>

        <div class="sim-sensors-list">
          <div v-for="s in sensores" :key="s.id" class="sim-sensor-item">
            <div class="sim-sensor-info">
              <strong>{{ s.id }} · {{ s.cuarto }}</strong>
              <span class="subtext">Actual: <code>{{ s.temp }}°C</code> · {{ s.humedad }}% HR · Estado: <strong>{{ s.estado }}</strong></span>
            </div>
            <div class="sim-actions-row">
              <button class="btn-sim btn-warning" @click="$emit('inject', s.id, 'AUMENTO_PAULATINO')" title="Incrementa +0.5°C por ciclo">
                Aumento Paulatino
              </button>
              <button class="btn-sim btn-danger" @click="$emit('inject', s.id, 'APERTURA_PUERTA')" title="Sube a 14.2°C inmediato">
                Apertura de Puerta
              </button>
              <button class="btn-sim btn-success" @click="$emit('inject', s.id, 'NORMALIZAR')" title="Restaura a 4.5°C">
                Normalizar (4.5°C)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card sim-card">
        <h3>Emisión Manual de Telemetría IoT</h3>
        <p class="card-desc">Transmita una lectura calibrada exacta para verificar el disparo de alertas tras 3 lecturas.</p>

        <form @submit.prevent="enviar" class="manual-form">
          <div class="form-group">
            <label>Equipo / Sensor Destino</label>
            <select v-model="form.sensorId" class="custom-select">
              <option v-for="s in sensores" :key="s.id" :value="s.id">{{ s.id }} — {{ s.cuarto }}</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Temperatura (°C)</label>
              <input v-model.number="form.temp" type="number" step="0.1" required class="custom-input" />
              <span class="field-hint">Rango seguro: 2.0°C a 8.0°C</span>
            </div>
            <div class="form-group">
              <label>Humedad (% HR)</label>
              <input v-model.number="form.humedad" type="number" min="0" max="100" class="custom-input" />
            </div>
          </div>

          <button type="submit" class="btn-primary" style="margin-top: 1rem;">
            Emitir Lectura IoT a Sala room_911
          </button>
        </form>

        <div class="info-box-rule">
          <strong>Regla de Negocio 1:</strong> Se genera una alerta crítica de <em>Nivel 1</em> y se apertura un incidente cuando la temperatura se sale del rango de 2°C a 8°C durante <strong>3 lecturas consecutivas</strong>.
        </div>
      </div>
    </div>
  </div>
</template>
