import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button, Text, View } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { PublicConfig } from '@banortehack/contracts';

WebBrowser.maybeCompleteAuthSession();
const api = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

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
const demoRequest: Session['request'] = async (path, init) => checkResponse(await fetch(`${api}${path}`, init));
function Status({ children }: { children: ReactNode }) {
  return <View style={{ padding: 24, paddingTop: 80, gap: 20 }}><Text style={{ fontSize: 28 }}>BanorteHack</Text>{children}</View>;
}

function AuthenticatedSession({ config, children }: { config: PublicConfig; children: ReactNode }) {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'banortehack', path: 'auth/callback' });
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
    try {
      const discovery = await AuthSession.fetchDiscoveryAsync(config.auth.issuer);
      // Cada intento recibe un state y un verificador PKCE nuevos.
      const authRequest = new AuthSession.AuthRequest({
        clientId: config.auth.mobileClientId, redirectUri, responseType: AuthSession.ResponseType.Code,
        scopes: ['openid', 'profile', 'email'], usePKCE: true,
        extraParams: { audience: config.auth.audience, prompt: 'login' }
      });
      const result = await authRequest.promptAsync(discovery);
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success' || !authRequest.codeVerifier) throw new Error();
      const response = await AuthSession.exchangeCodeAsync({
        clientId: config.auth.mobileClientId, code: result.params.code, redirectUri,
        extraParams: { code_verifier: authRequest.codeVerifier }
      }, discovery);
      if (!response.accessToken || !response.expiresIn || response.expiresIn <= 0) throw new Error();
      setToken({ value: response.accessToken, expiresAt: Date.now() + response.expiresIn * 1000 });
    } catch { setError('No se pudo iniciar sesión. Intenta de nuevo.'); }
    finally { setBusy(false); }
  }

  const request = useCallback<Session['request']>(async (path, init) => {
    if (!token || token.expiresAt <= Date.now()) { setToken(undefined); throw new Error('Inicia sesión de nuevo.'); }
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token.value}`);
    const response = await fetch(`${api}${path}`, { ...init, headers });
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

  if (!token) return <Status>
    <Text>Inicia sesión para conversar sobre tus finanzas.</Text>
    <Button title={busy ? 'Conectando…' : 'Iniciar sesión'} onPress={login} disabled={busy} />
    {Boolean(error) && <Text accessibilityRole="alert">{error}</Text>}
  </Status>;
  return <Context.Provider value={{ request, logout: () => { void logout(); }, voiceEnabled: config.voice.enabled, demo: false }}>{children}</Context.Provider>;
}

export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch(`${api}/api/config`, { signal: controller.signal }).then(checkResponse).then(response => response.json()).then(setConfig)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt]);
  if (failed) return <Status><Text>No se pudo conectar al servicio.</Text><Button title="Reintentar" onPress={() => setAttempt(value => value + 1)} /></Status>;
  if (!config) return <Status><Text>Conectando…</Text></Status>;
  if (config.auth.mode === 'demo') return <Context.Provider value={{ request: demoRequest, logout: () => {}, voiceEnabled: false, demo: true }}>{children}</Context.Provider>;
  if (!config.auth.mobileClientId) return <Status><Text>El inicio de sesión aún no está configurado.</Text></Status>;
  return <AuthenticatedSession config={config}>{children}</AuthenticatedSession>;
}
