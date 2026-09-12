import { createRemoteJWKSet, jwtVerify } from 'jose';

export function createTokenVerifier({ issuer, audience }, { fetchImpl = fetch } = {}) {
  let keysPromise;
  async function discoverKeys() {
    const response = await fetchImpl(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(5000), redirect: 'error'
    });
    if (!response.ok) throw new Error('No se pudo descubrir el proveedor OAuth.');
    const metadata = await response.json();
    if (metadata.issuer !== issuer) throw new Error('El issuer no coincide con el proveedor.');
    const url = new URL(metadata.jwks_uri);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('JWKS requiere HTTPS.');
    return createRemoteJWKSet(url, { timeoutDuration: 5000 });
  }
  return async token => {
    keysPromise ??= discoverKeys().catch(error => { keysPromise = undefined; throw error; });
    return verifyToken(token, await keysPromise, { issuer, audience });
  };
}

export async function verifyToken(token, keys, { issuer, audience }) {
  const { payload } = await jwtVerify(token, keys, {
    issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5
  });
  if (typeof payload.sub !== 'string' || !payload.sub.trim()) throw new Error('Token sin usuario.');
  return payload;
}
