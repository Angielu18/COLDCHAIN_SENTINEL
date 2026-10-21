// =============================================================================
// ColdChain Sentinel - Módulo de Correo (Nodemailer)
// =============================================================================
import 'dotenv/config';
import nodemailer from 'nodemailer';

let transporter = null;

/** ¿Está configurado el SMTP en el .env? */
export function smtpConfigurado() {
  return (
    String(process.env.SMTP_ENABLED).toLowerCase() === 'true' &&
    !!process.env.SMTP_HOST &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_PASS
  );
}

function obtenerTransporter() {
  if (transporter) return transporter;
  if (!smtpConfigurado()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
}

/**
 * Envía un correo de alerta.
 * @param {{to:string, subject:string, text:string, html?:string}} opciones
 */
export async function enviarCorreoAlerta({ to, subject, text, html }) {
  const t = obtenerTransporter();
  if (!t) throw new Error('SMTP no configurado');

  return t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html: html || undefined
  });
}

/** Verifica la conexión SMTP (opcional, para diagnóstico) */
export async function verificarSMTP() {
  const t = obtenerTransporter();
  if (!t) return false;
  await t.verify();
  return true;
}
