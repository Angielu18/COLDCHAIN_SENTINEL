import 'dotenv/config';
import crypto from 'crypto';

export const JWT_SECRET = process.env.JWT_SECRET || 'coldchain-sentinel-secret-key-sala-room-911-2026';
export const PUERTO = Number(process.env.PORT || 3000);

export const SLA = {
  demoMin5: 15000,
  demoMin10: 30000,
  realMin5: 5 * 60 * 1000,
  realMin10: 10 * 60 * 1000
};

export const ROLES_VALIDOS = ['TECNICO', 'SUPERVISOR', 'INVENTARIO', 'DIRECTOR'];

export const hashPassword = (password) =>
  crypto.createHash('sha256').update(String(password)).digest('hex');
