import { createServer } from 'node:http';
import { previewTransaction } from './transactions/service.js';

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Solicitud demasiado grande.');
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Se requiere un objeto JSON.');
  return parsed;
}

export function createApp({ aiUrl = process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000', webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173' } = {}) {
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Access-Control-Allow-Origin', webOrigin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    const send = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)); };
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (request.method === 'GET' && path === '/health') return send(200, { status: 'ok', service: 'api', mode: 'demo' });
    if (request.method === 'GET' && path === '/api/account') return send(200, { balance: 24500, currency: 'MXN', mode: 'demo' });
    if (request.method === 'POST' && path === '/api/transactions') return send(501, { error: 'Las transacciones reales aún no están implementadas.' });
    if (request.method !== 'POST' || !['/api/chat', '/api/transactions/preview'].includes(path)) return send(404, { error: 'Ruta no encontrada.' });
    let body;
    try { body = await readJson(request); }
    catch { return send(400, { error: 'JSON inválido o solicitud demasiado grande.' }); }
    if (path === '/api/transactions/preview') {
      try { return send(200, previewTransaction(body)); }
      catch (error) { return send(400, { error: error.message }); }
    }
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) return send(400, { error: 'El mensaje debe contener entre 1 y 2000 caracteres.' });
    try {
      const upstream = await fetch(`${aiUrl}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: body.message.trim() }), signal: AbortSignal.timeout(15_000)
      });
      if (!upstream.ok) throw new Error('AI unavailable');
      return send(200, await upstream.json());
    } catch { return send(502, { error: 'El servicio de IA no está disponible.' }); }
  });
}
