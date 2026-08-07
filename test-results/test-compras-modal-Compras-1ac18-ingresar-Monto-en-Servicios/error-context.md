# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test\compras-modal.spec.ts >> Compras Module - Formato 606 >> debe auto-calcular el ITBIS facturado al ingresar Monto en Servicios
- Location: test\compras-modal.spec.ts:90:7

# Error details

```
Error: electron.launch: Target page, context or browser has been closed
Browser logs:

<launching> "C:\Users\Edwin\Desktop\Trabajos\cyberbistro\node_modules\electron\dist\electron.exe" "-r" "C:\Users\Edwin\Desktop\Trabajos\cyberbistro\node_modules\playwright-core\lib\server\electron\loader.js" "--inspect=0" "--remote-debugging-port=0" "." 
<launched> pid=13908
[pid=13908][out] 
[pid=13908][err] Debugger listening on ws://127.0.0.1:56340/318eb077-2af4-4dd8-a417-db96b6f999b7
[pid=13908][err] For help, see: https://nodejs.org/en/docs/inspector
[pid=13908][err] Debugger attached.
[pid=13908][err] 
[pid=13908][err] DevTools listening on ws://127.0.0.1:56342/devtools/browser/94f0785f-8870-40d3-8f50-c38385991f7d
Call log:
  - <launching> "C:\Users\Edwin\Desktop\Trabajos\cyberbistro\node_modules\electron\dist\electron.exe" "-r" "C:\Users\Edwin\Desktop\Trabajos\cyberbistro\node_modules\playwright-core\lib\server\electron\loader.js" "--inspect=0" "--remote-debugging-port=0" "."
  - <launched> pid=13908
  - [pid=13908][out]
  - [pid=13908][err] Debugger listening on ws://127.0.0.1:56340/318eb077-2af4-4dd8-a417-db96b6f999b7
  - [pid=13908][err] For help, see: https://nodejs.org/en/docs/inspector
  - <ws connecting> ws://127.0.0.1:56340/318eb077-2af4-4dd8-a417-db96b6f999b7
  - <ws connected> ws://127.0.0.1:56340/318eb077-2af4-4dd8-a417-db96b6f999b7
  - [pid=13908][err] Debugger attached.
  - [pid=13908][err]
  - [pid=13908][err] DevTools listening on ws://127.0.0.1:56342/devtools/browser/94f0785f-8870-40d3-8f50-c38385991f7d
  - <ws connecting> ws://127.0.0.1:56342/devtools/browser/94f0785f-8870-40d3-8f50-c38385991f7d
  - <ws connected> ws://127.0.0.1:56342/devtools/browser/94f0785f-8870-40d3-8f50-c38385991f7d
  - <ws disconnected> ws://127.0.0.1:56340/318eb077-2af4-4dd8-a417-db96b6f999b7 code=1005 reason=
  - <ws disconnected> ws://127.0.0.1:56342/devtools/browser/94f0785f-8870-40d3-8f50-c38385991f7d code=1006 reason=
  - [pid=13908] <kill>
  - [pid=13908] <will force kill>
  - [pid=13908] taskkill stderr: ERROR: no se encontr� el proceso "13908".
  - [pid=13908] <process did exit: exitCode=0, signal=null>
  - [pid=13908] starting temporary directories cleanup
  - [pid=13908] finished temporary directories cleanup

```

# Test source

```ts
  1   | import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
  2   | 
  3   | const TEST_EMAIL_ENV = 'CYBERBISTRO_TEST_EMAIL';
  4   | const TEST_PASSWORD_ENV = 'CYBERBISTRO_TEST_PASSWORD';
  5   | 
  6   | interface BrowserDiagnostics {
  7   |   consoleMessages: string[];
  8   |   pageErrors: string[];
  9   | }
  10  | 
  11  | function attachDiagnostics(page: Page): BrowserDiagnostics {
  12  |   const diagnostics: BrowserDiagnostics = { consoleMessages: [], pageErrors: [] };
  13  |   page.on('console', (message) => {
  14  |     if (['error', 'warning', 'info'].includes(message.type())) {
  15  |       diagnostics.consoleMessages.push(`[${message.type()}] ${message.text()}`);
  16  |     }
  17  |   });
  18  |   page.on('pageerror', (error) => {
  19  |     diagnostics.pageErrors.push(error.stack || error.message);
  20  |   });
  21  |   return diagnostics;
  22  | }
  23  | 
  24  | async function attachDiagnosticsOnFailure(diagnostics: BrowserDiagnostics[]): Promise<void> {
  25  |   const output = diagnostics
  26  |     .flatMap((entry, index) => [
  27  |       `# Window ${index + 1}`,
  28  |       '## Page errors',
  29  |       ...(entry.pageErrors.length ? entry.pageErrors : ['<none>']),
  30  |       '## Console',
  31  |       ...(entry.consoleMessages.length ? entry.consoleMessages : ['<none>'])
  32  |     ])
  33  |     .join('\n');
  34  |   test.info().attachments.push({
  35  |     name: 'browser-diagnostics.md',
  36  |     contentType: 'text/markdown',
  37  |     body: Buffer.from(output)
  38  |   });
  39  | }
  40  | 
  41  | async function launchApp(diagnostics: BrowserDiagnostics[]): Promise<{ app: ElectronApplication; window: Page }> {
> 42  |   const app = await electron.launch({ args: ['.'] });
      |               ^ Error: electron.launch: Target page, context or browser has been closed
  43  |   const window = await app.firstWindow();
  44  |   diagnostics.push(attachDiagnostics(window));
  45  |   await loginIfNeeded(window);
  46  |   await waitForAppShell(window);
  47  |   return { app, window };
  48  | }
  49  | 
  50  | async function waitForLoginOrShell(page: Page): Promise<void> {
  51  |   await Promise.race([
  52  |     page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 20_000 }),
  53  |     page.locator('aside').getByRole('button', { name: /^Mesas$/ }).waitFor({ state: 'visible', timeout: 20_000 }),
  54  |     page.locator('button:has-text("Cerrar Sesión")').first().waitFor({ state: 'visible', timeout: 20_000 }),
  55  |   ]);
  56  | }
  57  | 
  58  | async function waitForAppShell(page: Page): Promise<void> {
  59  |   await expect(page.locator('aside').getByRole('button', { name: /^Mesas$/ })).toBeVisible({ timeout: 20_000 });
  60  | }
  61  | 
  62  | async function loginIfNeeded(page: Page): Promise<void> {
  63  |   await waitForLoginOrShell(page);
  64  | 
  65  |   const emailInput = page.locator('input[type="email"]').first();
  66  |   if (!(await emailInput.isVisible().catch(() => false))) {
  67  |     return;
  68  |   }
  69  | 
  70  |   const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  71  |   const email = process.env[TEST_EMAIL_ENV] || 'test@test.com';
  72  |   const password = process.env[TEST_PASSWORD_ENV] || 'test123456';
  73  | 
  74  |   await emailInput.fill(email);
  75  |   await passwordInput.fill(password);
  76  |   await page.keyboard.press('Enter');
  77  |   
  78  |   await waitForAppShell(page);
  79  | }
  80  | 
  81  | test.describe('Compras Module - Formato 606', () => {
  82  |   const diagnostics: BrowserDiagnostics[] = [];
  83  | 
  84  |   test.afterEach(async ({}, testInfo) => {
  85  |     if (testInfo.status === 'failed') {
  86  |       await attachDiagnosticsOnFailure(diagnostics);
  87  |     }
  88  |   });
  89  | 
  90  |   test('debe auto-calcular el ITBIS facturado al ingresar Monto en Servicios', async () => {
  91  |     const { app, window } = await launchApp(diagnostics);
  92  | 
  93  |     try {
  94  |       // 1. Ir a Compras
  95  |       await window.locator('aside').getByRole('button', { name: /^Compras$/ }).click();
  96  |       await expect(window.locator('h2', { hasText: 'Módulo de Compras' })).toBeVisible();
  97  | 
  98  |       // 2. Abrir Modal de Registrar Compra
  99  |       await window.getByRole('button', { name: /Registrar Compra/i }).click();
  100 |       await expect(window.getByRole('heading', { name: /Registrar Factura de Compra/i })).toBeVisible();
  101 | 
  102 |       // 3. Buscar el campo "Monto Servicios" y llenarlo
  103 |       const montoServiciosInput = window.locator('input[placeholder="RD$ 0.00"]').nth(0); // Might be tricky, let's use label
  104 |       
  105 |       // Let's locate inputs by adjacent labels
  106 |       const montoServiciosLabel = window.locator('label', { hasText: 'Monto Servicios' });
  107 |       await montoServiciosLabel.locator('..').locator('input').fill('1000');
  108 | 
  109 |       // 4. Verificar el autocalculo del ITBIS (18%)
  110 |       const itbisFacturadoLabel = window.locator('label', { hasText: 'ITBIS Facturado' });
  111 |       const itbisFacturadoInput = itbisFacturadoLabel.locator('..').locator('input');
  112 |       await expect(itbisFacturadoInput).toHaveValue('180.00');
  113 | 
  114 |       // 5. Verificar que el Monto Total Factura y el Monto a Pagar se actualizan
  115 |       await expect(window.locator('span', { hasText: /^RD\$ 1,180\.00$/ }).first()).toBeVisible();
  116 | 
  117 |       // Close modal
  118 |       await window.getByRole('button', { name: /Cancelar/i }).click();
  119 | 
  120 |     } finally {
  121 |       await app.close();
  122 |     }
  123 |   });
  124 | });
  125 | 
```