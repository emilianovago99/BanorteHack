import { z } from 'zod';

export const CATALOG_ID = 'lazy-bank:finance-v1';
const amount = z.number().finite();
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const simulationInputSchema = z.strictObject({
  plan_id: z.enum(['conservative', 'balanced', 'growth']),
  amount: amount.min(100).max(1000000).default(10000),
  monthly_contribution: amount.min(0).max(100000).default(1000),
  months: z.number().int().min(1).max(120).default(24),
});
const debtId = z.enum(['card-classic', 'personal-loan', 'laptop', 'auto-loan']);
export const debtInputSchema = z.strictObject({
  debt_id: debtId, extra_payment: amount.min(0).max(100000).default(500),
});
export const paymentInputSchema = z.strictObject({
  debt_id: debtId, extra_payment: amount.positive().max(100000).multipleOf(0.01),
});
const selection = z.strictObject({ name: z.literal('select_plan'), context: simulationInputSchema });
const payment = z.strictObject({ name: z.literal('confirm_debt_payment'), context: paymentInputSchema });
export const investmentInputSchema = z.strictObject({
  plan_id: z.enum(['conservative', 'balanced', 'growth']),
  amount: amount.min(100).max(1000000).multipleOf(0.01).default(10000),
});
const investment = z.strictObject({ name: z.literal('confirm_investment'), context: investmentInputSchema });

export const eventSchema = z.discriminatedUnion('name', [
  selection, payment, investment,
  z.strictObject({ name: z.literal('simulate_investment'), context: simulationInputSchema }),
  z.strictObject({ name: z.literal('simulate_debt'), context: debtInputSchema }),
  z.strictObject({ name: z.literal('compare_plans'), context: z.strictObject({ amount: amount.min(100).max(1000000).default(10000) }) }),
  z.strictObject({ name: z.literal('show_transactions'), context: z.strictObject({ month: month.nullable().optional(), kind: z.enum(['income', 'expense']).nullable().optional() }) }),
]);
// Local navigation can be emitted by A2UI, but is not an executable MCP event.
export const localEventSchema = z.strictObject({ name: z.literal('return_to_zero'), context: z.strictObject({}) });
export const clientEventSchema = z.discriminatedUnion('name', [...eventSchema.options, localEventSchema]);
export const actionSchema = z.strictObject({ event: clientEventSchema });
const label = z.string().min(1).max(200);
const paymentAction = z.strictObject({ label, kind: z.literal('mutation'), event: payment });
const investmentAction = z.strictObject({ label, kind: z.literal('mutation'), event: investment });
const mutationAction = z.strictObject({ label, kind: z.literal('mutation'), event: z.union([payment, investment]) });
const planAction = z.strictObject({ label, kind: z.literal('simulation'), event: selection });
// The mandatory closing action need not move money: plan selection is explicitly a simulation.
export const transactionalActionSchema = z.discriminatedUnion('kind', [mutationAction, planAction]);
const binding = z.strictObject({ path: z.string().startsWith('/') });
const base = z.strictObject({
  id: z.string().min(1).max(100),
  transactionalAction: transactionalActionSchema.optional(),
});
const text = z.string().max(4000);
const title = z.string();
const action = actionSchema.optional();
export const nodeSchema = z.discriminatedUnion('component', [
  base.extend({ component: z.literal('Column'), children: z.array(z.string()).max(100), variant: z.literal('confirmation').optional() }),
  base.extend({ component: z.literal('Row'), children: z.array(z.string()).max(100) }),
  base.extend({ component: z.literal('Text'), text, variant: z.string().optional() }),
  z.strictObject({ id: z.string().min(1).max(100), component: z.literal('Notice'), text }),
  base.extend({ component: z.literal('Metric'), label: title, value: amount, format: z.enum(['currency', 'number', 'percent']).optional(), tone: z.string().optional(), detail: z.string().optional() }),
  base.extend({ component: z.literal('FinancialChart'), title, data: binding, chartType: z.enum(['bar', 'line', 'doughnut']), palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(12).optional(), action }),
  base.extend({ component: z.literal('DataTable'), title, data: binding, columns: z.array(z.strictObject({ key: z.string(), label: title, format: z.string().optional() })), action }),
  base.extend({ component: z.literal('Button'), text, action: actionSchema }),
  base.extend({ component: z.literal('PlanCard'), data: binding, amount: amount.optional(), action, transactionalAction: z.union([planAction, investmentAction]) }),
  base.extend({ component: z.literal('DebtCard'), data: binding, action, transactionalAction: paymentAction }),
  base.extend({ component: z.literal('Simulator'), data: binding, action: actionSchema }),
  base.extend({ component: z.literal('BudgetList'), title: title.optional(), data: binding, action }),
  base.extend({ component: z.literal('GoalList'), title: title.optional(), data: binding, action }),
]);
const surfaceId = z.string().min(1).max(100);
export const messageSchema = z.union([
  z.strictObject({ version: z.literal('v0.9'), createSurface: z.strictObject({ surfaceId, catalogId: z.literal(CATALOG_ID) }) }),
  z.strictObject({ version: z.literal('v0.9'), updateDataModel: z.strictObject({ surfaceId, path: z.literal('/'), value: z.record(z.string(), z.unknown()) }) }),
  z.strictObject({ version: z.literal('v0.9'), updateComponents: z.strictObject({ surfaceId, components: z.array(nodeSchema).max(100) }) }),
]);
const metadata = {
  surfaceId: z.string().max(100), sourceComponentId: z.string().max(100), timestamp: z.string().max(60),
};
export const uiActionSchema = z.strictObject({
  version: z.literal('v0.9').default('v0.9'),
  action: z.discriminatedUnion('name', [
    eventSchema.options[0].extend(metadata), eventSchema.options[1].extend(metadata),
    eventSchema.options[2].extend(metadata), eventSchema.options[3].extend(metadata),
    eventSchema.options[4].extend(metadata), eventSchema.options[5].extend(metadata),
    eventSchema.options[6].extend(metadata), localEventSchema.extend(metadata),
  ]),
});
export type A2UINode = z.infer<typeof nodeSchema>;
export type A2UIEvent = z.infer<typeof clientEventSchema>;
export type TransactionalAction = z.infer<typeof transactionalActionSchema>;
