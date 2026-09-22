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
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'cloudix-compras-crud-'));
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

async function revealSidebar(page: Page): Promise<void> {
  // The sidebar can start collapsed (narrow Electron window / responsive
  // layout); reveal it so the navigation buttons inside <aside> are reachable.
  const showSidebar = page.getByRole('button', { name: 'Mostrar barra lateral' });
  if (await showSidebar.isVisible().catch(() => false)) {
    await showSidebar.click();
  }
}

async function waitForAppShell(page: Page): Promise<void> {
  await revealSidebar(page);
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
  const loginButton = page.locator('button:has-text("Iniciar Sesión")').first();
  if (await loginButton.isVisible().catch(() => false)) {
    await loginButton.click();
  } else {
    await page.keyboard.press('Enter');
  }
  
  await waitForAppShell(page);
}

test.describe('Compras E2E - Crear, Editar y Anular', () => {
  const diagnostics: BrowserDiagnostics[] = [];

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed') {
      await attachDiagnosticsOnFailure(diagnostics);
    }
  });

  test('debe registrar, editar y anular una compra de servicio', async () => {
    test.setTimeout(60_000);
    const { app, window, userDataDirectory } = await launchApp(diagnostics);

    try {
      console.log('[E2E] Paso 1: Ir a Compras');
      // Esperar a que el plan y el tenant estén listos tras login
      await expect(window.locator('text=/Plan /i')).toBeVisible({ timeout: 20_000 }).catch(() => {});

      // 1. Ir al Módulo de Compras
      const comprasNavBtn = window.locator('aside').getByRole('button', { name: /^Compras$/ }).first();
      if (await comprasNavBtn.isVisible().catch(() => false)) {
        await comprasNavBtn.click();
      } else {
        await window.evaluate(() => { window.location.hash = '/compras'; });
      }
      if (!(await window.locator('h2', { hasText: 'Módulo de Compras' }).isVisible().catch(() => false))) {
        await window.evaluate(() => { window.location.hash = '/compras'; });
      }
      await expect(window.locator('h2', { hasText: 'Módulo de Compras' })).toBeVisible({ timeout: 20_000 });

      // Esperar a que termine de cargar compras y se estabilice el render
      await expect(window.locator('text=/Cargando compras/i')).toHaveCount(0, { timeout: 20_000 }).catch(() => {});
      await window.waitForTimeout(1500);

      console.log('[E2E] Paso 2: Abrir modal Registrar Compra');
      // 2. Abrir Modal de Registrar Compra
      const registrarBtn = window.locator('button:has-text("Registrar Compra")').first();
      await expect(registrarBtn).toBeVisible({ timeout: 15_000 });
      await registrarBtn.click();
      await expect(window.locator('text="Registrar Factura de Compra"').first()).toBeVisible();

      // 3. Seleccionar Proveedor (o crear uno si no hay ninguno)
      const providerOptions = window.getByTestId('purchase-provider-option');
      if ((await providerOptions.count()) === 0) {
        console.log('[E2E] Creando proveedor de prueba...');
        await window.locator('button:has-text("Cancelar")').first().click();
        await window.locator('button:has-text("Proveedores")').click();
        await window.locator('button:has-text("Nuevo Proveedor")').click();
        await window.locator('label:has-text("Nombre Comercial *")').locator('..').locator('input').fill('Distribuidora Test');
        await window.locator('label:has-text("RNC / Cédula")').locator('..').locator('input').fill('101000001');
        await window.locator('button:has-text("Guardar Proveedor")').click();
        await expect(window.locator('text=/Proveedor creado/i')).toBeVisible({ timeout: 10_000 });
        await window.locator('button:has-text("Facturas de Compra")').click();
        await window.locator('button:has-text("Registrar Compra")').first().click();
      }
      await expect(providerOptions.first()).toBeVisible({ timeout: 15_000 });
      await providerOptions.first().click();

      // Validar si el ciclo de caja está abierto (si no, el botón Guardar estará bloqueado)
      const cicloCerrado = window.locator('text="Ciclo cerrado:"');
      if (await cicloCerrado.isVisible({ timeout: 1000 }).catch(() => false)) {
        throw new Error("❌ PRUEBA DETENIDA: Tu ciclo operativo está cerrado (el botón Guardar está deshabilitado). Abre la caja en el módulo de Cierre y vuelve a correr el test.");
      }

      // 4. Llenar Número Factura (NCF)
      const ncfTest = `B010000${Math.floor(Math.random() * 10000)}`;
      const ncfInput = window.locator('label:has-text("Número Factura / NCF *")').locator('..').locator('input');
      await ncfInput.fill(ncfTest);

      // 4.5. Eliminar la fila de insumo vacía que viene por defecto (porque tiene required y bloquearía el submit si no se llena)
      const removerFilaBtn = window.locator('button[title="Remover Fila"]').first();
      if (await removerFilaBtn.isVisible()) {
        await removerFilaBtn.click();
      }

      // 5. Llenar Monto Servicios (para saltar la tabla de insumos)
      const serviciosInput = window.locator('label:has-text("Monto Servicios")').locator('..').locator('input');
      await serviciosInput.fill('2500');

      console.log('[E2E] Paso 3: Guardando compra...');
      // 6. Guardar Compra
      await window.locator('button:has-text("Guardar Compra")').first().click();

      // Verificar si hay un mensaje de error rojo en la cabecera
      const errorMsg = window.locator('div.bg-\\[rgba\\(255\\,113\\,108\\,0\\.06\\)\\] span.text-\\[\\#ff716c\\]').first();
      
      // 7. Esperar que se cierre el modal y salga el mensaje de éxito
      try {
        await expect(window.locator('text=/Compra registrada/i')).toBeVisible({ timeout: 5000 });
      } catch (e) {
        if (await errorMsg.isVisible().catch(() => false)) {
          const text = await errorMsg.textContent();
          throw new Error(`La compra falló con el error en pantalla: ${text}`);
        }
        throw e;
      }

      console.log('[E2E] Paso 4: Compra registrada, buscando fila...');
      // 8. Buscar la fila en la tabla que contiene el NCF recién creado
      const row = window.locator('tr', { hasText: ncfTest });
      await expect(row).toBeVisible();

      console.log('[E2E] Paso 5: Editando datos fiscales...');
      // 9. Clic en el botón "Editar Datos Fiscales" (el del lapicito)
      await row.locator('button[title="Editar Datos Fiscales"]').click();

      // 10. Verificar que abrió el modal de Edición
      await expect(window.locator('text="Editar Datos Fiscales"').first()).toBeVisible();

      // 11. Modificar el NCF
      const ncfEditInput = window.locator('label:has-text("Número Factura / NCF *")').locator('..').locator('input');
      const ncfNuevo = ncfTest + 'MOD';
      await ncfEditInput.fill(ncfNuevo);

      // 12. Guardar los cambios
      await window.locator('button:has-text("Guardar Cambios")').first().click();

      // 13. Verificar el mensaje de éxito de edición
      await expect(window.locator('text=/Datos fiscales actualizados/i')).toBeVisible({ timeout: 10000 });

      console.log('[E2E] Paso 6: Datos fiscales actualizados. Buscando fila modificada...');
      // 14. Confirmar que la tabla ahora muestra el nuevo NCF
      const updatedRow = window.locator('tr', { hasText: ncfNuevo });
      await expect(updatedRow).toBeVisible();

      console.log('[E2E] Paso 7: Anulando compra...');
      // 15. Anular la compra y confirmar el diálogo de seguridad.
      await updatedRow.locator('button[title="Anular Compra (Revertir Stock)"]').click();
      await expect(window.locator('h3', { hasText: '¿Anular y Revertir Compra?' })).toBeVisible();
      await window.getByRole('button', { name: 'Sí, Anular Compra' }).click();

      console.log('[E2E] Paso 8: Verificando anulación...');
      // 16. La compra deja de aparecer después de revertir y sincronizar el borrado.
      await expect(window.locator('text=/Compra anulada exitosamente/i')).toBeVisible({ timeout: 10_000 });
      await expect(window.locator('tr', { hasText: ncfNuevo })).toHaveCount(0, { timeout: 10_000 });
      console.log('[E2E] ✅ Compra anulada y removida exitosamente!');

    } finally {
      await app.close();
      await rm(userDataDirectory, { recursive: true, force: true }).catch(() => {});
    }
  });
});
