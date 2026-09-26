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
 *   - CYBERBISTRO_E2E_PRODUCT → optional; a specific catalog product name. When
 *     unset, the journey sells the first available product on the grid.
 *   - CYBERBISTRO_E2E_MESA (default "01") → a table that is FREE at start.
 *   - An OPEN operational cycle (cobro is rejected without one).
 *
 * Running it charges a real sale: it creates an order and an invoice (consuming
 * an NCF) in that tenant. Use a throwaway test tenant.
 *
 * Selectors track the current POS DOM; adjust them here if the UI changes.
 */

const EMAIL = process.env.CYBERBISTRO_E2E_EMAIL;
const PASSWORD = process.env.CYBERBISTRO_E2E_PASSWORD;
const PRODUCT = process.env.CYBERBISTRO_E2E_PRODUCT;
const MESA = process.env.CYBERBISTRO_E2E_MESA ?? "01";
const hasJourneyConfig = Boolean(EMAIL && PASSWORD);

async function launchApp(): Promise<{ app: ElectronApplication; page: Page; userDataDirectory: string }> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-journey-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
  return { app, page: await app.firstWindow(), userDataDirectory };
}

test("POS sales journey persists the order and the invoice to SQLite", async () => {
  test.skip(
    !hasJourneyConfig,
    "Set CYBERBISTRO_E2E_EMAIL and CYBERBISTRO_E2E_PASSWORD (linked test tenant) to run this journey.",
  );
  // Real-backend login plus the full order/checkout flow needs more than the
  // default 30s budget on CI.
  test.setTimeout(90_000);

  const { app, page, userDataDirectory } = await launchApp();
  // Auto-dismiss native alerts (e.g. "no hay un ciclo operativo abierto") so a
  // blocked precondition surfaces as a clear assertion failure, not a hang.
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
  const mesaNumero = Number(MESA);

  const countConsumosForMesa = () =>
    page.evaluate((n) => window.electronAPI!.listConsumos!({ mesaNumero: n }).then((r) => r.data.length), mesaNumero);
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
    console.log("[JOURNEY] Step 1: Filling login form...");
    await page.getByLabel("Correo").fill(EMAIL!);
    await page.getByLabel("Contraseña").fill(PASSWORD!);
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    console.log("[JOURNEY] Step 1: Login submitted ✓");

    // 2. Wait for the POS. The mesa selector is only present once the tenant is
    //    loaded. If the account lands elsewhere, navigate to Ventas/POS first.
    console.log("[JOURNEY] Step 2: Waiting for mesa selector...");
    const mesaSelector = page.getByRole("button", { name: /Seleccionar mesa|Mesa \d+/ });
    await expect(mesaSelector).toBeVisible({ timeout: 30_000 });
    console.log("[JOURNEY] Step 2: Mesa selector visible ✓");

    const invoicesBefore = await countInvoices();
    const consumosBefore = await countConsumosForMesa();
    console.log(`[JOURNEY] Baseline: ${invoicesBefore} invoices, ${consumosBefore} consumos for mesa ${MESA}`);

    // 3. Select the table. The dropdown labels every mesa zero-padded to two
    //    digits (e.g. "01"), so normalize whatever MESA was configured ("1" or
    //    "01") to that format before matching.
    console.log("[JOURNEY] Step 3: Selecting mesa...");
    const mesaLabel = String(Number(MESA)).padStart(2, "0");
    await mesaSelector.click();
    await page.getByRole("button", { name: mesaLabel, exact: true }).click();
    console.log(`[JOURNEY] Step 3: Mesa ${mesaLabel} selected ✓`);

    // 4. Add a product (the whole card is clickable). Pin a specific KITCHEN dish
    //    via CYBERBISTRO_E2E_PRODUCT to also exercise the orange path; otherwise
    //    the first card is used and only the SQLite write is asserted.
    console.log("[JOURNEY] Step 4: Looking for product card...");
    const product = PRODUCT
      ? page.getByText(PRODUCT, { exact: false }).first()
      : page.locator("div.cursor-pointer.group").first();
    await expect(product).toBeVisible();
    console.log("[JOURNEY] Step 4: Product card visible, clicking...");
    await product.click();
    console.log("[JOURNEY] Step 4: Product added to cart ✓");

    // 5. Send to kitchen ("+ Agregar" in the cart section).
    console.log("[JOURNEY] Step 5: Looking for '+ Agregar' button...");
    const agregarBtn = page.getByRole("button", { name: "+ Agregar" });
    const agregarVisible = await agregarBtn.isVisible().catch(() => false);
    console.log(`[JOURNEY] Step 5: '+ Agregar' visible = ${agregarVisible}`);
    if (!agregarVisible) {
      // Dump the DOM state of all visible buttons for debugging
      const buttons = await page.locator("button:visible").allTextContents();
      console.log(`[JOURNEY] DEBUG: Visible buttons = ${JSON.stringify(buttons)}`);
    }
    await agregarBtn.click();
    console.log("[JOURNEY] Step 5: Sent to kitchen ✓");

    // 6. Core assertion: the order reflects in SQLite immediately (any state),
    //    without a cloud round-trip — this is what the dual-engine bug broke.
    console.log("[JOURNEY] Step 6: Polling consumos in SQLite...");
    await expect.poll(countConsumosForMesa, { timeout: 10_000 }).toBeGreaterThan(consumosBefore);
    console.log("[JOURNEY] Step 6: Consumos in SQLite ✓");
    //    When a kitchen dish was sold, it also shows as the orange "enviado_cocina"
    //    line in the account panel.
    if ((await countConsumosSentToKitchen()) > 0) {
      await expect(page.getByText(/ENVIADO COCINA/i).first()).toBeVisible();
      console.log("[JOURNEY] Step 6b: ENVIADO COCINA visible ✓");
    }

    // 7. Charge the table. "Cobrar" exists in both the mesa and takeout panels,
    //    so target the visible one. Match the accessible name exactly: a
    //    substring match also hits the "Cuentas por Cobrar" sidebar item.
    console.log("[JOURNEY] Step 7: Clicking 'Cobrar'...");
    await page
      .getByRole("button", { name: "Cobrar", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    console.log("[JOURNEY] Step 7: Cobrar clicked, waiting for 'Confirmar Pago'...");
    await page
      .getByRole("button", { name: "Confirmar Pago", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    console.log("[JOURNEY] Step 7: Confirmar Pago clicked ✓");

    // 8. A new invoice must land in SQLite.
    console.log("[JOURNEY] Step 8: Polling invoices in SQLite...");
    await expect.poll(countInvoices, { timeout: 15_000 }).toBeGreaterThan(invoicesBefore);
    console.log("[JOURNEY] Step 8: Invoice in SQLite ✓ — JOURNEY PASSED!");
  } finally {
    await app.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
