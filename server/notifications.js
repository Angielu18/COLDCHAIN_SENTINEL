import { query } from '../db.js';
import { enviarCorreoAlerta, smtpConfigurado } from '../mailer.js';
import { estaDetenidoSLA } from './state.js';

async function registrarNotificacion(idAnomalia, tipo, canal, nivel, destinatario, asunto, cuerpo, estado = 'ENVIADA') {
  try {
    await query(`
      INSERT INTO notificacion (id_anomalia, type, channel, level, recipient, subject, body, delivery_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [idAnomalia, tipo, canal, nivel, destinatario, asunto, cuerpo, estado]);
  } catch (err) {
    console.error('Error persistiendo notificación:', err.message);
  }
}

const ROLES_POR_NIVEL = {
  'Nivel 1': ['TECNICO'],
  'Nivel 2': ['SUPERVISOR'],
  'Nivel 3 (Emergencia)': ['DIRECTOR']
};

async function resolverDestinatariosCorreo(nivel, envVar) {
  const roles = ROLES_POR_NIVEL[nivel] || [];
  const destinatarios = new Set();

  if (roles.length > 0) {
    const { rows } = await query(`
      SELECT DISTINCT lower(u.gmail) AS email
        FROM usuario u
        JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.status = 'ACTIVO' AND r.code = ANY($1::text[])
    `, [roles]);
    rows.forEach((row) => {
      if (row.email) destinatarios.add(row.email.trim());
    });
  }

  const correoEntorno = (process.env[envVar] || '').trim();
  if (correoEntorno) destinatarios.add(correoEntorno);

  if (destinatarios.size === 0 && process.env.SMTP_USER) {
    destinatarios.add(process.env.SMTP_USER);
  }

  return [...destinatarios];
}

async function resolverTodosLosRolesActivos() {
  const destinatarios = new Set();
  const { rows } = await query(`
    SELECT DISTINCT lower(u.gmail) AS email
      FROM usuario u
      JOIN rol r ON r.id_rol = u.id_rol
     WHERE u.status = 'ACTIVO'
  `);

  rows.forEach((row) => {
    if (row.email) destinatarios.add(row.email.trim());
  });

  if (destinatarios.size === 0) {
    ['ALERTAS_TECNICO', 'ALERTAS_SUPERVISOR', 'ALERTAS_DIRECTOR'].forEach((envVar) => {
      const correo = (process.env[envVar] || '').trim();
      if (correo) destinatarios.add(correo);
    });
    if (destinatarios.size === 0 && process.env.SMTP_USER) {
      destinatarios.add(process.env.SMTP_USER);
    }
  }

  return [...destinatarios];
}

async function enviarCorreosNivel(destinatarios, asunto, cuerpo, idAnomalia, nivel) {
  const resultados = await Promise.allSettled(destinatarios.map(async (to) => {
    try {
      await enviarCorreoAlerta({ to, subject: asunto, text: cuerpo });
      await registrarNotificacion(idAnomalia, 'Correo', 'SMTP', nivel, to, asunto, cuerpo, 'ENVIADA');
    } catch (err) {
      await registrarNotificacion(
        idAnomalia, 'Correo', 'SMTP', nivel, to, asunto,
        `${cuerpo}\n\nError SMTP: ${err.message}`,
        'FALLIDA'
      );
      console.error(`Error enviando correo a ${to}:`, err.message);
      throw err;
    }
  }));

  const fallidos = resultados.filter((r) => r.status === 'rejected').length;
  if (fallidos > 0) {
    console.error(`Correos de alerta ${nivel}: ${fallidos} envío(s) fallido(s).`);
  }
}

export async function notificarNivel(idAnomalia, nivel, destinatario, envVar, datos, contexto, alcance = 'nivel') {
  if (estaDetenidoSLA(idAnomalia)) return;
  const { sensor, tempActual, code } = datos;
  const asunto = `[ColdChain Sentinel] ${contexto ? contexto + ' · ' : ''}${nivel} - Excursión térmica en ${sensor.cuarto} (${code})`;
  const detalleDestino = alcance === 'todos'
    ? 'Notificación inicial enviada a todos los roles con usuarios activos.'
    : `Destinatario: ${destinatario}.`;
  const cuerpo =
    `Temperatura crítica ${tempActual}°C detectada en ${sensor.cuarto} ` +
    `(rango ${sensor.tempMin}°C a ${sensor.tempMax}°C). ${detalleDestino}`;

  await registrarNotificacion(idAnomalia, 'Alerta', 'Interfaz', nivel, destinatario, asunto, cuerpo, 'ENVIADA');

  const destinatarios = alcance === 'todos'
    ? await resolverTodosLosRolesActivos()
    : await resolverDestinatariosCorreo(nivel, envVar);
  if (!smtpConfigurado()) {
    for (const to of destinatarios) {
      await registrarNotificacion(idAnomalia, 'Correo', 'SMTP', nivel, to, asunto, 'SMTP desactivado en entorno local.', 'NO_CONFIGURADO');
    }
    return;
  }

  enviarCorreosNivel(destinatarios, asunto, cuerpo, idAnomalia, nivel).catch((err) => {
    console.error(`Error enviando correos de ${nivel}:`, err.message);
  });
}

export async function notificarAdvertencia(sensor, tempActual) {
  const nivel = 'Advertencia de telemetría';
  const destinatario = 'Técnico de Turno';
  const asunto = `[ColdChain Sentinel] Advertencia - Lectura fuera de rango en ${sensor.cuarto}`;
  const cuerpo =
    `Se detectó una lectura de ${tempActual}°C fuera del rango permitido ` +
    `(${sensor.tempMin}°C a ${sensor.tempMax}°C) en ${sensor.cuarto}. ` +
    'Si la condición persiste, se abrirá un incidente formal.';

  await registrarNotificacion(null, 'Alerta', 'Interfaz', nivel, destinatario, asunto, cuerpo, 'ENVIADA');

  const destinatarios = await resolverDestinatariosCorreo('Nivel 1', 'ALERTAS_TECNICO');
  if (!smtpConfigurado()) {
    for (const to of destinatarios) {
      await registrarNotificacion(null, 'Correo', 'SMTP', nivel, to, asunto, 'SMTP desactivado en entorno local.', 'NO_CONFIGURADO');
    }
    return;
  }

  enviarCorreosNivel(destinatarios, asunto, cuerpo, null, nivel).catch((err) => {
    console.error('Error enviando advertencias de telemetría:', err.message);
  });
}
