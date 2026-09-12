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

function LoginScreen({ demo = false, onLogin, error }: { demo?: boolean; onLogin: () => void; error?: boolean }) {
  return <div className="login-shell"><section className="login-story"><a className="brand" href="/"><span className="brand-mark">B</span><span>BANORTE<span className="brand-light">HACK</span></span></a><div><span className="eyebrow">TU ESPACIO FINANCIERO</span><h1>Tu dinero, con más claridad.</h1><p>Pregunta, descubre y construye una vista de tus finanzas a tu medida.</p><div className="login-preview"><span>Una conversación. Nuevas perspectivas.</span><strong>Todo empieza contigo.</strong><div className="login-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div></div></div><small>Prototipo con datos sintéticos</small></section><main className="login-card"><span className="eyebrow">BIENVENIDO A NORTE</span><h2>Inicia sesión</h2><p>Un solo espacio para entender tus movimientos, explorar escenarios y tomar mejores decisiones.</p>{error && <p role="alert">No se pudo iniciar sesión. Intenta de nuevo.</p>}<button onClick={onLogin}>{demo ? 'Entrar a la demostración' : 'Iniciar sesión'}</button><small>{demo ? 'Explora el perfil ficticio de Alex, sin credenciales bancarias.' : 'Continúa con tu cuenta mediante el acceso seguro.'}</small></main></div>;
}

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
  if (!isAuthenticated || expired || error) return <LoginScreen error={Boolean(error || loginError)} onLogin={() => { setLoginError(false); void loginWithRedirect({ authorizationParams: { prompt: 'login' } }).catch(() => setLoginError(true)); }} />;

  return <SessionContext.Provider value={{ request, voiceEnabled: config.voice.enabled, demo: false,
    logout: () => { setExpired(true); void logout({ logoutParams: { returnTo: window.location.origin } }).catch(() => setLoginError(true)); }
  }}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>();
  const [failed, setFailed] = useState(false);
  const [demoEntered, setDemoEntered] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    let active = true;
    fetch('/api/config', { signal: controller.signal })
      .then(checkResponse)
      .then(response => response.json())
      .then(data => { if (active) setConfig(data); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => window.clearTimeout(timer));
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, []);
  if (failed) return <main><p role="alert">No se pudo conectar al servicio. Arranca la API con <code>npm run dev:api</code> y recarga.</p><button onClick={() => window.location.reload()}>Reintentar</button></main>;
  if (!config) return <main><p role="status">Conectando…</p></main>;
  if (config.auth.mode === 'demo' && !demoEntered) return <LoginScreen demo onLogin={() => setDemoEntered(true)} />;
  if (config.auth.mode === 'demo') return <SessionContext.Provider value={{ request: demoRequest, logout: () => setDemoEntered(false), voiceEnabled: false, demo: true }}>{children}</SessionContext.Provider>;
  if (!config.auth.webClientId) return <main><p role="status">El inicio de sesión aún no está configurado.</p></main>;
  return <Auth0Provider domain={new URL(config.auth.issuer).host} clientId={config.auth.webClientId}
    authorizationParams={{ redirect_uri: window.location.origin, audience: config.auth.audience, scope: 'openid profile email' }}
    onRedirectCallback={() => window.history.replaceState({}, document.title, window.location.pathname)}>
    <AuthenticatedSession config={config}>{children}</AuthenticatedSession>
  </Auth0Provider>;
}
