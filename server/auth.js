import jwt from 'jsonwebtoken';
import { queryOne } from '../db.js';
import { JWT_SECRET } from './config.js';

export async function verificarAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado. Token JWT requerido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const usuario = await queryOne(`
      SELECT u.id_usuario AS id, u.name AS nombre, u.last_name AS apellido,
             u.gmail AS email, u.phone AS telefono, u.status, u.avatar, r.code AS rol
        FROM usuario u
        LEFT JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = $1
    `, [decoded.id]);

    if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado o sesión expirada.' });
    if (usuario.status !== 'ACTIVO') return res.status(403).json({ error: 'Su cuenta no está activa.' });

    req.user = usuario;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.', detalle: err.message });
  }
}

export const requerirRol = (...rolesPermitidos) => (req, res, next) => {
  if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
    return res.status(403).json({
      error: `Acceso denegado. Roles requeridos: ${rolesPermitidos.join(', ')}.`
    });
  }
  next();
};

export const firmarToken = (usuario) =>
  jwt.sign(
    {
      id: usuario.id,
      email: usuario.email,
      nombre: `${usuario.nombre} ${usuario.apellido}`,
      rol: usuario.rol
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
