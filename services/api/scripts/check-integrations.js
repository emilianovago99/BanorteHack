import { loadConfig } from '../src/config.js';

// Solo consultas de configuración/voz: no genera audio ni imprime credenciales.
const config = loadConfig();
const checks = [
  ['OAuth discovery', async () => {
    const response = await fetch(`${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
    if (!response.ok) return `HTTP ${response.status}`;
    const metadata = await response.json();
    return metadata.issuer === config.issuer && metadata.jwks_uri ? 'OK' : 'Issuer o JWKS no coincide';
  }],
  ['ElevenLabs voice access', async () => {
    if (!config.elevenLabsKey || !config.voiceId) return 'Faltan variables';
    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(config.voiceId)}`, {
      headers: { 'xi-api-key': config.elevenLabsKey }, signal: AbortSignal.timeout(10_000), redirect: 'error'
    });
    if (response.status === 401 || response.status === 403) {
      const body = await response.json().catch(() => ({}));
      if (body.detail?.status === 'missing_permissions') return 'WARN: falta Voices Read; la síntesis puede funcionar sin ese permiso';
      return `HTTP ${response.status} (revisar credenciales y permisos)`;
    }
    await response.body?.cancel();
    return response.ok ? 'OK' : `HTTP ${response.status} (revisar clave, voz y permiso Voices Read)`;
  }]
];
for (const [name, run] of checks) {
  let result;
  try { result = await run(); } catch { result = 'No se pudo conectar'; }
  console.log(`${name}: ${result}`);
  if (result !== 'OK' && !result.startsWith('WARN:')) process.exitCode = 1;
}
console.log(`Web Client ID: ${config.webClientId ? 'presente' : 'pendiente'}`);
console.log(`Mobile Client ID: ${config.mobileClientId ? 'presente' : 'pendiente'}`);
