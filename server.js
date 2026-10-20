import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// =============================================================================
// ESTADO EN MEMORIA (Inspirado en la BD coldchain_sentinel de PostgreSQL)
// =============================================================================

// 1. Sensores y Equipos en sala room_911
let sensores = [
  {
    id: 'SEN-01',
    cuarto: 'Cuarto Frío 1 (Vacunas)',
    tipoEquipo: 'CUARTO_FRIO',
    temp: 4.5,
    humedad: 58,
    tempMin: 2.0,
    tempMax: 8.0,
    estado: 'Normal',
    lecturasFuera: 0,
    modoFallo: null // null | 'AUMENTO_PAULATINO' | 'APERTURA_PUERTA'
  },
  {
    id: 'SEN-02',
    cuarto: 'Nevera 1 (Insulinas)',
    tipoEquipo: 'NEVERA',
    temp: 4.8,
    humedad: 52,
    tempMin: 2.0,
    tempMax: 8.0,
    estado: 'Normal',
    lecturasFuera: 0,
    modoFallo: null
  },
  {
    id: 'SEN-03',
    cuarto: 'Nevera 2 (Reactivos Biológicos)',
    tipoEquipo: 'NEVERA',
    temp: 5.2,
    humedad: 48,
    tempMin: 2.0,
    tempMax: 8.0,
    estado: 'Normal',
    lecturasFuera: 0,
    modoFallo: null
  }
];

// 2. Inventario de Medicamentos e Insumos y sus Lotes
let productos = [
  { id: 1, codigo: 'MED-VAC-001', nombre: 'Vacuna mRNA COVID-19', tipo: 'MEDICAMENTO' },
  { id: 2, codigo: 'MED-INS-002', nombre: 'Insulina Glargina 100 UI/ml', tipo: 'MEDICAMENTO' },
  { id: 3, codigo: 'MED-BIO-003', nombre: 'Anticuerpos Monoclonales Inmunoterapia', tipo: 'MEDICAMENTO' },
  { id: 4, codigo: 'MED-VAC-004', nombre: 'Vacuna Hepatitis B Recombinante', tipo: 'MEDICAMENTO' }
];

let lotes = [
  {
    id: 1,
    productoId: 1,
    productoNombre: 'Vacuna mRNA COVID-19',
    codigo: 'MED-VAC-001',
    numeroLote: 'LOT-2026-X89',
    cantidad: 5000,
    vencimiento: '2027-04-15',
    sensorId: 'SEN-01',
    ubicacion: 'Cuarto Frío 1',
    estado: 'Vigente'
  },
  {
    id: 2,
    productoId: 2,
    productoNombre: 'Insulina Glargina 100 UI/ml',
    codigo: 'MED-INS-002',
    numeroLote: 'LOT-2026-B12',
    cantidad: 2400,
    vencimiento: '2026-12-30',
    sensorId: 'SEN-02',
    ubicacion: 'Nevera 1',
    estado: 'Vigente'
  },
  {
    id: 3,
    productoId: 3,
    productoNombre: 'Anticuerpos Monoclonales Inmunoterapia',
    codigo: 'MED-BIO-003',
    numeroLote: 'LOT-2026-C44',
    cantidad: 850,
    vencimiento: '2027-08-20',
    sensorId: 'SEN-03',
    ubicacion: 'Nevera 2',
    estado: 'Vigente'
  },
  {
    id: 4,
    productoId: 4,
    productoNombre: 'Vacuna Hepatitis B Recombinante',
    codigo: 'MED-VAC-004',
    numeroLote: 'LOT-2026-V77',
    cantidad: 3200,
    vencimiento: '2027-01-10',
    sensorId: 'SEN-01',
    ubicacion: 'Cuarto Frío 1',
    estado: 'Vigente'
  }
];

// 3. Incidentes, Escalamiento SLA y Lotes Afectados
let incidentes = [];
let lotesAfectados = [];
let historialLecturas = [];
let timersSLA = {};

// Factor de tiempo de prueba para SLA:
// Si aceleradoSLA = true, los minutos se simulan en intervalos de 15 segundos para demos fluidas.
let aceleradoSLA = true;

// =============================================================================
// FUNCIONES AUXILIARES & WEBSOCKET BROADCAST
// =============================================================================

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

function broadcastFullState() {
  broadcast({
    tipo: 'ACTUALIZACION_COMPLETA',
    sensores,
    incidentes,
    lotes,
    lotesAfectados,
    metricas: calcularMetricas()
  });
}

function calcularMetricas() {
  const cerrados = incidentes.filter(i => i.estado === 'Cerrado' && i.cerradoEn);
  let totalMinutos = 0;

  cerrados.forEach(inc => {
    const duracionMs = new Date(inc.cerradoEn) - new Date(inc.creadoEn);
    totalMinutos += Math.max(1, Math.round(duracionMs / 60000));
  });

  const mttr = cerrados.length > 0 ? (totalMinutos / cerrados.length).toFixed(1) : 0;

  return {
    incidentesTotales: incidentes.length,
    incidentesActivos: incidentes.filter(i => i.estado !== 'Cerrado').length,
    incidentesCerrados: cerrados.length,
    mttrMinutos: Number(mttr),
    lotesEnRevision: lotesAfectados.filter(l => l.decision === 'PENDIENTE_REVISION').length
  };
}

// =============================================================================
// MOTOR DE SIMULACIÓN DE TELEMETRÍA (IoT)
// =============================================================================

setInterval(() => {
  const ahora = new Date();

  sensores.forEach(sensor => {
    // 1. Manejo de modos de fallo inyectados
    if (sensor.modoFallo === 'AUMENTO_PAULATINO') {
      if (sensor.temp < 12.5) {
        sensor.temp = parseFloat((sensor.temp + 0.6).toFixed(1));
      }
    } else if (sensor.modoFallo === 'APERTURA_PUERTA') {
      sensor.temp = parseFloat((13.8 + (Math.random() * 0.4 - 0.2)).toFixed(1));
      sensor.humedad = Math.min(92, sensor.humedad + 3);
    } else {
      // Comportamiento normal dentro de rango con pequeña oscilación estocástica
      const delta = (Math.random() * 0.6 - 0.3);
      sensor.temp = parseFloat((sensor.temp + delta).toFixed(1));
      if (sensor.temp < 2.5) sensor.temp = 2.8;
      if (sensor.temp > 7.5) sensor.temp = 7.1;
      sensor.humedad = Math.round(55 + Math.random() * 6);
    }

    // 2. Detección de umbral (Rango 2°C a 8°C)
    const fueraDeRango = sensor.temp < sensor.tempMin || sensor.temp > sensor.tempMax;

    if (fueraDeRango) {
      sensor.lecturasFuera += 1;
      if (sensor.lecturasFuera >= 3) {
        sensor.estado = 'Crítico';
        verificarYCrearIncidente(sensor, sensor.temp);
      } else {
        sensor.estado = 'Advertencia';
      }
    } else {
      sensor.lecturasFuera = 0;
      sensor.estado = 'Normal';
    }

    // 3. Registro para auditoría (últimas 200 lecturas)
    historialLecturas.push({
      timestamp: ahora.toISOString(),
      sensorId: sensor.id,
      cuarto: sensor.cuarto,
      temp: sensor.temp,
      humedad: sensor.humedad,
      estado: sensor.estado
    });

    if (historialLecturas.length > 200) {
      historialLecturas.shift();
    }
  });

  broadcastFullState();
}, 3500);

// =============================================================================
// MOTOR DE ALERTAS, ESCALAMIENTO SLA E IDENTIFICACIÓN DE LOTES
// =============================================================================

function verificarYCrearIncidente(sensor, tempActual) {
  // Evitar duplicar incidentes si ya hay uno abierto o en atención para este sensor
  const incidenteExistente = incidentes.find(
    inc => inc.sensorId === sensor.id && inc.estado !== 'Cerrado'
  );

  if (incidenteExistente) return;

  const idIncidente = 'INC-' + Date.now().toString().slice(-6);
  const tiempoMin5 = aceleradoSLA ? 15000 : 5 * 60 * 1000;
  const tiempoMin10 = aceleradoSLA ? 30000 : 10 * 60 * 1000;

  const nuevoIncidente = {
    id: idIncidente,
    sensorId: sensor.id,
    cuarto: sensor.cuarto,
    tipoEquipo: sensor.tipoEquipo,
    temperaturaCritica: tempActual,
    nivel: 'Nivel 1',
    estado: 'Abierto', // 'Abierto' | 'En atención' | 'Cerrado'
    etapaSLA: 'Minuto 0: Notificación inicial emitida al Técnico de Turno',
    destinatarioActual: 'Técnico de Turno',
    protocoloEmergenciaActivo: false,
    creadoEn: new Date(),
    acusadoPor: null,
    acusadoEn: null,
    cerradoPor: null,
    cerradoEn: null,
    motivo: null,
    accionesCorrectivas: null
  };

  incidentes.unshift(nuevoIncidente);

  // MÓDULO 5: IDENTIFICACIÓN AUTOMÁTICA DE LOTES POTENCIALMENTE AFECTADOS
  const lotesEnRiesgo = lotes.filter(l => l.sensorId === sensor.id);
  lotesEnRiesgo.forEach(l => {
    // Marcamos el lote en revisión
    l.estado = 'En revisión';

    // Registramos en lotes afectados por este incidente
    lotesAfectados.unshift({
      id: 'LA-' + Date.now().toString().slice(-5) + '-' + l.id,
      incidenteId: idIncidente,
      loteId: l.id,
      numeroLote: l.numeroLote,
      productoNombre: l.productoNombre,
      cantidad: l.cantidad,
      sensorId: sensor.id,
      ubicacion: l.ubicacion,
      marcadoEn: new Date(),
      decision: 'PENDIENTE_REVISION', // 'PENDIENTE_REVISION' | 'APTO' | 'NO_APTO'
      justificacion: null,
      decididoPor: null,
      decididoEn: null
    });
  });

  // Temporizador SLA: Minuto 5 (Escalamiento a Supervisor de Calidad)
  const timer5 = setTimeout(() => {
    const inc = incidentes.find(i => i.id === idIncidente);
    if (inc && inc.estado === 'Abierto') {
      inc.nivel = 'Nivel 2';
      inc.destinatarioActual = 'Supervisor de Calidad';
      inc.etapaSLA = 'Minuto 5 (Sin acuse): Escalamiento automático al Supervisor de Calidad';
      broadcastFullState();
    }
  }, tiempoMin5);

  // Temporizador SLA: Minuto 10 (Escalamiento a Director y Protocolo de Emergencia)
  const timer10 = setTimeout(() => {
    const inc = incidentes.find(i => i.id === idIncidente);
    if (inc && inc.estado === 'Abierto') {
      inc.nivel = 'Nivel 3 (Emergencia)';
      inc.destinatarioActual = 'Director del Laboratorio';
      inc.protocoloEmergenciaActivo = true;
      inc.etapaSLA = 'Minuto 10 (Sin acuse): Escalamiento al Director del Laboratorio y Protocolo de Emergencia activado';
      broadcastFullState();
    }
  }, tiempoMin10);

  timersSLA[idIncidente] = { timer5, timer10 };
}

// =============================================================================
// ENDPOINTS REST API
// =============================================================================

// --- MÓDULO 1: Simulación de anomalías ---
app.post('/api/anomalia', (req, res) => {
  const { sensorId, modoFallo } = req.body;
  const sensor = sensores.find(s => s.id === sensorId);

  if (!sensor) {
    return res.status(404).json({ error: 'Sensor no encontrado' });
  }

  sensor.modoFallo = modoFallo;

  if (modoFallo === 'NORMALIZAR') {
    sensor.modoFallo = null;
    sensor.temp = 4.5;
    sensor.lecturasFuera = 0;
    sensor.estado = 'Normal';
  } else if (modoFallo === 'APERTURA_PUERTA') {
    sensor.temp = 13.8;
  }

  broadcastFullState();
  res.json({ exito: true, mensaje: `Escenario ${modoFallo || 'Normal'} aplicado a ${sensorId}` });
});

// Toggle de velocidad SLA (para demos y pruebas rápidas)
app.post('/api/config/sla-acelerado', (req, res) => {
  aceleradoSLA = !aceleradoSLA;
  res.json({ aceleradoSLA, mensaje: `SLA acelerado para demos: ${aceleradoSLA ? 'ACTIVADO (15s/30s)' : 'DESACTIVADO (5min/10min)'}` });
});

// --- MÓDULO 3: Acuse de recibo y Cierre de incidentes ---
app.post('/api/incidentes/:id/acusar', (req, res) => {
  const { id } = req.params;
  const { usuario, rol } = req.body;

  const incidente = incidentes.find(i => i.id === id);
  if (!incidente) {
    return res.status(404).json({ error: 'Incidente no encontrado' });
  }

  incidente.estado = 'En atención';
  incidente.acusadoPor = `${usuario} (${rol})`;
  incidente.acusadoEn = new Date();
  incidente.etapaSLA = `Acuse recibido por ${usuario} (${rol}). Temporizador de escalamiento detenido.`;

  // Detener timers de escalamiento porque ya hubo intervención humana
  if (timersSLA[id]) {
    clearTimeout(timersSLA[id].timer5);
    clearTimeout(timersSLA[id].timer10);
    delete timersSLA[id];
  }

  broadcastFullState();
  res.json({ exito: true, incidente });
});

app.post('/api/incidentes/:id/cerrar', (req, res) => {
  const { id } = req.params;
  const { motivo, accionesCorrectivas, usuario, rol } = req.body;

  if (!motivo || !accionesCorrectivas) {
    return res.status(400).json({ error: 'Se requiere motivo y acciones correctivas para cerrar el incidente' });
  }

  const incidente = incidentes.find(i => i.id === id);
  if (!incidente) {
    return res.status(404).json({ error: 'Incidente no encontrado' });
  }

  incidente.estado = 'Cerrado';
  incidente.motivo = motivo;
  incidente.accionesCorrectivas = accionesCorrectivas;
  incidente.cerradoPor = `${usuario} (${rol})`;
  incidente.cerradoEn = new Date();
  incidente.etapaSLA = `Incidente resuelto y cerrado por ${usuario}.`;

  if (timersSLA[id]) {
    clearTimeout(timersSLA[id].timer5);
    clearTimeout(timersSLA[id].timer10);
    delete timersSLA[id];
  }

  // Normalizar el sensor asociado si estaba en fallo
  const sensor = sensores.find(s => s.id === incidente.sensorId);
  if (sensor) {
    sensor.modoFallo = null;
    sensor.temp = 4.5;
    sensor.lecturasFuera = 0;
    sensor.estado = 'Normal';
  }

  broadcastFullState();
  res.json({ exito: true, mensaje: 'Incidente cerrado con éxito' });
});

// --- MÓDULO 5: Gestión de Inventario y Evaluación de Lotes con 2FA ---
app.get('/api/inventario', (req, res) => {
  res.json({ productos, lotes, lotesAfectados });
});

app.post('/api/inventario/lotes', (req, res) => {
  const { productoId, numeroLote, cantidad, vencimiento, sensorId } = req.body;
  const producto = productos.find(p => p.id === Number(productoId));
  const sensor = sensores.find(s => s.id === sensorId);

  if (!producto || !numeroLote || !cantidad || !sensor) {
    return res.status(400).json({ error: 'Faltan datos requeridos del lote' });
  }

  const nuevoLote = {
    id: lotes.length + 1,
    productoId: producto.id,
    productoNombre: producto.nombre,
    codigo: producto.codigo,
    numeroLote,
    cantidad: Number(cantidad),
    vencimiento,
    sensorId: sensor.id,
    ubicacion: sensor.cuarto,
    estado: 'Vigente'
  };

  lotes.push(nuevoLote);
  broadcastFullState();
  res.json({ exito: true, lote: nuevoLote });
});

// Evaluación de disposición del lote (Apto / No Apto) - REGLA DE NEGOCIO Y 2FA
app.post('/api/lotes-afectados/:id/evaluar', (req, res) => {
  const { id } = req.params;
  const { decision, justificacion, codigo2FA, usuario, rol } = req.body;

  // 1. Verificación de permisos RBAC: Solo Supervisor o Director
  if (!['SUPERVISOR', 'DIRECTOR'].includes(rol)) {
    return res.status(403).json({ error: 'Solo el Supervisor de Calidad o Director pueden disponer de lotes afectados' });
  }

  // 2. Verificación 2FA obligatoria
  // Código mock estándar de 2FA para el laboratorio: '741258' o cualquier código de 6 dígitos para la demo
  if (!codigo2FA || codigo2FA.length !== 6) {
    return res.status(401).json({ error: 'Código de autenticación 2FA inválido. Ingrese un código de 6 dígitos.' });
  }

  // 3. Justificación obligatoria
  if (!justificacion || justificacion.trim().length < 10) {
    return res.status(400).json({ error: 'La justificación médica/técnica debe tener al menos 10 caracteres' });
  }

  const itemAfectado = lotesAfectados.find(la => la.id === id);
  if (!itemAfectado) {
    return res.status(404).json({ error: 'Registro de lote afectado no encontrado' });
  }

  itemAfectado.decision = decision; // 'APTO' o 'NO_APTO'
  itemAfectado.justificacion = justificacion;
  itemAfectado.decididoPor = `${usuario} (${rol})`;
  itemAfectado.decididoEn = new Date();

  // Actualizar el estado del lote en el inventario general
  const loteOriginal = lotes.find(l => l.id === itemAfectado.loteId);
  if (loteOriginal) {
    loteOriginal.estado = decision === 'APTO' ? 'Vigente' : 'Degradado';
  }

  broadcastFullState();
  res.json({ exito: true, mensaje: `Lote ${itemAfectado.numeroLote} dispuesto como ${decision}`, itemAfectado });
});

// --- MÓDULO 4: Exportación de Auditoría (CSV) ---
app.get('/api/exportar/csv', (req, res) => {
  let csv = 'Timestamp,Sensor_ID,Ubicacion,Temperatura_C,Humedad_Porcentaje,Estado\n';
  historialLecturas.forEach(h => {
    csv += `"${h.timestamp}","${h.sensorId}","${h.cuarto}",${h.temp},${h.humedad},"${h.estado}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="auditoria_telemetria_coldchain.csv"');
  res.send(csv);
});

// =============================================================================
// INICIALIZACIÓN DEL SERVIDOR
// =============================================================================
const PUERTO = 3000;
server.listen(PUERTO, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Coldchain Sentinel IoT Backend corriendo en:`);
  console.log(`   API REST:    http://localhost:${PUERTO}`);
  console.log(`   WebSocket:   ws://localhost:${PUERTO}`);
  console.log(`======================================================\n`);
});
