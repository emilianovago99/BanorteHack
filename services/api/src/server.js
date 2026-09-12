import { createServer } from 'node:http';
import { previewTransaction } from './transactions/service.js';
import { loadConfig, publicConfig } from './config.js';
import { createTokenVerifier } from './integrations/oauth.js';
import { createSpeechService, createSpeechLimiter } from './integrations/elevenlabs.js';

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65_536) throw new Error('Solicitud demasiado grande.');
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Se requiere un objeto JSON.');
  return parsed;
}

export function createApp({
  aiUrl = process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000',
  webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  config = loadConfig(),
  verifyAccessToken = config.authMode === 'required' ? createTokenVerifier(config) : null,
  synthesize = createSpeechService(config),
  allowSpeech = createSpeechLimiter(),
  fetchAI = fetch
} = {}) {
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Access-Control-Allow-Origin', webOrigin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    const send = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)); };
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (request.method === 'GET' && path === '/health') return send(200, { status: 'ok', service: 'api', mode: 'demo' });
    if (request.method === 'GET' && path === '/api/config') return send(200, publicConfig(config));
    let subject = 'demo';
    if (path.startsWith('/api/') && config.authMode === 'required') {
      const authorization = request.headers.authorization;
      const token = typeof authorization === 'string' && /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
      try {
        if (!token) throw new Error('Token requerido.');
        subject = (await verifyAccessToken(token)).sub;
      } catch {
        response.setHeader('WWW-Authenticate', 'Bearer');
        return send(401, { error: 'Inicia sesión de nuevo para continuar.' });
      }
    }
    if (request.method === 'GET' && ['/api/account', '/api/dashboard'].includes(path)) {
      try {
        const upstream = await fetchAI(`${aiUrl}/${path.split('/').pop()}`, { signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) throw new Error();
        return send(200, await upstream.json());
      } catch { return send(502, { error: 'No se pudo consultar el dataset. Verifica el servicio de IA.' }); }
    }
    if (request.method === 'POST' && path === '/api/transactions') return send(501, { error: 'Las transacciones reales aún no están implementadas.' });
    if (request.method !== 'POST' || !['/api/chat', '/api/actions', '/api/transactions/preview', '/api/speech'].includes(path)) return send(404, { error: 'Ruta no encontrada.' });
    let body;
    try { body = await readJson(request); }
    catch { return send(400, { error: 'JSON inválido o solicitud demasiado grande.' }); }
    if (path === '/api/speech') {
      if (config.authMode !== 'required') return send(403, { error: 'Inicia sesión para usar la voz.' });
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000) return send(400, { error: 'El texto debe contener entre 1 y 2000 caracteres.' });
      if (!allowSpeech(subject)) {
        response.setHeader('Retry-After', '60');
        return send(429, { error: 'Espera un minuto antes de generar más audio.' });
      }
      try {
        const audio = await synthesize(body.text.trim());
        response.setHeader('Content-Type', 'audio/mpeg');
        response.writeHead(200);
        response.end(audio);
        return;
      } catch (error) { return send(error.status ?? 502, { error: error.message ?? 'No se pudo generar la voz.' }); }
    }
    if (path === '/api/transactions/preview') {
      try { return send(200, previewTransaction(body)); }
      catch (error) { return send(400, { error: error.message }); }
    }
    if (path === '/api/chat' && (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000)) return send(400, { error: 'El mensaje debe contener entre 1 y 2000 caracteres.' });
    try {
      const upstream = await fetchAI(`${aiUrl}/${path === '/api/actions' ? 'actions' : 'chat'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(path === '/api/actions' ? body : { message: body.message.trim(), history: body.history ?? [], simulation: body.simulation ?? null, current_view: body.current_view ?? null }), signal: AbortSignal.timeout(30_000)
      });
      if (upstream.status === 422) return send(400, { error: 'Revisa los parámetros de la consulta o simulación.' });
      if (!upstream.ok) throw new Error('AI unavailable');
      return send(200, await upstream.json());
    } catch { return send(502, { error: 'El servicio de IA no está disponible.' }); }
  });
}
