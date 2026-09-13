import { test, expect, type Page } from '@playwright/test';

function surface(id: string, components: unknown[], model = {}, transaction: unknown = null) {
  return {
    message: transaction ? 'Operación confirmada' : 'Proyección de inversión', domain: 'inversiones', surface_id: id, transaction,
    a2ui: [
      { version: 'v0.9', createSurface: { surfaceId: id, catalogId: 'lazy-bank:finance-v1' } },
      { version: 'v0.9', updateDataModel: { surfaceId: id, path: '/', value: model } },
      { version: 'v0.9', updateComponents: { surfaceId: id, components } },
    ],
  };
}

async function setup(page: Page, failInitialAccount = false) {
  const state = { balance: 10000, accountAvailable: !failInitialAccount };
  await page.route('**/api/config', route => route.fulfill({ json: { auth: { mode: 'demo' }, voice: { enabled: false } } }));
  await page.route('**/api/account', route => {
    if (!state.accountAvailable) return route.fulfill({ status: 502, json: { error: 'No se pudo cargar el saldo.' } });
    return route.fulfill({ json: { balance: state.balance, currency: 'MXN', mode: 'demo' } });
  });
  await page.route('**/api/chat', route => route.fulfill({ json: surface('projection', [
    { id: 'root', component: 'Column', children: ['simulator'] },
    { id: 'simulator', component: 'Simulator', data: { path: '/simulation' },
      action: { event: { name: 'simulate_investment', context: { plan_id: 'balanced', amount: 1000 } } },
      transactionalAction: { kind: 'mutation', label: 'Confirmar inversión de $1,000', event: { name: 'confirm_investment', context: { plan_id: 'balanced', amount: 1000 } } },
    },
  ], { simulation: { plan_id: 'balanced', amount: 1000, monthly_contribution: 500, months: 24 } }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  if (failInitialAccount) await expect(page.getByRole('alert')).toContainText('No se pudo cargar el saldo');
  else await expect(page.locator('.zero-balance h1')).toContainText('10,000.00');
  return state;
}

async function openProjection(page: Page) {
  await page.getByLabel('Pregunta sobre tus finanzas').fill('Invertir');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByLabel('Capital inicial')).toHaveValue('1000');
}

for (const missingAccount of [false, true]) {
  test(`confirmación usa el monto editado y recupera el saldo (carga inicial fallida: ${missingAccount})`, async ({ page }) => {
    const state = await setup(page, missingAccount);
    const actions: any[] = [];
    await page.route('**/api/actions', async route => {
      const action = route.request().postDataJSON().action;
      actions.push(action);
      state.balance -= action.context.amount;
      state.accountAvailable = true;
      await route.fulfill({ json: surface('receipt', [
        { id: 'root', component: 'Column', children: ['close'] },
        { id: 'close', component: 'Button', text: 'Aceptar', action: { event: { name: 'return_to_zero', context: {} } } },
      ], {}, { transaction_id: 'test-receipt', confirmed: true, balance_after: state.balance, debt_after: null }) });
    });
    await openProjection(page);
    await page.getByLabel('Capital inicial').fill('2500.25');
    expect(actions).toEqual([]);
    await page.getByRole('button', { name: 'Confirmar inversión de $2,500.25' }).click();
    await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(page.locator('.zero-balance h1')).toContainText('7,499.75');
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('confirm_investment');
    expect(actions[0].context.amount).toBe(2500.25);
  });
}

test('saldo refleja ingresos y egresos externos al reactivar la página', async ({ page }) => {
  const state = await setup(page);
  state.balance += 500;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.zero-balance h1')).toContainText('10,500.00');
  state.balance -= 750;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.zero-balance h1')).toContainText('9,750.00');
});

test('una confirmación rechazada conserva el saldo', async ({ page }) => {
  await setup(page);
  await page.route('**/api/actions', route => route.fulfill({ status: 400, json: { error: 'Saldo insuficiente.' } }));
  await openProjection(page);
  await page.getByRole('button', { name: 'Confirmar inversión de $1,000.00' }).click();
  await expect(page.getByRole('alert')).toContainText('Saldo insuficiente');
  await page.getByRole('button', { name: 'Volver al inicio', exact: true }).click();
  await expect(page.locator('.zero-balance h1')).toContainText('10,000.00');
});
