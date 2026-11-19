import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import {
  PayrollSyncClient,
  classifyRemoteError,
  isCycleNumberConflict,
  type MutationError,
  type RemoteMutationBuilder,
} from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker, createDurableOperation, type DurableOperation } from "../electron/persistence/syncWorker";
import { OrdersRepository } from "../electron/persistence/ordersRepository";

function fakeMutationBuilder(overrides: Partial<RemoteMutationBuilder> = {}): RemoteMutationBuilder {
  return {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
    ...overrides,
  };
}

describe("T2: Cycle open push renumber on duplicate cycle_number", () => {
  const tenantId = "tenant-renumber-1";
  const branchId = "branch-1";

  describe("isCycleNumberConflict", () => {
    it("recognizes 23505 unique cycle constraint from message", () => {
      const err: MutationError = {
        code: "23505",
        message: 'duplicate key value violates unique constraint "cierres_operativos_unique_cycle"',
      };
      expect(isCycleNumberConflict(err)).toBe(true);
    });

    it("recognizes unique cycle conflict from duplicate key message with cycle_number", () => {
      const err: MutationError = {
        message: "duplicate key value violates unique constraint",
        details: "Key (tenant_id, cycle_number)=(tenant-1, 5) already exists.",
      };
      expect(isCycleNumberConflict(err)).toBe(true);
    });

    it("requires code 23505 or message containing duplicate key (already exists alone is dropped)", () => {
      const err: MutationError = {
        message: "cycle row already exists for this tenant",
        details: "Key (tenant_id, cycle_number)=(tenant-1, 5) already exists.",
      };
      expect(isCycleNumberConflict(err)).toBe(false);
    });

    it("distinguishes primary key / id conflict and returns false", () => {
      const errPkey: MutationError = {
        code: "23505",
        message: 'duplicate key value violates unique constraint "cierres_operativos_pkey"',
        details: "Key (id)=(cycle-1) already exists.",
      };
      expect(isCycleNumberConflict(errPkey)).toBe(false);

      const errKeyId: MutationError = {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key (id)=(cycle-uuid) already exists.",
      };
      expect(isCycleNumberConflict(errKeyId)).toBe(false);

      const errPrimary: MutationError = {
        code: "23505",
        message: "duplicate key value violates primary key constraint",
      };
      expect(isCycleNumberConflict(errPrimary)).toBe(false);
    });

    it("returns false for non-23505 errors", () => {
      expect(isCycleNumberConflict({ code: "P0001", message: "Ya existe un ciclo operativo abierto" })).toBe(false);
      expect(isCycleNumberConflict({ code: "23503", message: "foreign key violation" })).toBe(false);
      expect(isCycleNumberConflict({ message: "Network connection lost" })).toBe(false);
    });
  });

  describe("classifyRemoteError with cierres_operativos", () => {
    it("classifies error with message 'ya existe un ciclo operativo abierto' as conflict for cierres_operativos regardless of code", () => {
      const resultWithCode = classifyRemoteError(
        { code: "P0001", message: "Ya existe un ciclo operativo abierto" },
        "cierres_operativos",
        "upsert",
      );
      expect(resultWithCode).toEqual({
        conflict: {
          reason: "Remote upsert conflict for cierres_operativos: Ya existe un ciclo operativo abierto",
        },
      });

      const resultWithoutCode = classifyRemoteError(
        { message: "trigger failed: ya existe un ciclo operativo abierto" },
        "cierres_operativos",
        "upsert",
      );
      expect(resultWithoutCode).toEqual({
        conflict: {
          reason: "Remote upsert conflict for cierres_operativos: trigger failed: ya existe un ciclo operativo abierto",
        },
      });
    });

    it("throws on P0001 with unrelated message for cierres_operativos and other tables (keeping existing retry classification)", () => {
      expect(() =>
        classifyRemoteError(
          { code: "P0001", message: "Custom trigger error" },
          "cierres_operativos",
          "upsert",
        ),
      ).toThrow("Upsert failed: Custom trigger error");

      expect(() =>
        classifyRemoteError(
          { code: "P0001", message: "Custom trigger error" },
          "facturas",
          "upsert",
        ),
      ).toThrow("Upsert failed: Custom trigger error");
    });
  });

  describe("PayrollSyncClient orders.cycle.open renumbering", () => {
    it("23505 on unique cycle → reads cloud max, retries with max+1, returns synced + renumberedCycleNumber", async () => {
      const upsertMock = vi.fn();
      const selectMock = vi.fn();

      // Upsert 1: fails with 23505 on cierres_operativos_unique_cycle
      // Upsert 2: succeeds
      upsertMock
        .mockResolvedValueOnce({
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "cierres_operativos_unique_cycle"',
            details: "Key (tenant_id, cycle_number)=(tenant-renumber-1, 5) already exists.",
          },
        })
        .mockResolvedValueOnce({ error: null });

      // Cloud max query returns cycle_number = 12
      selectMock.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ cycle_number: 12 }],
              error: null,
            }),
          }),
        }),
      });

      const fakeClient = {
        from: vi.fn(() =>
          fakeMutationBuilder({
            upsert: upsertMock,
            select: selectMock,
          }),
        ),
      };

      const client = new PayrollSyncClient(fakeClient);
      const operation: DurableOperation = {
        id: "op-open-1",
        tenantId,
        branchId,
        tableName: "cierres_operativos",
        rowId: "cycle-100",
        op: "upsert",
        payload: {
          type: "orders.cycle.open",
          id: "cycle-100",
          businessDay: "2026-09-16",
          openingCash: 500,
          cycleNumber: 5,
          openedAt: "2026-09-16T10:00:00.000Z",
        },
        payloadHash: "hash-1",
        sequence: 1,
        deviceId: "dev-1",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const response = await client.push(operation);

      expect(response).toEqual({
        result: {
          synced: true,
          id: "cycle-100",
          remoteTable: "cierres_operativos",
          renumberedCycleNumber: 13,
        },
      });

      // Verify attempts and payloads
      expect(upsertMock).toHaveBeenCalledTimes(2);
      expect(upsertMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: "cycle-100",
          cycle_number: 5,
          tenant_id: tenantId,
        }),
        { onConflict: "id" },
      );
      expect(upsertMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          id: "cycle-100", // Same id
          cycle_number: 13, // New number: cloudMax (12) + 1
          tenant_id: tenantId,
        }),
        { onConflict: "id" },
      );
    });

    it("23505 twice then success → 3 attempts, final number correct", async () => {
      const upsertMock = vi.fn();
      let selectCount = 0;

      // Upsert 1: fails (collides with 5)
      // Upsert 2: fails (collides with 13)
      // Upsert 3: succeeds with 14
      upsertMock
        .mockResolvedValueOnce({
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "cierres_operativos_unique_cycle"',
          },
        })
        .mockResolvedValueOnce({
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "cierres_operativos_unique_cycle"',
          },
        })
        .mockResolvedValueOnce({ error: null });

      const fakeClient = {
        from: vi.fn(() =>
          fakeMutationBuilder({
            upsert: upsertMock,
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => {
                    selectCount++;
                    return {
                      data: [{ cycle_number: selectCount === 1 ? 12 : 13 }],
                      error: null,
                    };
                  }),
                })),
              })),
            })),
          }),
        ),
      };

      const client = new PayrollSyncClient(fakeClient);
      const operation: DurableOperation = {
        id: "op-open-2",
        tenantId,
        branchId,
        tableName: "cierres_operativos",
        rowId: "cycle-200",
        op: "upsert",
        payload: {
          type: "orders.cycle.open",
          id: "cycle-200",
          businessDay: "2026-09-16",
          openingCash: 500,
          cycleNumber: 5,
          openedAt: "2026-09-16T10:00:00.000Z",
        },
        payloadHash: "hash-2",
        sequence: 2,
        deviceId: "dev-1",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const response = await client.push(operation);

      expect(response).toEqual({
        result: {
          synced: true,
          id: "cycle-200",
          remoteTable: "cierres_operativos",
          renumberedCycleNumber: 14,
        },
      });
      expect(upsertMock).toHaveBeenCalledTimes(3);
      expect(upsertMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ id: "cycle-200", cycle_number: 14 }),
        { onConflict: "id" },
      );
    });

    it("23505 three times → { conflict }, no more than 3 upserts", async () => {
      const upsertMock = vi.fn().mockResolvedValue({
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "cierres_operativos_unique_cycle"',
        },
      });

      const fakeClient = {
        from: vi.fn(() =>
          fakeMutationBuilder({
            upsert: upsertMock,
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ cycle_number: 20 }],
                    error: null,
                  }),
                })),
              })),
            })),
          }),
        ),
      };

      const client = new PayrollSyncClient(fakeClient);
      const operation: DurableOperation = {
        id: "op-open-3",
        tenantId,
        branchId,
        tableName: "cierres_operativos",
        rowId: "cycle-300",
        op: "upsert",
        payload: {
          type: "orders.cycle.open",
          id: "cycle-300",
          businessDay: "2026-09-16",
          openingCash: 500,
          cycleNumber: 5,
          openedAt: "2026-09-16T10:00:00.000Z",
        },
        payloadHash: "hash-3",
        sequence: 3,
        deviceId: "dev-1",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const response = await client.push(operation);

      expect(response.conflict).toBeDefined();
      expect(response.conflict?.reason).toContain("Remote upsert conflict for cierres_operativos");
      expect(upsertMock).toHaveBeenCalledTimes(3);
    });

    it("Max read fails → { conflict }", async () => {
      const upsertMock = vi.fn().mockResolvedValue({
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "cierres_operativos_unique_cycle"',
        },
      });

      const fakeClient = {
        from: vi.fn(() =>
          fakeMutationBuilder({
            upsert: upsertMock,
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: "Cloud query failed" },
                  }),
                })),
              })),
            })),
          }),
        ),
      };

      const client = new PayrollSyncClient(fakeClient);
      const operation: DurableOperation = {
        id: "op-open-4",
        tenantId,
        branchId,
        tableName: "cierres_operativos",
        rowId: "cycle-400",
        op: "upsert",
        payload: {
          type: "orders.cycle.open",
          id: "cycle-400",
          businessDay: "2026-09-16",
          openingCash: 500,
          cycleNumber: 5,
          openedAt: "2026-09-16T10:00:00.000Z",
        },
        payloadHash: "hash-4",
        sequence: 4,
        deviceId: "dev-1",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const response = await client.push(operation);

      expect(response.conflict).toBeDefined();
      expect(response.conflict?.reason).toContain("Remote upsert conflict for cierres_operativos");
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    it("Missing select support on table client → { conflict }, no retry", async () => {
      const upsertMock = vi.fn().mockResolvedValue({
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "cierres_operativos_unique_cycle"',
        },
      });

      const fakeClient = {
        from: vi.fn(() =>
          fakeMutationBuilder({
            upsert: upsertMock,
            select: undefined,
          }),
        ),
      };

      const client = new PayrollSyncClient(fakeClient);
      const operation: DurableOperation = {
        id: "op-open-no-select",
        tenantId,
        branchId,
        tableName: "cierres_operativos",
        rowId: "cycle-no-select",
        op: "upsert",
        payload: {
          type: "orders.cycle.open",
          id: "cycle-no-select",
          businessDay: "2026-09-16",
          openingCash: 500,
          cycleNumber: 5,
          openedAt: "2026-09-16T10:00:00.000Z",
        },
        payloadHash: "hash-ns",
        sequence: 1,
        deviceId: "dev-1",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const response = await client.push(operation);
      expect(response.conflict).toBeDefined();
      expect(response.conflict?.reason).toContain("Remote upsert conflict for cierres_operativos");
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    it("23505 on primary key / id → no renumber, existing behavior", async () => {
      const upsertMock = vi.fn().mockResolvedValue({
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "cierres_operativos_pkey"',
          details: "Key (id)=(cycle-500) already exists.",
        },
      });
      const selectMock = vi.fn();

      const fakeClient = {
        from: vi.fn(() =>
          fakeMutationBuilder({
            upsert: upsertMock,
            select: selectMock,
          }),
        ),
      };

      const client = new PayrollSyncClient(fakeClient);
      const operation: DurableOperation = {
        id: "op-open-5",
        tenantId,
        branchId,
        tableName: "cierres_operativos",
        rowId: "cycle-500",
        op: "upsert",
        payload: {
          type: "orders.cycle.open",
          id: "cycle-500",
          businessDay: "2026-09-16",
          openingCash: 500,
          cycleNumber: 5,
          openedAt: "2026-09-16T10:00:00.000Z",
        },
        payloadHash: "hash-5",
        sequence: 5,
        deviceId: "dev-1",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const response = await client.push(operation);

      expect(response.conflict).toBeDefined();
      expect(response.conflict?.reason).toContain("Remote upsert conflict for cierres_operativos");
      expect(upsertMock).toHaveBeenCalledTimes(1);
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("P0001 'Ya existe un ciclo operativo abierto' → { conflict }, no renumber", async () => {
      const upsertMock = vi.fn().mockResolvedValue({
        error: {
          code: "P0001",
          message: "Ya existe un ciclo operativo abierto",
        },
      });
      const selectMock = vi.fn();

      const fakeClient = {
        from: vi.fn(() =>
          fakeMutationBuilder({
            upsert: upsertMock,
            select: selectMock,
          }),
        ),
      };

      const client = new PayrollSyncClient(fakeClient);
      const operation: DurableOperation = {
        id: "op-open-6",
        tenantId,
        branchId,
        tableName: "cierres_operativos",
        rowId: "cycle-600",
        op: "upsert",
        payload: {
          type: "orders.cycle.open",
          id: "cycle-600",
          businessDay: "2026-09-16",
          openingCash: 500,
          cycleNumber: 5,
          openedAt: "2026-09-16T10:00:00.000Z",
        },
        payloadHash: "hash-6",
        sequence: 6,
        deviceId: "dev-1",
        status: "syncing",
        leaseUntil: 0,
        result: null,
      };

      const response = await client.push(operation);

      expect(response.conflict).toBeDefined();
      expect(response.conflict?.reason).toBe("Remote upsert conflict for cierres_operativos: Ya existe un ciclo operativo abierto");
      expect(upsertMock).toHaveBeenCalledTimes(1);
      expect(selectMock).not.toHaveBeenCalled();
    });
  });

  describe("Store settle with renumberedCycleNumber", () => {
    let db: DatabaseSync;
    let store: SQLitePayrollSyncStore;

    beforeEach(() => {
      db = new DatabaseSync(":memory:");
      initializeTenantSchema(db, tenantId);
      db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, tenantId, "Principal");
      store = new SQLitePayrollSyncStore(db, tenantId);
    });

    it("synced settle with renumberedCycleNumber updates the local cycle_number only for that row and pending outbox payloads", () => {
      // 1. Create target cycle and unrelated cycle
      db.prepare(`
        INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, cycle_number, opened_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
      `).run("cycle-target", tenantId, branchId, "2026-09-16", 100, 3, "2026-09-16T10:00:00.000Z", "2026-09-16T10:00:00.000Z");

      db.prepare(`
        INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, cycle_number, opened_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'closed', ?, ?, ?)
      `).run("cycle-other", tenantId, branchId, "2026-09-15", 200, 2, "2026-09-15T10:00:00.000Z", "2026-09-15T10:00:00.000Z");

      // 2. Insert outbox rows:
      // - open op for cycle-target (the one being settled)
      // - pending close op for cycle-target carrying cycleNumber
      // - pending print op for cycle-target carrying cycleNumber
      // - pending other table outbox row
      db.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("outbox-open", tenantId, branchId, "cierres_operativos", "cycle-target", "upsert", JSON.stringify({ type: "orders.cycle.open", id: "cycle-target", cycleNumber: 3 }), "syncing");

      db.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("outbox-close", tenantId, branchId, "cierres_operativos", "cycle-target", "upsert", JSON.stringify({ type: "orders.cycle.close", id: "cycle-target", cycleNumber: 3, closedAt: "2026-09-16T18:00:00.000Z" }), "pending");

      db.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("outbox-print", tenantId, branchId, "cierres_operativos", "cycle-target", "upsert", JSON.stringify({ type: "orders.cycle.mark-printed", id: "cycle-target", cycleNumber: 3, printedAt: "2026-09-16T18:05:00.000Z" }), "pending");

      db.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("outbox-unrelated", tenantId, branchId, "facturas", "fac-1", "upsert", JSON.stringify({ id: "fac-1", cycleNumber: 3 }), "pending");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // 3. Settle outbox-open as synced with renumberedCycleNumber = 10
      store.settle("outbox-open", "synced", {
        synced: true,
        id: "cycle-target",
        remoteTable: "cierres_operativos",
        renumberedCycleNumber: 10,
      });

      // 4. Verify target row cycle_number is updated to 10
      const targetRow = db.prepare("SELECT cycle_number, state, business_day FROM cierres_operativos WHERE id = ?").get("cycle-target") as any;
      expect(targetRow.cycle_number).toBe(10);
      expect(targetRow.state).toBe("open"); // Other columns untouched

      // 5. Verify other cycle is completely untouched
      const otherRow = db.prepare("SELECT cycle_number FROM cierres_operativos WHERE id = ?").get("cycle-other") as any;
      expect(otherRow.cycle_number).toBe(2);

      // 6. Verify outbox-open is deleted
      const openOutbox = db.prepare("SELECT * FROM sync_outbox WHERE id = ?").get("outbox-open");
      expect(openOutbox).toBeUndefined();

      // 7. Verify pending close and print outbox payloads have cycleNumber updated to 10
      const closeOutbox = db.prepare("SELECT payload_json FROM sync_outbox WHERE id = ?").get("outbox-close") as any;
      const closePayload = JSON.parse(closeOutbox.payload_json);
      expect(closePayload.cycleNumber).toBe(10);
      expect(closePayload.id).toBe("cycle-target");

      const printOutbox = db.prepare("SELECT payload_json FROM sync_outbox WHERE id = ?").get("outbox-print") as any;
      const printPayload = JSON.parse(printOutbox.payload_json);
      expect(printPayload.cycleNumber).toBe(10);

      // 8. Verify unrelated table outbox payload is untouched
      const unrelatedOutbox = db.prepare("SELECT payload_json FROM sync_outbox WHERE id = ?").get("outbox-unrelated") as any;
      const unrelatedPayload = JSON.parse(unrelatedOutbox.payload_json);
      expect(unrelatedPayload.cycleNumber).toBe(3);

      // 9. Verify warning log in [sync↑] style
      expect(warnSpy).toHaveBeenCalledWith("[sync↑] cierres_operativos cycle-target → ciclo renumerado #3 → #10");

      warnSpy.mockRestore();
    });
  });

  describe("End-to-end with real SQLite store + DurableSyncWorker + fake Supabase client", () => {
    let db: DatabaseSync;
    let store: SQLitePayrollSyncStore;

    beforeEach(() => {
      db = new DatabaseSync(":memory:");
      initializeTenantSchema(db, tenantId);
      db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, tenantId, "Principal");
      store = new SQLitePayrollSyncStore(db, tenantId);
    });

    it("open a cycle locally with a colliding number, push → local cycle_number updated, outbox op settled", async () => {
      // 1. Create cycle locally using OrdersRepository
      const orders = new OrdersRepository({
        store: {
          executeOrdersCommand: ({ command: cmd }) => {
            // Write directly to SQLite schema matching TenantStore behavior
            if (cmd.type === "orders.cycle.open") {
              db.prepare(`
                INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, cycle_number, opened_at, created_at)
                VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
              `).run(cmd.id, tenantId, branchId, cmd.businessDay, cmd.openingCash, cmd.cycleNumber, cmd.openedAt, cmd.openedAt);

              db.prepare(`
                INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
                VALUES (?, ?, ?, 'cierres_operativos', ?, 'upsert', ?, 'pending')
              `).run(`outbox-${cmd.id}`, tenantId, branchId, cmd.id, JSON.stringify({ ...cmd, branchId }));
            }
          },
        },
        branchId,
      });

      orders.execute({
        type: "orders.cycle.open",
        id: "cycle-e2e-1",
        businessDay: "2026-09-16",
        openingCash: 500,
        cycleNumber: 1, // Colliding local number
        openedAt: "2026-09-16T10:00:00.000Z",
      });

      // Also add pending close op
      db.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'cierres_operativos', ?, 'upsert', ?, 'pending')
      `).run("outbox-close-e2e", tenantId, branchId, "cycle-e2e-1", JSON.stringify({
        type: "orders.cycle.close",
        id: "cycle-e2e-1",
        cycleNumber: 1,
        closedAt: "2026-09-16T18:00:00.000Z",
      }));

      // Verify initial local state
      const initialRow = db.prepare("SELECT cycle_number FROM cierres_operativos WHERE id = ?").get("cycle-e2e-1") as any;
      expect(initialRow.cycle_number).toBe(1);

      // 2. Set up fake Supabase client
      const upsertMock = vi.fn();
      // First attempt fails with 23505 unique cycle constraint
      // Second attempt succeeds
      upsertMock
        .mockResolvedValueOnce({
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "cierres_operativos_unique_cycle"',
            details: "Key (tenant_id, cycle_number)=(tenant-renumber-1, 1) already exists.",
          },
        })
        .mockResolvedValueOnce({ error: null });

      const fakeClient = {
        from: vi.fn(() =>
          fakeMutationBuilder({
            upsert: upsertMock,
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn().mockRejectedValue(new Error("Network offline on close")),
              })),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ cycle_number: 41 }], // Cloud max is 41
                    error: null,
                  }),
                })),
              })),
            })),
          }),
        ),
        pull: vi.fn().mockResolvedValue({ cursor: "cursor-1", changes: [] }),
      };

      const syncClient = new PayrollSyncClient(fakeClient as never);
      const worker = new DurableSyncWorker(store, syncClient, tenantId);

      // 3. Worker push
      const pushOutcome = await worker.push();

      // In this claim batch, the open op was pushed and renumbered
      expect(pushOutcome.pushed).toBeGreaterThanOrEqual(1);
      expect(pushOutcome.conflicted).toBe(0);

      // 4. Verify local cycle_number is updated to 42
      const updatedRow = db.prepare("SELECT cycle_number FROM cierres_operativos WHERE id = ?").get("cycle-e2e-1") as any;
      expect(updatedRow.cycle_number).toBe(42);

      // 5. Verify cycle-open outbox row is settled (deleted from outbox)
      const openOutbox = db.prepare("SELECT * FROM sync_outbox WHERE id = ?").get("outbox-cycle-e2e-1");
      expect(openOutbox).toBeUndefined();

      // 6. Verify pending close outbox payload had its cycleNumber updated to 42
      const closeOutbox = db.prepare("SELECT payload_json FROM sync_outbox WHERE id = ?").get("outbox-close-e2e") as any;
      expect(closeOutbox).toBeDefined();
      const closePayload = JSON.parse(closeOutbox.payload_json);
      expect(closePayload.cycleNumber).toBe(42);
    });
  });
});
