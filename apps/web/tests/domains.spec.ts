import { test, expect } from '@playwright/test';

test('chips iniciales y colores del dominio recibido', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  await expect(page.getByRole('button', { name: 'Revisar deudas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar deudas', exact: true }).click();
  await expect(page.locator('.lazy-workspace')).toHaveAttribute('data-domain', 'deudas');
  expect(await page.locator('.lazy-workspace').evaluate(el => getComputedStyle(el).getPropertyValue('--accent'))).toBe('#c2410c');
  for (const [question, domain, accent] of [['Mis ingresos', 'ingresos', '#15803d'], ['Quiero invertir $10000', 'inversiones', '#2563eb']]) {
    await page.getByLabel('Pregunta sobre tus finanzas').fill(question);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.locator('.lazy-workspace')).toHaveAttribute('data-domain', domain);
    expect(await page.locator('.lazy-workspace').evaluate(el => getComputedStyle(el).getPropertyValue('--accent'))).toBe(accent);
  }
});

test('texto sin sentido consulta MCP y muestra aclaración', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar a la demostración' }).click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/chat'));
  await page.getByLabel('Pregunta sobre tus finanzas').fill('asdfgh');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  expect((await (await response).json()).tools_used).toEqual(['report_query_issue']);
  await expect(page.getByText('No entendí lo que necesitas.', { exact: false })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});
