import { Component, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import type { UIAction } from '@banortehack/contracts';
import { DatasetChart } from './index';

export const CATALOG_ID = 'banortehack:finance-v1';
const action = z.object({ event: z.object({ name: z.enum(['select_plan', 'simulate_investment', 'compare_plans', 'simulate_debt', 'show_transactions']), context: z.record(z.string(), z.unknown()) }) });
const nodeSchema = z.object({
  id: z.string().max(100), component: z.enum(['Column', 'Row', 'Text', 'Metric', 'FinancialChart', 'DataTable', 'Button', 'Notice', 'PlanCard', 'DebtCard', 'Simulator', 'BudgetList', 'GoalList']),
  children: z.array(z.string()).max(100).optional(), text: z.string().max(4000).optional(), title: z.string().optional(), variant: z.string().optional(),
  label: z.string().optional(), value: z.number().finite().optional(), format: z.enum(['currency', 'number', 'percent']).optional(), tone: z.string().optional(), detail: z.string().optional(),
  data: z.object({ path: z.string().startsWith('/') }).optional(), chartType: z.enum(['bar', 'line', 'doughnut']).optional(),
  columns: z.array(z.object({ key: z.string(), label: z.string(), format: z.string().optional() })).optional(),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(12).optional(),
  action: action.optional(), amount: z.number().finite().optional()
}).strict().superRefine((node, ctx) => {
  const required: Record<string, string[]> = { Column: ['children'], Row: ['children'], Text: ['text'], Notice: ['text'], Metric: ['label', 'value'], FinancialChart: ['title', 'chartType', 'data'], DataTable: ['title', 'columns', 'data'], Button: ['text', 'action'], PlanCard: ['data', 'action'], DebtCard: ['data', 'action'], Simulator: ['data', 'action'], BudgetList: ['data'], GoalList: ['data'] };
  for (const field of required[node.component]) if (!(field in node)) ctx.addIssue({ code: 'custom', message: `Falta ${field}`, path: [field] });
});
type Node = z.infer<typeof nodeSchema>;
type Event = z.infer<typeof action>['event'];
const numeric = z.number().finite();
const seriesSchema = z.object({ labels: z.array(z.string()).max(200), series: z.array(z.object({ label: z.string(), values: z.array(numeric).max(200) })).max(5) });
const money = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
const format = (value: unknown, kind = 'number') => typeof value === 'number' ? kind === 'currency' ? money(value) : kind === 'percent' ? `${value.toLocaleString('es-MX')}%` : value.toLocaleString('es-MX') : String(value ?? '—');

function parseSurface(messages: unknown[]) {
  if (messages.length > 12) throw new Error('Demasiados mensajes.');
  let surfaceId = '';
  let model: Record<string, unknown> = {};
  const nodes = new Map<string, Node>();
  for (const raw of messages) {
    const message = z.object({ version: z.literal('v0.9'), createSurface: z.object({ surfaceId: z.string(), catalogId: z.literal(CATALOG_ID) }).optional(), updateDataModel: z.object({ surfaceId: z.string(), path: z.literal('/'), value: z.record(z.string(), z.unknown()) }).optional(), updateComponents: z.object({ surfaceId: z.string(), components: z.array(nodeSchema).max(100) }).optional() }).strict().parse(raw);
    if ([message.createSurface, message.updateDataModel, message.updateComponents].filter(Boolean).length !== 1) throw new Error('Mensaje ambiguo.');
    if (message.createSurface) { if (surfaceId) throw new Error('Superficie duplicada.'); surfaceId = message.createSurface.surfaceId; }
    if (message.updateDataModel) { if (!surfaceId || surfaceId !== message.updateDataModel.surfaceId) throw new Error('Superficie inválida.'); model = message.updateDataModel.value; }
    if (message.updateComponents) { if (!surfaceId || surfaceId !== message.updateComponents.surfaceId) throw new Error('Superficie inválida.'); for (const node of message.updateComponents.components) nodes.set(node.id, node); }
  }
  if (!nodes.has('root')) throw new Error('Falta root.');
  // Validar referencias y ciclos antes de crear elementos React.
  function visit(id: string, parents: string[]) { if (parents.includes(id) || parents.length > 20) throw new Error('Árbol inválido.'); const node = nodes.get(id); if (!node) throw new Error('Referencia inválida.'); for (const child of node.children ?? []) visit(child, [...parents, id]); }
  visit('root', []);
  return { surfaceId, model, nodes };
}

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
  return <form className="finance-panel simulation-form" onSubmit={e => { e.preventDefault(); onEvent({ ...event, context: { plan_id: initial.plan_id, amount: Number(amount), monthly_contribution: Number(monthly), months: Number(months) } }); }}>
    <div><h3>Hazlo a tu medida</h3><p>Ajusta los montos para generar otra proyección.</p></div>
    <label>Capital inicial<input type="number" min="100" max="1000000" step="100" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
    <label>Aportación mensual<input type="number" min="0" max="100000" step="100" required value={monthly} onChange={e => setMonthly(e.target.value)} /></label>
    <label>Plazo en meses<input type="number" min="1" max="120" step="1" required value={months} onChange={e => setMonths(e.target.value)} /></label>
    <button disabled={busy}>Actualizar simulación</button>
  </form>;
}

function SurfaceView({ messages, onAction, busy }: { messages: unknown[]; onAction: (action: UIAction) => void; busy: boolean }) {
  const { surfaceId, nodes, model } = useMemo(() => parseSurface(messages), [messages]);
  function bound(node: Node) {
    const parts = node.data?.path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~')) ?? [];
    let value: unknown = model;
    for (const part of parts) { if (['__proto__', 'constructor', 'prototype'].includes(part)) throw new Error('Ruta inválida.'); value = (value as Record<string, unknown>)?.[part]; }
    return value;
  }
  function send(node: Node, event = node.action!.event) { onAction({ version: 'v0.9', action: { ...event, surfaceId, sourceComponentId: node.id, timestamp: new Date().toISOString() } }); }
  function render(id: string): ReactNode {
    const node = nodes.get(id)!;
    switch (node.component) {
      case 'Column': return <div key={id} className="a2ui-column">{node.children?.map(render)}</div>;
      case 'Row': return <div key={id} className="a2ui-row">{node.children?.map(render)}</div>;
      case 'Text': return node.variant === 'h2' ? <h2 key={id}>{node.text}</h2> : <p key={id}>{node.text}</p>;
      case 'Notice': return <aside key={id} className="finance-notice"><span aria-hidden="true">ⓘ</span><p>{node.text}</p></aside>;
      case 'Metric': return <section key={id} className={`metric-card ${node.tone ?? ''}`}><span>{node.label}</span><strong>{format(node.value, node.format)}</strong>{node.detail && <small>{node.detail}</small>}</section>;
      case 'FinancialChart': { const data = seriesSchema.parse(bound(node)); if (data.series.some(item => item.values.length !== data.labels.length)) throw new Error('Serie inválida.'); return <DatasetChart key={id} title={node.title ?? ''} type={node.chartType} palette={node.palette} {...data} />; }
      case 'Button': return <button key={id} className="context-action" disabled={busy} onClick={() => send(node)}>{node.text}<span aria-hidden="true"> →</span></button>;
      case 'DataTable': { const rows = z.array(z.record(z.string(), z.unknown())).max(100).parse(bound(node)); return <section key={id} className="finance-panel"><div className="panel-heading"><h3>{node.title}</h3><span className="panel-unit">{rows.length} registros</span></div><div className="table-scroll"><table><thead><tr>{node.columns?.map(col => <th key={col.key}>{col.label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{node.columns?.map(col => <td key={col.key} className={col.key === 'kind' ? 'type-cell' : ''}>{col.key === 'kind' ? row[col.key] === 'income' ? 'Ingreso' : 'Gasto' : format(row[col.key], col.format)}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="empty-state">No hay movimientos con estos filtros.</p>}</div></section>; }
      case 'PlanCard': { const plan = z.object({ id: z.string(), name: z.string(), risk: z.string(), annual_rate: numeric, description: z.string() }).parse(bound(node)); return <section key={id} className={`plan-card ${plan.id === 'balanced' ? 'featured' : ''}`}><span className="risk-badge">Riesgo {plan.risk.toLowerCase()}</span><h3>{plan.name}</h3><div className="plan-rate">{(plan.annual_rate * 100).toFixed(0)}<span>%</span></div><small>tasa anual hipotética</small><p>{plan.description}</p><div className="plan-capital">Capital inicial <strong>{money(node.amount ?? 0)}</strong></div><button disabled={busy} onClick={() => send(node)}>Explorar {plan.name} →</button></section>; }
      case 'DebtCard': { const debt = z.object({ name: z.string(), balance: numeric, annual_rate: numeric, minimum_payment: numeric, due_day: numeric, credit_limit: numeric }).parse(bound(node)); return <section key={id} className="finance-panel debt-card"><span className="eyebrow">CRÉDITO ACTIVO</span><h3>{debt.name}</h3><strong className="debt-balance">{money(debt.balance)}</strong><progress max={debt.credit_limit} value={debt.balance} /><dl><div><dt>Tasa anual</dt><dd>{Math.round(debt.annual_rate*100)}%</dd></div><div><dt>Pago mínimo</dt><dd>{money(debt.minimum_payment)}</dd></div><div><dt>Día de pago</dt><dd>{debt.due_day}</dd></div></dl><button className="secondary" disabled={busy} onClick={() => send(node)}>Simular abono de $500</button></section>; }
      case 'Simulator': return <Simulator key={id} data={bound(node)} event={node.action!.event} busy={busy} onEvent={event => send(node, event)} />;
      case 'BudgetList': { const rows = z.array(z.object({ category: z.string(), budget: numeric, spent: numeric, percent: numeric, remaining: numeric })).parse(bound(node)); return <section key={id} className="finance-panel"><h3>{node.title}</h3><div className="progress-list">{rows.map(row => <div key={row.category} className={row.percent > 100 ? 'over-budget' : ''}><div className="progress-label"><strong>{row.category}</strong><span>{money(row.spent)} <small>/ {money(row.budget)}</small></span></div><progress max="100" value={Math.min(row.percent, 100)} /><small>{row.percent > 100 ? `${money(-row.remaining)} por encima del presupuesto` : `${money(row.remaining)} disponibles`}</small></div>)}</div></section>; }
      case 'GoalList': { const rows = z.array(z.object({ name: z.string(), saved: numeric, target: numeric })).parse(bound(node)); return <section key={id} className="finance-panel"><h3>{node.title}</h3><div className="progress-list">{rows.map(row => <div key={row.name}><div className="progress-label"><strong>{row.name}</strong><span>{Math.round(row.saved/row.target*100)}%</span></div><progress max={row.target} value={row.saved} /><small>{money(row.saved)} de {money(row.target)}</small></div>)}</div></section>; }
    }
  }
  return <>{render('root')}</>;
}

export function A2UIRenderer({ messages, onAction, busy = false, onRecover }: { messages: unknown[]; onAction: (action: UIAction) => void; busy?: boolean; onRecover: () => void }) {
  return <SurfaceBoundary key={JSON.stringify(messages[0])} onRecover={onRecover}><SurfaceView messages={messages} onAction={onAction} busy={busy} /></SurfaceBoundary>;
}
