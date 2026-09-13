import { test, expect, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await expect(page.getByRole('region', { name: 'Estado Cero' })).toBeVisible();
  await expect(page.locator('.zero-balance h1')).not.toHaveText('—');
}
async function ask(page: Page, message: string) {
  await page.getByLabel('Pregunta sobre tus finanzas').fill(message);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
}

for (const width of [320, 390, 760, 1050, 1250, 1800]) {
  test(`Estado Cero y superficie sin navegación a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/')) requests.push(new URL(request.url()).pathname); });
    page.on('pageerror', error => errors.push(error.message));
    await enter(page);
    await expect(page.locator('nav, .sidebar, .custom-tabs, canvas')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Conversación', exact: true })).toHaveCount(0);
    expect(requests.filter(path => !['/api/config', '/api/account'].includes(path))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1800) await page.screenshot({ path: test.info().outputPath('zero.png'), fullPage: true });
    await ask(page, 'Muéstrame mis gastos de agosto');
    await expect(page.getByRole('region', { name: 'Vista financiera' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(2);
    await expect(page.locator('.conversation, .chat-message')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Estado Cero' })).toHaveCount(0);
    await expect(page.locator('nav, .sidebar, .custom-tabs')).toHaveCount(0);
    expect(requests).not.toContain('/api/dashboard');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    if (width === 390 || width === 1800) await page.screenshot({ path: test.info().outputPath('surface.png'), fullPage: true });
  });
}

test('acciones A2UI y seguimiento conservan simulación e historial', async ({ page }) => {
  await enter(page);
  await ask(page, 'Quiero invertir $10000');
  await page.getByRole('button', { name: 'Explorar Equilibrio' }).click();
  await expect(page.getByLabel('Aportación mensual')).toHaveValue('1000');
  const sent = page.waitForRequest(request => request.url().endsWith('/api/chat') && request.method() === 'POST');
  await ask(page, '¿Y si aporto $3000 al mes?');
  const body = (await sent).postDataJSON();
  expect(body.simulation.plan_id).toBe('balanced');
  expect(body.current_view.a2ui.length).toBeGreaterThan(0);
  expect(body.history.length).toBeGreaterThan(0);
  expect(body.history.length).toBeLessThanOrEqual(6);
  expect(body.history).toContainEqual({ role: 'user', content: 'Explorar este plan de inversión' });
  await expect(page.locator('.conversation, .chat-message')).toHaveCount(0);
  expect(body.history.every((turn: { content: string }) => turn.content.length <= 2000)).toBe(true);
  await expect(page.getByLabel('Aportación mensual')).toHaveValue('3000');
  await page.getByLabel('Aportación mensual').fill('2000');
  await page.getByRole('button', { name: 'Actualizar simulación' }).click();
  await expect(page.getByLabel('Aportación mensual')).toHaveValue('2000');
});

test('recuperar una superficie vuelve a cero sin dashboard ni pérdida de contexto', async ({ page }) => {
  await enter(page);
  const balance = await page.locator('.zero-balance h1').textContent();
  await ask(page, 'Quiero invertir $10000');
  await page.getByRole('button', { name: 'Explorar Equilibrio' }).click();
  await expect(page.getByLabel('Aportación mensual')).toHaveValue('1000');
  await page.route('**/api/chat', async route => {
    const current = route.request().postDataJSON().current_view;
    await route.fulfill({ json: { ...current, a2ui: [
      { version: 'v0.9', createSurface: { surfaceId: 'invalid', catalogId: 'lazy-bank:finance-v1' } },
      { version: 'v0.9', updateComponents: { surfaceId: 'invalid', components: [{ id: 'root', component: 'UnknownWidget' }] } }
    ] } });
  }, { times: 1 });
  await ask(page, 'Pon la gráfica en azul');
  await expect(page.getByRole('heading', { name: 'No se pudo mostrar esta vista' })).toBeVisible();
  // This label belongs to the unchanged renderer; its callback now resets to zero.
  await page.getByRole('button', { name: 'Volver al resumen' }).click();
  await expect(page.getByRole('region', { name: 'Estado Cero' })).toBeVisible();
  await expect(page.locator('.zero-balance h1')).toHaveText(balance!);
  const sent = page.waitForRequest(request => request.url().endsWith('/api/chat'));
  await ask(page, '¿Y si aporto $2000 al mes?');
  const body = (await sent).postDataJSON();
  expect(body.simulation.plan_id).toBe('balanced');
  expect(body.history.length).toBeGreaterThan(0);
  await expect(page.getByLabel('Aportación mensual')).toHaveValue('2000');
});

test('el logout discreto conserva el cierre de sesión existente', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Estado Cero' })).toHaveCount(0);
});

test('fallo de red sale de loading y permite reintentar el texto', async ({ page }) => {
  await enter(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/chat', async route => {
    await gate;
    await route.fulfill({ status: 502, json: { error: 'No se pudo consultar el servicio.' } });
  }, { times: 1 });
  await ask(page, 'Muéstrame mis deudas');
  await expect(page.getByRole('status')).toContainText('Preparando tu vista');
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Estado Cero' })).toHaveCount(0);
  release();
  await expect(page.getByRole('region', { name: 'Estado Cero' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('No se pudo consultar');
  await expect(page.getByLabel('Pregunta sobre tus finanzas')).toHaveValue('Muéstrame mis deudas');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByRole('button', { name: 'Simular abono de $500' })).toHaveCount(3);
});


test('historial invisible conserva los últimos seis mensajes y limita cada contenido a 2000 caracteres', async ({ page }) => {
  await enter(page);
  const memory: { role: string; content: string }[] = [];
  const payloads: { history: { role: string; content: string }[] }[] = [];
  let turn = 0;
  await page.route('**/api/chat', async route => {
    payloads.push(route.request().postDataJSON());
    turn += 1;
    await route.fulfill({ json: {
      message: `Respuesta privada ${turn}: ` + 'x'.repeat(2100),
      domain: 'resumen', mode: 'demo', tools_used: [], interpretation: 'local', source: 'Prueba',
      visualization: { type: 'bar', title: 'Prueba', labels: [], values: [] },
      surface_id: `test-${turn}`,
      a2ui: [
        { version: 'v0.9', createSurface: { surfaceId: `test-${turn}`, catalogId: 'lazy-bank:finance-v1' } },
        { version: 'v0.9', updateDataModel: { surfaceId: `test-${turn}`, path: '/', value: {} } },
        { version: 'v0.9', updateComponents: { surfaceId: `test-${turn}`, components: [
          { id: 'root', component: 'Column', children: ['heading'] },
          { id: 'heading', component: 'Text', variant: 'h2', text: `Vista ${turn}` }
        ] } }
      ]
    } });
  });
  for (let index = 1; index <= 5; index += 1) {
    const prompt = `Consulta privada ${index}`;
    await ask(page, prompt);
    await expect(page.getByRole('heading', { name: `Vista ${index}`, exact: true })).toBeVisible();
    expect(payloads[index - 1].history).toEqual(memory.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 2000) })));
    memory.push({ role: 'user', content: prompt }, { role: 'assistant', content: `Respuesta privada ${index}: ` + 'x'.repeat(2100) });
    await expect(page.locator('.conversation, .chat-message')).toHaveCount(0);
    await expect(page.getByText(/Consulta privada|Respuesta privada/)).toHaveCount(0);
  }
  expect(payloads[4].history).toHaveLength(6);
  expect(payloads[4].history[1].content).toHaveLength(2000);
});


test('la simulación genera un botón A2UI de confirmación y envía una sola acción', async ({ page }) => {
  await enter(page);
  await ask(page, 'Muéstrame mis deudas');
  await page.getByRole('button', { name: 'Simular abono de $500' }).first().click();
  const confirm = page.getByRole('button', { name: 'Confirmar abono único de $500.00 MXN' });
  await expect(confirm).toBeVisible();
  await expect(page.getByText(/no programa pagos mensuales/)).toBeVisible();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/actions', async route => {
    const body = route.request().postDataJSON();
    expect(body.action.name).toBe('confirm_debt_payment');
    expect(body.action.context).toEqual({ debt_id: 'card-classic', extra_payment: 500 });
    calls += 1;
    await gate;
    // No fixture payment is executed by browser tests on the shared dataset.
    await route.fulfill({ status: 502, json: { error: 'Confirmación de prueba interrumpida.' } });
  });
  await confirm.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole('status')).toContainText('Preparando tu vista');
  await expect(confirm).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toContainText('Confirmación de prueba');
  expect(calls).toBe(1);
  await expect(confirm).toBeEnabled();
});

test('entrada inválida pide clarificación y permite volver a una consulta analítica', async ({ page }) => {
  const actions: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/actions')) actions.push(request.url()); });
  await enter(page);
  await ask(page, 'm');
  await expect(page.locator('.finance-notice')).toContainText('No entendí tu consulta');
  await expect(page.locator('canvas, .context-action')).toHaveCount(0);
  expect(actions).toEqual([]);
  await ask(page, '¿En qué gasté más este mes?');
  await expect(page.locator('canvas')).toHaveCount(2);
  await expect(page.locator('.finance-notice')).toHaveCount(0);
});
