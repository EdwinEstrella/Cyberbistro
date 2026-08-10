import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FISCAL_SALES_REPOSITORY_EXECUTE_CHANNEL, registerSalesFiscalRepositoryIpc, type SalesFiscalRepositoryIpcMain } from "../electron/persistence/ipc";
import { SalesFiscalRepository } from "../electron/persistence/salesFiscalRepository";
import { TenantStore } from "../electron/persistence/tenantStore";

function withStore(run: (store: TenantStore, repository: SalesFiscalRepository) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-sales-fiscal-"));
  try {
    const store = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
    store.executeCatalogCommand({ command: { type: "catalog.branch.upsert", id: "branch-a", name: "A" }, commitId: "seed-branch", branchId: "branch-a" });
    run(store, new SalesFiscalRepository({ store, branchId: "branch-a", createCommitId: () => "commit-1" }));
    store.close();
  } finally {
    try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows can retain SQLite handles briefly. */ }
  }
}

const sale = { type: "sales.fiscal.create" as const, invoiceId: "invoice-1", fiscalIntentId: "intent-1", fiscalMode: "dgii_ecf" as const, documentType: "31", total: 25 };

describe("local sales fiscal contract", () => {
  it("rejects forged sender and tenant payloads before any repository write", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const executed: unknown[] = [];
    const ipcMain: SalesFiscalRepositoryIpcMain = { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) };
    registerSalesFiscalRepositoryIpc({ ipcMain, isTrustedSender: (event) => event.senderId === 7, getRepository: () => ({ execute: (command: unknown) => { executed.push(command); return { commitId: "commit-1", localStatus: "committed", syncStatus: "pending" }; } }) });
    const handler = handlers.get(FISCAL_SALES_REPOSITORY_EXECUTE_CHANNEL);

    await expect(handler?.({ senderId: 8 }, sale)).rejects.toThrow("Untrusted IPC sender");
    await expect(handler?.({ senderId: 7 }, { ...sale, tenantId: "tenant-b" })).rejects.toThrow("Invalid sales fiscal command");
    expect(executed).toEqual([]);
  });

  it("commits a dgii e-CF invoice, pending fiscal intent, and pending fiscal outbox locally", () => {
    withStore((store, repository) => {
      expect(repository.execute(sale)).toEqual({ commitId: "commit-1", localStatus: "committed", syncStatus: "pending" });
      expect(store.readSalesFiscalRows()).toEqual({ invoices: [{ id: "invoice-1", fiscalMode: "dgii_ecf", total: 25, localStatus: "pending_sync" }], intents: [{ id: "intent-1", invoiceId: "invoice-1", status: "pending_sync" }], outbox: [{ id: "commit-1", invoiceId: "invoice-1", status: "pending" }] });
    });
  });

  it("rolls back invoice and fiscal intent when the fiscal outbox cannot be inserted", () => {
    withStore((store, repository) => {
      repository.execute(sale);
      expect(() => repository.execute({ ...sale, invoiceId: "invoice-rolled-back", fiscalIntentId: "intent-rolled-back" })).toThrow();
      expect(store.readSalesFiscalRows().invoices).toEqual([{ id: "invoice-1", fiscalMode: "dgii_ecf", total: 25, localStatus: "pending_sync" }]);
      expect(store.readSalesFiscalRows().intents).toEqual([{ id: "intent-1", invoiceId: "invoice-1", status: "pending_sync" }]);
    });
  });
});
