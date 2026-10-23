import { query, queryOne, withTransaction } from '../db.js';
import { SLA } from './config.js';
import {
  claveSLA,
  detenerTemporizadoresSLA,
  estaDetenidoSLA,
  incidentesDetenidos,
  intervaloSegunModo,
  normalizarSensorEnMemoria,
  timersSLA
} from './state.js';
import { notificarAdvertencia, notificarNivel } from './notifications.js';
import { broadcastFullState } from './realtime.js';

export async function obtenerIncidenteVigente(idAnomalia) {
  if (estaDetenidoSLA(idAnomalia)) return null;
  const inc = await queryOne(
    `SELECT id_anomalia, status, level, emergency_protocol FROM anomalia WHERE id_anomalia = $1`,
    [idAnomalia]
  );
  if (!inc || inc.status !== 'Acontece') return null;
  return inc;
}

export async function procesarLectura(sensor, { hora = null } = {}) {
  const fueraDeRango = sensor.temp < sensor.tempMin || sensor.temp > sensor.tempMax;
  if (fueraDeRango) {
    sensor.lecturasFuera += 1;
    if (sensor.lecturasFuera === 1) {
      await notificarAdvertencia(sensor, sensor.temp);
    }
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

  const insertarLectura = hora
    ? query(
        `INSERT INTO lectura (id_equipo, temperature, humidity, hour) VALUES ($1, $2, $3, $4)`,
        [sensor.id_equipo, sensor.temp, sensor.humedad, hora]
      )
    : query(
        `INSERT INTO lectura (id_equipo, temperature, humidity, hour) VALUES ($1, $2, $3, now())`,
        [sensor.id_equipo, sensor.temp, sensor.humedad]
      );

  await Promise.all([
    insertarLectura,
    query(
      `UPDATE equipo SET temperature_level = $1, humidity_level = $2 WHERE id_equipo = $3`,
      [sensor.temp, sensor.humedad, sensor.id_equipo]
    )
  ]);
}

export async function verificarYCrearIncidente(sensor, tempActual) {
  const existente = await queryOne(`
    SELECT id_anomalia FROM anomalia
     WHERE id_equipo = $1 AND status <> 'Finalizo'
     LIMIT 1
  `, [sensor.id_equipo]);

  if (existente) return;

  const code = `INC-${Date.now().toString().slice(-6)}`;
  const tiempoMin5 = intervaloSegunModo(SLA.realMin5, SLA.demoMin5);
  const tiempoMin10 = intervaloSegunModo(SLA.realMin10, SLA.demoMin10);

  const idAnomalia = await withTransaction(async (client) => {
    const { rows } = await client.query(`
      INSERT INTO anomalia (id_equipo, start_time, status, level, sla_stage, current_target,
                            emergency_protocol, critical_temperature, code)
      VALUES ($1, now(), 'Acontece', 'Nivel 1',
              'Minuto 0: Notificación inmediata emitida al Técnico de Turno',
              'Técnico de Turno', FALSE, $2, $3)
      RETURNING id_anomalia
    `, [sensor.id_equipo, tempActual, code]);

    const nuevoId = rows[0].id_anomalia;

    const { rows: lotesEnRiesgo } = await client.query(`
      SELECT id_lote FROM lote WHERE id_equipo = $1 AND status <> 'Degradado'
    `, [sensor.id_equipo]);

    for (const l of lotesEnRiesgo) {
      await client.query(`UPDATE lote SET status = 'En revisión' WHERE id_lote = $1`, [l.id_lote]);

      const { rows: yaEnRevision } = await client.query(`
        SELECT 1 FROM lote_afectado
         WHERE id_lote = $1 AND review_status = 'PENDIENTE_REVISION'
         LIMIT 1
      `, [l.id_lote]);

      if (yaEnRevision.length === 0) {
        const codigoLA = `LA-${Date.now().toString().slice(-5)}-${l.id_lote}`;
        await client.query(`
          INSERT INTO lote_afectado (id_lote, id_accion_protocolo, fecha_anomalia, review_status, decision, code)
          VALUES ($1, NULL, now(), 'PENDIENTE_REVISION', 'PENDIENTE_REVISION', $2)
        `, [l.id_lote, codigoLA]);
      }
    }

    return nuevoId;
  });

  const key = claveSLA(idAnomalia);
  incidentesDetenidos.delete(key);

  const datos = { sensor, tempActual, code };
  const registroTimers = {
    timer5: null,
    timer10: null,
    intervaloNivel1: null,
    intervaloNivel2: null,
    intervaloNivel3: null
  };
  timersSLA.set(key, registroTimers);

  await broadcastFullState();
  await notificarNivel(idAnomalia, 'Nivel 1', 'Todos los roles activos', 'ALERTAS_TECNICO', datos, 'Minuto 0', 'todos');

  registroTimers.intervaloNivel1 = setInterval(async () => {
    const inc = await obtenerIncidenteVigente(idAnomalia);
    if (!inc || inc.level !== 'Nivel 1') {
      clearInterval(registroTimers.intervaloNivel1);
      return;
    }
    await notificarNivel(idAnomalia, 'Nivel 1', 'Técnico de Turno', 'ALERTAS_TECNICO', datos, 'Recordatorio');
  }, intervaloSegunModo(60000, 10000));

  registroTimers.timer5 = setTimeout(async () => {
    try {
      const inc = await obtenerIncidenteVigente(idAnomalia);
      if (!inc) return;

      await query(`
        UPDATE anomalia
           SET level = 'Nivel 2',
               current_target = 'Supervisor de Calidad',
               sla_stage = 'Minuto 5 (sin acuse): Escalamiento automático al Supervisor de Calidad'
         WHERE id_anomalia = $1 AND status = 'Acontece'
      `, [idAnomalia]);

      clearInterval(registroTimers.intervaloNivel1);
      await notificarNivel(idAnomalia, 'Nivel 2', 'Supervisor de Calidad', 'ALERTAS_SUPERVISOR', datos, 'Escalamiento Minuto 5');

      registroTimers.intervaloNivel2 = setInterval(async () => {
        const actual = await obtenerIncidenteVigente(idAnomalia);
        if (!actual || actual.level !== 'Nivel 2') {
          clearInterval(registroTimers.intervaloNivel2);
          return;
        }
        await notificarNivel(idAnomalia, 'Nivel 2', 'Supervisor de Calidad', 'ALERTAS_SUPERVISOR', datos, 'Recordatorio');
      }, intervaloSegunModo(120000, 15000));

      await broadcastFullState();
    } catch (e) {
      console.error('Error timer SLA min5:', e.message);
    }
  }, tiempoMin5);

  registroTimers.timer10 = setTimeout(async () => {
    try {
      const inc = await obtenerIncidenteVigente(idAnomalia);
      if (!inc) return;

      await query(`
        UPDATE anomalia
           SET level = 'Nivel 3 (Emergencia)',
               current_target = 'Director del Laboratorio',
               emergency_protocol = TRUE,
               sla_stage = 'Minuto 10 (sin acuse): Escalamiento al Director y activación de protocolo de emergencia'
         WHERE id_anomalia = $1 AND status = 'Acontece'
      `, [idAnomalia]);

      clearInterval(registroTimers.intervaloNivel2);
      await notificarNivel(idAnomalia, 'Nivel 3 (Emergencia)', 'Director del Laboratorio', 'ALERTAS_DIRECTOR', datos, 'Protocolo de Emergencia Minuto 10');

      registroTimers.intervaloNivel3 = setInterval(async () => {
        const actual = await obtenerIncidenteVigente(idAnomalia);
        if (!actual || !actual.emergency_protocol) {
          clearInterval(registroTimers.intervaloNivel3);
          return;
        }
        await notificarNivel(idAnomalia, 'Nivel 3 (Emergencia)', 'Director del Laboratorio', 'ALERTAS_DIRECTOR', datos, 'Recordatorio Emergencia');
      }, intervaloSegunModo(300000, 30000));

      await broadcastFullState();
    } catch (e) {
      console.error('Error timer SLA min10:', e.message);
    }
  }, tiempoMin10);
}

export async function cerrarIncidentesDeEquipo(id_equipo, motivo, acciones, cerradoPor) {
  return withTransaction(async (client) => {
    const { rows: abiertos } = await client.query(`
      SELECT id_anomalia FROM anomalia
       WHERE id_equipo = $1 AND status <> 'Finalizo'
    `, [id_equipo]);

    for (const inc of abiertos) {
      detenerTemporizadoresSLA(inc.id_anomalia);
      await client.query(`
        UPDATE anomalia
           SET status = 'Finalizo',
               end_time = now(),
               closed_at = now(),
               duration = (now() - start_time),
               root_cause = $1,
               corrective_actions = $2,
               closed_by = $3,
               emergency_protocol = FALSE,
               sla_stage = $4
         WHERE id_anomalia = $5
      `, [motivo, acciones, cerradoPor, `Incidente resuelto y cerrado por ${cerradoPor}.`, inc.id_anomalia]);
    }

    await client.query(`
      UPDATE equipo
         SET temperature_level = 4.5, humidity_level = 55.0
       WHERE id_equipo = $1
    `, [id_equipo]);

    await client.query(`
      INSERT INTO lectura (id_equipo, temperature, humidity, hour)
      VALUES ($1, 4.5, 55.0, now())
    `, [id_equipo]);

    normalizarSensorEnMemoria(id_equipo);
    return { incidentesCerrados: abiertos.length };
  });
}
