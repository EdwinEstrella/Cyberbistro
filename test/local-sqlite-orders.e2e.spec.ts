import { expect, test, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";

test("uses an isolated C2 profile and exposes no kitchen endpoint or raw IPC authority", async () => {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-orders-e2e-"));
  const seed = TenantStore.open({ dataRoot: userDataDirectory, tenantId: "tenant-e2e" });
  seed.executeCatalogCommand({ command: { type: "catalog.branch.upsert", id: "branch-e2e", name: "Synthetic Branch" }, commitId: "seed-branch", branchId: "branch-e2e" });
  seed.executeOrdersCommand({ command: { type: "orders.table.set-state", tableId: "table-e2e", tableNumber: 1, state: "free" }, commitId: "seed-table", branchId: "branch-e2e" });
  seed.close();

  const app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Correo")).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({
      hasOrdersCommand: typeof window.electronAPI?.executeOrdersCommand === "function",
      hasRawIpc: "ipcRenderer" in (window.electronAPI ?? {}),
      hasKitchenEndpoint: "discoverKitchenEndpoint" in (window.electronAPI ?? {}),
    }))).toEqual({ hasOrdersCommand: true, hasRawIpc: false, hasKitchenEndpoint: false });
    await expect(page.evaluate(() => window.electronAPI?.executeOrdersCommand?.({ type: "orders.cycle.open", id: "forged", businessDay: "2026-08-09", openingCash: 0 }))).rejects.toThrow(/(Tenant store is unavailable|Untrusted IPC sender)/);
  } finally {
    await app.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
