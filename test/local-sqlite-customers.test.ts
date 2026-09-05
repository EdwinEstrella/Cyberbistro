import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";
import { CustomerRepository } from "../electron/persistence/customerRepository";
import {
  CUSTOMER_REPOSITORY_EXECUTE_CHANNEL,
  CUSTOMERS_LIST_CHANNEL,
  registerCustomerRepositoryIpc,
  type CustomerRepositoryIpcMain,
} from "../electron/persistence/ipc";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";

function withStore(run: (store: TenantStore, repository: CustomerRepository) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-customers-"));
  try {
    const store = TenantStore.open({ dataRoot, tenantId: "tenant-test" });
    const repository = new CustomerRepository({
      store,
      branchId: "branch-test",
      createCommitId: () => "commit-cust-1",
    });
    run(store, repository);
    store.close();
  } finally {
    try {
      rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {}
  }
}

describe("local sqlite customers", () => {
  it("creates, reads, and updates customer in SQLite and emits outbox row", () => {
    withStore((store, repository) => {
      // 1. Create customer
      const res = repository.execute({
        type: "customer.upsert",
        id: "cust-1",
        name: "Restaurante La Esquina SRL",
        phone: "809-555-1234",
        email: "contacto@laesquina.do",
        documentId: "131-00000-1",
        address: "Av. Winston Churchill #45",
        notes: "Cliente VIP corporativo",
      });
      expect(res).toEqual({
        commitId: "commit-cust-1",
        localStatus: "committed",
        syncStatus: "pending",
      });

      // 2. Read customer
      const list = store.listCustomers();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: "cust-1",
        tenant_id: "tenant-test",
        name: "Restaurante La Esquina SRL",
        phone: "809-555-1234",
        email: "contacto@laesquina.do",
        document_id: "131-00000-1",
        address: "Av. Winston Churchill #45",
        notes: "Cliente VIP corporativo",
        deleted_at: null,
      });

      // 3. Check outbox
      const outbox = store.readLocalOutbox();
      const custOutbox = outbox.find((o) => o.tableName === "customers");
      expect(custOutbox).toBeDefined();
      expect(custOutbox?.rowId).toBe("cust-1");

      const outboxRow = store.getDatabase().prepare(
        "SELECT payload_json FROM sync_outbox WHERE row_id = 'cust-1'"
      ).get() as { payload_json: string };
      const payload = JSON.parse(outboxRow.payload_json);
      expect(payload.name).toBe("Restaurante La Esquina SRL");
      expect(payload.documentId).toBe("131-00000-1");
    });
  });

  it("soft deletes a customer and emits delete outbox operation", () => {
    withStore((store, repository) => {
      repository.execute({
        type: "customer.upsert",
        id: "cust-del",
        name: "Cliente Temporal",
      });
      expect(store.listCustomers()).toHaveLength(1);

      repository.execute({
        type: "customer.delete",
        id: "cust-del",
      });
      expect(store.listCustomers()).toHaveLength(0);

      const outbox = store.readLocalOutbox();
      const delEntry = outbox.find((o) => o.tableName === "customers" && o.status === "pending" && o.id.includes("customer-delete"));
      expect(delEntry).toBeDefined();
      expect(delEntry?.rowId).toBe("cust-del");
    });
  });

  it("validates IPC handler sender and commands", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: CustomerRepositoryIpcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    };

    const executedCommands: unknown[] = [];
    registerCustomerRepositoryIpc({
      ipcMain,
      isTrustedSender: (e) => e.senderId === 10,
      getRepository: () => ({
        execute: (command) => {
          executedCommands.push(command);
          return { commitId: "c-1", localStatus: "committed", syncStatus: "pending" };
        },
      }),
      listCustomers: () => [{ id: "mock-cust", name: "Mock" }],
    });

    const execHandler = handlers.get(CUSTOMER_REPOSITORY_EXECUTE_CHANNEL);
    const listHandler = handlers.get(CUSTOMERS_LIST_CHANNEL);

    // Rejects untrusted
    await expect(execHandler?.({ senderId: 99 }, { type: "customer.delete", id: "1" })).rejects.toThrow("Untrusted IPC sender");

    // Executes valid command
    const res = await execHandler?.({ senderId: 10 }, {
      type: "customer.upsert",
      id: "cust-ipc",
      name: "Juan Perez",
      phone: "809-111-2222",
    });
    expect(res).toEqual({ ok: true, data: { commitId: "c-1", localStatus: "committed", syncStatus: "pending" } });
    expect(executedCommands).toHaveLength(1);

    // Lists customers
    const listRes = await listHandler?.({ senderId: 10 });
    expect(listRes).toEqual({ ok: true, data: [{ id: "mock-cust", name: "Mock" }] });
  });

  it("claims customer outbox operations and pushes to InsForge", async () => {
    withStore(async (store) => {
      const syncStore = new SQLitePayrollSyncStore(store.getDatabase(), "tenant-test");
      const fakeUpsert = vi.fn().mockResolvedValue({ error: null });
      const fakeFrom = vi.fn().mockReturnValue({
        upsert: fakeUpsert,
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      });
      const client = new PayrollSyncClient({ from: fakeFrom } as any);

      store.getDatabase().prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES ('outbox-c-1', 'tenant-test', 'branch-test', 'customers', 'c-100', 'upsert', ?, 'pending')
      `).run(JSON.stringify({
        id: "c-100",
        tenantId: "tenant-test",
        name: "Empresa ABC",
        phone: "809-999-8888",
        email: "abc@empresa.com",
        documentId: "101-23456-7",
        address: "Calle 1ra",
        notes: "Buen cliente",
      }));

      const claims = syncStore.claim(Date.now());
      const custClaim = claims.find((c) => c.id === "outbox-c-1");
      expect(custClaim).toBeDefined();

      const pushResult = await client.push(custClaim!);
      expect(pushResult.permanent).toBeUndefined();

      expect(fakeFrom).toHaveBeenCalledWith("customers");
      expect(fakeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "c-100",
          tenant_id: "tenant-test",
          name: "Empresa ABC",
          phone: "809-999-8888",
          email: "abc@empresa.com",
          document_id: "101-23456-7",
          address: "Calle 1ra",
          notes: "Buen cliente",
        }),
        { onConflict: "id" }
      );
    });
  });
});
