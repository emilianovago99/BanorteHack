import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { LoginScreen } from './ui';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { PublicConfig } from '@banortehack/contracts';

WebBrowser.maybeCompleteAuthSession();
const api = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
class LoginFailure extends Error {}

interface Session {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  logout: () => void;
  voiceEnabled: boolean;
  demo: boolean;
}
const Context = createContext<Session | null>(null);
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('MobileSessionProvider requerido.');
  return value;
}

async function checkResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'No se pudo completar la solicitud.');
  }
  return response;
}
async function fetchAPI(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 40000);
  init?.signal?.addEventListener('abort', abort);
  if (init?.signal?.aborted) controller.abort();
  try { return await fetch(`${api}${path}`, { ...init, signal: controller.signal }); }
  catch { throw new Error(controller.signal.aborted ? 'La consulta tardó demasiado. Puedes intentar de nuevo.' : 'No se pudo conectar al servicio. Comprueba la conexión USB o la red.'); }
  finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
}
const demoRequest: Session['request'] = async (path, init) => checkResponse(await fetchAPI(path, init));

function AuthenticatedSession({ config, children }: { config: PublicConfig; children: ReactNode }) {
  const redirectUri = AuthSession.makeRedirectUri({ native: 'banortehack://auth/callback', scheme: 'banortehack', path: 'auth/callback' });
  const [token, setToken] = useState<{ value: string; expiresAt: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => setToken(undefined), Math.max(0, token.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [token]);

  async function login() {
    if (busy) return;
    setBusy(true);
    setError('');
    let step = 'discovery';
    try {
      const discovery = await AuthSession.fetchDiscoveryAsync(config.auth.issuer);
      // Cada intento recibe un state y un verificador PKCE nuevos.
      const authRequest = new AuthSession.AuthRequest({
        clientId: config.auth.mobileClientId, redirectUri, responseType: AuthSession.ResponseType.Code,
        scopes: ['openid', 'profile', 'email'], usePKCE: true,
        extraParams: { audience: config.auth.audience, prompt: 'login' }
      });
      step = 'browser';
      const result = await authRequest.promptAsync(discovery);
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type === 'error') {
        const code = result.params?.error;
        throw new LoginFailure(code === 'access_denied' || code === 'unauthorized_client' ? 'Auth0 rechazó el acceso. Revisa que la aplicación Native tenga acceso a la API y el callback autorizado.' : 'Auth0 no pudo completar el acceso. Revisa el callback de la aplicación Native.');
      }
      if (result.type !== 'success' || !authRequest.codeVerifier) throw new LoginFailure('El navegador no devolvió una autorización válida. Intenta de nuevo.');
      step = 'exchange';
      const response = await AuthSession.exchangeCodeAsync({
        clientId: config.auth.mobileClientId, code: result.params.code, redirectUri,
        extraParams: { code_verifier: authRequest.codeVerifier }
      }, discovery);
      if (!response.accessToken || !response.expiresIn || response.expiresIn <= 0) throw new Error();
      setToken({ value: response.accessToken, expiresAt: Date.now() + response.expiresIn * 1000 });
    } catch (failure) {
      console.warn('Auth0 mobile:', step, failure instanceof Error ? failure.name : 'Error');
      setError(failure instanceof LoginFailure ? failure.message : step === 'discovery' ? 'No se pudo conectar con Auth0. Comprueba que el teléfono tenga acceso a Internet.' : step === 'exchange' ? 'No se pudo completar el intercambio de sesión con Auth0. Revisa la configuración del cliente Native.' : 'No se pudo abrir el acceso seguro. Intenta de nuevo.');
    }
    finally { setBusy(false); }
  }

  const request = useCallback<Session['request']>(async (path, init) => {
    if (!token || token.expiresAt <= Date.now()) { setToken(undefined); throw new Error('Inicia sesión de nuevo.'); }
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token.value}`);
    const response = await fetchAPI(path, { ...init, headers });
    if (response.status === 401) setToken(undefined);
    return checkResponse(response);
  }, [token]);

  async function logout() {
    setToken(undefined);
    setBusy(true);
    try {
      const url = new URL('v2/logout', config.auth.issuer);
      url.searchParams.set('client_id', config.auth.mobileClientId);
      url.searchParams.set('returnTo', redirectUri);
      await WebBrowser.openAuthSessionAsync(url.toString(), redirectUri);
    } catch { setError('La sesión local se cerró. No se pudo cerrar la sesión del navegador.'); }
    finally { setBusy(false); }
  }

  if (!token) return <LoginScreen busy={busy} error={error} onLogin={() => void login()} />;
  return <Context.Provider value={{ request, logout: () => { void logout(); }, voiceEnabled: config.voice.enabled, demo: false }}>{children}</Context.Provider>;
}

export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [demoEntered, setDemoEntered] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); setFailed(true); }, 10000);
    setFailed(false);
    fetch(`${api}/api/config`, { signal: controller.signal }).then(checkResponse).then(response => response.json()).then(setConfig)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [attempt]);
  if (failed) return <LoginScreen error="No se pudo conectar al servicio. Comprueba la conexión con tu computadora." onLogin={() => setAttempt(value => value + 1)} />;
  if (!config) return <LoginScreen busy message="Conectando con tu espacio financiero…" />;
  if (config.auth.mode === 'demo' && !demoEntered) return <LoginScreen demo onLogin={() => setDemoEntered(true)} />;
  if (config.auth.mode === 'demo') return <Context.Provider value={{ request: demoRequest, logout: () => setDemoEntered(false), voiceEnabled: false, demo: true }}>{children}</Context.Provider>;
  if (!config.auth.mobileClientId) return <LoginScreen error="El inicio de sesión aún no está configurado." />;
  return <AuthenticatedSession config={config}>{children}</AuthenticatedSession>;
}
