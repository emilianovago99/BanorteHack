import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { AccountSummary, ChatResponse, FinancialDomain, UIAction } from '@banortehack/contracts';
import { A2UIRenderer } from '@banortehack/visual-engine';
import { useSession } from './session';
import { SpeechPlayer } from './SpeechPlayer';

const sections: { id: FinancialDomain; label: string; icon: string; prompt: string }[] = [
  { id: 'resumen', label: 'Mi resumen', icon: 'grid', prompt: 'Dame un resumen de mis finanzas' },
  { id: 'movimientos', label: 'Movimientos', icon: 'arrows', prompt: 'Muéstrame mis movimientos de agosto' },
  { id: 'presupuestos', label: 'Presupuestos', icon: 'chart', prompt: 'Compara mis gastos con mis presupuestos' },
  { id: 'deudas', label: 'Mis créditos', icon: 'card', prompt: 'Muéstrame mis deudas de crédito' },
  { id: 'inversiones', label: 'Invertir', icon: 'growth', prompt: 'Quiero invertir $10000, propón planes de inversión' },
  { id: 'suscripciones', label: 'Suscripciones', icon: 'repeat', prompt: 'Cuánto cuestan mis suscripciones' },
];
const titles: Record<FinancialDomain, string> = { resumen: 'Tu dinero, con perspectiva.', movimientos: 'Cada movimiento cuenta.', presupuestos: 'Dale un destino a tu dinero.', deudas: 'Un paso más cerca de cero.', inversiones: 'Dibuja tu próximo horizonte.', ingresos: 'Conoce de dónde viene.', gastos: 'Entiende a dónde se va.', suscripciones: 'Los pequeños gastos también cuentan.' };

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = { grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', arrows: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4', chart: 'M4 20V10m8 10V4m8 16v-7', card: 'M3 5h18v14H3z M3 10h18 M6 15h4', growth: 'M3 18 10 11l4 4 7-10m-6 0h6v6', repeat: 'M4 7h14l-3-3m5 13H6l3 3M4 7v5m16 5v-5', sparkle: 'm12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z', send: 'm4 12 16-8-5 16-3-6-8-2Z M12 14l8-10', logout: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h10' };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.sparkle} /></svg>;
}

type SavedTab = { id: string; label: string; view: ChatResponse };

type Message = { role: 'user' | 'assistant'; content: string; id: number };

export function FinancialWorkspace() {
  const { request, logout, voiceEnabled } = useSession();
  const [tabs, setTabs] = useState<SavedTab[]>([]);
  const [activeTab, setActiveTab] = useState('resumen');
  const [mobileChat, setMobileChat] = useState(false);
  const [account, setAccount] = useState<AccountSummary>();
  const [view, setView] = useState<ChatResponse>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const messageId = useRef(0);
  const chatEnd = useRef<HTMLDivElement>(null);

  const loadDashboard = useCallback(async () => {
    setError('');
    try {
      const [summary, dashboard] = await Promise.all([request('/api/account').then(r => r.json()), request('/api/dashboard').then(r => r.json())]);
      if (!Array.isArray(dashboard.a2ui)) throw new Error('La respuesta no contiene una vista válida.');
      setAccount(summary); setView(dashboard); setActiveTab('resumen');
      setTabs(previous => [...previous.filter(tab => tab.id !== 'resumen'), { id: 'resumen', label: 'Mi resumen', view: dashboard }]);
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo cargar el resumen.'); }
  }, [request]);
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);

  async function query(text: string, action?: UIAction, sectionId?: string) {
    if (inFlight.current || !text.trim()) return;
    inFlight.current = true; setBusy(true); setError('');
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
    setMessages(previous => [...previous, { id: ++messageId.current, role: 'user', content: text }]);
    try {
      const response = await request(action ? '/api/actions' : '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action ?? { message: text, history, simulation: view?.simulation, current_view: view }) });
      const next: ChatResponse = await response.json();
      if (!Array.isArray(next.a2ui)) throw new Error('No se pudo generar la vista. Intenta otra consulta.');
      const updating = Boolean(action || next.workspace_operation === 'update');
      const id = sectionId ?? (updating ? activeTab : `tab-${++messageId.current}`);
      const label = sectionId ? sections.find(section => section.id === sectionId)!.label : updating ? tabs.find(tab => tab.id === activeTab)?.label ?? text.slice(0, 48) : text.slice(0, 48);
      setTabs(previous => previous.some(tab => tab.id === id) ? previous.map(tab => tab.id === id ? { id, label, view: next } : tab) : [...previous, { id, label, view: next }]);
      setActiveTab(id); setView(next);
      setMessages(previous => [...previous, { id: ++messageId.current, role: 'assistant', content: next.message }]);
      setPrompt('');
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo completar la consulta.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  function onAction(action: UIAction) {
    const labels: Record<string, string> = { select_plan: 'Explorar este plan de inversión', simulate_investment: 'Actualizar mi simulación', compare_plans: 'Comparar otros planes', simulate_debt: 'Simular un abono adicional a este crédito', show_transactions: 'Ver los movimientos del periodo' };
    void query(labels[action.action.name] ?? 'Explorar escenario', action);
  }
  function send(event: FormEvent) { event.preventDefault(); void query(prompt); }
  const domain = view?.domain ?? 'resumen';

  return <div className={`workspace-shell ${mobileChat ? 'mobile-chat-open' : ''}`}>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="BanorteHack inicio"><span className="brand-mark">B</span><span>BANORTE<span className="brand-light">HACK</span></span></a>
      <div className="workspace-label">TU ESPACIO FINANCIERO</div>
      <nav aria-label="Navegación principal">{sections.map(section => <button key={section.id} className={`nav-item ${activeTab === section.id ? 'active' : ''}`} disabled={busy} title={section.label} onClick={() => { const saved = tabs.find(tab => tab.id === section.id); if (saved) { setView(saved.view); setActiveTab(saved.id); } else if (section.id === 'resumen') void loadDashboard(); else void query(section.prompt, undefined, section.id); }}><Icon name={section.icon} /><span>{section.label}</span>{section.id === 'inversiones' && <span className="new-dot" />}</button>)}</nav>
      {tabs.some(tab => tab.id.startsWith('tab-')) && <nav className="custom-tabs" aria-label="Vistas creadas"><span className="workspace-label">TUS VISTAS</span>{tabs.filter(tab => tab.id.startsWith('tab-')).map(tab => <button key={tab.id} disabled={busy} title={tab.label} aria-current={activeTab === tab.id ? 'page' : undefined} className={`nav-item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => { setView(tab.view); setActiveTab(tab.id); }}><Icon name="sparkle" /><span>{tab.label}</span></button>)}</nav>}
      <div className="sidebar-tip"><Icon name="sparkle" /><strong>Más claridad.<br />Mejores decisiones.</strong><p>Pregunta, compara y explora antes de dar el siguiente paso.</p></div>
      <div className="sidebar-profile"><div className="avatar">AX</div><div><strong>Perfil de Alex</strong><small>Dataset sintético</small></div>{<button className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout}><Icon name="logout" /></button>}</div>
    </aside>

    <div className="workspace-main">
      <header className="workspace-topbar"><div className="breadcrumb">Mi espacio <span>/</span> <strong>{tabs.find(tab => tab.id === activeTab)?.label ?? domain}</strong></div><div className="topbar-right"><span className="status-dot" />Entorno de demostración<span className="topbar-divider" /><span>MXN</span></div></header>
      <main className="financial-content">
        <div className="page-intro"><div><span className="eyebrow">FINANZAS QUE SE ENTIENDEN</span><h1>{titles[domain]}</h1><p>Todos tus movimientos, conectados en una conversación.</p></div><span className="period-pill"><span aria-hidden="true">▦</span> {view?.period ?? account?.month ?? '2026-08'} · cierre mensual</span></div>
        <div className="dataset-strip"><span className="dataset-badge">SINTÉTICO</span><span>{account?.dataset?.transaction_count.toLocaleString('es-MX') ?? '11,602'} movimientos · enero 2024 a agosto 2026</span><span className="dataset-note">Sin conexión con cuentas bancarias reales</span></div>
        {error && <div className="error-banner" role="alert"><p>{error}</p><button className="secondary" onClick={() => void loadDashboard()}>Volver al resumen</button></div>}
        <div className="generated-workspace" aria-busy={busy}>
          {busy && <div className="view-working" role="status"><span className="loading-dot" />Consultando movimientos y preparando tu vista…</div>}
          {view ? <A2UIRenderer messages={view.a2ui} onAction={onAction} busy={busy} onRecover={() => void loadDashboard()} /> : !error && <div className="loading-grid" role="status" aria-label="Cargando resumen"><div /><div /><div /><div /></div>}
        </div>
        <footer className="workspace-footer">Datos sintéticos. Las proyecciones son educativas y no ejecutan movimientos de dinero.</footer>
      </main>
    </div>

    <button className="mobile-chat-toggle" aria-expanded={mobileChat} aria-controls="financial-assistant" onClick={() => setMobileChat(open => !open)}>{mobileChat ? 'Volver a mi vista' : 'Conversar con Norte'}</button>
    <aside id="financial-assistant" className="assistant-panel" aria-label="Asistente financiero">
      <div className="assistant-heading"><div className="assistant-symbol"><Icon name="sparkle" /></div><div><strong>Norte</strong><span>Tu asistente financiero</span></div><span className="assistant-live">●</span></div>
      <div className="conversation" aria-live="polite"><div className="assistant-welcome"><span className="eyebrow">HABLEMOS DE TU DINERO</span><h2>¿Qué te gustaría<br />entender hoy?</h2><p>Puedo encontrar patrones en tus gastos, revisar tus créditos o ayudarte a explorar un plan de inversión.</p></div>
        <div className="suggested-questions">{['¿En qué gasté más en agosto?', '¿De dónde vienen mis ingresos?', 'Quiero invertir $10000'].map(text => <button key={text} disabled={busy} onClick={() => void query(text)}>{text}<span>↗</span></button>)}</div>
        {messages.map(item => <div key={item.id} className={`chat-message ${item.role}`}><span className="message-author">{item.role === 'user' ? 'Tú' : 'Norte'}</span><p>{item.content}</p>{item.role === 'assistant' && voiceEnabled && <SpeechPlayer text={item.content} />}</div>)}
        {busy && <div className="chat-thinking" role="status">Norte está preparando tu respuesta<span>•••</span></div>}<div ref={chatEnd} />
      </div>
      <form className="chat-composer" onSubmit={send}><label htmlFor="financial-message">Pregunta sobre tus finanzas</label><div className="composer-input"><textarea id="financial-message" placeholder="¿Y si aporto $2,000 al mes?" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} rows={3} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) void query(prompt); } }} /><button className="send-button" disabled={busy || !prompt.trim()} aria-label="Enviar mensaje"><Icon name="send" /></button></div><small>Las respuestas usan el dataset del perfil de demostración.</small></form>
    </aside>
  </div>;
}
