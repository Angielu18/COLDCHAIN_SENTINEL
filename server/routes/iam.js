import { Router } from 'express';
import { query, queryOne } from '../../db.js';
import { requerirRol, verificarAuth } from '../auth.js';
import { hashPassword, ROLES_VALIDOS } from '../config.js';
import { broadcastFullState } from '../realtime.js';

const router = Router();

router.get('/usuarios', verificarAuth, requerirRol('DIRECTOR'), async (req, res) => {
  const { rows: usuarios } = await query(`
    SELECT u.id_usuario AS id, u.name AS nombre, u.last_name AS apellido,
           u.gmail AS email, u.phone AS telefono, u.status, u.avatar,
           u.created_at AS "creadoEn", u.approved_at AS "aprobadoEn",
           u.approved_by AS "aprobadoPor", r.code AS rol
      FROM usuario u
      LEFT JOIN rol r ON r.id_rol = u.id_rol
     ORDER BY u.id_usuario
  `);
  const { rows: rolesDisponibles } = await query(`SELECT code AS name, description AS label, avatar FROM rol ORDER BY id_rol`);
  res.json({ usuarios, rolesDisponibles });
});

router.post('/usuarios', verificarAuth, requerirRol('DIRECTOR'), async (req, res) => {
  try {
    const { nombre, apellido, email, telefono, password, rol } = req.body;

    if (!nombre || !apellido || !email || !password || !rol) {
      return res.status(400).json({ error: 'Nombres, apellidos, correo, contraseña y rol son obligatorios.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe contener al menos 6 caracteres.' });
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Permitidos: ${ROLES_VALIDOS.join(', ')}` });
    }

    const rolRow = await queryOne(`SELECT id_rol, avatar, description FROM rol WHERE code = $1`, [rol]);
    if (!rolRow) return res.status(400).json({ error: 'Rol no encontrado.' });

    const emailNormalizado = email.toLowerCase().trim();
    const existe = await queryOne(`SELECT id_usuario FROM usuario WHERE lower(gmail) = $1`, [emailNormalizado]);
    if (existe) {
      return res.status(400).json({ error: 'Ya existe una cuenta registrada con este correo electrónico.' });
    }

    const nuevo = await queryOne(`
      INSERT INTO usuario (id_rol, name, last_name, gmail, phone, password_hash, status, avatar, approved_at, approved_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', $7, now(), $8)
      RETURNING id_usuario AS id, name AS nombre, last_name AS apellido,
                gmail AS email, phone AS telefono, status, avatar
    `, [
      rolRow.id_rol,
      nombre.trim(),
      apellido.trim(),
      emailNormalizado,
      telefono ? telefono.trim() : '',
      hashPassword(password),
      rolRow.avatar || '',
      `${req.user.nombre} ${req.user.apellido} (Director)`
    ]);

    await broadcastFullState();
    return res.status(201).json({
      exito: true,
      mensaje: `Usuario ${nuevo.nombre} ${nuevo.apellido} creado con rol ${rolRow.description}.`,
      usuario: { ...nuevo, rol }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error creando usuario: ' + err.message });
  }
});

router.post('/usuarios/:id/cambiar-estado', verificarAuth, requerirRol('DIRECTOR'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['ACTIVO', 'INACTIVO'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }
  if (Number(id) === req.user.id) {
    return res.status(400).json({ error: 'El Director no puede suspender su propia cuenta.' });
  }

  const usuario = await queryOne(`
    UPDATE usuario SET status = $1 WHERE id_usuario = $2
    RETURNING id_usuario AS id, name AS nombre, last_name AS apellido, gmail AS email, status
  `, [status, Number(id)]);

  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });

  await broadcastFullState();
  res.json({ exito: true, mensaje: `Estado de ${usuario.nombre} actualizado a ${status}`, usuario });
});

export default router;
