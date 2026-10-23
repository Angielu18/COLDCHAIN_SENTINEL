import { Router } from 'express';
import { query, queryOne } from '../../db.js';
import { requerirRol, verificarAuth } from '../auth.js';
import { cerrarIncidentesDeEquipo } from '../incidents.js';
import { broadcastFullState } from '../realtime.js';
import { detenerTemporizadoresSLA } from '../state.js';

const router = Router();
const ROLES_ALERTAS = ['TECNICO', 'SUPERVISOR', 'DIRECTOR'];

router.post('/incidentes/:id/acusar', verificarAuth, requerirRol(...ROLES_ALERTAS), async (req, res) => {
  try {
    const { id } = req.params;
    const responsable = `${req.user.nombre} ${req.user.apellido} (${req.user.rol})`;

    const incidente = await queryOne(`
      UPDATE anomalia
         SET status = 'En revisión',
             acknowledged_by = $1,
             acknowledged_at = now(),
             emergency_protocol = FALSE,
             sla_stage = $2
       WHERE code = $3 OR id_anomalia::text = $3
      RETURNING id_anomalia
    `, [
      responsable,
      `Acuse recibido por ${responsable}. Escalamiento SLA y alarma detenidos.`,
      String(id)
    ]);

    if (!incidente) return res.status(404).json({ error: 'Incidente no encontrado.' });

    detenerTemporizadoresSLA(incidente.id_anomalia);
    const estado = await broadcastFullState();
    res.json({ exito: true, mensaje: 'Incidente acusado y alarma detenida.', estado });
  } catch (err) {
    res.status(500).json({ error: 'Error al acusar incidente: ' + err.message });
  }
});

router.post('/incidentes/:id/cerrar', verificarAuth, requerirRol(...ROLES_ALERTAS), async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, accionesCorrectivas } = req.body;

    if (!motivo?.trim() || !accionesCorrectivas?.trim()) {
      return res.status(400).json({
        error: 'Se requiere registrar obligatoriamente la causa raíz y las acciones correctivas.'
      });
    }

    const objetivo = await queryOne(`
      SELECT id_anomalia, id_equipo
        FROM anomalia
       WHERE code = $1 OR id_anomalia::text = $1
    `, [String(id)]);

    if (!objetivo) return res.status(404).json({ error: 'Incidente no encontrado.' });

    const responsable = `${req.user.nombre} ${req.user.apellido} (${req.user.rol})`;
    detenerTemporizadoresSLA(objetivo.id_anomalia);

    await cerrarIncidentesDeEquipo(
      objetivo.id_equipo,
      motivo.trim(),
      accionesCorrectivas.trim(),
      responsable
    );

    const estado = await broadcastFullState();
    res.json({
      exito: true,
      mensaje: `Incidente ${id} cerrado exitosamente y equipo normalizado a 4.5°C.`,
      estado
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al cerrar incidente: ' + err.message });
  }
});

router.get('/notificaciones', verificarAuth, requerirRol(...ROLES_ALERTAS), async (req, res) => {
  const { rows } = await query(`
    SELECT n.id_notificacion AS id, n.type AS tipo, n.channel AS canal, n.level AS nivel,
           n.recipient AS destinatario, n.subject AS asunto, n.sent_at AS "enviadaEn",
           n.delivery_status AS estado, a.code AS "incidenteId"
      FROM notificacion n
      LEFT JOIN anomalia a ON a.id_anomalia = n.id_anomalia
     ORDER BY n.sent_at DESC
     LIMIT 100
  `);
  res.json({ notificaciones: rows });
});

export default router;
