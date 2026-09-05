import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";
import { ExpenseRepository } from "../electron/persistence/expenseRepository";
import {
  EXPENSE_REPOSITORY_EXECUTE_CHANNEL,
  EXPENSES_LIST_CHANNEL,
  EXPENSE_CATEGORIES_LIST_CHANNEL,
  registerExpenseRepositoryIpc,
  type ExpenseRepositoryIpcMain,
} from "../electron/persistence/ipc";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";

function withStore(run: (store: TenantStore, repository: ExpenseRepository) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-expenses-"));
  try {
    const store = TenantStore.open({ dataRoot, tenantId: "tenant-test" });
    const repository = new ExpenseRepository({
      store,
      branchId: "branch-test",
      createCommitId: () => "commit-exp-1",
    });
    run(store, repository);
    store.close();
  } finally {
    try {
      rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {}
  }
}

describe("local sqlite expenses & categories", () => {
  it("creates categories and operational expenses in SQLite and emits outbox rows", () => {
    withStore((store, repository) => {
      // 1. Create category
      const catResult = repository.execute({
        type: "expense.category.create",
        id: "cat-1",
        name: "Servicios Públicos",
        description: "Luz, agua, internet",
        color: "#10b981",
      });
      expect(catResult).toEqual({
        commitId: "commit-exp-1",
        localStatus: "committed",
        syncStatus: "pending",
      });

      const categories = store.listExpenseCategories();
      expect(categories).toEqual([
        {
          id: "cat-1",
          nombre: "Servicios Públicos",
          descripcion: "Luz, agua, internet",
          color: "#10b981",
          activa: 1,
        },
      ]);

      // 2. Create operational expense
      const expResult = repository.execute({
        type: "expense.create",
        id: "exp-1",
        categoryId: "cat-1",
        description: "Factura de Luz EDEESTE",
        supplier: "EDEESTE",
        amount: 4500.5,
        paymentMethod: "transfer",
        expenseDate: "2026-09-05T12:00:00.000Z",
        notes: "Mes de agosto",
      });
      expect(expResult).toEqual({
        commitId: "commit-exp-1",
        localStatus: "committed",
        syncStatus: "pending",
      });

      const expenses = store.listExpenses({ sucursalId: "branch-test" });
      expect(expenses).toHaveLength(1);
      expect(expenses[0].id).toBe("exp-1");
      expect(expenses[0].tenant_id).toBe("tenant-test");
      expect(expenses[0].sucursal_id).toBe("branch-test");
      expect(expenses[0].category_id).toBe("cat-1");
      expect(expenses[0].amount).toBe(4500.5);
      expect(expenses[0].payment_method).toBe("transfer");
      expect(expenses[0].description).toBe("Factura de Luz EDEESTE");
      expect(expenses[0].supplier).toBe("EDEESTE");

      // Check sync_outbox entries
      const outbox = store.readLocalOutbox();
      const catOutbox = outbox.find((o) => o.tableName === "gasto_categorias");
      const expOutbox = outbox.find((o) => o.tableName === "gastos");

      expect(catOutbox).toBeDefined();
      expect(catOutbox?.rowId).toBe("cat-1");
      expect(expOutbox).toBeDefined();
      expect(expOutbox?.rowId).toBe("exp-1");
    });
  });

  it("handles expense and category deletion with outbox records", () => {
    withStore((store, repository) => {
      repository.execute({
        type: "expense.create",
        id: "exp-del",
        description: "Para borrar",
        amount: 100,
      });
      expect(store.listExpenses()).toHaveLength(1);

      repository.execute({
        type: "expense.delete",
        id: "exp-del",
      });
      expect(store.listExpenses()).toHaveLength(0);

      const outbox = store.readLocalOutbox();
      const delEntry = outbox.find((o) => o.tableName === "gastos" && o.status === "pending");
      expect(delEntry).toBeDefined();
      expect(delEntry?.rowId).toBe("exp-del");
    });
  });

  it("handles IPC invocation safely and validates trusted sender", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: ExpenseRepositoryIpcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    };

    const executedCommands: unknown[] = [];
    registerExpenseRepositoryIpc({
      ipcMain,
      isTrustedSender: (e) => e.senderId === 42,
      getRepository: () => ({
        execute: (command) => {
          executedCommands.push(command);
          return { commitId: "c-1", localStatus: "committed", syncStatus: "pending" };
        },
      }),
      listExpenses: () => [{ id: "mock-exp" }],
      listCategories: () => [{ id: "mock-cat" }],
    });

    const execHandler = handlers.get(EXPENSE_REPOSITORY_EXECUTE_CHANNEL);
    const listHandler = handlers.get(EXPENSES_LIST_CHANNEL);
    const catHandler = handlers.get(EXPENSE_CATEGORIES_LIST_CHANNEL);

    // Rejects untrusted sender
    await expect(execHandler?.({ senderId: 99 }, { type: "expense.delete", id: "1" })).rejects.toThrow("Untrusted IPC sender");

    // Executes valid command
    const res = await execHandler?.({ senderId: 42 }, {
      type: "expense.create",
      id: "e-1",
      description: "Prueba",
      amount: 50,
    });
    expect(res).toEqual({ ok: true, data: { commitId: "c-1", localStatus: "committed", syncStatus: "pending" } });
    expect(executedCommands).toHaveLength(1);

    // Queries work
    const listRes = await listHandler?.({ senderId: 42 });
    expect(listRes).toEqual({ ok: true, data: [{ id: "mock-exp" }] });

    const catRes = await catHandler?.({ senderId: 42 });
    expect(catRes).toEqual({ ok: true, data: [{ id: "mock-cat" }] });
  });

  it("claims operational gastos and categories in sync store and pushes to InsForge", async () => {
    withStore(async (store) => {
      const syncStore = new SQLitePayrollSyncStore(store.getDatabase(), "tenant-test");
      const fakeUpsert = vi.fn().mockResolvedValue({ error: null });
      const fakeFrom = vi.fn().mockReturnValue({
        upsert: fakeUpsert,
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      });
      const client = new PayrollSyncClient({ from: fakeFrom } as any);

      // Insert operational expense into outbox
      store.getDatabase().prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES ('outbox-op-1', 'tenant-test', 'branch-test', 'gastos', 'gasto-op-1', 'upsert', ?, 'pending')
      `).run(JSON.stringify({
        id: "gasto-op-1",
        tenantId: "tenant-test",
        sucursalId: "branch-test",
        description: "Alquiler local",
        amount: 25000,
        paymentMethod: "transfer",
        expenseType: "operational",
      }));

      // Insert category into outbox
      store.getDatabase().prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES ('outbox-cat-1', 'tenant-test', 'branch-test', 'gasto_categorias', 'cat-op-1', 'upsert', ?, 'pending')
      `).run(JSON.stringify({
        id: "cat-op-1",
        tenantId: "tenant-test",
        name: "Alquileres",
        color: "#6366f1",
      }));

      const claims = syncStore.claim(Date.now());
      expect(claims.map((c) => c.id)).toContain("outbox-op-1");
      expect(claims.map((c) => c.id)).toContain("outbox-cat-1");

      // Push claims through client
      for (const claim of claims) {
        const result = await client.push(claim);
        expect(result.permanent).toBeUndefined();
      }

      expect(fakeFrom).toHaveBeenCalledWith("gastos");
      expect(fakeFrom).toHaveBeenCalledWith("gasto_categorias");
      expect(fakeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "gasto-op-1",
          tenant_id: "tenant-test",
          descripcion: "Alquiler local",
          monto: 25000,
          metodo_pago: "transfer",
        }),
        { onConflict: "id" }
      );
      expect(fakeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "cat-op-1",
          tenant_id: "tenant-test",
          nombre: "Alquileres",
          color: "#6366f1",
        }),
        { onConflict: "id" }
      );
    });
  });
});
