// =============================================================================
// ColdChain Sentinel - Módulo de Conexión a PostgreSQL
// Centraliza el pool de conexiones y utilidades de consulta.
// =============================================================================
import 'dotenv/config';
import pkg from 'pg';

const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'coldchain_sentinel2',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Verificación de conectividad al arrancar
export async function probarConexion() {
  const { rows } = await pool.query('SELECT current_database() AS db, now() AS ahora');
  return rows[0];
}

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} texto SQL con placeholders $1, $2...
 * @param {Array} params valores
 */
export async function query(texto, params = []) {
  return pool.query(texto, params);
}

/** Devuelve la primera fila o null */
export async function queryOne(texto, params = []) {
  const { rows } = await pool.query(texto, params);
  return rows[0] || null;
}

/** Cierra el pool (para apagado limpio) */
export async function cerrarPool() {
  await pool.end();
}
