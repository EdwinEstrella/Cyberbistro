import { expect, test, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";

test("uses an isolated profile with synthetic catalog data and exposes no raw SQLite authority", async () => {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-catalog-e2e-"));
  const seed = TenantStore.open({ dataRoot: userDataDirectory, tenantId: "tenant-e2e" });
  seed.executeCatalogCommand({
    command: { type: "catalog.customer.upsert", id: "customer-e2e", name: "Synthetic Customer" },
    commitId: "seed-commit",
    branchId: "branch-e2e",
  });
  seed.close();

  const app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Correo")).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({
      hasCatalogCommand: typeof window.electronAPI?.executeCatalogCommand === "function",
      hasRawIpc: "ipcRenderer" in (window.electronAPI ?? {}),
    }))).toEqual({ hasCatalogCommand: true, hasRawIpc: false });
    await expect(page.evaluate(() => window.electronAPI?.executeCatalogCommand?.({ type: "catalog.customer.upsert", id: "forged", name: "No active tenant" }))).rejects.toThrow(/(Tenant store is unavailable|Untrusted IPC sender)/);
  } finally {
    await app.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
