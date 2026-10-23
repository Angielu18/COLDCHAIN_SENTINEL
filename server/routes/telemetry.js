import { Router } from 'express';
import { requerirRol, verificarAuth } from '../auth.js';
import {
  cerrarIncidentesDeEquipo,
  procesarLectura
} from '../incidents.js';
import { broadcastFullState } from '../realtime.js';
import { getAceleradoSLA, sensores, setAceleradoSLA } from '../state.js';

const router = Router();

router.post('/anomalia', verificarAuth, requerirRol('TECNICO', 'SUPERVISOR', 'DIRECTOR'), async (req, res) => {
  try {
    const { sensorId, modoFallo } = req.body;
    const sensor = sensores.find((s) => s.id === sensorId);
    if (!sensor) return res.status(404).json({ error: 'Sensor no encontrado.' });

    sensor.modoFallo = modoFallo;

    if (modoFallo === 'NORMALIZAR') {
      const resumen = await cerrarIncidentesDeEquipo(
        sensor.id_equipo,
        'Normalización manual del equipo desde el simulador',
        'Restablecimiento de temperatura al rango seguro (4.5°C) y verificación operativa.',
        `${req.user.nombre} ${req.user.apellido} (${req.user.rol})`
      );

      const estado = await broadcastFullState();
      return res.json({
        exito: true,
        mensaje: `Equipo ${sensor.cuarto} normalizado a 4.5°C (${resumen.incidentesCerrados} incidente(s) cerrado(s)).`,
        estado
      });
    }

    if (modoFallo === 'APERTURA_PUERTA') {
      sensor.temp = 13.8;
    }

    const estado = await broadcastFullState();
    res.json({
      exito: true,
      mensaje: `Escenario "${modoFallo || 'Normal'}" aplicado a ${sensor.cuarto}.`,
      estado
    });
  } catch (err) {
    res.status(500).json({ error: 'Error procesando escenario: ' + err.message });
  }
});

router.post('/telemetria/manual', verificarAuth, requerirRol('TECNICO', 'SUPERVISOR', 'DIRECTOR'), async (req, res) => {
  try {
    const { sensorId, temp, humedad } = req.body;
    const sensor = sensores.find((s) => s.id === sensorId);
    if (!sensor) return res.status(404).json({ error: 'Sensor no encontrado.' });

    sensor.temp = parseFloat(Number(temp).toFixed(1));
    if (humedad !== undefined) sensor.humedad = Math.round(Number(humedad));

    await procesarLectura(sensor);
    const estado = await broadcastFullState();
    res.json({ exito: true, sensor, estado });
  } catch (err) {
    res.status(500).json({ error: 'Error registrando telemetría manual: ' + err.message });
  }
});

router.get('/config/sla-acelerado', (req, res) => {
  const aceleradoSLA = getAceleradoSLA();
  res.json({
    aceleradoSLA,
    mensaje: `SLA Demo: ${aceleradoSLA ? 'ACTIVADO (15s/30s)' : 'DESACTIVADO (5min/10min)'}`
  });
});

router.post(
  '/config/sla-acelerado',
  verificarAuth,
  requerirRol('TECNICO', 'SUPERVISOR', 'DIRECTOR'),
  (req, res) => {
    const aceleradoSLA = setAceleradoSLA(req.body?.acelerado);
    res.json({
      aceleradoSLA,
      mensaje: `SLA Demo: ${aceleradoSLA ? 'ACTIVADO (15s/30s)' : 'DESACTIVADO (5min/10min)'}`
    });
  }
);

export default router;
