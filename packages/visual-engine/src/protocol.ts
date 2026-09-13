import { z } from 'zod';
export const CATALOG_ID = 'banortehack:finance-v1';
const action = z.object({ event: z.object({ name: z.enum(['select_plan', 'simulate_investment', 'compare_plans', 'simulate_debt', 'show_transactions', 'confirm_debt_payment']), context: z.record(z.string(), z.unknown()) }) });
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
export type Node = z.infer<typeof nodeSchema>;
export type Event = z.infer<typeof action>['event'];
const numeric = z.number().finite();
export const seriesSchema = z.object({ labels: z.array(z.string()).max(200), series: z.array(z.object({ label: z.string(), values: z.array(numeric).max(200) })).max(5) });
export function parseSurface(messages: unknown[]) {
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

