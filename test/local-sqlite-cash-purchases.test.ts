import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CASH_PURCHASE_REPOSITORY_EXECUTE_CHANNEL, registerCashPurchaseRepositoryIpc, type CashPurchaseRepositoryIpcMain } from "../electron/persistence/ipc";
import { CashPurchaseRepository } from "../electron/persistence/cashPurchaseRepository";
import { TenantStore } from "../electron/persistence/tenantStore";

const purchase = { type: "purchase.cash.create" as const, purchaseId: "purchase-1", supplierId: "supplier-1", detailId: "detail-1", inventoryMovementId: "movement-1", expenseId: "expense-1", inventoryProductId: "inventory-1", quantity: 2, unitCost: 5 };

function withStore(run: (store: TenantStore, repository: CashPurchaseRepository) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-cash-purchases-"));
  try {
    const store = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
    for (const command of [{ type: "catalog.branch.upsert" as const, id: "branch-a", name: "A" }, { type: "catalog.supplier.upsert" as const, id: "supplier-1", name: "Supplier" }, { type: "catalog.inventory-product.upsert" as const, id: "inventory-1", name: "Rice", unit: "kg" }]) store.executeCatalogCommand({ command, commitId: `seed-${command.id}`, branchId: "branch-a" });
    run(store, new CashPurchaseRepository({ store, branchId: "branch-a", createCommitId: () => "commit-1" }));
    store.close();
  } finally { try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch {} }
}

describe("local cash purchase repository", () => {
  it("accepts only trusted typed cash commands and rejects a forged tenant without writes", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const executed: unknown[] = [];
    const ipcMain: CashPurchaseRepositoryIpcMain = { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) };
    registerCashPurchaseRepositoryIpc({ ipcMain, isTrustedSender: (event) => event.senderId === 7, getRepository: () => ({ execute: (command: unknown) => { executed.push(command); return { commitId: "commit-1", localStatus: "committed", syncStatus: "pending" }; } }) });
    const handler = handlers.get(CASH_PURCHASE_REPOSITORY_EXECUTE_CHANNEL);
    await expect(handler?.({ senderId: 7 }, purchase)).resolves.toEqual({ ok: true, data: { commitId: "commit-1", localStatus: "committed", syncStatus: "pending" } });
    await expect(handler?.({ senderId: 7 }, { ...purchase, tenantId: "tenant-b" })).rejects.toThrow("Invalid cash purchase command");
    await expect(handler?.({ senderId: 8 }, purchase)).rejects.toThrow("Untrusted IPC sender");
    expect(executed).toEqual([purchase]);
  });

  it("commits the cash purchase graph and pending local outbox atomically", () => {
    withStore((store, repository) => {
      expect(repository.execute(purchase)).toEqual({ commitId: "commit-1", localStatus: "committed", syncStatus: "pending" });
      expect(store.readCashPurchaseRows()).toEqual({ purchases: [{ id: "purchase-1", total: 10 }], details: [{ id: "detail-1", purchaseId: "purchase-1", quantity: 2, subtotal: 10 }], movements: [{ id: "movement-1", purchaseId: "purchase-1", quantity: 2 }], expenses: [{ id: "expense-1", purchaseId: "purchase-1", amount: 10 }] });
      expect(store.readLocalOutbox().filter((entry) => entry.id.startsWith("commit-1:"))).toHaveLength(4);
    });
  });

  it("rolls back every graph row when a repeated local outbox commit collides", () => {
    withStore((store, repository) => {
      repository.execute(purchase);
      expect(() => repository.execute({ ...purchase, purchaseId: "purchase-2", detailId: "detail-2", inventoryMovementId: "movement-2", expenseId: "expense-2" })).toThrow();
      expect(store.readCashPurchaseRows().purchases).toEqual([{ id: "purchase-1", total: 10 }]);
      expect(store.readCashPurchaseRows().expenses).toEqual([{ id: "expense-1", purchaseId: "purchase-1", amount: 10 }]);
    });
  });
});
