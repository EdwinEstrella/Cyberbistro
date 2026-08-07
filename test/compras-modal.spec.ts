import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const TEST_EMAIL_ENV = 'CYBERBISTRO_TEST_EMAIL';
const TEST_PASSWORD_ENV = 'CYBERBISTRO_TEST_PASSWORD';

interface BrowserDiagnostics {
  consoleMessages: string[];
  pageErrors: string[];
}

function attachDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = { consoleMessages: [], pageErrors: [] };
  page.on('console', (message) => {
    if (['error', 'warning', 'info'].includes(message.type())) {
      diagnostics.consoleMessages.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.stack || error.message);
  });
  return diagnostics;
}

async function attachDiagnosticsOnFailure(diagnostics: BrowserDiagnostics[]): Promise<void> {
  const output = diagnostics
    .flatMap((entry, index) => [
      `# Window ${index + 1}`,
      '## Page errors',
      ...(entry.pageErrors.length ? entry.pageErrors : ['<none>']),
      '## Console',
      ...(entry.consoleMessages.length ? entry.consoleMessages : ['<none>'])
    ])
    .join('\n');
  test.info().attachments.push({
    name: 'browser-diagnostics.md',
    contentType: 'text/markdown',
    body: Buffer.from(output)
  });
}

async function launchApp(diagnostics: BrowserDiagnostics[]): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  diagnostics.push(attachDiagnostics(window));
  await loginIfNeeded(window);
  await waitForAppShell(window);
  return { app, window };
}

async function waitForLoginOrShell(page: Page): Promise<void> {
  await Promise.race([
    page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 20_000 }),
    page.locator('aside').getByRole('button', { name: /^Mesas$/ }).waitFor({ state: 'visible', timeout: 20_000 }),
    page.locator('button:has-text("Cerrar Sesión")').first().waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
}

async function waitForAppShell(page: Page): Promise<void> {
  await expect(page.locator('aside').getByRole('button', { name: /^Mesas$/ })).toBeVisible({ timeout: 20_000 });
}

async function loginIfNeeded(page: Page): Promise<void> {
  await waitForLoginOrShell(page);

  const emailInput = page.locator('input[type="email"]').first();
  if (!(await emailInput.isVisible().catch(() => false))) {
    return;
  }

  const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  const email = process.env[TEST_EMAIL_ENV] || 'test@test.com';
  const password = process.env[TEST_PASSWORD_ENV] || 'test123456';

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.keyboard.press('Enter');
  
  await waitForAppShell(page);
}

test.describe('Compras Module - Formato 606', () => {
  const diagnostics: BrowserDiagnostics[] = [];

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed') {
      await attachDiagnosticsOnFailure(diagnostics);
    }
  });

  test('debe auto-calcular el ITBIS facturado al ingresar Monto en Servicios', async () => {
    const { app, window } = await launchApp(diagnostics);

    try {
      // 1. Ir a Compras
      await window.locator('aside').getByRole('button', { name: /^Compras$/ }).click();
      await expect(window.locator('h2', { hasText: 'Módulo de Compras' })).toBeVisible();

      // 2. Abrir Modal de Registrar Compra
      await window.getByRole('button', { name: /Registrar Compra/i }).click();
      await expect(window.getByRole('heading', { name: /Registrar Factura de Compra/i })).toBeVisible();

      // 3. Buscar el campo "Monto Servicios" y llenarlo
      const montoServiciosInput = window.locator('input[placeholder="RD$ 0.00"]').nth(0); // Might be tricky, let's use label
      
      // Let's locate inputs by adjacent labels
      const montoServiciosLabel = window.locator('label', { hasText: 'Monto Servicios' });
      await montoServiciosLabel.locator('..').locator('input').fill('1000');

      // 4. Verificar el autocalculo del ITBIS (18%)
      const itbisFacturadoLabel = window.locator('label', { hasText: 'ITBIS Facturado' });
      const itbisFacturadoInput = itbisFacturadoLabel.locator('..').locator('input');
      await expect(itbisFacturadoInput).toHaveValue('180.00');

      // 5. Verificar que el Monto Total Factura y el Monto a Pagar se actualizan
      await expect(window.locator('span', { hasText: /^RD\$ 1,180\.00$/ }).first()).toBeVisible();

      // Close modal
      await window.getByRole('button', { name: /Cancelar/i }).click();

    } finally {
      await app.close();
    }
  });
});
