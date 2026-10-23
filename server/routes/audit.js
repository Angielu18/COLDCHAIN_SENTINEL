import { Router } from 'express';
import { query } from '../../db.js';
import { requerirRol, verificarAuth } from '../auth.js';

const router = Router();

router.get('/exportar/csv', verificarAuth, requerirRol('SUPERVISOR', 'DIRECTOR'), async (req, res) => {
  const { rows } = await query(`
    SELECT l.hour, e.code AS sensor, e.name AS ubicacion, l.temperature, l.humidity
      FROM lectura l
      JOIN equipo e ON e.id_equipo = l.id_equipo
     ORDER BY l.hour DESC
     LIMIT 5000
  `);

  let csv = 'Timestamp,Sensor_ID,Ubicacion,Temperatura_C,Humedad_Porcentaje\n';
  rows.forEach((h) => {
    csv += `"${h.hour.toISOString()}","${h.sensor}","${h.ubicacion}",${h.temperature},${h.humidity}\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="auditoria_telemetria_coldchain.csv"');
  res.send(csv);
});

router.get('/lecturas/historico', verificarAuth, async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 60, 500);
  const { rows } = await query(`
    SELECT e.code AS "sensorId", e.name AS cuarto, l.temperature AS temp,
           l.humidity AS humedad, l.hour AS timestamp
      FROM lectura l
      JOIN equipo e ON e.id_equipo = l.id_equipo
     WHERE l.hour > now() - interval '2 hours'
     ORDER BY l.hour ASC
     LIMIT $1
  `, [limite]);
  res.json({ lecturas: rows });
});

export default router;
