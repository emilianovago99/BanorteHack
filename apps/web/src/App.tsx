import { useEffect, useState, type FormEvent } from 'react';
import type { AccountSummary, ChatResponse, FinancialAction } from '@banortehack/contracts';
import { FinancialChart } from '@banortehack/visual-engine';

export function App() {
  const [account, setAccount] = useState<AccountSummary>();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/account').then(async response => {
      if (!response.ok) throw new Error();
      setAccount(await response.json());
    }).catch(() => setNotice('No se pudo cargar el saldo. Verifica que la API esté encendida.'));
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: prompt })
      });
      if (!response.ok) throw new Error('No se pudo responder. Verifica que la API y el servicio de IA estén encendidos.');
      const reply: ChatResponse = await response.json();
      setMessages(previous => [...previous, reply]);
      setPrompt('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Error de conexión.');
    } finally { setBusy(false); }
  }

  async function simulate(action: FinancialAction) {
    try {
      const response = await fetch('/api/transactions/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, amount: 100 })
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setNotice(result.message);
    } catch { setNotice('No se pudo generar la vista previa.'); }
  }

  return <main>
    <header><strong>BANORTE<span>HACK</span></strong><small>Prototipo · Datos ficticios</small></header>
    <section className="balance"><p>Tu saldo disponible</p><h1>{account ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: account.currency }).format(account.balance) : '—'}</h1><p>Una conversación para entender tus finanzas.</p></section>
    <section aria-label="Conversación" aria-live="polite">
      {messages.map((reply, index) => <article key={index}><p>{reply.message}</p><FinancialChart data={reply.visualization} /></article>)}
    </section>
    <form onSubmit={send}>
      <label htmlFor="message">¿Qué quieres explorar?</label>
      <div className="input-row"><input id="message" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Muéstrame mis ingresos" maxLength={2000} required /><button disabled={busy || !prompt.trim()}>{busy ? 'Consultando…' : 'Enviar'}</button></div>
    </form>
    <nav aria-label="Acciones de demostración">{(['invertir', 'pagar', 'transferir'] as const).map(action => <button className="secondary" key={action} onClick={() => simulate(action)}>{action}</button>)}</nav>
    <p role="status">{notice}</p>
  </main>;
}
