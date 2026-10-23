import { sensores } from './state.js';
import { procesarLectura } from './incidents.js';
import { broadcastFullState } from './realtime.js';

export function iniciarSimulador() {
  return setInterval(async () => {
    try {
      const ahora = new Date();

      for (const sensor of sensores) {
        if (sensor.modoFallo === 'AUMENTO_PAULATINO') {
          if (sensor.temp < 13.5) sensor.temp = parseFloat((sensor.temp + 0.5).toFixed(1));
        } else if (sensor.modoFallo === 'APERTURA_PUERTA') {
          sensor.temp = parseFloat((14.2 + (Math.random() * 0.4 - 0.2)).toFixed(1));
          sensor.humedad = Math.min(94, sensor.humedad + 3);
        } else {
          const delta = Math.random() * 0.4 - 0.2;
          sensor.temp = parseFloat((sensor.temp + delta).toFixed(1));
          if (sensor.temp < 2.4) sensor.temp = 2.8;
          if (sensor.temp > 7.4) sensor.temp = 7.0;
          sensor.humedad = Math.round(52 + Math.random() * 6);
        }

        await procesarLectura(sensor, { hora: ahora });
      }

      await broadcastFullState();
    } catch (err) {
      console.error('Error en motor de simulación:', err.message);
    }
  }, 3500);
}
