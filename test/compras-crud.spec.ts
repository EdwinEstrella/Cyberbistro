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
    page.locator('text="Mesas"').first().waitFor({ state: 'visible', timeout: 20_000 }),
    page.locator('text="Cerrar Sesión"').first().waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
}

async function waitForAppShell(page: Page): Promise<void> {
  await expect(page.locator('text="Mesas"').first()).toBeVisible({ timeout: 20_000 });
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

test.describe('Compras E2E - Crear, Editar y Anular', () => {
  const diagnostics: BrowserDiagnostics[] = [];

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed') {
      await attachDiagnosticsOnFailure(diagnostics);
    }
  });

  test('debe registrar, editar y anular una compra de servicio', async () => {
    const { app, window } = await launchApp(diagnostics);

    try {
      // 1. Ir al Módulo de Compras
      await window.locator('text="Compras"').first().click();
      await expect(window.locator('h2', { hasText: 'Módulo de Compras' })).toBeVisible();

      // 2. Abrir Modal de Registrar Compra
      await window.locator('button:has-text("Registrar Compra")').first().click();
      await expect(window.locator('text="Registrar Factura de Compra"').first()).toBeVisible();

      // 3. Seleccionar Proveedor (el primero disponible)
      const providerOptions = window.getByTestId('purchase-provider-option');
      if ((await providerOptions.count()) === 0) {
        throw new Error("❌ PRUEBA DETENIDA: No tienes ningún Proveedor registrado. Cierra esto, ve a la pestaña de 'Proveedores', crea uno y vuelve a correr el test.");
      }
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

      // 8. Buscar la fila en la tabla que contiene el NCF recién creado
      const row = window.locator('tr', { hasText: ncfTest });
      await expect(row).toBeVisible();

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

      // 14. Confirmar que la tabla ahora muestra el nuevo NCF
      const updatedRow = window.locator('tr', { hasText: ncfNuevo });
      await expect(updatedRow).toBeVisible();

      // 15. Anular la compra y confirmar el diálogo de seguridad.
      await updatedRow.locator('button[title="Anular Compra (Revertir Stock)"]').click();
      await expect(window.locator('h3', { hasText: '¿Anular y Revertir Compra?' })).toBeVisible();
      await window.getByRole('button', { name: 'Sí, Anular Compra' }).click();

      // 16. La compra deja de aparecer después de revertir y sincronizar el borrado.
      await expect(window.locator('text=/Compra anulada exitosamente/i')).toBeVisible({ timeout: 10_000 });
      await expect(window.locator('tr', { hasText: ncfNuevo })).toHaveCount(0, { timeout: 10_000 });

    } finally {
      await app.close();
    }
  });
});
