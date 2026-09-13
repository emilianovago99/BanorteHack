import { Component, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { uiActionSchema, eventSchema, investmentInputSchema, type UIAction, type TransactionalAction } from '@lazy-bank/contracts';
import { DatasetChart } from './index';

import { parseSurface, seriesSchema, type Node, type Event } from './protocol';
export { CATALOG_ID } from './protocol';
const numeric = z.number().finite();
const money = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
const format = (value: unknown, kind = 'number') => typeof value === 'number' ? kind === 'currency' ? money(value) : kind === 'percent' ? `${value.toLocaleString('es-MX')}%` : value.toLocaleString('es-MX') : String(value ?? '—');

class SurfaceBoundary extends Component<{ children: ReactNode; onRecover: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="finance-panel" role="alert"><h3>No se pudo mostrar esta vista</h3><p>Tu sesión sigue activa. Puedes volver al resumen e intentar otra consulta.</p><button onClick={this.props.onRecover}>Volver al resumen</button></div> : this.props.children; }
}

function Simulator({ data, event, onEvent, busy }: { data: unknown; event: Event; onEvent: (event: Event) => void; busy: boolean }) {
  const initial = z.object({ plan_id: z.string(), amount: numeric, months: numeric, monthly_contribution: numeric }).parse(data);
  const [amount, setAmount] = useState(String(initial.amount));
  const [monthly, setMonthly] = useState(String(initial.monthly_contribution));
  const [months, setMonths] = useState(String(initial.months));
  return <form className="finance-panel simulation-form" onSubmit={e => { e.preventDefault(); onEvent(eventSchema.parse({ name: 'simulate_investment', context: { plan_id: initial.plan_id, amount: Number(amount), monthly_contribution: Number(monthly), months: Number(months) } })); }}>
    <div><h3>Hazlo a tu medida</h3><p>Ajusta los montos para generar otra proyección.</p></div>
    <label>Capital inicial<input type="number" min="100" max="1000000" step="100" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
    <label>Aportación mensual<input type="number" min="0" max="100000" step="100" required value={monthly} onChange={e => setMonthly(e.target.value)} /></label>
    <label>Plazo en meses<input type="number" min="1" max="120" step="1" required value={months} onChange={e => setMonths(e.target.value)} /></label>
    <button disabled={busy}>Actualizar simulación</button>
  </form>;
}

function PlanCardComponent({ node, data, busy, send }: {
  node: Extract<Node, { component: 'PlanCard' }>; data: unknown; busy: boolean;
  send: (node: Node, event: Event) => void;
}) {
  const plan = z.object({ id: z.string(), name: z.string(), risk: z.string(), annual_rate: numeric, description: z.string() }).parse(data);
  const closing = node.transactionalAction;
  if (plan.id !== closing.event.context.plan_id) throw new Error('Acción incompatible con la tarjeta.');
  const [amount, setAmount] = useState(String(node.amount ?? closing.event.context.amount));
  const valid = amount.trim() !== '' && investmentInputSchema.safeParse({ plan_id: plan.id, amount: Number(amount) }).success;
  const formattedAmount = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(amount));
  const closingLabel = closing.kind === 'mutation'
    ? valid ? 'Invertir ' + formattedAmount + ' en ' + plan.name : 'Confirmar inversión'
    : closing.label;
  function withAmount(event: Event): Event {
    return eventSchema.parse({ ...event, context: { ...event.context, amount: Number(amount) } });
  }
  return <div className="a2ui-actionable">
    <section className={'plan-card ' + (plan.id === 'balanced' ? 'featured' : '')}>
      <span className="risk-badge">Riesgo {plan.risk.toLowerCase()}</span>
      <h3>{plan.name}</h3>
      <div className="plan-rate">{(plan.annual_rate * 100).toFixed(0)}<span>%</span></div>
      <small>tasa anual hipotética</small><p>{plan.description}</p>
      <label className="plan-amount">Monto a invertir
        <input aria-label={'Monto a invertir en ' + plan.name} type="number" min="100" max="1000000" step="0.01" required
          value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} aria-invalid={!valid} />
      </label>
      {!valid && <p className="plan-amount-error" role="alert">Ingresa de $100 a $1,000,000, con máximo dos decimales.</p>}
      {node.action && <button type="button" className="secondary" disabled={busy || !valid}
        onClick={() => node.action && send(node, withAmount(node.action.event))}>Explorar {plan.name}</button>}
    </section>
    <TransactionalButton action={{ ...closing, label: closingLabel }} busy={busy || !valid}
      onConfirm={() => { if (valid) send(node, withAmount(closing.event)); }} />
  </div>;
}

function DebtCardComponent({ node, data, busy, send }: { node: any; data: unknown; busy: boolean; send: (node: any, event: any) => void }) {
  const debt = z.object({ name: z.string(), balance: numeric, annual_rate: numeric, minimum_payment: numeric, due_day: numeric, credit_limit: numeric }).parse(data);
  const [amount, setAmount] = useState(String(node.action?.event?.context?.extra_payment || 500));
  const closing = node.transactionalAction;
  const content = <section className="finance-panel debt-card"><span className="eyebrow">CRÉDITO ACTIVO</span><h3>{debt.name}</h3><strong className="debt-balance">{money(debt.balance)}</strong><progress max={debt.credit_limit} value={debt.balance} /><dl><div><dt>Tasa anual</dt><dd>{Math.round(debt.annual_rate*100)}%</dd></div><div><dt>Pago mínimo</dt><dd>{money(debt.minimum_payment)}</dd></div><div><dt>Día de pago</dt><dd>{debt.due_day}</dd></div></dl><div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}><input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" max={debt.balance} disabled={busy || !node.action} style={{ width: '100%' }} /><button className="secondary" disabled={busy || !node.action} onClick={() => node.action && send(node, { ...node.action.event, context: { ...node.action.event.context, extra_payment: Number(amount) } })}>Simular abono</button></div></section>;
  if (closing) {
      return <div className="a2ui-actionable">{content}<TransactionalButton action={closing} busy={busy} onConfirm={() => send(node, { ...closing.event, context: { ...closing.event.context, extra_payment: Number(amount) } })} /></div>;
  }
  return content;
}

function TransactionalButton({ action, busy, onConfirm }: { action: TransactionalAction; busy: boolean; onConfirm: () => void }) {
  return <button type="button" className="context-action" disabled={busy} onClick={onConfirm} data-action-kind={action.kind}>{action.label}<span aria-hidden="true"> →</span></button>;
}

function SurfaceView({ messages, onAction, busy }: { messages: unknown[]; onAction: (action: UIAction) => void; busy: boolean }) {
  const { surfaceId, nodes, model } = useMemo(() => parseSurface(messages), [messages]);
  function bound(node: Node) {
    const parts = ('data' in node ? node.data : undefined)?.path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~')) ?? [];
    let value: unknown = model;
    for (const part of parts) { if (['__proto__', 'constructor', 'prototype'].includes(part)) throw new Error('Ruta inválida.'); value = (value as Record<string, unknown>)?.[part]; }
    return value;
  }
  function send(node: Node, event: Event) {
    onAction(uiActionSchema.parse({ version: 'v0.9', action: { ...event, surfaceId, sourceComponentId: node.id, timestamp: new Date().toISOString() } }));
  }
  function render(id: string): ReactNode {
    const node = nodes.get(id)!;
    const content = renderContent(id);
    if (node.component === 'DebtCard' || node.component === 'PlanCard') return content;
    if (!('transactionalAction' in node) || !node.transactionalAction) return content;
    const closing = node.transactionalAction;

    return <div key={id} className="a2ui-actionable">{content}<TransactionalButton action={closing} busy={busy} onConfirm={() => send(node, closing.event)} /></div>;
  }
  function renderContent(id: string): ReactNode {
    const node = nodes.get(id)!;
    switch (node.component) {
      case 'Column': return <div key={id} className={node.variant === 'confirmation' ? 'a2ui-column a2ui-confirmation' : 'a2ui-column'}>{node.children?.map(render)}</div>;
      case 'Row': return <div key={id} className="a2ui-row">{node.children?.map(render)}</div>;
      case 'Text': return node.variant === 'h2' ? <h2 key={id}>{node.text}</h2> : <p key={id}>{node.text}</p>;
      case 'Notice': return <aside key={id} className="finance-notice"><span aria-hidden="true">ⓘ</span><p>{node.text}</p></aside>;
      case 'Metric': return <section key={id} className={`metric-card ${node.tone ?? ''}`}><span>{node.label}</span><strong>{format(node.value, node.format)}</strong>{node.detail && <small>{node.detail}</small>}</section>;
      case 'FinancialChart': { const data = seriesSchema.parse(bound(node)); if (data.series.some(item => item.values.length !== data.labels.length)) throw new Error('Serie inválida.'); return <DatasetChart key={id} title={node.title ?? ''} type={node.chartType} palette={node.palette} {...data} />; }
      case 'Button': return <button key={id} className="context-action" disabled={busy} onClick={() => send(node, node.action.event)}>{node.text}<span aria-hidden="true"> →</span></button>;
      case 'DataTable': { const rows = z.array(z.record(z.string(), z.unknown())).max(100).parse(bound(node)); return <section key={id} className="finance-panel"><div className="panel-heading"><h3>{node.title}</h3><span className="panel-unit">{rows.length} registros</span></div><div className="table-scroll"><table><thead><tr>{node.columns?.map(col => <th key={col.key}>{col.label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{node.columns?.map(col => <td key={col.key} className={col.key === 'kind' ? 'type-cell' : ''}>{col.key === 'kind' ? row[col.key] === 'income' ? 'Ingreso' : 'Gasto' : format(row[col.key], col.format)}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="empty-state">No hay movimientos con estos filtros.</p>}</div></section>; }
      case 'PlanCard': return <PlanCardComponent key={id} node={node} data={bound(node)} busy={busy} send={send} />;
      case 'DebtCard': return <DebtCardComponent key={id} node={node} data={bound(node)} busy={busy} send={send} />;
      case 'Simulator': return <Simulator key={id} data={bound(node)} event={node.action.event} busy={busy} onEvent={event => send(node, event)} />;
      case 'BudgetList': { const rows = z.array(z.object({ category: z.string(), budget: numeric, spent: numeric, percent: numeric, remaining: numeric })).parse(bound(node)); return <section key={id} className="finance-panel"><h3>{node.title}</h3><div className="progress-list">{rows.map(row => <div key={row.category} className={row.percent > 100 ? 'over-budget' : ''}><div className="progress-label"><strong>{row.category}</strong><span>{money(row.spent)} <small>/ {money(row.budget)}</small></span></div><progress max="100" value={Math.min(row.percent, 100)} /><small>{row.percent > 100 ? `${money(-row.remaining)} por encima del presupuesto` : `${money(row.remaining)} disponibles`}</small></div>)}</div></section>; }
      case 'GoalList': { const rows = z.array(z.object({ name: z.string(), saved: numeric, target: numeric })).parse(bound(node)); return <section key={id} className="finance-panel"><h3>{node.title}</h3><div className="progress-list">{rows.map(row => <div key={row.name}><div className="progress-label"><strong>{row.name}</strong><span>{Math.round(row.saved/row.target*100)}%</span></div><progress max={row.target} value={row.saved} /><small>{money(row.saved)} de {money(row.target)}</small></div>)}</div></section>; }
    }
  }
  return <>{render('root')}</>;
}

export function A2UIRenderer({ messages, onAction, busy = false, onRecover }: { messages: unknown[]; onAction: (action: UIAction) => void; busy?: boolean; onRecover: () => void }) {
  return <SurfaceBoundary key={JSON.stringify(messages[0])} onRecover={onRecover}><SurfaceView messages={messages} onAction={onAction} busy={busy} /></SurfaceBoundary>;
}
