import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { loadConfig, publicConfig } from '../src/config.js';
import { verifyToken } from '../src/integrations/oauth.js';
import { createSpeechService, createSpeechLimiter } from '../src/integrations/elevenlabs.js';
import { createApp } from '../src/server.js';

const config = loadConfig({ OAUTH_ISSUER: 'https://issuer.example/', OAUTH_AUDIENCE: 'https://api.example', ELEVENLABS_API_KEY: 'test-secret', ELEVENLABS_VOICE_ID: 'test-voice' });
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] });
async function token({ issuer = config.issuer, audience = config.audience, expiry = '5m', signer = privateKey } = {}) {
  return new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject('user-1')
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiry).sign(signer);
}
async function start(t, options = {}) {
  const server = createApp({ config, verifyAccessToken: value => verifyToken(value, keys, config), ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('auth requerida por defecto y configuración pública sin secretos', () => {
  assert.throws(() => loadConfig({}), /OAUTH_ISSUER/);
  assert.throws(() => loadConfig({ AUTH_MODE: 'typo' }), /AUTH_MODE/);
  assert.equal(loadConfig({ OAUTH_ISSUER: 'tenant.us.auth0.com', OAUTH_AUDIENCE: 'api' }).issuer, 'https://tenant.us.auth0.com/');
  assert.throws(() => loadConfig({ OAUTH_ISSUER: 'not-a-url', OAUTH_AUDIENCE: 'api' }), error => !error.message.includes('not-a-url'));
  assert.throws(() => loadConfig({ OAUTH_ISSUER: 'http://issuer.example/', OAUTH_AUDIENCE: 'api' }), /HTTPS/);
  assert.ok(!JSON.stringify(publicConfig(config)).includes('test-secret'));
  assert.ok(!JSON.stringify(publicConfig(config)).includes('test-voice'));
});

test('rechaza tokens vencidos, otra audiencia, otro issuer y firmas falsas', async () => {
  const other = await generateKeyPair('RS256');
  for (const options of [{ expiry: '-1m' }, { audience: 'wrong' }, { issuer: 'https://wrong.example/' }, { signer: other.privateKey }]) {
    await assert.rejects(() => token(options).then(value => verifyToken(value, keys, config)));
  }
  assert.equal((await verifyToken(await token(), keys, config)).sub, 'user-1');
});

test('protege saldo, chat, transacciones y voz; permite config y preflight', async t => {
  let synthesisCalls = 0;
  const url = await start(t, { synthesize: async () => { synthesisCalls++; return Buffer.from('ID3audio'); } });
  for (const [path, method] of [['account', 'GET'], ['chat', 'POST'], ['transactions/preview', 'POST'], ['transactions', 'POST'], ['speech', 'POST']]) {
    const result = await fetch(`${url}/api/${path}`, { method });
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('www-authenticate'), 'Bearer');
  }
  assert.equal(synthesisCalls, 0);
  const invalid = await fetch(`${url}/api/account`, { headers: { Authorization: 'Bearer bad-token' } });
  assert.equal(invalid.status, 401);
  const result = await fetch(`${url}/api/account`, { headers: { Authorization: `Bearer ${await token()}` } });
  assert.equal(result.status, 200);
  const settings = await fetch(`${url}/api/config`);
  assert.equal(settings.status, 200);
  assert.ok(!(await settings.text()).includes('test-secret'));
  const preflight = await fetch(`${url}/api/speech`, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
});

test('voz autenticada devuelve MP3, valida texto y limita peticiones', async t => {
  let calls = 0;
  const url = await start(t, { synthesize: async text => { calls++; assert.equal(text, 'Hola'); return Buffer.from('ID3audio'); }, allowSpeech: createSpeechLimiter({ limit: 1 }) });
  const headers = { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' };
  for (const text of ['', ' ', 'x'.repeat(2001)]) {
    assert.equal((await fetch(`${url}/api/speech`, { method: 'POST', headers, body: JSON.stringify({ text }) })).status, 400);
  }
  const response = await fetch(`${url}/api/speech`, { method: 'POST', headers, body: JSON.stringify({ text: ' Hola ' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), 'ID3audio');
  const limited = await fetch(`${url}/api/speech`, { method: 'POST', headers, body: JSON.stringify({ text: 'Hola' }) });
  assert.equal(limited.status, 429);
  assert.equal(calls, 1);
});

test('modo demo nunca gasta créditos de voz', async t => {
  const url = await start(t, { config: loadConfig({ AUTH_MODE: 'demo', ELEVENLABS_API_KEY: 'test-secret', ELEVENLABS_VOICE_ID: 'test-voice' }), synthesize: () => assert.fail('No debe llamarse') });
  assert.equal((await fetch(`${url}/api/speech`, { method: 'POST', body: JSON.stringify({ text: 'Hola' }) })).status, 403);
});

test('adaptador ElevenLabs envía la clave solo al proveedor y devuelve audio', async () => {
  const synthesize = createSpeechService(config, { fetchImpl: async (url, init) => {
    assert.equal(new URL(url).origin, 'https://api.elevenlabs.io');
    assert.equal(init.headers['xi-api-key'], 'test-secret');
    assert.equal(JSON.parse(init.body).model_id, 'eleven_multilingual_v2');
    assert.equal(JSON.parse(init.body).text, 'Hola');
    return new Response('ID3audio', { headers: { 'Content-Type': 'audio/mpeg' } });
  } });
  assert.equal((await synthesize('Hola')).toString(), 'ID3audio');
});

test('errores de ElevenLabs no filtran el cuerpo ni la clave', async () => {
  for (const [providerStatus, status] of [[401, 502], [429, 429], [500, 502]]) {
    const synthesize = createSpeechService(config, { fetchImpl: async () => new Response('test-secret', { status: providerStatus }) });
    await assert.rejects(() => synthesize('Hola'), error => error.status === status && !error.message.includes('test-secret'));
  }
  await assert.rejects(() => createSpeechService({})('Hola'), error => error.status === 503);
  await assert.rejects(() => createSpeechService(config, { fetchImpl: async () => { throw new Error('test-secret'); } })('Hola'), error => error.status === 502 && !error.message.includes('test-secret'));
});
