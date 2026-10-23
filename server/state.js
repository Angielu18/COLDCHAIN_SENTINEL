import { query } from '../db.js';
import { SLA } from './config.js';

export const sensores = [];
export const timersSLA = new Map();
export const incidentesDetenidos = new Set();

let aceleradoSLA = true;

export const getAceleradoSLA = () => aceleradoSLA;
export const setAceleradoSLA = (value) => {
  aceleradoSLA = typeof value === 'boolean' ? value : !aceleradoSLA;
  return aceleradoSLA;
};

export const claveSLA = (idAnomalia) => String(idAnomalia);
export const estaDetenidoSLA = (idAnomalia) => incidentesDetenidos.has(claveSLA(idAnomalia));
export const intervaloSegunModo = (realMs, demoMs) => (aceleradoSLA ? demoMs : realMs);

export async function cargarSensores() {
  const { rows } = await query(`
    SELECT id_equipo, code, name, location, temperature_level, humidity_level,
           temp_min, temp_max
      FROM equipo
     WHERE status = 'activo'
     ORDER BY id_equipo
  `);

  const cargados = rows.map((r) => {
    const temp = Number(r.temperature_level);
    const tempMin = Number(r.temp_min);
    const tempMax = Number(r.temp_max);
    return {
      id_equipo: r.id_equipo,
      id: r.code,
      cuarto: r.name,
      tipoEquipo: 'CUARTO_FRIO',
      ubicacion: r.location,
      temp,
      humedad: Number(r.humidity_level),
      tempMin,
      tempMax,
      estado: temp < tempMin || temp > tempMax ? 'Advertencia' : 'Normal',
      lecturasFuera: 0,
      modoFallo: null
    };
  });

  sensores.splice(0, sensores.length, ...cargados);
}

export function normalizarEstadoIncidente(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'finalizo' || s === 'finalizado' || s === 'cerrado') return 'Cerrado';
  if (s === 'en revisión' || s === 'en revision') return 'En revisión';
  return 'Abierto';
}

export async function calcularMetricas() {
  const { rows } = await query(`
    SELECT status, start_time, end_time, closed_at
      FROM anomalia
  `);

  const cerrados = rows.filter((r) =>
    normalizarEstadoIncidente(r.status) === 'Cerrado' || r.closed_at || r.end_time
  );

  let totalMinutos = 0;
  cerrados.forEach((inc) => {
    const fin = inc.closed_at || inc.end_time || new Date();
    const duracionMs = Math.max(0, new Date(fin) - new Date(inc.start_time));
    totalMinutos += Math.max(1, Math.round(duracionMs / 60000));
  });

  const [{ rows: la }, { rows: suspendidos }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM lote_afectado WHERE review_status = 'PENDIENTE_REVISION'`),
    query(`SELECT COUNT(*)::int AS n FROM usuario WHERE status = 'INACTIVO'`)
  ]);

  return {
    incidentesTotales: rows.length,
    incidentesActivos: rows.length - cerrados.length,
    incidentesCerrados: cerrados.length,
    mttrMinutos: cerrados.length > 0 ? Number((totalMinutos / cerrados.length).toFixed(1)) : 0,
    lotesEnRevision: la[0].n,
    usuariosSuspendidos: suspendidos[0].n
  };
}

export async function construirEstado() {
  const sensoresOut = sensores.map((s) => ({ ...s }));
  const [
    { rows: incidentesRaw },
    { rows: lotes },
    { rows: lotesAfectados },
    { rows: usuarios },
    metricas
  ] = await Promise.all([
    query(`
      SELECT a.id_anomalia, a.code AS id, a.level AS nivel, a.sla_stage AS "etapaSLA",
             a.current_target AS "destinatarioActual", a.emergency_protocol AS "protocoloEmergenciaActivo",
             a.critical_temperature AS "temperaturaCritica", a.status,
             a.start_time AS "creadoEn", a.acknowledged_by AS "acusadoPor",
             a.acknowledged_at AS "acusadoEn", a.closed_by AS "cerradoPor",
             COALESCE(a.closed_at, a.end_time) AS "cerradoEn", a.root_cause AS motivo,
             a.corrective_actions AS "accionesCorrectivas", e.code AS "sensorId", e.name AS cuarto
        FROM anomalia a
        JOIN equipo e ON e.id_equipo = a.id_equipo
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
        FROM usuario u
        LEFT JOIN rol r ON r.id_rol = u.id_rol
       ORDER BY u.id_usuario
    `),
    calcularMetricas()
  ]);

  const incidentes = incidentesRaw.map((inc) => {
    const estado = normalizarEstadoIncidente(inc.status);
    const duracionMinutos = inc.cerradoEn
      ? Math.max(1, Math.round((new Date(inc.cerradoEn) - new Date(inc.creadoEn)) / 60000))
      : null;
    return {
      ...inc,
      estado,
      duracionMinutos,
      resultado:
        estado === 'Cerrado'
          ? 'Resuelto / Normalizado'
          : estado === 'En revisión'
            ? 'Acusado en Atención'
            : 'Alerta Activa'
    };
  });

  return { sensores: sensoresOut, incidentes, lotes, lotesAfectados, metricas, usuariosIAM: usuarios };
}

export function detenerTemporizadoresSLA(idAnomalia) {
  const key = claveSLA(idAnomalia);
  incidentesDetenidos.add(key);

  const registro = timersSLA.get(key);
  if (!registro) return;

  clearTimeout(registro.timer5);
  clearTimeout(registro.timer10);
  clearInterval(registro.intervaloNivel1);
  clearInterval(registro.intervaloNivel2);
  clearInterval(registro.intervaloNivel3);
  timersSLA.delete(key);
}

export function normalizarSensorEnMemoria(id_equipo) {
  const sensor = sensores.find((s) => s.id_equipo === id_equipo);
  if (!sensor) return null;
  sensor.modoFallo = null;
  sensor.temp = 4.5;
  sensor.humedad = 55;
  sensor.lecturasFuera = 0;
  sensor.estado = 'Normal';
  return sensor;
}

export { SLA };
