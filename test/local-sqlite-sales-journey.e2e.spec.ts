import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Real end-to-end sales journey: login → send to kitchen → assert the consumo
 * landed in SQLite as "enviado_cocina" (orange) → charge → assert the invoice
 * landed in SQLite.
 *
 * WHY THIS SKIPS BY DEFAULT: login is Supabase-authenticated and the session is
 * a signed JWT that cannot be faked or seeded locally, so this journey needs a
 * REAL account linked to a test tenant. It runs only when the env vars below are
 * set, exactly like login-local-first.e2e.spec.ts.
 *
 * The test tenant must have, before the run:
 *   - CYBERBISTRO_E2E_EMAIL / CYBERBISTRO_E2E_PASSWORD → a linked account.
 *   - CYBERBISTRO_E2E_PRODUCT → the exact name of a catalog product to sell.
 *   - CYBERBISTRO_E2E_MESA (default "01") → a table that is FREE at start.
 *   - An OPEN operational cycle (cobro is rejected without one).
 *
 * Selectors track the current POS DOM; adjust them here if the UI changes.
 */

const EMAIL = process.env.CYBERBISTRO_E2E_EMAIL;
const PASSWORD = process.env.CYBERBISTRO_E2E_PASSWORD;
const PRODUCT = process.env.CYBERBISTRO_E2E_PRODUCT;
const MESA = process.env.CYBERBISTRO_E2E_MESA ?? "01";
const hasJourneyConfig = Boolean(EMAIL && PASSWORD && PRODUCT);

async function launchApp(): Promise<{ app: ElectronApplication; page: Page; userDataDirectory: string }> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-journey-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
  return { app, page: await app.firstWindow(), userDataDirectory };
}

test("POS sales journey persists the order and the invoice to SQLite", async () => {
  test.skip(
    !hasJourneyConfig,
    "Set CYBERBISTRO_E2E_EMAIL, CYBERBISTRO_E2E_PASSWORD and CYBERBISTRO_E2E_PRODUCT (linked test tenant) to run this journey.",
  );

  const { app, page, userDataDirectory } = await launchApp();
  const mesaNumero = Number(MESA);

  const countConsumosSentToKitchen = () =>
    page.evaluate(
      (n) => window.electronAPI!.listConsumos!({ mesaNumero: n }).then(
        (r) => r.data.filter((c) => (c as { estado?: string }).estado === "enviado_cocina").length,
      ),
      mesaNumero,
    );
  const countInvoices = () =>
    page.evaluate(() => window.electronAPI!.listInvoices!({}).then((r) => r.data.length));

  try {
    // 1. Login (Supabase-authenticated).
    await page.getByLabel("Correo").fill(EMAIL!);
    await page.getByLabel("Contraseña").fill(PASSWORD!);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();

    // 2. Wait for the POS. The mesa selector is only present once the tenant is
    //    loaded. If the account lands elsewhere, navigate to Ventas/POS first.
    const mesaSelector = page.getByRole("button", { name: /Seleccionar mesa|Mesa \d+/ });
    await expect(mesaSelector).toBeVisible({ timeout: 30_000 });

    const invoicesBefore = await countInvoices();

    // 3. Select the (free) table by its zero-padded number.
    await mesaSelector.click();
    await page.getByRole("button", { name: MESA, exact: true }).click();

    // 4. Add the product to the cart (the whole product card is clickable).
    await page.getByText(PRODUCT!, { exact: false }).first().click();

    // 5. Send to kitchen ("+ Agregar" in the cart section).
    await page.getByRole("button", { name: "+ Agregar" }).click();

    // 6. The order must reflect immediately: the consumo is in SQLite as
    //    "enviado_cocina" (the orange state), without a cloud round-trip...
    await expect.poll(countConsumosSentToKitchen, { timeout: 10_000 }).toBeGreaterThan(0);
    //    ...and the account panel shows the orange "ENVIADO COCINA" tag.
    await expect(page.getByText(/ENVIADO COCINA/i).first()).toBeVisible();

    // 7. Charge the table.
    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByRole("button", { name: "Confirmar Pago" }).click();

    // 8. A new invoice must land in SQLite.
    await expect.poll(countInvoices, { timeout: 15_000 }).toBeGreaterThan(invoicesBefore);
  } finally {
    await app.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
