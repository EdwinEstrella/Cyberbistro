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
      ...(entry.consoleMessages.length ? entry.consoleMessages : ['<none>']),
    ])
    .join('\n');

  await test.info().attach('electron-browser-diagnostics.txt', {
    body: output,
    contentType: 'text/plain',
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

function paddedTableNumber(tableNumber: number): string {
  return String(tableNumber).padStart(2, '0');
}

function tableButton(page: Page, tableNumber: number) {
  return page.getByRole('button', {
    name: new RegExp(`^Mesa ${paddedTableNumber(tableNumber)} \\(`),
  });
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
  await expect(page.locator('aside').getByRole('button', { name: /^Soporte$/ })).toBeVisible({ timeout: 20_000 });
}

async function loginIfNeeded(page: Page): Promise<void> {
  await waitForLoginOrShell(page);

  const emailInput = page.locator('input[type="email"]').first();
  if (!(await emailInput.isVisible().catch(() => false))) {
    return;
  }

  const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  const email = process.env[TEST_EMAIL_ENV];
  const password = process.env[TEST_PASSWORD_ENV];

  if (email) {
    await emailInput.fill(email);
  } else if (!(await emailInput.inputValue())) {
    throw new Error(`${TEST_EMAIL_ENV} is required when the login email is not already filled.`);
  }

  if (password) {
    await passwordInput.fill(password);
  } else if (!(await passwordInput.inputValue())) {
    throw new Error(`${TEST_PASSWORD_ENV} is required when the login password is not already filled.`);
  }

  if (await page.locator('aside').getByRole('button', { name: /^Mesas$/ }).isVisible().catch(() => false)) {
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await page.locator('aside').getByRole('button', { name: /^Mesas$/ }).isVisible().catch(() => false)) {
      break;
    }

    const loginButton = page.getByRole('button', { name: /Iniciar Sesión/i }).first();
    await loginButton.click({ timeout: 5_000 }).catch(async (error: unknown) => {
      if (attempt === 3) {
        throw error;
      }
    });

    if (await page.locator('aside').getByRole('button', { name: /^Mesas$/ }).isVisible().catch(() => false)) {
      break;
    }
  }

  await expect(page.locator('aside').getByRole('button', { name: /^Mesas$/ })).toBeVisible({ timeout: 20_000 });
}

async function openSupportMesasPanel(page: Page): Promise<void> {
  const soporteNav = page.locator('aside').getByRole('button', { name: /^Soporte$/ }).first();

  if (await soporteNav.isVisible().catch(() => false)) {
    await soporteNav.click();
  } else {
    await page.evaluate(() => {
      window.location.hash = '/soporte';
    });
  }

  await expect(page.getByRole('heading', { name: /Panel Soporte/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Mesas$/ }).last().click();
  await expect(page.getByRole('heading', { name: /Gestión de Mesas/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^Cargando\.\.\.$/)).toBeHidden({ timeout: 15_000 });
  await expect(await mesasCountInput(page)).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Guardar Distribución/i })).toBeEnabled({ timeout: 15_000 });
}

async function mesasCountInput(page: Page) {
  return page
    .locator('label', { hasText: 'Cantidad de Mesas' })
    .locator('..')
    .locator('input[type="number"]')
    .first();
}

async function readMesasCount(page: Page): Promise<number> {
  const input = await mesasCountInput(page);
  await expect(input).toBeVisible({ timeout: 15_000 });
  const rawValue = await input.inputValue();
  const count = Number(rawValue);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Unexpected mesas count value: ${rawValue}`);
  }
  return count;
}

async function saveMesasCount(page: Page, count: number): Promise<void> {
  const input = await mesasCountInput(page);
  const previousValue = await input.inputValue();
  await input.fill(String(count));
  await expect(input).toHaveValue(String(count), { timeout: 5_000 });

  const alertModal = page.locator('div.fixed', { hasText: 'Configuración guardada.' }).last();
  const nativeDialogPromise = page
    .waitForEvent('dialog', { timeout: 15_000 })
    .then((dialog) => ({ type: 'native' as const, dialog }))
    .catch(() => Promise.reject(new Error('Native save dialog was not shown.')));
  const visibleStatusPromise = page.getByRole('status', { name: /Configuración guardada\./i })
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => ({ type: 'status' as const }))
    .catch(() => Promise.reject(new Error('Visible save status was not shown.')));
  const customAlertPromise = alertModal
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => ({ type: 'custom' as const }))
    .catch(() => Promise.reject(new Error('Custom save alert was not shown.')));

  await page.getByRole('button', { name: /Guardar Distribución/i }).click();
  await expect(page.getByRole('button', { name: /Guardando/i })).toBeVisible({ timeout: 5_000 }).catch(() => undefined);

  const alertResult = await Promise.any([nativeDialogPromise, customAlertPromise, visibleStatusPromise]).catch(() => null);
  if (alertResult === null) {
    throw new Error(`Expected mesas save confirmation alert/status was not shown. Previous value: ${previousValue}; attempted value: ${count}.`);
  }

  if (alertResult.type === 'native') {
    expect(alertResult.dialog.message()).toContain('Configuración guardada.');
    await alertResult.dialog.accept();
  } else if (alertResult.type === 'custom') {
    await alertModal.getByRole('button', { name: /Aceptar/i }).click();
  }

  await expect(page.getByRole('button', { name: /Guardar Distribución/i })).toBeEnabled({ timeout: 15_000 });
}

async function expectSupportPanelCountAfterReopen(page: Page, expectedCount: number): Promise<void> {
  await openMesasModule(page);
  await openSupportMesasPanel(page);
  await expect(await mesasCountInput(page)).toHaveValue(String(expectedCount), { timeout: 15_000 });
}

async function openMesasModule(page: Page): Promise<void> {
  const mesasNav = page.locator('aside').getByRole('button', { name: /^Mesas$/ }).first();
  if (await mesasNav.isVisible().catch(() => false)) {
    await mesasNav.click();
  } else {
    await page.evaluate(() => {
      window.location.hash = '/tables';
    });
  }

  await expect(page.getByText(/Cargando mesas/i)).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /Plano de Mesas/i })).toBeVisible({ timeout: 20_000 });
  await expect(tableButton(page, 1)).toBeVisible({ timeout: 20_000 });
}

test('mesas count can be increased, reduced, and restored', async () => {
  test.setTimeout(180_000);

  let electronApp: ElectronApplication | undefined;
  let window: Page | undefined;
  let originalCount: number | undefined;
  const diagnostics: BrowserDiagnostics[] = [];

  try {
    ({ app: electronApp, window } = await launchApp(diagnostics));

    await openSupportMesasPanel(window);
    originalCount = await readMesasCount(window);

    const increasedCount = Math.min(100, Math.max(originalCount + 1, 2));
    const reducedCount = Math.max(1, increasedCount - 1);

    await saveMesasCount(window, increasedCount);
    await expectSupportPanelCountAfterReopen(window, increasedCount);
    await openMesasModule(window);
    await expect(tableButton(window, increasedCount)).toBeVisible({ timeout: 20_000 });

    await openSupportMesasPanel(window);
    await saveMesasCount(window, reducedCount);
    await electronApp.close();
    ({ app: electronApp, window } = await launchApp(diagnostics));
    await expectSupportPanelCountAfterReopen(window, reducedCount);
    await openMesasModule(window);
    await expect(tableButton(window, reducedCount)).toBeVisible({ timeout: 20_000 });
    await expect(tableButton(window, increasedCount)).toBeHidden({ timeout: 10_000 });
    const pageErrors = diagnostics.flatMap((entry) => entry.pageErrors);
    expect(pageErrors, `Unexpected Electron page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  } catch (error) {
    await attachDiagnosticsOnFailure(diagnostics);
    throw error;
  } finally {
    if (electronApp) {
      window = electronApp.windows()[0] ?? window;

      if (window && originalCount !== undefined) {
        try {
          await openSupportMesasPanel(window);
          const currentCount = await readMesasCount(window);
          if (currentCount !== originalCount) {
            await saveMesasCount(window, originalCount);
            await expectSupportPanelCountAfterReopen(window, originalCount);
          }
        } catch (restoreError) {
          await attachDiagnosticsOnFailure(diagnostics);
          throw restoreError;
        }
      }

      await electronApp.close();
    }
  }
});
