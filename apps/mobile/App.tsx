import { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AccountSummary, ChatResponse, FinancialAction } from '@banortehack/contracts';

const api = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function App() {
  const [account, setAccount] = useState<AccountSummary>();
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<ChatResponse>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${api}/api/account`).then(async response => {
      if (!response.ok) throw new Error();
      setAccount(await response.json());
    }).catch(() => setNotice('No se pudo conectar a la API.'));
  }, []);

  async function send() {
    if (!message.trim() || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(`${api}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
      if (!response.ok) throw new Error();
      setReply(await response.json());
      setMessage('');
    } catch { setNotice('No se pudo responder. Revisa la API y el servicio de IA.'); }
    finally { setBusy(false); }
  }

  async function preview(action: FinancialAction) {
    try {
      const response = await fetch(`${api}/api/transactions/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, amount: 100 }) });
      if (!response.ok) throw new Error();
      setNotice((await response.json()).message);
    } catch { setNotice('No se pudo generar la vista previa.'); }
  }

  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.brand}>BANORTEHACK</Text><Text>Prototipo · Datos ficticios</Text>
    <View style={styles.card}><Text>Saldo disponible (MXN)</Text><Text style={styles.balance}>{account ? `$${account.balance.toFixed(2)}` : '—'}</Text></View>
    {reply && <View style={styles.card}><Text>{reply.message}</Text><Text style={styles.title}>{reply.visualization.title}</Text>{reply.visualization.labels.map((label, index) => <Text key={label}>{label}: ${reply.visualization.values[index]} MXN</Text>)}</View>}
    <Text style={styles.title}>¿Qué quieres explorar?</Text>
    <TextInput accessibilityLabel="Mensaje" style={styles.input} value={message} onChangeText={setMessage} placeholder="Muéstrame mis ingresos" maxLength={2000} />
    <Button title={busy ? 'Consultando…' : 'Enviar'} color="#d40028" onPress={send} disabled={busy || !message.trim()} />
    <View style={styles.actions}>{(['invertir', 'pagar', 'transferir'] as const).map(action => <Button key={action} title={action} color="#b90024" onPress={() => preview(action)} />)}</View>
    <Text accessibilityLiveRegion="polite">{notice}</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 64, gap: 16, backgroundColor: '#f6f7f8', flexGrow: 1 },
  brand: { color: '#d40028', fontSize: 24, fontWeight: '700' },
  card: { padding: 24, backgroundColor: 'white', borderRadius: 16, gap: 8 },
  balance: { fontSize: 36, fontWeight: '700' }, title: { fontWeight: '600', marginTop: 12 },
  input: { padding: 16, borderWidth: 1, borderColor: '#aaa', borderRadius: 8, backgroundColor: 'white' },
  actions: { gap: 8 }
});
