export function loadConfig(env = process.env) {
  const read = key => env[key]?.trim() ?? '';
  const authMode = read('AUTH_MODE') || 'required';
  if (!['required', 'demo'].includes(authMode)) throw new Error('AUTH_MODE debe ser required o demo.');
  let issuer = read('OAUTH_ISSUER');
  if (/^[a-z\d.-]+\.auth0\.com\/?$/i.test(issuer)) issuer = `https://${issuer}`;
  const audience = read('OAUTH_AUDIENCE');
  if (authMode === 'required') {
    if (!issuer || !audience) throw new Error('Configura OAUTH_ISSUER y OAUTH_AUDIENCE; para datos ficticios sin login usa AUTH_MODE=demo.');
    let url;
    try { url = new URL(issuer); } catch { throw new Error('OAUTH_ISSUER debe ser una URL HTTPS válida o el dominio de tu tenant Auth0.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('OAUTH_ISSUER debe ser una URL HTTPS válida.');
    issuer = url.href;
  }
  return {
    authMode, issuer, audience,
    webClientId: read('OAUTH_WEB_CLIENT_ID'), mobileClientId: read('OAUTH_MOBILE_CLIENT_ID'),
    elevenLabsKey: read('ELEVENLABS_API_KEY'), voiceId: read('ELEVENLABS_VOICE_ID'),
    voiceModel: read('ELEVENLABS_MODEL_ID') || 'eleven_multilingual_v2'
  };
}

export function publicConfig(config) {
  return {
    auth: { mode: config.authMode, issuer: config.issuer, audience: config.audience, webClientId: config.webClientId, mobileClientId: config.mobileClientId },
    voice: { enabled: config.authMode === 'required' && Boolean(config.elevenLabsKey && config.voiceId) }
  };
}
