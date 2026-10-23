import { Router } from 'express';
import { query, queryOne, withTransaction } from '../../db.js';
import { requerirRol, verificarAuth } from '../auth.js';
import { broadcastFullState } from '../realtime.js';
import { construirEstado } from '../state.js';

const router = Router();

router.get('/inventario', verificarAuth, requerirRol('INVENTARIO', 'DIRECTOR', 'SUPERVISOR'), async (req, res) => {
  const [estado, { rows: productos }] = await Promise.all([
    construirEstado(),
    query(`
      SELECT m.id_medicamento AS id, m.code AS codigo, m.name AS nombre, m.type AS tipo,
             m.optimal_temp AS "tempOptima", e.code AS "equipoId"
        FROM medicamento m
        LEFT JOIN equipo e ON e.id_equipo = m.id_equipo
       ORDER BY m.id_medicamento
    `)
  ]);
  res.json({ productos, lotes: estado.lotes, lotesAfectados: estado.lotesAfectados });
});

router.post('/inventario/medicamentos', verificarAuth, requerirRol('INVENTARIO', 'DIRECTOR'), async (req, res) => {
  try {
    const { codigo, nombre, tipo, equipoId, tempOptima } = req.body;
    if (!codigo || !nombre || !equipoId) {
      return res.status(400).json({ error: 'Código, nombre y equipo son obligatorios.' });
    }

    const equipo = await queryOne(`SELECT id_equipo FROM equipo WHERE code = $1`, [equipoId]);
    if (!equipo) return res.status(400).json({ error: 'Equipo no encontrado.' });

    const nuevo = await queryOne(`
      INSERT INTO medicamento (id_equipo, name, code, type, optimal_temp)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id_medicamento AS id, code AS codigo, name AS nombre, type AS tipo, optimal_temp AS "tempOptima"
    `, [equipo.id_equipo, nombre.trim(), codigo.trim(), tipo || 'MEDICAMENTO', tempOptima || '2°C a 8°C']);

    const estado = await broadcastFullState();
    res.json({ exito: true, medicamento: nuevo, estado });
  } catch (err) {
    res.status(500).json({ error: 'Error registrando medicamento: ' + err.message });
  }
});

router.post('/inventario/lotes', verificarAuth, requerirRol('INVENTARIO', 'DIRECTOR'), async (req, res) => {
  try {
    const { productoId, numeroLote, cantidad, vencimiento, sensorId } = req.body;
    const producto = await queryOne(`SELECT id_medicamento FROM medicamento WHERE id_medicamento = $1`, [Number(productoId)]);
    const equipo = await queryOne(`SELECT id_equipo FROM equipo WHERE code = $1`, [sensorId]);

    if (!producto || !numeroLote || !cantidad || !equipo) {
      return res.status(400).json({ error: 'Faltan datos requeridos del lote.' });
    }

    const nuevoLote = await queryOne(`
      INSERT INTO lote (id_medicamento, id_equipo, batch_number, medication_quantity, inspection_date, status)
      VALUES ($1, $2, $3, $4, $5, 'Vigente')
      RETURNING id_lote AS id
    `, [producto.id_medicamento, equipo.id_equipo, numeroLote.trim(), Number(cantidad), vencimiento]);

    const estado = await broadcastFullState();
    res.json({ exito: true, lote: nuevoLote, estado });
  } catch (err) {
    res.status(500).json({ error: 'Error registrando lote: ' + err.message });
  }
});

router.post('/lotes-afectados/:id/evaluar', verificarAuth, requerirRol('SUPERVISOR', 'DIRECTOR'), async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, justificacion, codigo2FA } = req.body;

    if (!codigo2FA || String(codigo2FA).trim().length !== 6) {
      return res.status(401).json({
        error: 'Código 2FA inválido. Ingrese un código de 6 dígitos emitido por su autenticador.'
      });
    }
    if (!justificacion || justificacion.trim().length < 10) {
      return res.status(400).json({
        error: 'La justificación técnica debe tener al menos 10 caracteres (trazabilidad GxP).'
      });
    }

    const responsable = `${req.user.nombre} ${req.user.apellido} (${req.user.rol})`;

    await withTransaction(async (client) => {
      const { rows } = await client.query(`
        SELECT id_lote_afectado, id_lote
          FROM lote_afectado
         WHERE code = $1 OR id_lote_afectado::text = $1
         LIMIT 1
      `, [String(id)]);

      const item = rows[0];
      if (!item) {
        const notFound = new Error('Registro de lote afectado no encontrado.');
        notFound.status = 404;
        throw notFound;
      }

      await client.query(`
        UPDATE lote_afectado
           SET review_status = $1,
               decision = $1,
               justification = $2,
               decided_by = $3,
               decided_at = now()
         WHERE id_lote_afectado = $4
      `, [decision, justificacion.trim(), responsable, item.id_lote_afectado]);

      await client.query(`
        UPDATE lote
           SET status = $1
         WHERE id_lote = $2
      `, [decision === 'APTO' ? 'Vigente' : 'Degradado', item.id_lote]);
    });

    const estado = await broadcastFullState();
    res.json({
      exito: true,
      mensaje: `Lote dictaminado como ${decision} con confirmación 2FA exitosa.`,
      estado
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
