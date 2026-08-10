import { expect, test, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("exposes only the named cash-purchase bridge in an isolated Electron profile", async () => {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-cash-purchases-e2e-"));
  const app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel("Correo")).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({
      hasCashPurchaseCommand: typeof window.electronAPI?.executeCashPurchaseCommand === "function",
      hasRawIpc: "ipcRenderer" in (window.electronAPI ?? {}),
    }))).toEqual({ hasCashPurchaseCommand: true, hasRawIpc: false });
    await expect(page.evaluate(() => window.electronAPI?.executeCashPurchaseCommand?.({ type: "purchase.cash.create", purchaseId: "forged", supplierId: "supplier", detailId: "detail", inventoryMovementId: "movement", expenseId: "expense", inventoryProductId: "inventory", quantity: 1, unitCost: 1 }))).rejects.toThrow("Untrusted IPC sender");
  } finally {
    await app.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
