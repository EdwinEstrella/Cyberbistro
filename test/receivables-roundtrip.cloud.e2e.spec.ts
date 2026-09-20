import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Layer 2 (real cloud round-trip): proves that Cuentas por Cobrar writes made in
// the desktop app actually reach the live backend (PUSH) and that a fresh device
// downloads them (PULL). It logs in with the dedicated test user and cleans up
// its own rows via an authenticated DELETE on the parent receivable (RLS blocks
// deleting cxc_pagos directly, but the FK cascade removes them when the parent
// goes). NOT run in CI — it lives in the `cloud` project and needs a real .env +
// CYBERBISTRO_TEST_PASSWORD. Run with: npm run test:e2e:cloud:build
//
// Prereqs in the test tenant: the account can log in AND has at least one
// existing customer (cuentas_cobrar.customer_id is a real FK the local store
// does not enqueue). The test skips with a clear message if either is missing.

function readEnvValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`));
    if (!line) return undefined;
    return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const SUPABASE_URL = readEnvValue("VITE_SUPABASE_URL");
const SUPABASE_KEY = readEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY");
const TEST_EMAIL = process.env.CYBERBISTRO_TEST_EMAIL || "test@test.com";
const TEST_PASSWORD = process.env.CYBERBISTRO_TEST_PASSWORD || "";

async function loginToApp(page: Page): Promise<void> {
  await expect(page.getByLabel("Correo")).toBeVisible({ timeout: 20_000 });
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button:has-text("Iniciar Sesión")').click();
  // Login form unmounts once the app shell mounts.
  await expect(page.locator('input[type="email"]')).toBeHidden({ timeout: 20_000 });
}

test.describe("Cuentas por Cobrar — real cloud round-trip (push + pull)", () => {
  let supa: SupabaseClient;
  let tenantId: string;
  let customerId: string;
  const createdReceivableIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_KEY, "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env");
    test.skip(!TEST_PASSWORD, "Set CYBERBISTRO_TEST_PASSWORD to run the real round-trip");

    supa = createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false } });
    const { error: authError } = await supa.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(authError, `login failed: ${authError?.message}`).toBeNull();

    const { data: membership } = await supa.from("tenant_users").select("tenant_id").limit(1).maybeSingle();
    tenantId = (membership as { tenant_id?: string } | null)?.tenant_id ?? "";
    expect(tenantId, "the test user has no tenant_users row").toBeTruthy();

    const { data: customer } = await supa.from("customers").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
    customerId = (customer as { id?: string } | null)?.id ?? "";
    test.skip(!customerId, "The test tenant needs at least one existing customer to attach a receivable to");
  });

  test.afterAll(async () => {
    // Cleanup: deleting the parent receivable cascades to its cxc_pagos.
    if (supa && createdReceivableIds.length > 0) {
      await supa.from("cuentas_cobrar").delete().in("id", createdReceivableIds);
    }
    if (supa) await supa.auth.signOut();
  });

  test("PUSH: a receivable created in the app is uploaded to the cloud", async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-cxc-push-"));
    let app: ElectronApplication | undefined;
    try {
      app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
      const page = await app.firstWindow();
      await loginToApp(page);

      const receivableId = randomUUID();
      createdReceivableIds.push(receivableId);

      const res = await page.evaluate(
        ({ id, cid }) =>
          window.electronAPI!.executeReceivablesCommand!({
            type: "receivables.create",
            id,
            customerId: cid,
            totalAmount: 1234,
            observacion: "E2E round-trip PUSH",
          }),
        { id: receivableId, cid: customerId }
      );
      expect(res.ok).toBe(true);

      // Kick the sync engine and wait until the row lands in Postgres.
      await page.evaluate(() => window.electronAPI!.triggerSync!());

      await expect
        .poll(
          async () => {
            const { data } = await supa
              .from("cuentas_cobrar")
              .select("id, monto_total")
              .eq("id", receivableId)
              .maybeSingle();
            return (data as { monto_total?: number } | null)?.monto_total ?? null;
          },
          { timeout: 30_000, intervals: [1000, 2000, 3000] }
        )
        .toBe(1234);
    } finally {
      if (app) await app.close();
      await rm(userDataDirectory, { recursive: true, force: true });
    }
  });

  test("PULL: a receivable that exists in the cloud downloads to a fresh device", async () => {
    // Seed the cloud directly (as the authenticated user) so the pull has
    // something authored elsewhere to bring down.
    const receivableId = randomUUID();
    createdReceivableIds.push(receivableId);
    const { error: insertError } = await supa.from("cuentas_cobrar").insert({
      id: receivableId,
      tenant_id: tenantId,
      customer_id: customerId,
      monto_total: 4321,
      observacion: "E2E round-trip PULL",
    });
    expect(insertError, `cloud seed failed: ${insertError?.message}`).toBeNull();

    const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-cxc-pull-"));
    let app: ElectronApplication | undefined;
    try {
      app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
      const page = await app.firstWindow();
      await loginToApp(page);

      // After login the desktop pulls the tenant mirror. Poll the local list
      // until the cloud-authored row shows up.
      await expect
        .poll(
          async () => {
            const list = await page.evaluate(() => window.electronAPI!.listCuentasCobrar!());
            const rows = ((list as { data?: Array<{ id: string }> })?.data ?? []) as Array<{ id: string }>;
            return rows.some((r) => r.id === receivableId);
          },
          { timeout: 45_000, intervals: [1500, 3000, 5000] }
        )
        .toBe(true);
    } finally {
      if (app) await app.close();
      await rm(userDataDirectory, { recursive: true, force: true });
    }
  });
});
