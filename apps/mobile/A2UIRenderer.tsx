import { Component, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { z } from 'zod';
import { parseSurface, seriesSchema, type Node, type Event } from '@lazy-bank/visual-engine/protocol';
import { eventSchema, uiActionSchema, type UIAction } from '@lazy-bank/contracts';
import { ActionButton, Panel, ui, useTheme } from './ui';

const number = z.number().finite();
const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const format = (value: unknown, kind?: string) => typeof value === 'number' ? kind === 'currency' ? money(value) : kind === 'percent' ? `${value}%` : value.toLocaleString('es-MX') : String(value ?? '—');
function Progress({ value }: { value: number }) {
  const theme = useTheme();
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }} style={{ height: 6, borderRadius: 6, backgroundColor: '#edf2f0', overflow: 'hidden' }}><View style={{ height: 6, width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: theme.accent }} /></View>;
}

function Chart({ node, value }: { node: Extract<Node, { component: 'FinancialChart' }>; value: unknown }) {
  const data = seriesSchema.parse(value);
  if (data.series.some(s => s.values.length !== data.labels.length)) throw new Error('Serie inválida');
  const theme = useTheme();
  const colors = node.palette ?? [theme.accent, theme.secondary, '#e8a05a', '#78948c', '#b889ab', '#85a8c4'];
  const [expanded, setExpanded] = useState(false);
  const all = data.series.flatMap(s => s.values);
  const min = Math.min(0, ...all), max = Math.max(1, ...all), range = max - min;
  const y = (n: number) => 174 - (n - min) / range * 150;
  const x = (i: number) => 46 + i / Math.max(1, data.labels.length - 1) * 246;
  let offset = 0;
  const total = data.series[0]?.values.reduce((a, b) => a + Math.max(0, b), 0) ?? 0;
  return <Panel><Text style={ui.title}>{node.title}</Text>{!data.labels.length ? <Text style={ui.body}>No hay datos para este periodo.</Text> : <>
    <Svg width="100%" height={220} viewBox="0 0 320 220" accessibilityLabel={node.title}>
      {node.chartType === 'doughnut' ? <>
        <Circle cx={160} cy={104} r={70} fill="none" stroke="#edf2f0" strokeWidth={25} />
        {data.series[0]?.values.map((v, i) => { const length = total ? Math.max(0, v) / total * 440 : 0; const start = offset; offset += length; return <Circle key={i} cx={160} cy={104} r={70} fill="none" stroke={colors[i % colors.length]} strokeWidth={25} strokeDasharray={`${length} ${440 - length}`} strokeDashoffset={-start} rotation={-90} origin="160,104" />; })}
      </> : <>
        {[0, .5, 1].map(r => <ViewlessGrid key={r} y={y(min + range * r)} label={Math.round(min + range * r).toLocaleString('es-MX')} />)}
        {data.series.map((s, j) => node.chartType === 'line' ? <Polyline key={s.label} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={colors[j % colors.length]} strokeWidth={2} /> : s.values.map((v, i) => { const group = 246 / data.labels.length, width = group / (data.series.length + 1); return <Rect key={`${j}-${i}`} x={46 + i * group + j * width} y={Math.min(y(v), y(0))} width={Math.max(.5, width - 1)} height={Math.abs(y(0) - y(v))} rx={2} fill={colors[j % colors.length]} />; }))}
        {[...new Set([0, Math.floor((data.labels.length - 1) / 2), data.labels.length - 1])].map(i => <SvgText key={i} x={x(i)} y={200} fontSize={9} fill="#627473" textAnchor={i === 0 ? 'start' : 'end'}>{data.labels[i].slice(0, 18)}</SvgText>)}
      </>}
    </Svg>
    <View style={{ gap: 8 }}>{(node.chartType === 'doughnut' ? data.labels : data.series.map(s => s.label)).map((label, i) => <View key={`${label}-${i}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[i % colors.length] }} /><Text style={ui.caption}>{label}</Text></View>)}</View>
    <ActionButton secondary title={expanded ? 'Ocultar datos de la gráfica' : 'Ver datos de la gráfica'} onPress={() => setExpanded(!expanded)} />
    {expanded && data.labels.map((label, i) => <View key={`${label}-${i}`} style={{ borderTopWidth: 1, borderColor: '#edf2f0', paddingTop: 8 }}><Text style={ui.body}>{label}</Text>{data.series.map(s => <Text key={s.label} style={ui.caption}>{s.label}: {s.label === '%' ? `${s.values[i]}%` : money(s.values[i])}</Text>)}</View>)}
  </>}</Panel>;
}
function ViewlessGrid({ y, label }: { y: number; label: string }) { return <><Line x1={44} x2={302} y1={y} y2={y} stroke="#e4eae7" /><SvgText x={40} y={y + 3} textAnchor="end" fontSize={8} fill="#627473">{label}</SvgText></>; }

function Simulator({ value, onEvent, event, busy }: { value: unknown; onEvent: (e: Event) => void; event: Event; busy: boolean }) {
  const data = z.object({ plan_id: z.string(), amount: number, monthly_contribution: number, months: number }).parse(value);
  const [amount, setAmount] = useState(String(data.amount)), [monthly, setMonthly] = useState(String(data.monthly_contribution)), [months, setMonths] = useState(String(data.months));
  const n = (v: string) => Number(v.replace(/,/g, ''));
  const valid = [amount, monthly, months].every(v => v.trim() !== '' && Number.isFinite(n(v))) && n(amount) >= 100 && n(amount) <= 1000000 && n(monthly) >= 0 && n(monthly) <= 100000 && Number.isInteger(n(months)) && n(months) >= 1 && n(months) <= 120;
  return <Panel><Text style={ui.title}>Hazlo a tu medida</Text>{([{ label: 'Capital inicial', value: amount, set: setAmount }, { label: 'Aportación mensual', value: monthly, set: setMonthly }, { label: 'Plazo en meses', value: months, set: setMonths }]).map(field => <View key={field.label} style={{ gap: 6 }}><Text style={ui.caption}>{field.label}</Text><TextInput accessibilityLabel={field.label} keyboardType="numeric" value={field.value} onChangeText={field.set} style={ui.input} editable={!busy} /></View>)}
    {!valid && <Text style={ui.error}>Capital: $100–$1,000,000. Aportación: $0–$100,000. Plazo: 1–120 meses.</Text>}
    <ActionButton title="Actualizar simulación" disabled={busy || !valid} onPress={() => onEvent(eventSchema.parse({ name: 'simulate_investment', context: { plan_id: data.plan_id, amount: n(amount), monthly_contribution: n(monthly), months: n(months) } }))} />
  </Panel>;
}

function Surface({ messages, onAction, busy }: { messages: unknown[]; onAction: (a: UIAction) => void; busy: boolean }) {
  const { surfaceId, model, nodes } = useMemo(() => parseSurface(messages), [messages]);
  const theme = useTheme();
  function bound(node: Node): unknown {
    let value: unknown = model;
    for (const part of ('data' in node ? node.data : undefined)?.path.slice(1).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~')) ?? []) { if (['__proto__', 'constructor', 'prototype'].includes(part)) throw new Error('Ruta inválida'); value = (value as Record<string, unknown>)?.[part]; }
    return value;
  }
  function send(node: Node, event: Event) { onAction(uiActionSchema.parse({ version: 'v0.9', action: { ...event, surfaceId, sourceComponentId: node.id, timestamp: new Date().toISOString() } })); }
  function render(id: string): ReactNode {
    const node = nodes.get(id)!;
    const content = renderContent(id);
    if (!('transactionalAction' in node) || !node.transactionalAction || node.component === 'PlanCard') return content;
    const closing = node.transactionalAction;
    return <View key={id} style={ui.stack}>{content}<ActionButton title={closing.label} disabled={busy} onPress={() => send(node, closing.event)} /></View>;
  }
  function renderContent(id: string): ReactNode {
    const node = nodes.get(id)!;
    switch (node.component) {
      case 'Column': case 'Row': return <View key={id} style={ui.stack}>{node.children?.map(render)}</View>;
      case 'Text': return <Text key={id} style={node.variant === 'h2' ? ui.title : ui.body}>{node.text}</Text>;
      case 'Notice': return <View key={id} style={{ backgroundColor: theme.soft, borderRadius: 12, padding: 16 }}><Text style={ui.body}>{node.text}</Text></View>;
      case 'Metric': return <Panel key={id}><Text style={ui.caption}>{node.label}</Text><Text style={[ui.value, { color: node.tone === 'positive' ? '#15803d' : theme.accent }]}>{format(node.value, node.format)}</Text>{!!node.detail && <Text style={ui.caption}>{node.detail}</Text>}</Panel>;
      case 'FinancialChart': return <Chart key={id} node={node} value={bound(node)} />;
      case 'Button': return <ActionButton key={id} title={node.text!} disabled={busy} onPress={() => node.action && send(node, node.action.event)} />;
      case 'Simulator': return <Simulator key={id} value={bound(node)} busy={busy} event={node.action!.event} onEvent={e => send(node, e)} />;
      case 'PlanCard': { const p = z.object({ name: z.string(), risk: z.string(), annual_rate: number, description: z.string() }).parse(bound(node)); return <Panel key={id}><Text style={ui.eyebrow}>RIESGO {p.risk.toUpperCase()}</Text><Text style={ui.title}>{p.name}</Text><Text style={[ui.value, { color: theme.accent }]}>{Math.round(p.annual_rate * 100)}%</Text><Text style={ui.caption}>Tasa anual hipotética</Text><Text style={ui.body}>{p.description}</Text><Text style={ui.body}>Capital inicial: {money(node.amount ?? 0)}</Text><ActionButton title={`Explorar ${p.name}`} disabled={busy} onPress={() => send(node, node.transactionalAction.event)} /></Panel>; }
      case 'DebtCard': { const d = z.object({ name: z.string(), balance: number, annual_rate: number, minimum_payment: number, due_day: number, credit_limit: number.positive() }).parse(bound(node)); return <Panel key={id}><Text style={ui.title}>{d.name}</Text><Text style={ui.value}>{money(d.balance)}</Text><Progress value={d.balance / d.credit_limit * 100} /><Text style={ui.body}>Tasa anual: {Math.round(d.annual_rate * 100)}%{"\n"}Pago mínimo: {money(d.minimum_payment)}{"\n"}Día de pago: {d.due_day}</Text><ActionButton title="Simular abono de $500" disabled={busy} onPress={() => node.action && send(node, node.action.event)} /></Panel>; }
      case 'DataTable': { const rows = z.array(z.record(z.string(), z.unknown())).max(100).parse(bound(node)); return <Panel key={id}><Text style={ui.title}>{node.title}</Text><Text style={ui.caption}>{rows.length} registros</Text>{!rows.length && <Text style={ui.body}>No hay movimientos con estos filtros.</Text>}<ScrollView horizontal><View>{rows.map((row, i) => <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#edf2f0', paddingVertical: 10 }}>{node.columns?.map(c => <View key={c.key} style={{ width: c.key === 'merchant' ? 170 : 115, paddingRight: 8 }}><Text style={ui.caption}>{c.label}</Text><Text style={ui.body}>{c.key === 'kind' ? row[c.key] === 'income' ? 'Ingreso' : 'Gasto' : format(row[c.key], c.format)}</Text></View>)}</View>)}</View></ScrollView></Panel>; }
      case 'BudgetList': { const rows = z.array(z.object({ category: z.string(), spent: number, budget: number, percent: number, remaining: number })).max(100).parse(bound(node)); return <Panel key={id}><Text style={ui.title}>{node.title}</Text>{rows.map(r => <View key={r.category} style={{ gap: 8 }}><Text style={ui.body}>{r.category}</Text><Text style={ui.caption}>{money(r.spent)} / {money(r.budget)}</Text><Progress value={r.percent} /><Text style={r.remaining < 0 ? ui.error : ui.caption}>{money(Math.abs(r.remaining))} {r.remaining < 0 ? 'por encima del presupuesto' : 'disponibles'}</Text></View>)}</Panel>; }
      case 'GoalList': { const rows = z.array(z.object({ name: z.string(), saved: number, target: number.positive() })).max(100).parse(bound(node)); return <Panel key={id}><Text style={ui.title}>{node.title}</Text>{rows.map(r => <View key={r.name} style={{ gap: 8 }}><Text style={ui.body}>{r.name}</Text><Progress value={r.saved / r.target * 100} /><Text style={ui.caption}>{money(r.saved)} de {money(r.target)}</Text></View>)}</Panel>; }
    }
  }
  return <>{render('root')}</>;
}
class Boundary extends Component<{ children: ReactNode; onRecover: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Panel><Text accessibilityRole="alert" style={ui.title}>No se pudo mostrar esta vista</Text><ActionButton title="Volver al inicio" onPress={this.props.onRecover} /></Panel> : this.props.children; }
}
export function A2UIRenderer(props: { messages: unknown[]; onAction: (a: UIAction) => void; busy: boolean; onRecover: () => void }) {
  return <Boundary key={JSON.stringify(props.messages)} onRecover={props.onRecover}><Surface {...props} /></Boundary>;
}
