import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { AccountSummary, ChatResponse, UIAction } from '@banortehack/contracts';
import { A2UIRenderer } from '@banortehack/visual-engine';
import { useSession } from './session';

type ViewMode = 'zero' | 'loading' | 'surface';
type Message = { role: 'user' | 'assistant'; content: string; id: number };

function Icon({ name }: { name: 'send' | 'logout' }) {
  const paths = {
    send: 'm4 12 16-8-5 16-3-6-8-2Z M12 14l8-10',
    logout: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h10'
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function FinancialWorkspace() {
  const { request, logout } = useSession();
  const [viewMode, setViewMode] = useState<ViewMode>('zero');
  const [account, setAccount] = useState<AccountSummary>();
  const [view, setView] = useState<ChatResponse>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const inFlight = useRef(false);
  const messageId = useRef(0);
  const latestRequestId = useRef(0);
  // Retain conversational context even when the visual surface is discarded.
  const simulation = useRef<ChatResponse['simulation']>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);

  const refreshBalance = useCallback(async () => {
    setBalanceError('');
    try {
      const response = await request('/api/account');
      setAccount(await response.json());
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : 'No se pudo cargar el saldo.');
    }
  }, [request]);

  useEffect(() => { void refreshBalance(); }, [refreshBalance]);
  useEffect(() => {
    if (viewMode === 'surface') surfaceRef.current?.focus();
    if (viewMode === 'zero') inputRef.current?.focus();
  }, [viewMode]);

  function resetToZero(balanceAfter?: number) {
    if (typeof balanceAfter === 'number') {
      setAccount(prev => prev ? { ...prev, balance: balanceAfter } : prev);
    }
    setView(undefined);
    setViewMode('zero');
    setError('');
  }

  async function query(text: string, action?: UIAction) {
    if (inFlight.current || !text.trim()) return;
    inFlight.current = true; setBusy(true); setError(''); setViewMode('loading');
    const reqId = ++latestRequestId.current;
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
    setMessages(previous => [...previous, { id: ++messageId.current, role: 'user', content: text }]);
    try {
      const response = await request(action ? '/api/actions' : '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action ?? { message: text, history, simulation: view ? view.simulation : simulation.current, current_view: view })
      });
      const next: ChatResponse = await response.json();
      if (latestRequestId.current !== reqId) return;
      if (!Array.isArray(next.a2ui)) throw new Error('No se pudo generar la vista. Intenta otra consulta.');
      
      if (next.transaction?.confirmed) {
        resetToZero(next.transaction.balance_after);
        setPrompt('');
        return;
      }
      
      if (next.simulation) simulation.current = next.simulation;
      setView(next); setViewMode('surface');
      setMessages(previous => [...previous, { id: ++messageId.current, role: 'assistant', content: next.message }]);
      setPrompt('');
    } catch (error) {
      if (latestRequestId.current !== reqId) return;
      setError(error instanceof Error ? error.message : 'No se pudo completar la consulta.');
      setViewMode(view ? 'surface' : 'zero');
    } finally { 
      if (latestRequestId.current === reqId) {
        inFlight.current = false; setBusy(false); 
      }
    }
  }

  function onAction(action: UIAction) {
    const labels: Record<string, string> = { select_plan: 'Explorar este plan de inversión', simulate_investment: 'Actualizar mi simulación', compare_plans: 'Comparar otros planes', simulate_debt: 'Simular un abono adicional a este crédito', show_transactions: 'Ver los movimientos del periodo', confirm_debt_payment: 'Confirmar el abono único a este crédito' };
    void query(labels[action.action.name] ?? 'Explorar escenario', action);
  }
  function send(event: FormEvent) { event.preventDefault(); void query(prompt); }

  return <div className={`lazy-workspace lazy-${viewMode}`} data-view-mode={viewMode} data-domain={view?.domain ?? 'resumen'}>
    <main className="lazy-canvas">
      {viewMode === 'zero' && <section className="zero-state" aria-label="Estado Cero">
        <div className="zero-balance">
          <div><p>Saldo disponible</p><h1 aria-live="polite">{account ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: account.currency }).format(account.balance) : '—'}</h1></div>
          <button className="logout-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout}><Icon name="logout" /></button>
        </div>
        {balanceError && <div className="error-banner" role="alert"><p>{balanceError}</p><button className="secondary" onClick={() => void refreshBalance()}>Reintentar saldo</button></div>}
      </section>}
      {viewMode === 'loading' && <div className="lazy-loading" role="status"><span className="loading-dot" />Preparando tu vista…</div>}
      {viewMode === 'surface' && view && <section className="surface-canvas" aria-label="Vista financiera" ref={surfaceRef} tabIndex={-1}>
        <div className="surface-heading"><button className="secondary" onClick={() => resetToZero()} disabled={busy}>Volver al inicio</button><button className="logout-button" aria-label="Cerrar sesión" onClick={logout}><Icon name="logout" /></button></div>
        <A2UIRenderer messages={view.a2ui} onAction={onAction} busy={busy} onRecover={resetToZero} />
      </section>}
      {error && <div className="error-banner query-error" role="alert"><p>{error}</p></div>}
    </main>

    <form className="lazy-composer" onSubmit={send}>
      <label className="visually-hidden" htmlFor="financial-message">Pregunta sobre tus finanzas</label>
      <textarea ref={inputRef} id="financial-message" placeholder="¿Qué quieres hacer con tu dinero?" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={2000} rows={1} disabled={busy} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!busy) void query(prompt); } }} />
      <button className="send-button" disabled={busy || !prompt.trim()} aria-label="Enviar mensaje"><Icon name="send" /></button>
    </form>
    {viewMode === 'zero' && <div className="zero-chips" aria-label="Ejemplos para empezar">{['Revisar deudas', 'Analizar gastos', 'Explorar inversiones'].map(text => <button key={text} type="button" disabled={busy} onClick={() => void query(text)}>{text}</button>)}</div>}
  </div>;
}
