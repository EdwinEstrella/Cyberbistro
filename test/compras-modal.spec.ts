import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

async function launchApp(diagnostics: BrowserDiagnostics[]): Promise<{ app: ElectronApplication; window: Page; userDataDirectory: string }> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'cloudix-compras-modal-'));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDirectory}`] });
  const window = await app.firstWindow();
  diagnostics.push(attachDiagnostics(window));
  await loginIfNeeded(window);
  await waitForAppShell(window);
  return { app, window, userDataDirectory };
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
  const password = process.env[TEST_PASSWORD_ENV] || 'lia2026';

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
    test.setTimeout(60_000);
    const { app, window, userDataDirectory } = await launchApp(diagnostics);

    try {
      // Esperar a que el plan y el tenant estén listos tras login
      await expect(window.locator('text=/Plan /i')).toBeVisible({ timeout: 20_000 }).catch(() => {});

      // 1. Ir a Compras
      await window.locator('aside').getByRole('button', { name: /^Compras$/ }).click();
      await expect(window.locator('h2', { hasText: 'Módulo de Compras' })).toBeVisible({ timeout: 15_000 });

      // Esperar a que termine de cargar compras y se estabilice el render
      await expect(window.locator('text=/Cargando compras/i')).toHaveCount(0, { timeout: 20_000 }).catch(() => {});
      await window.waitForTimeout(1000);

      // 2. Abrir Modal de Registrar Compra
      const registrarBtn = window.locator('button:has-text("Registrar Compra")').first();
      await expect(registrarBtn).toBeVisible({ timeout: 15_000 });
      await registrarBtn.click();
      await expect(window.locator('text="Registrar Factura de Compra"').first()).toBeVisible({ timeout: 15_000 });

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
      await rm(userDataDirectory, { recursive: true, force: true }).catch(() => {});
    }
  });
});
