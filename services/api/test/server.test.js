import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';

async function start(t, options) {
  const server = createApp({ config: loadConfig({ AUTH_MODE: 'demo' }), ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('rechaza mensajes vacíos antes de llamar a la IA', async t => {
  const url = await start(t);
  const result = await fetch(`${url}/api/chat`, { method: 'POST', body: JSON.stringify({ message: '  ' }) });
  assert.equal(result.status, 400);
});

test('la vista previa valida montos y no ejecuta transacciones', async t => {
  const url = await start(t);
  for (const amount of [-1, 0, '100']) {
    const result = await fetch(`${url}/api/transactions/preview`, { method: 'POST', body: JSON.stringify({ action: 'pagar', amount }) });
    assert.equal(result.status, 400);
  }
  const preview = await fetch(`${url}/api/transactions/preview`, { method: 'POST', body: JSON.stringify({ action: 'pagar', amount: 100 }) });
  assert.equal((await preview.json()).status, 'preview');
  const execute = await fetch(`${url}/api/transactions`, { method: 'POST' });
  assert.equal(execute.status, 501);
});

test('devuelve un error controlado si el servicio de IA no responde', async t => {
  const url = await start(t, { aiUrl: 'http://127.0.0.1:1' });
  const result = await fetch(`${url}/api/chat`, { method: 'POST', body: JSON.stringify({ message: 'Mis ingresos' }) });
  assert.equal(result.status, 502);
});
