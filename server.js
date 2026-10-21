// =============================================================================
// ColdChain Sentinel - Backend IoT (API REST + WebSockets) con PostgreSQL
// =============================================================================
import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, queryOne, probarConexion, cerrarPool } from './db.js';
import { enviarCorreoAlerta, smtpConfigurado } from './mailer.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const JWT_SECRET = process.env.JWT_SECRET || 'coldchain-sentinel-secret-key-sala-room-911-2026';
const PUERTO = Number(process.env.PORT || 3000);
const SLA_ACELERADO_MIN5_MS = 15000;
const SLA_ACELERADO_MIN10_MS = 30000;
const SLA_REAL_MIN5_MS = 5 * 60 * 1000;
const SLA_REAL_MIN10_MS = 10 * 60 * 1000;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// =============================================================================
// ESTADO EN MEMORIA (SOLO LO QUE ES VIVO/EFÍMERO)
// =============================================================================
// Los sensores mantienen su temperatura actual en memoria y cada lectura se
// persiste en la tabla 'lectura'. Los usuarios, incidentes, lotes, etc. viven
// en PostgreSQL.
let sensores = [];
let timersSLA = {};
let incidentesDetenidos = new Set(); // IDs de incidentes cuyo SLA ya fue detenido (acuse/cierre)
let aceleradoSLA = true;

// =============================================================================
// CARGA INICIAL DE SENSORES DESDE LA BASE DE DATOS
// =============================================================================
async function cargarSensores() {
  const { rows } = await query(`
    SELECT id_equipo, code, name, location, temperature_level, humidity_level,
           temp_min, temp_max
      FROM equipo
     WHERE status = 'activo'
     ORDER BY id_equipo
  `);

  sensores = rows.map(r => ({
    id_equipo: r.id_equipo,
    id: r.code,
    cuarto: r.name,
    tipoEquipo: 'CUARTO_FRIO',
    ubicacion: r.location,
    temp: Number(r.temperature_level),
    humedad: Number(r.humidity_level),
    tempMin: Number(r.temp_min),
    tempMax: Number(r.temp_max),
    estado: 'Normal',
    lecturasFuera: 0,
    modoFallo: null
  }));

  // Recalcular el estado de cada sensor según su última lectura
  for (const s of sensores) {
    const fuera = s.temp < s.tempMin || s.temp > s.tempMax;
    s.estado = fuera ? 'Advertencia' : 'Normal';
  }
}

// =============================================================================
// MIDDLEWARES DE AUTENTICACIÓN Y AUTORIZACIÓN (IAM / RBAC)
// =============================================================================

async function verificarAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const tokenQuery = req.query.token; // usado por la descarga CSV vía window.open
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : tokenQuery;

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado. Token JWT no proporcionado.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const usuario = await queryOne(`
      SELECT u.id_usuario AS id, u.name AS nombre, u.last_name AS apellido,
             u.gmail AS email, u.phone AS telefono, u.password_hash,
             u.status, u.avatar, r.code AS rol
        FROM usuario u
        LEFT JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = $1
    `, [decoded.id]);

    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado o sesión expirada.' });
    }
    if (usuario.status !== 'ACTIVO') {
      return res.status(403).json({ error: 'Su cuenta no se encuentra activa.' });
    }
    req.user = usuario;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.', detalle: err.message });
  }
}

function requerirRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}. Su rol actual es: ${req.user ? req.user.rol : 'Sin rol'}`
      });
    }
    next();
  };
}

// =============================================================================
// WEBSOCKET BROADCAST
// =============================================================================

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
}

async function construirEstado() {
  const sensoresOut = sensores.map(s => ({ ...s }));
  const [{ rows: incidentes }, { rows: lotes }, { rows: lotesAfectados }, { rows: usuarios }] = await Promise.all([
    query(`
      SELECT a.id_anomalia, a.code AS id, a.level AS nivel, a.sla_stage AS "etapaSLA",
             a.current_target AS "destinatarioActual", a.emergency_protocol AS "protocoloEmergenciaActivo",
             a.critical_temperature AS "temperaturaCritica", a.status,
             a.start_time AS "creadoEn", a.acknowledged_by AS "acusadoPor",
             a.acknowledged_at AS "acusadoEn", a.closed_by AS "cerradoPor",
             a.closed_at AS "cerradoEn", a.root_cause AS motivo,
             a.corrective_actions AS "accionesCorrectivas", e.code AS "sensorId", e.name AS cuarto
        FROM anomalia a JOIN equipo e ON e.id_equipo = a.id_equipo
       ORDER BY a.start_time DESC
    `),
    query(`
      SELECT l.id_lote AS id, l.batch_number AS "numeroLote", m.name AS "productoNombre",
             m.code AS codigo, m.id_medicamento AS "productoId", l.medication_quantity AS cantidad,
             l.inspection_date AS vencimiento, l.status AS estado,
             e.code AS "sensorId", e.name AS ubicacion
        FROM lote l
        JOIN medicamento m ON m.id_medicamento = l.id_medicamento
        LEFT JOIN equipo e ON e.id_equipo = l.id_equipo
       ORDER BY l.id_lote
    `),
    query(`
      SELECT la.id_lote_afectado AS id, la.code, la.review_status AS decision,
             la.justification AS justificacion, la.decided_by AS "decididoPor",
             la.decided_at AS "decididoEn", l.batch_number AS "numeroLote",
             m.name AS "productoNombre", l.medication_quantity AS cantidad,
             e.code AS "sensorId", e.name AS ubicacion
        FROM lote_afectado la
        JOIN lote l ON l.id_lote = la.id_lote
        JOIN medicamento m ON m.id_medicamento = l.id_medicamento
        LEFT JOIN equipo e ON e.id_equipo = l.id_equipo
       ORDER BY la.fecha_anomalia DESC
    `),
    query(`
      SELECT u.id_usuario AS id, u.name AS nombre, u.last_name AS apellido,
             u.gmail AS email, u.phone AS telefono, u.status, u.avatar,
             u.created_at AS "creadoEn", u.approved_at AS "aprobadoEn",
             u.approved_by AS "aprobadoPor", r.code AS rol
        FROM usuario u LEFT JOIN rol r ON r.id_rol = u.id_rol
       ORDER BY u.id_usuario
    `)
  ]);

  const metricas = await calcularMetricas();

  return { sensores: sensoresOut, incidentes, lotes, lotesAfectados, metricas, usuariosIAM: usuarios };
}

async function broadcastFullState() {
  const estado = await construirEstado();
  broadcast({ tipo: 'ACTUALIZACION_COMPLETA', ...estado });
}

async function calcularMetricas() {
  const { rows } = await query(`
    SELECT status, start_time, end_time
      FROM anomalia
  `);

  const cerrados = rows.filter(r => r.closed_at || r.end_time);
  let totalMinutos = 0;
  cerrados.forEach(inc => {
    const fin = inc.closed_at || inc.end_time;
    const duracionMs = new Date(fin) - new Date(inc.start_time);
    totalMinutos += Math.max(1, Math.round(duracionMs / 60000));
  });

  const [{ rows: la }, { rows: pend }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM lote_afectado WHERE review_status = 'PENDIENTE_REVISION'`),
    query(`SELECT COUNT(*)::int AS n FROM usuario WHERE status = 'PENDIENTE'`)
  ]);

  const mttr = cerrados.length > 0 ? (totalMinutos / cerrados.length).toFixed(1) : 0;

  return {
    incidentesTotales: rows.length,
    incidentesActivos: rows.length - cerrados.length,
    incidentesCerrados: cerrados.length,
    mttrMinutos: Number(mttr),
    lotesEnRevision: la[0].n,
    usuariosPendientes: pend[0].n
  };
}

// =============================================================================
// REGISTRO DE NOTIFICACIONES (VISUAL + CORREO)
// =============================================================================
async function registrarNotificacion(idAnomalia, tipo, canal, nivel, destinatario, asunto, cuerpo, estado) {
  await query(`
    INSERT INTO notificacion (id_anomalia, type, channel, level, recipient, subject, body, delivery_status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [idAnomalia, tipo, canal, nivel, destinatario, asunto, cuerpo, estado || 'ENVIADA']);
}

// =============================================================================
// MOTOR DE SIMULACIÓN DE TELEMETRÍA (IoT)
// =============================================================================

setInterval(async () => {
  try {
    const ahora = new Date();

    for (const sensor of sensores) {
      if (sensor.modoFallo === 'AUMENTO_PAULATINO') {
        if (sensor.temp < 13.5) sensor.temp = parseFloat((sensor.temp + 0.5).toFixed(1));
      } else if (sensor.modoFallo === 'APERTURA_PUERTA') {
        sensor.temp = parseFloat((14.2 + (Math.random() * 0.4 - 0.2)).toFixed(1));
        sensor.humedad = Math.min(94, sensor.humedad + 3);
      } else {
        const delta = (Math.random() * 0.4 - 0.2);
        sensor.temp = parseFloat((sensor.temp + delta).toFixed(1));
        if (sensor.temp < 2.4) sensor.temp = 2.8;
        if (sensor.temp > 7.4) sensor.temp = 7.0;
        sensor.humedad = Math.round(52 + Math.random() * 6);
      }

      const fueraDeRango = sensor.temp < sensor.tempMin || sensor.temp > sensor.tempMax;

      if (fueraDeRango) {
        sensor.lecturasFuera += 1;
        if (sensor.lecturasFuera >= 3) {
          sensor.estado = 'Crítico';
          await verificarYCrearIncidente(sensor, sensor.temp);
        } else {
          sensor.estado = 'Advertencia';
        }
      } else {
        sensor.lecturasFuera = 0;
        if (sensor.estado !== 'Normal') sensor.estado = 'Normal';
      }

      // Persistir la lectura en la base de datos (para gráficas históricas)
      await query(`
        INSERT INTO lectura (id_equipo, temperature, humidity, hour)
        VALUES ($1, $2, $3, $4)
      `, [sensor.id_equipo, sensor.temp, sensor.humedad, ahora]);

      // Mantener actualizado el valor "actual" del equipo en la BD
      await query(`
        UPDATE equipo SET temperature_level = $1, humidity_level = $2 WHERE id_equipo = $3
      `, [sensor.temp, sensor.humedad, sensor.id_equipo]);
    }

    await broadcastFullState();
  } catch (err) {
    console.error('Error en el motor de simulación:', err.message);
  }
}, 3500);

// =============================================================================
// MOTOR DE ALERTAS, ESCALAMIENTO SLA Y MARCADO AUTOMÁTICO DE LOTES
// =============================================================================

async function verificarYCrearIncidente(sensor, tempActual) {
  const existente = await queryOne(`
    SELECT id_anomalia FROM anomalia
     WHERE id_equipo = $1 AND status <> 'Finalizo'
     LIMIT 1
  `, [sensor.id_equipo]);

  if (existente) return;

  const code = 'INC-' + Date.now().toString().slice(-6);
  const tiempoMin5 = aceleradoSLA ? SLA_ACELERADO_MIN5_MS : SLA_REAL_MIN5_MS;
  const tiempoMin10 = aceleradoSLA ? SLA_ACELERADO_MIN10_MS : SLA_REAL_MIN10_MS;

  const incidente = await queryOne(`
    INSERT INTO anomalia (id_equipo, start_time, status, level, sla_stage, current_target,
                          emergency_protocol, critical_temperature, code)
    VALUES ($1, now(), 'Acontece', 'Nivel 1',
            'Minuto 0: Notificación inmediata emitida al Técnico de Turno',
            'Técnico de Turno', FALSE, $2, $3)
    RETURNING id_anomalia
  `, [sensor.id_equipo, tempActual, code]);

  const idAnomalia = incidente.id_anomalia;

  // Asegura que un incidente nuevo no herede una marca de detención previa
  incidentesDetenidos.delete(String(idAnomalia));

  // --- Registro del equipo/datos para los recordatorios periódicos ---
  const datos = { sensor, tempActual, code };

  // Inicializa el registro de temporizadores ANTES de crear los intervalos
  timersSLA[idAnomalia] = { timer5: null, timer10: null, intervaloNivel1: null, intervaloNivel2: null, intervaloNivel3: null };

  // =========================================================================
  // NIVEL 1 (Minuto 0): Notificación inmediata al Técnico de Turno
  // y REENVÍO cada 1 minuto mientras no haya acuse.
  // =========================================================================
  await notificarNivel(idAnomalia, 'Nivel 1', 'Técnico de Turno', 'ALERTAS_TECNICO', datos, 'Minuto 0');

  // REGLA DE NEGOCIO 3: Marcado automático de lotes en el equipo afectado
  const { rows: lotesEnRiesgo } = await query(`
    SELECT id_lote FROM lote WHERE id_equipo = $1 AND status <> 'Degradado'
  `, [sensor.id_equipo]);

  for (const l of lotesEnRiesgo) {
    await query(`UPDATE lote SET status = 'En revisión' WHERE id_lote = $1`, [l.id_lote]);
    await query(`
      INSERT INTO lote_afectado (id_lote, id_accion_protocolo, fecha_anomalia, review_status, code)
      VALUES ($1, NULL, now(), 'PENDIENTE_REVISION', $2)
    `, [l.id_lote, 'LA-' + Date.now().toString().slice(-5) + '-' + l.id_lote]);
  }

  // -------------------------------------------------------------------------
  // RECORDATORIO NIVEL 1: reenviar cada 1 min hasta que el nivel cambie o haya acuse
  // -------------------------------------------------------------------------
  const intervaloNivel1 = setInterval(async () => {
    if (incidentesDetenidos.has(idAnomalia)) { clearInterval(intervaloNivel1); return; }
    const inc = await obtenerIncidenteVigente(idAnomalia);
    if (!inc || inc.level !== 'Nivel 1') {
      clearInterval(intervaloNivel1);
      return;
    }
    await notificarNivel(idAnomalia, 'Nivel 1', 'Técnico de Turno', 'ALERTAS_TECNICO', datos, 'Recordatorio');
  }, prueba(1 * 60 * 1000, 10000)); // En modo demo: cada 10s
  timersSLA[idAnomalia].intervaloNivel1 = intervaloNivel1;

  // -------------------------------------------------------------------------
  // Temporizador SLA: Minuto 5 => Escalamiento al Supervisor de Calidad
  // y REENVÍO cada 2 minutos mientras no haya acuse.
  // -------------------------------------------------------------------------
  const timer5 = setTimeout(async () => {
    try {
      if (incidentesDetenidos.has(idAnomalia)) return;
      const inc = await obtenerIncidenteVigente(idAnomalia);
      if (inc && inc.status === 'Acontece') {
        await query(`
          UPDATE anomalia SET level = 'Nivel 2', current_target = 'Supervisor de Calidad',
                 sla_stage = 'Minuto 5 (sin acuse): Escalamiento automático al Supervisor de Calidad'
           WHERE id_anomalia = $1
        `, [idAnomalia]);

        await notificarNivel(idAnomalia, 'Nivel 2', 'Supervisor de Calidad', 'ALERTAS_SUPERVISOR', datos, 'Escalamiento Minuto 5');
        clearInterval(intervaloNivel1);

        // Reenvío del Nivel 2 cada 2 minutos
        const intervaloNivel2 = setInterval(async () => {
          if (incidentesDetenidos.has(idAnomalia)) { clearInterval(intervaloNivel2); return; }
          const actual = await obtenerIncidenteVigente(idAnomalia);
          if (!actual || actual.level !== 'Nivel 2') {
            clearInterval(intervaloNivel2);
            return;
          }
          await notificarNivel(idAnomalia, 'Nivel 2', 'Supervisor de Calidad', 'ALERTAS_SUPERVISOR', datos, 'Recordatorio');
        }, prueba(2 * 60 * 1000, 15000)); // En modo demo: cada 15s
        timersSLA[idAnomalia].intervaloNivel2 = intervaloNivel2;

        await broadcastFullState();
      }
    } catch (e) { console.error('Error timer SLA min5:', e.message); }
  }, tiempoMin5);

  // -------------------------------------------------------------------------
  // Temporizador SLA: Minuto 10 => Director + Protocolo de Emergencia
  // y REENVÍO cada 5 minutos mientras no haya acuse.
  // -------------------------------------------------------------------------
  const timer10 = setTimeout(async () => {
    try {
      if (incidentesDetenidos.has(idAnomalia)) return;
      const inc = await obtenerIncidenteVigente(idAnomalia);
      if (inc && inc.status === 'Acontece') {
        await query(`
          UPDATE anomalia SET level = 'Nivel 3 (Emergencia)', current_target = 'Director del Laboratorio',
                 emergency_protocol = TRUE,
                 sla_stage = 'Minuto 10 (sin acuse): Escalamiento al Director y activación de protocolo de emergencia'
           WHERE id_anomalia = $1
        `, [idAnomalia]);

        await notificarNivel(idAnomalia, 'Nivel 3', 'Director del Laboratorio', 'ALERTAS_DIRECTOR', datos, 'Protocolo de Emergencia Minuto 10');

        // Reenvío del Nivel 3 cada 5 minutos
        const intervaloNivel3 = setInterval(async () => {
          if (incidentesDetenidos.has(idAnomalia)) { clearInterval(intervaloNivel3); return; }
          const actual = await obtenerIncidenteVigente(idAnomalia);
          if (!actual || !actual.emergency_protocol) {
            clearInterval(intervaloNivel3);
            return;
          }
          await notificarNivel(idAnomalia, 'Nivel 3', 'Director del Laboratorio', 'ALERTAS_DIRECTOR', datos, 'Recordatorio Emergencia');
        }, prueba(5 * 60 * 1000, 30000)); // En modo demo: cada 30s
        timersSLA[idAnomalia].intervaloNivel3 = intervaloNivel3;

        await broadcastFullState();
      }
    } catch (e) { console.error('Error timer SLA min10:', e.message); }
  }, tiempoMin10);

  // Registra los temporizadores principales (los intervalos ya se registraron arriba)
  timersSLA[idAnomalia].timer5 = timer5;
  timersSLA[idAnomalia].timer10 = timer10;
}

// Devuelve el incidente solo si sigue ABIERTO (sin acuse); si fue acusado/cerrado, null
async function obtenerIncidenteVigente(idAnomalia) {
  const inc = await queryOne(
    `SELECT id_anomalia, status, level, emergency_protocol FROM anomalia WHERE id_anomalia = $1`,
    [idAnomalia]
  );
  if (!inc) return null;
  if (inc.status !== 'Acontece') return null; // ya fue acusado o cerrado
  return inc;
}

// En modo demo acelera los intervalos para poder verlos en vivo
function prueba(realMs, demoMs) {
  return aceleradoSLA ? demoMs : realMs;
}

// Detiene todos los temporizadores e intervalos de recordatorio de un incidente
function detenerTemporizadoresSLA(idAnomalia) {
  // Marca el incidente como detenido: cualquier callback pendiente abortará
  incidentesDetenidos.add(String(idAnomalia));
  const t = timersSLA[idAnomalia];
  if (!t) return;
  clearTimeout(t.timer5);
  clearTimeout(t.timer10);
  clearInterval(t.intervaloNivel1);
  clearInterval(t.intervaloNivel2);
  clearInterval(t.intervaloNivel3);
  delete timersSLA[idAnomalia];
}

// Devuelve el equipo al estado normal: temperatura segura, sin fallo activo.
function normalizarSensorEnMemoria(id_equipo) {
  const sensor = sensores.find(s => s.id_equipo === id_equipo);
  if (!sensor) return null;
  sensor.modoFallo = null;
  sensor.temp = 4.5;
  sensor.humedad = 55;
  sensor.lecturasFuera = 0;
  sensor.estado = 'Normal';
  return sensor;
}

// Libera los lotes que quedaron marcados como afectados por un equipo.
async function liberarLotesDeEquipo(id_equipo) {
  const { rows: lotes } = await query(
    `SELECT id_lote FROM lote WHERE id_equipo = $1 AND status = 'En revisión'`,
    [id_equipo]
  );
  for (const l of lotes) {
    await query(`UPDATE lote SET status = 'Vigente' WHERE id_lote = $1`, [l.id_lote]);
  }
  return lotes.length;
}

// Cierra TODOS los incidentes abiertos de un equipo y deja el equipo normal.
// Se usa al cerrar un incidente y al pulsar "Normalizar".
async function cerrarIncidentesDeEquipo(id_equipo, motivo, acciones, cerradoPor) {
  const { rows: abiertos } = await query(
    `SELECT id_anomalia FROM anomalia WHERE id_equipo = $1 AND status <> 'Finalizo'`,
    [id_equipo]
  );

  for (const inc of abiertos) {
    detenerTemporizadoresSLA(inc.id_anomalia);
    await query(`
      UPDATE anomalia
         SET status = 'Finalizo', end_time = now(),
             duration = (now() - start_time),
             root_cause = $1, corrective_actions = $2, closed_by = $3, closed_at = now(),
             emergency_protocol = FALSE,
             sla_stage = $4
       WHERE id_anomalia = $5
    `, [motivo, acciones, cerradoPor, 'Incidente cerrado y equipo normalizado.', inc.id_anomalia]);
  }

  normalizarSensorEnMemoria(id_equipo);
  const liberados = await liberarLotesDeEquipo(id_equipo);
  return { incidentesCerrados: abiertos.length, lotesLiberados: liberados };
}

// Envía la notificación (visual + correo) de un nivel concreto
async function notificarNivel(idAnomalia, nivel, destinatario, envVar, datos, contexto) {
  const { sensor, tempActual, code } = datos;
  const asuntoInterfaz = `[${contexto}] ${nivel} - Excursión térmica en ${sensor.cuarto} (${code})`;
  const cuerpoInterfaz =
    `Temperatura crítica ${tempActual}°C detectada en ${sensor.cuarto} ` +
    `(rango ${sensor.tempMin}°C a ${sensor.tempMax}°C). Destinatario: ${destinatario}.`;

  await registrarNotificacion(idAnomalia, 'Alerta', 'Interfaz', nivel, destinatario,
    asuntoInterfaz, cuerpoInterfaz, 'ENVIADA');

  await intentarEnviarCorreo(idAnomalia, nivel, destinatario, envVar, sensor, tempActual, code, contexto);
}

async function intentarEnviarCorreo(idAnomalia, nivel, destinatario, envVar, sensor, tempActual, code, contexto = '') {
  const to = process.env[envVar] || process.env.SMTP_USER;
  const asunto = `[ColdChain Sentinel] ${contexto ? contexto + ' · ' : ''}${nivel} - Excursión térmica en ${sensor.cuarto} (${code})`;
  const cuerpo =
    `Se ha registrado una excursión térmica.\n\n` +
    `Incidente: ${code}\nNivel: ${nivel}\nDestinatario: ${destinatario}\n` +
    `Equipo: ${sensor.cuarto} (${sensor.id})\n` +
    `Temperatura detectada: ${tempActual}°C\n` +
    `Rango seguro: ${sensor.tempMin}°C a ${sensor.tempMax}°C\n` +
    `Fecha: ${new Date().toLocaleString('es-CO')}\n\n` +
    `— ColdChain Sentinel · Sala room_911 · Cumplimiento GxP`;

  if (!smtpConfigurado()) {
    await registrarNotificacion(idAnomalia, 'Correo', 'SMTP', nivel, to,
      asunto, 'Correo no enviado (SMTP desactivado). Configure SMTP_ENABLED=true en .env', 'NO_CONFIGURADO');
    return;
  }

  try {
    await enviarCorreoAlerta({ to, subject: asunto, text: cuerpo });
    await registrarNotificacion(idAnomalia, 'Correo', 'SMTP', nivel, to, asunto, cuerpo, 'ENVIADA');
  } catch (err) {
    console.error('Error enviando correo:', err.message);
    await registrarNotificacion(idAnomalia, 'Correo', 'SMTP', nivel, to, asunto, cuerpo, 'FALLIDA');
  }
}

// =============================================================================
// ENDPOINTS REST API: AUTENTICACIÓN E IDENTIDAD (IAM)
// =============================================================================

// 1. Registro Abierto
app.post('/api/auth/register', async (req, res) => {
  const { nombre, apellido, email, telefono, password } = req.body;

  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados' });
  }

  const emailNormalizado = email.toLowerCase().trim();
  const existe = await queryOne(`SELECT id_usuario FROM usuario WHERE lower(gmail) = $1`, [emailNormalizado]);
  if (existe) {
    return res.status(400).json({ error: 'Ya existe una cuenta registrada con este correo electrónico' });
  }

  const nuevo = await queryOne(`
    INSERT INTO usuario (id_rol, name, last_name, gmail, phone, password_hash, status, avatar)
    VALUES (3, $1, $2, $3, $4, $5, 'PENDIENTE', '👤')
    RETURNING id_usuario AS id, name AS nombre, gmail AS email, status
  `, [nombre.trim(), apellido.trim(), emailNormalizado, telefono ? telefono.trim() : '',
      hashPassword(password)]);

  await broadcastFullState();

  return res.status(201).json({
    exito: true,
    mensaje: 'Su cuenta ha sido creada exitosamente. Debe esperar la aprobación del Director del Laboratorio para acceder a la plataforma.',
    usuario: { id: nuevo.id, nombre: nuevo.nombre, email: nuevo.email, status: nuevo.status }
  });
});

// 2. Inicio de Sesión (Login)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Ingrese correo y contraseña' });
  }

  const emailNormalizado = email.toLowerCase().trim();
  const usuario = await queryOne(`
    SELECT u.id_usuario AS id, u.name AS nombre, u.last_name AS apellido,
           u.gmail AS email, u.phone AS telefono, u.password_hash, u.status, u.avatar,
           r.code AS rol
      FROM usuario u LEFT JOIN rol r ON r.id_rol = u.id_rol
     WHERE lower(u.gmail) = $1
  `, [emailNormalizado]);

  if (!usuario || usuario.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Credenciales inválidas. Verifique su correo o contraseña.' });
  }

  if (usuario.status === 'PENDIENTE') {
    return res.status(403).json({
      error: 'Su cuenta está registrada pero se encuentra en estado PENDIENTE_APROBACION. Debe esperar la aprobación del Director del Laboratorio para acceder a la plataforma.'
    });
  }

  if (usuario.status === 'INACTIVO') {
    return res.status(403).json({
      error: 'Su cuenta ha sido suspendida o está inactiva. Comuníquese con el Director del Laboratorio.'
    });
  }

  await query(`UPDATE usuario SET last_login = now() WHERE id_usuario = $1`, [usuario.id]);

  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: `${usuario.nombre} ${usuario.apellido}`, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    exito: true,
    token,
    usuario: {
      id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido,
      email: usuario.email, rol: usuario.rol, status: usuario.status,
      avatar: usuario.avatar || '👤'
    }
  });
});

// 3. Perfil del Usuario Autenticado
app.get('/api/auth/me', verificarAuth, (req, res) => {
  const u = req.user;
  res.json({
    usuario: {
      id: u.id, nombre: u.nombre, apellido: u.apellido, email: u.email,
      telefono: u.telefono, rol: u.rol, status: u.status, avatar: u.avatar || '👤'
    }
  });
});

// =============================================================================
// MÓDULO 6: GESTIÓN IAM (PANEL EXCLUSIVO DEL DIRECTOR)
// =============================================================================

app.get('/api/iam/usuarios', verificarAuth, requerirRol('DIRECTOR'), async (req, res) => {
  const { rows: usuarios } = await query(`
    SELECT u.id_usuario AS id, u.name AS nombre, u.last_name AS apellido,
           u.gmail AS email, u.phone AS telefono, u.status, u.avatar,
           u.created_at AS "creadoEn", u.approved_at AS "aprobadoEn",
           u.approved_by AS "aprobadoPor", r.code AS rol
      FROM usuario u LEFT JOIN rol r ON r.id_rol = u.id_rol
     ORDER BY u.id_usuario
  `);
  const { rows: rolesDisponibles } = await query(`SELECT code AS name, description AS label, avatar FROM rol ORDER BY id_rol`);
  res.json({ usuarios, rolesDisponibles });
});

app.post('/api/iam/usuarios/:id/aprobar', verificarAuth, requerirRol('DIRECTOR'), async (req, res) => {
  const { id } = req.params;
  const { rol } = req.body;

  const rolesValidos = ['TECNICO', 'SUPERVISOR', 'INVENTARIO', 'DIRECTOR'];
  if (!rolesValidos.includes(rol)) {
    return res.status(400).json({ error: `Rol no válido. Debe ser uno de: ${rolesValidos.join(', ')}` });
  }

  const rolRow = await queryOne(`SELECT id_rol, avatar, description FROM rol WHERE code = $1`, [rol]);
  if (!rolRow) return res.status(400).json({ error: 'Rol no encontrado en el sistema' });

  const usuario = await queryOne(`
    UPDATE usuario
       SET status = 'ACTIVO', id_rol = $1, avatar = $2, approved_at = now(), approved_by = $3
     WHERE id_usuario = $4
    RETURNING id_usuario AS id, name AS nombre, last_name AS apellido, gmail AS email
  `, [rolRow.id_rol, rolRow.avatar || '👤', `${req.user.nombre} ${req.user.apellido} (Director)`, Number(id)]);

  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

  await broadcastFullState();
  res.json({
    exito: true,
    mensaje: `Cuenta de ${usuario.nombre} ${usuario.apellido} aprobada exitosamente con rol ${rolRow.description}.`,
    usuario: { ...usuario, rol, status: 'ACTIVO' }
  });
});

app.post('/api/iam/usuarios/:id/cambiar-estado', verificarAuth, requerirRol('DIRECTOR'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['ACTIVO', 'INACTIVO'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  if (Number(id) === req.user.id) {
    return res.status(400).json({ error: 'El Director no puede suspender su propia cuenta.' });
  }

  const usuario = await queryOne(`
    UPDATE usuario SET status = $1 WHERE id_usuario = $2
    RETURNING id_usuario AS id, name AS nombre, last_name AS apellido, gmail AS email, status
  `, [status, Number(id)]);

  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

  await broadcastFullState();
  res.json({ exito: true, mensaje: `Estado de ${usuario.nombre} actualizado a ${status}`, usuario });
});

// =============================================================================
// MÓDULO 1: SIMULADOR DE TELEMETRÍA (IoT)
// =============================================================================
app.post('/api/anomalia', verificarAuth, async (req, res) => {
  const { sensorId, modoFallo } = req.body;
  const sensor = sensores.find(s => s.id === sensorId);
  if (!sensor) return res.status(404).json({ error: 'Sensor no encontrado' });

  sensor.modoFallo = modoFallo;

  if (modoFallo === 'NORMALIZAR') {
    // Normalizar = cerrar la anomalía por completo: cierra incidentes abiertos,
    // detiene el SLA, deja el equipo a 4.5°C y libera los lotes afectados.
    const resumen = await cerrarIncidentesDeEquipo(
      sensor.id_equipo,
      'Normalización manual del equipo desde el simulador',
      'Se restableció la temperatura al rango seguro (4.5°C) y se verificó el equipo.',
      `${req.user.nombre} ${req.user.apellido} (${req.user.rol})`
    );

    await broadcastFullState();
    return res.json({
      exito: true,
      mensaje: `Equipo ${sensor.cuarto} normalizado. ${resumen.incidentesCerrados} incidente(s) cerrado(s), ${resumen.lotesLiberados} lote(s) liberado(s).`
    });
  }

  if (modoFallo === 'APERTURA_PUERTA') {
    sensor.temp = 13.8;
  }

  await broadcastFullState();
  res.json({ exito: true, mensaje: `Inyección de fallo "${modoFallo || 'Normal'}" aplicada a ${sensor.cuarto}` });
});

app.post('/api/telemetria/manual', verificarAuth, async (req, res) => {
  const { sensorId, temp, humedad } = req.body;
  const sensor = sensores.find(s => s.id === sensorId);
  if (!sensor) return res.status(404).json({ error: 'Sensor no encontrado' });

  sensor.temp = parseFloat(Number(temp).toFixed(1));
  if (humedad) sensor.humedad = Math.round(Number(humedad));

  const fueraDeRango = sensor.temp < sensor.tempMin || sensor.temp > sensor.tempMax;
  if (fueraDeRango) {
    sensor.lecturasFuera += 1;
    if (sensor.lecturasFuera >= 3) {
      sensor.estado = 'Crítico';
      await verificarYCrearIncidente(sensor, sensor.temp);
    } else {
      sensor.estado = 'Advertencia';
    }
  } else {
    sensor.lecturasFuera = 0;
    sensor.estado = 'Normal';
  }

  await broadcastFullState();
  res.json({ exito: true, sensor });
});

// Lectura del estado actual (NO altera nada)
app.get('/api/config/sla-acelerado', (req, res) => {
  res.json({
    aceleradoSLA,
    mensaje: `SLA Demo: ${aceleradoSLA ? 'ACTIVADO (15s/30s)' : 'DESACTIVADO (5min/10min)'}`
  });
});

// Alterna el modo demo. Aceptar { acelerado: true|false } lo fija de forma explícita;
// sin cuerpo, simplemente invierte el valor actual.
app.post('/api/config/sla-acelerado', verificarAuth, (req, res) => {
  if (typeof req.body?.acelerado === 'boolean') {
    aceleradoSLA = req.body.acelerado;
  } else {
    aceleradoSLA = !aceleradoSLA;
  }
  res.json({
    aceleradoSLA,
    mensaje: `SLA Demo: ${aceleradoSLA ? 'ACTIVADO (15s/30s)' : 'DESACTIVADO (5min/10min)'}`
  });
});

// =============================================================================
// MÓDULO 3: MOTOR DE ALERTAS Y SLA
// =============================================================================

app.post('/api/incidentes/:id/acusar', verificarAuth, async (req, res) => {
  const { id } = req.params;
  const incidente = await queryOne(`
    UPDATE anomalia
       SET status = 'En revisión', acknowledged_by = $1, acknowledged_at = now(),
           sla_stage = $2
     WHERE code = $3
    RETURNING id_anomalia
  `, [`${req.user.nombre} ${req.user.apellido} (${req.user.rol})`,
      `Acuse recibido por ${req.user.nombre} (${req.user.rol}). Temporizadores de escalamiento SLA detenidos.`, id]);

  if (!incidente) return res.status(404).json({ error: 'Incidente no encontrado' });

  detenerTemporizadoresSLA(incidente.id_anomalia);

  await broadcastFullState();
  res.json({ exito: true, mensaje: 'Incidente acusado con éxito' });
});

app.post('/api/incidentes/:id/cerrar', verificarAuth, async (req, res) => {
  const { id } = req.params;
  const { motivo, accionesCorrectivas } = req.body;

  if (!motivo || !accionesCorrectivas) {
    return res.status(400).json({ error: 'Se requiere obligatoriamente registrar la causa raíz y las acciones correctivas aplicadas.' });
  }

  const incidente = await queryOne(`
    UPDATE anomalia
       SET status = 'Finalizo', end_time = now(),
           duration = (now() - start_time),
           root_cause = $1, corrective_actions = $2, closed_by = $3, closed_at = now(),
           sla_stage = $4
     WHERE code = $5
    RETURNING id_anomalia, id_equipo
  `, [motivo, accionesCorrectivas, `${req.user.nombre} ${req.user.apellido} (${req.user.rol})`,
      `Incidente resuelto y cerrado por ${req.user.nombre}.`, id]);

  if (!incidente) return res.status(404).json({ error: 'Incidente no encontrado' });

  detenerTemporizadoresSLA(incidente.id_anomalia);

  // Normaliza el equipo y libera los lotes que quedaron afectados
  const resumen = await cerrarIncidentesDeEquipo(
    incidente.id_equipo,
    motivo,
    accionesCorrectivas,
    `${req.user.nombre} ${req.user.apellido} (${req.user.rol})`
  );

  await broadcastFullState();
  res.json({
    exito: true,
    mensaje: `Incidente cerrado. Equipo normalizado a 4.5°C y ${resumen.lotesLiberados} lote(s) liberado(s).`
  });
});

// =============================================================================
// MÓDULO 4: AUDITORÍA Y MÉTRICAS
// =============================================================================
app.get('/api/exportar/csv', verificarAuth, requerirRol('SUPERVISOR', 'DIRECTOR'), async (req, res) => {
  const { rows } = await query(`
    SELECT l.hour, e.code AS sensor, e.name AS ubicacion, l.temperature, l.humidity
      FROM lectura l JOIN equipo e ON e.id_equipo = l.id_equipo
     ORDER BY l.hour DESC
     LIMIT 5000
  `);

  let csv = 'Timestamp,Sensor_ID,Ubicacion,Temperatura_C,Humedad_Porcentaje\n';
  rows.forEach(h => {
    csv += `"${h.hour.toISOString()}","${h.sensor}","${h.ubicacion}",${h.temperature},${h.humidity}\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="auditoria_telemetria_coldchain.csv"');
  res.send(csv);
});

// Historial de lecturas para las gráficas (últimas N por equipo)
app.get('/api/lecturas/historico', verificarAuth, async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 60, 500);
  const { rows } = await query(`
    SELECT e.code AS "sensorId", e.name AS cuarto, l.temperature AS temp,
           l.humidity AS humedad, l.hour AS timestamp
      FROM lectura l JOIN equipo e ON e.id_equipo = l.id_equipo
     WHERE l.hour > now() - interval '2 hours'
     ORDER BY l.hour ASC
     LIMIT $1
  `, [limite]);
  res.json({ lecturas: rows });
});

// =============================================================================
// MÓDULO 5: GESTIÓN DE INVENTARIO
// =============================================================================
app.get('/api/inventario', verificarAuth, requerirRol('INVENTARIO', 'DIRECTOR', 'SUPERVISOR'), async (req, res) => {
  const estado = await construirEstado();
  res.json({ productos: await listarProductos(), lotes: estado.lotes, lotesAfectados: estado.lotesAfectados });
});

async function listarProductos() {
  const { rows } = await query(`
    SELECT m.id_medicamento AS id, m.code AS codigo, m.name AS nombre, m.type AS tipo,
           m.optimal_temp AS "tempOptima", e.code AS "equipoId"
      FROM medicamento m LEFT JOIN equipo e ON e.id_equipo = m.id_equipo
     ORDER BY m.id_medicamento
  `);
  return rows;
}

app.post('/api/inventario/medicamentos', verificarAuth, requerirRol('INVENTARIO', 'DIRECTOR'), async (req, res) => {
  const { codigo, nombre, tipo, equipoId, tempOptima } = req.body;
  if (!codigo || !nombre || !equipoId) {
    return res.status(400).json({ error: 'Código, nombre y equipo son obligatorios' });
  }

  const equipo = await queryOne(`SELECT id_equipo FROM equipo WHERE code = $1`, [equipoId]);
  if (!equipo) return res.status(400).json({ error: 'Equipo no encontrado' });

  const nuevo = await queryOne(`
    INSERT INTO medicamento (id_equipo, name, code, type, optimal_temp)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id_medicamento AS id, code AS codigo, name AS nombre, type AS tipo, optimal_temp AS "tempOptima"
  `, [equipo.id_equipo, nombre, codigo, tipo || 'MEDICAMENTO', tempOptima || '2°C a 8°C']);

  await broadcastFullState();
  res.json({ exito: true, medicamento: nuevo });
});

app.post('/api/inventario/lotes', verificarAuth, requerirRol('INVENTARIO', 'DIRECTOR'), async (req, res) => {
  const { productoId, numeroLote, cantidad, vencimiento, sensorId } = req.body;
  const producto = await queryOne(`SELECT id_medicamento, name, code FROM medicamento WHERE id_medicamento = $1`, [Number(productoId)]);
  const equipo = await queryOne(`SELECT id_equipo, name, code FROM equipo WHERE code = $1`, [sensorId]);

  if (!producto || !numeroLote || !cantidad || !equipo) {
    return res.status(400).json({ error: 'Faltan datos requeridos del lote' });
  }

  const nuevoLote = await queryOne(`
    INSERT INTO lote (id_medicamento, id_equipo, batch_number, medication_quantity, inspection_date, status)
    VALUES ($1, $2, $3, $4, $5, 'Vigente')
    RETURNING id_lote AS id
  `, [producto.id_medicamento, equipo.id_equipo, numeroLote, Number(cantidad), vencimiento]);

  await broadcastFullState();
  res.json({ exito: true, lote: nuevoLote });
});

// Disposición final de Lotes Afectados con 2FA OBLIGATORIO
app.post('/api/lotes-afectados/:id/evaluar', verificarAuth, requerirRol('SUPERVISOR', 'DIRECTOR'), async (req, res) => {
  const { id } = req.params;
  const { decision, justificacion, codigo2FA } = req.body;

  if (!codigo2FA || String(codigo2FA).trim().length !== 6) {
    return res.status(401).json({
      error: 'Código de autenticación 2FA inválido. Ingrese un código de 6 dígitos emitido por su autenticador.'
    });
  }

  if (!justificacion || justificacion.trim().length < 10) {
    return res.status(400).json({
      error: 'La justificación médica/técnica debe tener al menos 10 caracteres para garantizar la trazabilidad GxP.'
    });
  }

  const item = await queryOne(`SELECT id_lote_afectado, id_lote FROM lote_afectado WHERE code = $1`, [id]);
  if (!item) return res.status(404).json({ error: 'Registro de lote afectado no encontrado' });

  await query(`
    UPDATE lote_afectado
       SET review_status = $1, justification = $2, decided_by = $3, decided_at = now()
     WHERE id_lote_afectado = $4
  `, [decision, justificacion.trim(), `${req.user.nombre} ${req.user.apellido} (${req.user.rol})`, item.id_lote_afectado]);

  await query(`UPDATE lote SET status = $1 WHERE id_lote = $2`,
    [decision === 'APTO' ? 'Vigente' : 'Degradado', item.id_lote]);

  await broadcastFullState();
  res.json({ exito: true, mensaje: `Lote dispuesto como ${decision} con confirmación 2FA exitosa.` });
});

// =============================================================================
// NOTIFICACIONES (consultar las alertas registradas)
// =============================================================================
app.get('/api/notificaciones', verificarAuth, async (req, res) => {
  const { rows } = await query(`
    SELECT n.id_notificacion AS id, n.type AS tipo, n.channel AS canal, n.level AS nivel,
           n.recipient AS destinatario, n.subject AS asunto, n.sent_at AS "enviadaEn",
           n.delivery_status AS estado, a.code AS "incidenteId"
      FROM notificacion n LEFT JOIN anomalia a ON a.id_anomalia = n.id_anomalia
     ORDER BY n.sent_at DESC
     LIMIT 100
  `);
  res.json({ notificaciones: rows });
});

// =============================================================================
// INICIALIZACIÓN DEL SERVIDOR
// =============================================================================
async function iniciar() {
  try {
    const info = await probarConexion();
    console.log(`✅ Conectado a PostgreSQL: base "${info.db}"`);
    await cargarSensores();
    console.log(`✅ ${sensores.length} equipos cargados desde la base de datos`);
    console.log(`📧 SMTP: ${smtpConfigurado() ? 'Configurado (correos activos)' : 'Desactivado (solo alertas visuales)'}`);
    console.log(`⏱️  SLA: ${aceleradoSLA ? 'Modo DEMO activo (escalado 15s/30s, recordatorios 10s/15s/30s)' : 'Producción (escalado 5min/10min, recordatorios 1min/2min/5min)'}`);
  } catch (err) {
    console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
    console.error('   Revise el archivo .env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME).');
    process.exit(1);
  }

  server.listen(PUERTO, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Coldchain Sentinel IoT Backend corriendo en:`);
    console.log(`   API REST:    http://localhost:${PUERTO}`);
    console.log(`   WebSocket:   ws://localhost:${PUERTO}`);
    console.log(`   Sala:        room_911 (2°C a 8°C)`);
    console.log(`======================================================\n`);
  });
}

// Apagado limpio
process.on('SIGINT', async () => {
  console.log('\nCerrando servidor...');
  await cerrarPool();
  process.exit(0);
});

iniciar();
