import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicConfig } from '@banortehack/contracts';

interface Session {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  logout: () => void;
  voiceEnabled: boolean;
  demo: boolean;
}

const SessionContext = createContext<Session | null>(null);
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider requerido.');
  return session;
}

async function checkResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'No se pudo completar la solicitud.');
  }
  return response;
}

const demoRequest: Session['request'] = async (path, init) => checkResponse(await fetch(path, init));

function AuthenticatedSession({ config, children }: { config: PublicConfig; children: ReactNode }) {
  const { isLoading, isAuthenticated, error, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();
  const [expired, setExpired] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const request = useCallback<Session['request']>(async (path, init) => {
    let token: string;
    try { token = await getAccessTokenSilently(); }
    catch { setExpired(true); throw new Error('Inicia sesión de nuevo para continuar.'); }
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(path, { ...init, headers });
    if (response.status === 401) setExpired(true);
    return checkResponse(response);
  }, [getAccessTokenSilently]);

  if (isLoading) return <main><p role="status">Verificando tu sesión…</p></main>;
  if (!isAuthenticated || expired || error) return <main>
    <h1>BanorteHack</h1><p>Inicia sesión para conversar sobre tus finanzas.</p>
    {(error || loginError) && <p role="alert">No se pudo iniciar sesión. Intenta de nuevo.</p>}
    <button onClick={() => { setLoginError(false); void loginWithRedirect({ authorizationParams: { prompt: 'login' } }).catch(() => setLoginError(true)); }}>Iniciar sesión</button>
  </main>;

  return <SessionContext.Provider value={{ request, voiceEnabled: config.voice.enabled, demo: false,
    logout: () => { setExpired(true); void logout({ logoutParams: { returnTo: window.location.origin } }).catch(() => setLoginError(true)); }
  }}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal }).then(checkResponse).then(response => response.json()).then(setConfig)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  if (failed) return <main><p role="alert">No se pudo conectar al servicio.</p><button onClick={() => window.location.reload()}>Reintentar</button></main>;
  if (!config) return <main><p role="status">Conectando…</p></main>;
  if (config.auth.mode === 'demo') return <SessionContext.Provider value={{ request: demoRequest, logout: () => {}, voiceEnabled: false, demo: true }}>{children}</SessionContext.Provider>;
  if (!config.auth.webClientId) return <main><p role="status">El inicio de sesión aún no está configurado.</p></main>;
  return <Auth0Provider domain={new URL(config.auth.issuer).host} clientId={config.auth.webClientId}
    authorizationParams={{ redirect_uri: window.location.origin, audience: config.auth.audience, scope: 'openid profile email' }}
    onRedirectCallback={() => window.history.replaceState({}, document.title, window.location.pathname)}>
    <AuthenticatedSession config={config}>{children}</AuthenticatedSession>
  </Auth0Provider>;
}
