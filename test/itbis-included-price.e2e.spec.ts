import { expect, test, _electron as electron, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mainWindow } from "./support/electronMainWindow";

/**
 * ITBIS included in price, end to end: the tenant setting "ITBIS incluido en el
 * precio" changes how the checkout modal splits the menu price, and the persisted
 * factura matches what the modal showed.
 *
 * WHY THIS SKIPS BY DEFAULT: login is Supabase-authenticated (signed JWT that
 * cannot be seeded locally), so this needs the same linked test tenant as
 * local-sqlite-sales-journey.e2e.spec.ts:
 *   - CYBERBISTRO_E2E_EMAIL / CYBERBISTRO_E2E_PASSWORD → linked account.
 *   - CYBERBISTRO_E2E_PRODUCT → optional product name (first card otherwise).
 *   - CYBERBISTRO_E2E_MESA (default "01") → a table that is FREE at start.
 *   - An OPEN operational cycle.
 *
 * Price-agnostic: the menu price P is read from the checkout modal, so the
 * assertions hold for any product price (P = 100 gives 84.75 / 15.25 / 100):
 *   ON : subtotal = round2(P / 1.18), itbis = P - subtotal, total = P,
 *        with propina: propina = round2(P * 0.10), total = P + propina.
 *   OFF: subtotal = P, itbis = round2(P * 0.18), total = P + itbis.
 *
 * CI DEPENDENCY: the setting is persisted in tenants.itbis_incluido_en_precio.
 * The E2E Supabase project must have that column (see
 * supabase/migrations/*_add_tenant_itbis_incluido_en_precio.sql); without it the
 * save does not persist the flag and this spec fails at the "ON" step.
 *
 * SIDE EFFECTS: toggles a tenant setting on the shared test tenant (the original
 * value is restored in `finally`), creates one order and charges one invoice.
 */

const EMAIL = process.env.CYBERBISTRO_E2E_EMAIL;
const PASSWORD = process.env.CYBERBISTRO_E2E_PASSWORD;
const PRODUCT = process.env.CYBERBISTRO_E2E_PRODUCT;
const MESA = process.env.CYBERBISTRO_E2E_MESA ?? "01";
const hasConfig = Boolean(EMAIL && PASSWORD);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const parseMoney = (text: string | null) => Number((text ?? "").replace(/[^0-9.]/g, ""));

// Same tree-kill teardown as the sales journey: the checkout print dialog can
// block a graceful app.close() on printerless runners.
async function closeApp(app: ElectronApplication): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), 10_000);
  });
  const closing = app.close().then(() => "closed" as const, () => "closed" as const);
  const result = await Promise.race([closing, timedOut]);
  clearTimeout(timer);
  if (result === "closed") return;

  const child = app.process();
  if (child.pid === undefined || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => resolve());
    });
  } else {
    child.kill("SIGKILL");
  }
  await exited;
}

async function login(page: Page): Promise<void> {
  await page.getByLabel("Correo").fill(EMAIL!);
  await page.getByLabel("Contraseña").fill(PASSWORD!);
  await page.getByRole("button", { name: "Iniciar Sesión" }).click();
}

const mesaSelector = (page: Page) => page.getByRole("button", { name: /Seleccionar mesa|Mesa \d+/ });

/**
 * Reload the renderer so Dashboard re-reads the tenant billing settings. The
 * hash route survives a reload, so go back to "/" first: Login redirects an
 * authenticated session to its default (POS) route.
 */
async function reloadToPos(page: Page): Promise<void> {
  await page.evaluate(() => { window.location.hash = "/"; });
  await page.reload();
  const email = page.getByLabel("Correo");
  await expect(email.or(mesaSelector(page)).first()).toBeVisible({ timeout: 30_000 });
  if (await email.isVisible().catch(() => false)) await login(page);
  await expect(mesaSelector(page)).toBeVisible({ timeout: 30_000 });
}

async function openAjustes(page: Page): Promise<void> {
  const nav = page.locator("aside").getByRole("button", { name: /^Ajustes$/ }).first();
  if (await nav.isVisible().catch(() => false)) {
    await nav.click();
  } else {
    await page.evaluate(() => { window.location.hash = "/ajustes"; });
  }
  await expect(page.getByRole("heading", { name: /Configuración del Negocio/i })).toBeVisible({ timeout: 20_000 });
}

/** Sets the Ajustes checkbox, saves, and returns the value it had before. */
async function setItbisIncluded(page: Page, value: boolean): Promise<boolean> {
  await openAjustes(page);
  const checkbox = page.getByLabel("ITBIS incluido en el precio");
  await expect(checkbox).toBeVisible({ timeout: 15_000 });
  const previous = await checkbox.isChecked();
  if (previous !== value) {
    await checkbox.setChecked(value);
    await page.getByRole("button", { name: /Guardar Cambios/i }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible({ timeout: 15_000 });
  }
  // Persistence check: the toggle survives a full reload.
  await reloadToPos(page);
  await openAjustes(page);
  await expect(page.getByLabel("ITBIS incluido en el precio")).toBeChecked({ checked: value, timeout: 15_000 });
  return previous;
}

async function selectMesa(page: Page): Promise<void> {
  await mesaSelector(page).click();
  await page.getByRole("button", { name: String(Number(MESA)).padStart(2, "0"), exact: true }).click();
}

async function openCheckout(page: Page) {
  await page.getByRole("button", { name: "Cobrar", exact: true }).filter({ visible: true }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible({ timeout: 15_000 });
  return modal;
}

async function setSwitch(modal: Locator, namePattern: RegExp, on: boolean): Promise<void> {
  const toggle = modal.getByRole("switch", { name: namePattern });
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
}

async function readSummary(modal: Locator, itbisLabel: string | RegExp) {
  const valueOf = async (label: string | RegExp) =>
    parseMoney(await modal.getByText(label, { exact: typeof label === "string" }).locator("xpath=following-sibling::span").first().textContent());
  return {
    subtotal: await valueOf("Subtotal"),
    itbis: await valueOf(itbisLabel),
    propina: await valueOf(/^Propina legal \((10%|no incluida)\)$/),
    total: await valueOf("TOTAL COBRAR"),
  };
}

test("ITBIS included in price: checkout split matches the setting and the persisted factura", async () => {
  test.skip(!hasConfig, "Set CYBERBISTRO_E2E_EMAIL and CYBERBISTRO_E2E_PASSWORD (linked test tenant) to run this spec.");
  test.setTimeout(240_000);

  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-itbis-included-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
  const page = await mainWindow(app);
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
  let originalIncluded: boolean | undefined;

  try {
    await login(page);
    await expect(mesaSelector(page)).toBeVisible({ timeout: 30_000 });
    const invoicesBefore = await page.evaluate(() => window.electronAPI!.listInvoices!({}).then((r) => r.data.length));

    // ---- Setting OFF: classic behavior (no regression) ----
    originalIncluded = await setItbisIncluded(page, false);
    await selectMesa(page);
    const product = PRODUCT ? page.getByText(PRODUCT, { exact: false }).first() : page.locator("div.cursor-pointer.group").first();
    await expect(product).toBeVisible();
    await product.click();
    await page.getByRole("button", { name: "+ Agregar" }).click();

    let modal = await openCheckout(page);
    await setSwitch(modal, /ITBIS 18% en el total|ITBIS en el total/, true);
    await setSwitch(modal, /propina legal 10%/i, false);
    const off = await readSummary(modal, "ITBIS (18%)");
    const price = off.subtotal; // OFF: subtotal is the menu price.
    expect(price).toBeGreaterThan(0);
    expect(off.itbis).toBe(round2(price * 0.18));
    expect(off.propina).toBe(0);
    expect(off.total).toBe(round2(price + off.itbis));
    await modal.getByRole("button", { name: "Cerrar modal de cobro de mesa" }).click();

    // ---- Setting ON: menu price is the final price ----
    await setItbisIncluded(page, true);
    await selectMesa(page);
    modal = await openCheckout(page);
    await setSwitch(modal, /ITBIS 18% en el total|ITBIS en el total/, true);
    await setSwitch(modal, /propina legal 10%/i, false);
    const on = await readSummary(modal, "ITBIS 18% (incluido)");
    const base = round2(price / 1.18);
    expect(on.subtotal).toBe(base);
    expect(on.itbis).toBe(round2(price - base));
    expect(on.propina).toBe(0);
    expect(on.total).toBe(price);

    // ---- ON + propina: propina stays 10% of the menu price ----
    await setSwitch(modal, /propina legal 10%/i, true);
    const withPropina = await readSummary(modal, "ITBIS 18% (incluido)");
    expect(withPropina.subtotal).toBe(base);
    expect(withPropina.itbis).toBe(round2(price - base));
    expect(withPropina.propina).toBe(round2(price * 0.1));
    expect(withPropina.total).toBe(round2(price + price * 0.1));
    await setSwitch(modal, /propina legal 10%/i, false);

    // ---- Charge under ON and check the persisted factura ----
    await modal.getByRole("button", { name: "Confirmar Pago", exact: true }).click();
    await expect.poll(
      () => page.evaluate(() => window.electronAPI!.listInvoices!({}).then((r) => r.data.length)),
      { timeout: 20_000 },
    ).toBeGreaterThan(invoicesBefore);
    const invoices = await page.evaluate(() => window.electronAPI!.listInvoices!({}).then((r) => r.data as Array<Record<string, unknown>>));
    const latest = invoices
      .slice()
      .sort((a, b) => Number(b.numero_factura ?? 0) - Number(a.numero_factura ?? 0))[0];
    expect(Number(latest.subtotal)).toBe(base);
    expect(Number(latest.itbis)).toBe(round2(price - base));
    expect(Number(latest.propina)).toBe(0);
    expect(Number(latest.total)).toBe(price);
  } finally {
    // Restore the tenant setting we changed (shared test tenant).
    if (originalIncluded !== undefined) {
      try {
        await setItbisIncluded(page, originalIncluded);
      } catch (error) {
        console.error("Failed to restore itbis_incluido_en_precio:", error);
      }
    }
    await closeApp(app);
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});
