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

  try {
    if (await emailInput.isVisible()) await emailInput.fill(email, { timeout: 2000 });
    if (await passwordInput.isVisible()) await passwordInput.fill(password, { timeout: 2000 });
  } catch (e) {
    // Ignore fill errors if it disappeared
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
      if (attempt === 3) throw error;
    });

    if (await page.locator('aside').getByRole('button', { name: /^Mesas$/ }).isVisible().catch(() => false)) {
      break;
    }
  }

  await expect(page.locator('aside').getByRole('button', { name: /^Mesas$/ })).toBeVisible({ timeout: 20_000 });
}

async function openAjustesModule(page: Page): Promise<void> {
  const ajustesNav = page.locator('aside').getByRole('button', { name: /^Ajustes$/ }).first();
  
  if (await ajustesNav.isVisible().catch(() => false)) {
    await ajustesNav.click();
  } else {
    await page.evaluate(() => { window.location.hash = '/ajustes'; });
  }

  await expect(page.getByRole('heading', { name: /Configuración del Negocio/i })).toBeVisible({ timeout: 20_000 });
}

test('tenant fiscal settings can be saved and persisted after navigation', async () => {
  test.setTimeout(180_000);

  let electronApp: ElectronApplication | undefined;
  let window: Page | undefined;
    let originalFiscalMode: string | undefined;
    let originalB01Sequence: string | undefined;
    const diagnostics: BrowserDiagnostics[] = [];


  try {
    ({ app: electronApp, window } = await launchApp(diagnostics));

    await openAjustesModule(window);
    
    // Read current fiscal mode
    const modoFiscalTrigger = window.locator('label', { hasText: 'Modo Fiscal' }).locator('..').locator('button[role="combobox"]');
    await expect(modoFiscalTrigger).toBeVisible({ timeout: 15_000 });
    originalFiscalMode = await modoFiscalTrigger.textContent() || '';
    
    expect(originalFiscalMode.length).toBeGreaterThan(0);
    
    // Switch to NCF Tradicional to ensure fiscal inputs are visible for B01 testing
    if (!originalFiscalMode.includes('NCF')) {
      await modoFiscalTrigger.click();
      await window.getByRole('option', { name: 'NCF Tradicional', exact: true }).waitFor({ state: 'visible' });
      await window.getByRole('option', { name: 'NCF Tradicional', exact: true }).click();
      await expect(modoFiscalTrigger).toHaveText('NCF Tradicional', { timeout: 5_000 });
    }

    // Locate B01 input and read its value
    const b01InputContainer = window.locator('div').filter({ has: window.locator('input[type="number"]') }).filter({ hasText: 'B01' }).first();
    const b01Input = b01InputContainer.locator('input[type="number"]').first();
    await expect(b01Input).toBeVisible({ timeout: 5_000 });
    originalB01Sequence = await b01Input.inputValue();
    
    // Increment it by 1 to set a deterministic test value
    const testB01Value = (parseInt(originalB01Sequence || '0', 10) + 1).toString();
    await b01Input.fill(testB01Value);
    
    // Guardar Cambios
    const guardarBtn = window.getByRole('button', { name: /Guardar Cambios/i });

    await expect(guardarBtn).toBeEnabled();
    await guardarBtn.click();
    
    // Check if the message appears, but don't fail if it doesn't immediately (maybe it reloaded)
    await window.waitForTimeout(2000);
    
    // Real full reload instead of just navigating away
    await window.reload();
    await waitForLoginOrShell(window);
    await waitForAppShell(window);
    
    // Navigate back to Ajustes
    await openAjustesModule(window);
    
    // Assert mode is still NCF Tradicional
    await expect(modoFiscalTrigger).toHaveText('NCF Tradicional', { timeout: 15_000 });
    
    // Locate B01 input again and assert its value matches what we saved
    const b01InputReloadedContainer = window.locator('div').filter({ has: window.locator('input[type="number"]') }).filter({ hasText: 'B01' }).first();
    const b01InputReloaded = b01InputReloadedContainer.locator('input[type="number"]').first();
    await expect(b01InputReloaded).toHaveValue(testB01Value, { timeout: 5_000 });
    
    // Restore original mode and B01 value
    await b01InputReloaded.fill(originalB01Sequence);
    
    if (!originalFiscalMode.includes('NCF')) {
      await modoFiscalTrigger.click();
      await window.getByRole('option', { name: originalFiscalMode, exact: true }).waitFor({ state: 'visible' });
      await window.getByRole('option', { name: originalFiscalMode, exact: true }).click();
      await expect(modoFiscalTrigger).toHaveText(originalFiscalMode, { timeout: 5_000 });
    }
    await guardarBtn.click();
    await window.waitForTimeout(2000);
    
    const pageErrors = diagnostics.flatMap((entry) => entry.pageErrors);
    expect(pageErrors, `Unexpected Electron page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  } catch (error) {
    await attachDiagnosticsOnFailure(diagnostics);
    throw error;
  } finally {
    if (electronApp) {
      window = electronApp.windows()[0] ?? window;
      if (window && (originalFiscalMode !== undefined || originalB01Sequence !== undefined)) {
        try {
          await openAjustesModule(window);
          const modoFiscalTrigger = window.locator('label', { hasText: 'Modo Fiscal' }).locator('..').locator('button[role="combobox"]');
          const currentCount = await modoFiscalTrigger.textContent();
          
          let needsSave = false;

          // Make sure we are in a mode that shows B01 to restore it if needed
          if (originalB01Sequence !== undefined) {
             if (currentCount?.includes('Recibo Interno')) {
                await modoFiscalTrigger.click();
                await window.getByRole('option', { name: 'NCF Tradicional', exact: true }).click();
             }
             const b01InputContainer = window.locator('div').filter({ has: window.locator('input[type="number"]') }).filter({ hasText: 'B01' }).first();
             const b01Input = b01InputContainer.locator('input[type="number"]').first();
             if (await b01Input.isVisible() && await b01Input.inputValue() !== originalB01Sequence) {
                await b01Input.fill(originalB01Sequence);
                needsSave = true;
             }
          }

          if (originalFiscalMode !== undefined && currentCount !== originalFiscalMode) {
             await modoFiscalTrigger.click();
             await window.getByRole('option', { name: originalFiscalMode, exact: true }).waitFor({ state: 'visible' });
             await window.getByRole('option', { name: originalFiscalMode, exact: true }).click();
             await expect(modoFiscalTrigger).toHaveText(originalFiscalMode, { timeout: 5_000 });
             needsSave = true;
          }
          
          if (needsSave) {
             const guardarBtn = window.getByRole('button', { name: /Guardar Cambios/i });
             await guardarBtn.click();
             await window.waitForTimeout(2000);
          }
        } catch (restoreError) {
          await attachDiagnosticsOnFailure(diagnostics);
          console.error('Failed to restore settings:', restoreError);
        }
      }
      await electronApp.close();
    }
  }
});
