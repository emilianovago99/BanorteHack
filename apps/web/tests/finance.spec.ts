import { test, expect } from '@playwright/test';

test('el chat renderiza gastos y gráficas sin pantalla en blanco', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await expect(page.getByText('Saldo disponible', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('overview.png'), fullPage: true });
  await page.getByRole('button', { name: '¿En qué gasté más en agosto?' }).click();
  await expect(page.getByRole('heading', { name: 'Entiende a dónde se va.' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Ver movimientos del mes' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('seleccionar un plan y cambiar aportaciones genera otra superficie A2UI', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await expect(page.getByText('Saldo disponible', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Invertir', exact: true }).click();
  await page.getByRole('button', { name: 'Explorar Equilibrio' }).click();
  await expect(page.getByText('Ganancia hipotética', { exact: true })).toBeVisible();
  const metric = page.getByText('Valor proyectado', { exact: true }).locator('..');
  const previous = await metric.textContent();
  await page.getByLabel('Aportación mensual').fill('2000');
  await page.getByRole('button', { name: 'Actualizar simulación' }).click();
  await expect(metric).not.toHaveText(previous!);
  await expect(page.getByLabel('Aportación mensual')).toHaveValue('2000');
  await expect(page.getByRole('button', { name: 'Comparar otros planes' })).toBeVisible();
  await page.getByLabel('Pregunta sobre tus finanzas').fill('¿Y si aporto $3000 al mes?');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByLabel('Aportación mensual')).toHaveValue('3000');
  await page.screenshot({ path: test.info().outputPath('investment.png'), fullPage: true });
});

test('consulta créditos y compara amortización con un abono extra', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await expect(page.getByText('Saldo disponible', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mis créditos' }).click();
  await page.getByRole('button', { name: 'Simular abono de $500' }).first().click();
  await expect(page.getByText('Intereses que evitarías', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tu deuda hasta llegar a cero' })).toBeVisible();
});

test('la vista cabe en un teléfono y busca movimientos por comercio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await expect(page.getByText('Saldo disponible', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conversar con Norte' }).click();
  await page.getByLabel('Pregunta sobre tus finanzas').fill('Busca mis gastos en café en agosto');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await page.getByRole('button', { name: 'Volver a mi vista' }).click();
  await expect(page.getByRole('heading', { name: 'Detalle de movimientos' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('una superficie inválida muestra recuperación en lugar de dejar la pantalla en blanco', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await expect(page.getByText('Saldo disponible', { exact: true })).toBeVisible();
  await page.route('**/api/chat', route => route.fulfill({ json: { domain: 'gastos', message: 'Respuesta de prueba', a2ui: [
    { version: 'v0.9', createSurface: { surfaceId: 'invalid', catalogId: 'banortehack:finance-v1' } },
    { version: 'v0.9', updateComponents: { surfaceId: 'invalid', components: [{ id: 'root', component: 'UnknownWidget' }] } }
  ] } }));
  await page.getByRole('button', { name: '¿En qué gasté más en agosto?' }).click();
  await expect(page.getByRole('heading', { name: 'No se pudo mostrar esta vista' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver al resumen' }).click();
  await expect(page.getByText('Saldo disponible', { exact: true })).toBeVisible();
});


test('crea pestañas, ajusta la activa con tools y conserva la anterior', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await expect(page.getByText('Saldo disponible', { exact: true })).toBeVisible();
  const input = page.getByLabel('Pregunta sobre tus finanzas');
  await input.fill('Muéstrame mis gastos de julio 2025');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  const tabs = page.getByRole('navigation', { name: 'Vistas creadas' });
  await expect(tabs.getByRole('button')).toHaveCount(1);
  await input.fill('Orden ascendente por monto y color azul');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText('Actualicé la vista', { exact: false })).toBeVisible();
  await expect(tabs.getByRole('button')).toHaveCount(1);
  await input.fill('Crea una nueva pestaña de ingresos');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(tabs.getByRole('button')).toHaveCount(2);
  await tabs.getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Entiende a dónde se va.' })).toBeVisible();
  await expect(page.locator('.period-pill')).toContainText('2025-07');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
});
