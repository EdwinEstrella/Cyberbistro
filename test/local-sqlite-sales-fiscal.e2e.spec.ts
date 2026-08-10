import { expect, test, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";

test("keeps synthetic fiscal modes pending after graceful SQLite close/reopen", async () => {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-sales-fiscal-e2e-"));
  const seed = TenantStore.open({ dataRoot: userDataDirectory, tenantId: "tenant-e2e" });
  seed.executeCatalogCommand({ command: { type: "catalog.branch.upsert", id: "branch-e2e", name: "Synthetic Branch" }, commitId: "seed-branch", branchId: "branch-e2e" });
  for (const fiscalMode of ["internal_receipt", "ncf_legacy", "dgii_ecf"] as const) {
    seed.executeSalesFiscalCommand({ command: { type: "sales.fiscal.create", invoiceId: `invoice-${fiscalMode}`, fiscalIntentId: `intent-${fiscalMode}`, fiscalMode, documentType: "31", total: 25 }, commitId: `commit-${fiscalMode}`, branchId: "branch-e2e" });
  }
  seed.close();
  const reopened = TenantStore.open({ dataRoot: userDataDirectory, tenantId: "tenant-e2e" });
  const recovered = reopened.readSalesFiscalRows();
  reopened.close();
  const app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Correo")).toBeVisible();
    expect(recovered.invoices).toEqual(expect.arrayContaining([
      { id: "invoice-internal_receipt", fiscalMode: "internal_receipt", total: 25, localStatus: "pending_sync" },
      { id: "invoice-ncf_legacy", fiscalMode: "ncf_legacy", total: 25, localStatus: "pending_sync" },
      { id: "invoice-dgii_ecf", fiscalMode: "dgii_ecf", total: 25, localStatus: "pending_sync" },
    ]));
    expect(recovered.intents.map(({ status }) => status)).toEqual(["pending_sync"]);
    expect(recovered.outbox.map(({ status }) => status)).toEqual(["pending", "pending", "pending"]);
    await expect.poll(() => page.evaluate(() => typeof window.electronAPI?.executeSalesFiscalCommand === "function")).toBe(true);
  } finally {
    await app.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
