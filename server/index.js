import express from 'express';
import http from 'http';
import cors from 'cors';
import { cerrarPool, probarConexion } from '../db.js';
import { smtpConfigurado, verificarSMTP } from '../mailer.js';
import { PUERTO } from './config.js';
import { cargarSensores, sensores } from './state.js';
import { initRealtime } from './realtime.js';
import { iniciarSimulador } from './simulator.js';
import authRoutes from './routes/auth.js';
import iamRoutes from './routes/iam.js';
import telemetryRoutes from './routes/telemetry.js';
import incidentRoutes from './routes/incidents.js';
import inventoryRoutes from './routes/inventory.js';
import auditRoutes from './routes/audit.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', authRoutes);
app.use('/api/iam', iamRoutes);
app.use('/api', telemetryRoutes);
app.use('/api', incidentRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', auditRoutes);

const server = http.createServer(app);
initRealtime(server);

async function iniciar() {
  try {
    const info = await probarConexion();
    console.log(`Conectado a PostgreSQL: base "${info.db}"`);
    await cargarSensores();
    console.log(`${sensores.length} equipos cargados desde la base de datos`);
    console.log(`SMTP: ${smtpConfigurado() ? 'Configurado' : 'Desactivado (solo alertas visuales)'}`);
    if (smtpConfigurado()) {
      verificarSMTP()
        .then(() => console.log('SMTP: conexión y credenciales verificadas correctamente'))
        .catch((err) => console.error('SMTP: configuración presente pero falló la verificación:', err.message));
    }
  } catch (err) {
    console.error('Error inicializando PostgreSQL:', err.message);
    process.exit(1);
  }

  iniciarSimulador();
  server.listen(PUERTO, () => {
    console.log(`ColdChain Sentinel Backend en http://localhost:${PUERTO} (WS: ws://localhost:${PUERTO})`);
  });
}

process.on('SIGINT', async () => {
  await cerrarPool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cerrarPool();
  process.exit(0);
});

iniciar();
