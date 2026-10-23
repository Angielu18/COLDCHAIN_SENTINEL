import { Router } from 'express';
import { query, queryOne } from '../../db.js';
import { firmarToken, verificarAuth } from '../auth.js';
import { hashPassword } from '../config.js';
import { construirEstado } from '../state.js';

const router = Router();

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Ingrese correo y contraseña.' });
    }

    const usuario = await queryOne(`
      SELECT u.id_usuario AS id, u.name AS nombre, u.last_name AS apellido,
             u.gmail AS email, u.phone AS telefono, u.password_hash, u.status, u.avatar,
             r.code AS rol
        FROM usuario u
        LEFT JOIN rol r ON r.id_rol = u.id_rol
       WHERE lower(u.gmail) = $1
    `, [email.toLowerCase().trim()]);

    if (!usuario || usuario.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verifique su correo o contraseña.' });
    }
    if (usuario.status === 'PENDIENTE') {
      return res.status(403).json({ error: 'Su cuenta está suspendida. Contacte al Director del Laboratorio para activarla.' });
    }
    if (usuario.status === 'INACTIVO') {
      return res.status(403).json({ error: 'Su cuenta está inactiva. Contacte al Director del Laboratorio.' });
    }

    await query(`UPDATE usuario SET last_login = now() WHERE id_usuario = $1`, [usuario.id]);

    return res.json({
      exito: true,
      token: firmarToken(usuario),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        rol: usuario.rol,
        status: usuario.status,
        avatar: usuario.avatar || ''
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error en inicio de sesión: ' + err.message });
  }
});

router.get('/auth/me', verificarAuth, (req, res) => {
  const u = req.user;
  res.json({
    usuario: {
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email,
      telefono: u.telefono,
      rol: u.rol,
      status: u.status,
      avatar: u.avatar || ''
    }
  });
});

router.get('/estado', verificarAuth, async (req, res) => {
  try {
    res.json(await construirEstado());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
