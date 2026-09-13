import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { AccountSummary, ChatResponse, UIAction } from '@lazy-bank/contracts';
import { MobileSessionProvider, useSession } from './session';
import { SpeechPlayer } from './SpeechPlayer';
import { A2UIRenderer } from './A2UIRenderer';
import { ActionButton, Brand, Panel, ThemeContext, themes, ui } from './ui';

export default function App() {
  return <SafeAreaProvider><StatusBar barStyle="dark-content" /><MobileSessionProvider><Workspace /></MobileSessionProvider></SafeAreaProvider>;
}
function Workspace() {
  const { request, logout, voiceEnabled } = useSession();
  const [account, setAccount] = useState<AccountSummary>();
  const [view, setView] = useState<ChatResponse>();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const history = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const inFlight = useRef(false);
  const accountRequestId = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const theme = themes[view?.domain as keyof typeof themes] ?? themes.default;
  const load = useCallback(async () => {
    const id = ++accountRequestId.current;
    try {
      const next: AccountSummary = await (await request('/api/account')).json();
      if (id === accountRequestId.current) { setAccount(next); setError(''); }
    }
    catch (e) { if (id === accountRequestId.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el saldo.'); }
  }, [request]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && !inFlight.current) void load();
    });
    return () => subscription.remove();
  }, [load]);
  function returnHome() {
    if (inFlight.current) return;
    setView(undefined); setPrompt(''); setNotice('');
    void load();
  }
  async function query(text: string, action?: UIAction) {
    if (inFlight.current || !text.trim()) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const res = await request(action ? '/api/actions' : '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action ?? { message: text.trim(), history: history.current.slice(-6), simulation: view?.simulation, current_view: view }) });
      const next: ChatResponse = await res.json();
      if (!Array.isArray(next.a2ui)) throw new Error('No se pudo generar la vista. Intenta otra consulta.');
      history.current = [...history.current, { role: 'user', content: text.slice(0, 2000) }, { role: 'assistant', content: next.message.slice(0, 2000) }].slice(-6) as typeof history.current;
      if (next.transaction?.confirmed) {
        ++accountRequestId.current; // Discard account reads started before this receipt.
        setAccount(previous => previous ? { ...previous, balance: next.transaction!.balance_after } : previous);
        void load();
      }
      setView(next);
      setPrompt('');
      scroll.current?.scrollTo({ y: 0, animated: true });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la consulta.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <ThemeContext.Provider value={theme}><SafeAreaView style={ui.page}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={[ui.row, { paddingHorizontal: 20, paddingVertical: 12 }]}><Brand /><ActionButton title="Cerrar sesión" secondary onPress={logout} disabled={busy} /></View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18, flexGrow: 1, justifyContent: view ? 'flex-start' : 'center' }}>
      {!view && <View style={{ gap: 12, alignItems: 'center', paddingVertical: 28 }}><Text style={ui.body}>Saldo disponible</Text><Text style={[ui.hero, { fontSize: 38 }]}>{account ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(account.balance) : '—'}</Text><Text style={ui.caption}>Perfil sintético de Alex · MXN</Text></View>}
      {!!notice && <Panel><Text accessibilityLiveRegion="polite" style={ui.body}>{notice}</Text></Panel>}
      {!!error && <Panel><Text accessibilityRole="alert" style={ui.error}>{error}</Text>{!account && <ActionButton title="Reintentar conexión" secondary onPress={() => void load()} />}</Panel>}
      {busy && <View style={ui.row}><ActivityIndicator color={theme.accent} /><Text style={ui.body}>Preparando tu vista…</Text></View>}
      {view && <><View style={ui.row}><Text style={[ui.eyebrow, { color: theme.accent }]}>{view.domain.toUpperCase()}</Text><ActionButton title="Volver al inicio" secondary disabled={busy} onPress={returnHome} /></View><Text accessibilityLiveRegion="polite" style={ui.body}>{view.message}</Text>{voiceEnabled && <SpeechPlayer key={view.message} text={view.message} />}<A2UIRenderer messages={view.a2ui} onAction={action => { if (action.action.name === 'return_to_zero') returnHome(); else void query('Explorar escenario', action); }} busy={busy} onRecover={returnHome} /></>}
    </ScrollView>
    <View style={{ padding: 16, gap: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e5ebe8' }}>
      <View style={ui.row}><TextInput accessibilityLabel="Pregunta sobre tus finanzas" style={[ui.input, { flex: 1, maxHeight: 120 }]} value={prompt} onChangeText={setPrompt} multiline maxLength={2000} placeholder="¿Qué quieres hacer con tu dinero?" editable={!busy} /><ActionButton title="Enviar" onPress={() => void query(prompt)} disabled={busy || !prompt.trim()} /></View>
      {!view && <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{['Revisar deudas', 'Analizar gastos', 'Explorar inversiones'].map(text => <ActionButton key={text} title={text} secondary disabled={busy} onPress={() => void query(text)} />)}</View>}
      <Text style={ui.caption}>Datos sintéticos. Las proyecciones no mueven dinero real.</Text>
    </View>
  </KeyboardAvoidingView></SafeAreaView></ThemeContext.Provider>;
}
