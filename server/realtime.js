import { WebSocketServer } from 'ws';
import { construirEstado } from './state.js';

let wss = null;

export function initRealtime(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', async (ws) => {
    try {
      const estado = await construirEstado();
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ tipo: 'ACTUALIZACION_COMPLETA', ...estado }));
      }
    } catch (err) {
      console.error('Error enviando estado inicial por WS:', err.message);
    }
  });

  return wss;
}

export function broadcast(data) {
  if (!wss) return;
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

export async function broadcastFullState() {
  const estado = await construirEstado();
  broadcast({ tipo: 'ACTUALIZACION_COMPLETA', ...estado });
  return estado;
}
