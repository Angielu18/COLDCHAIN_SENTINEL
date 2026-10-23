// =============================================================================
// ColdChain Sentinel - Módulo de Conexión y Transacciones PostgreSQL
// =============================================================================
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'coldchain_sentinel2',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
};

export const pool = new Pool(dbConfig);

/**
 * Garantiza que la base de datos y su esquema/semilla estén inicializados.
 */
export async function inicializarBaseDeDatos() {
  const adminPool = new Pool({ ...dbConfig, database: 'postgres' });
  try {
    const { rows } = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbConfig.database]
    );
    if (rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${dbConfig.database}"`);
    }
  } finally {
    await adminPool.end();
  }

  const { rows: tablas } = await pool.query(`
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'anomalia'
  `);

  if (tablas.length === 0) {
    const baseSql = fs.readFileSync(path.join(__dirname, 'coldchain_sentinel.sql'), 'utf8');
    await pool.query(baseSql);
  }

  const migracionSql = fs.readFileSync(path.join(__dirname, 'db', '02_migracion.sql'), 'utf8');
  await pool.query(migracionSql);

  const { rows: equipos } = await pool.query('SELECT COUNT(*)::int AS total FROM equipo');
  if (equipos[0].total === 0) {
    const seedSql = fs.readFileSync(path.join(__dirname, 'db', '03_seed.sql'), 'utf8');
    await pool.query(seedSql);
  }
}

export async function probarConexion() {
  await inicializarBaseDeDatos();
  const { rows } = await pool.query('SELECT current_database() AS db, now() AS ahora');
  return rows[0];
}

export async function query(texto, params = []) {
  return pool.query(texto, params);
}

export async function queryOne(texto, params = []) {
  const { rows } = await pool.query(texto, params);
  return rows[0] || null;
}

/**
 * Ejecuta una función dentro de una transacción ACID (BEGIN / COMMIT / ROLLBACK).
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cerrarPool() {
  await pool.end();
}
