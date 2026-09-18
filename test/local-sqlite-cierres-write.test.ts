import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OrdersRepository } from "../electron/persistence/ordersRepository";
import { TenantStore } from "../electron/persistence/tenantStore";

function withStore(run: (stores: { tenant: TenantStore; orders: OrdersRepository }) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-cierres-write-"));
  try {
    const tenant = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
    tenant.executeCatalogCommand({ command: { type: "catalog.branch.upsert", id: "branch-a", name: "A" }, commitId: "seed-branch", branchId: "branch-a" });
    run({ tenant, orders: new OrdersRepository({ store: tenant, branchId: "branch-a", createCommitId: () => crypto.randomUUID() }) });
    tenant.close();
  } finally {
    try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows retains SQLite handles briefly. */ }
  }
}

describe("operational cycle SQLite write engine (single-engine cierres)", () => {
  it("persists cycle_number, opened_at, and created_at on open, plus a pending upsert outbox row", () => {
    withStore(({ tenant, orders }) => {
      orders.execute({ type: "orders.cycle.open", id: "cycle-1", businessDay: "2026-09-16", openingCash: 500, cycleNumber: 7, openedAt: "2026-09-16T10:00:00.000Z" });

      expect(tenant.readOrderRows("cierres_operativos")).toEqual([
        { id: "cycle-1", businessDay: "2026-09-16", openingCash: 500, state: "open", cycleNumber: 7, openedAt: "2026-09-16T10:00:00.000Z", closedAt: null, printedAt: null },
      ]);
      const outbox = tenant.readLocalOutbox().filter((e) => e.tableName === "cierres_operativos");
      expect(outbox).toEqual([expect.objectContaining({ tableName: "cierres_operativos", rowId: "cycle-1", status: "pending" })]);
    });
  });

  it("closes with the command's closed_at timestamp and enqueues the close upsert", () => {
    withStore(({ tenant, orders }) => {
      orders.execute({ type: "orders.cycle.open", id: "cycle-1", businessDay: "2026-09-16", openingCash: 0, cycleNumber: 1, openedAt: "2026-09-16T10:00:00.000Z" });
      orders.execute({ type: "orders.cycle.close", id: "cycle-1", closedAt: "2026-09-16T18:30:00.000Z" });

      const [row] = tenant.readOrderRows("cierres_operativos");
      expect(row).toMatchObject({ id: "cycle-1", state: "closed", closedAt: "2026-09-16T18:30:00.000Z" });
    });
  });

  it("marks printed_at without changing cycle state", () => {
    withStore(({ tenant, orders }) => {
      orders.execute({ type: "orders.cycle.open", id: "cycle-1", businessDay: "2026-09-16", openingCash: 0, cycleNumber: 1, openedAt: "2026-09-16T10:00:00.000Z" });
      orders.execute({ type: "orders.cycle.close", id: "cycle-1", closedAt: "2026-09-16T18:30:00.000Z" });
      orders.execute({ type: "orders.cycle.mark-printed", id: "cycle-1", printedAt: "2026-09-16T18:31:00.000Z" });

      const [row] = tenant.readOrderRows("cierres_operativos");
      expect(row).toMatchObject({ id: "cycle-1", state: "closed", printedAt: "2026-09-16T18:31:00.000Z" });
    });
  });

  it("discards an open cycle, deleting the row and enqueuing a delete outbox op so the cloud row is removed", () => {
    withStore(({ tenant, orders }) => {
      orders.execute({ type: "orders.cycle.open", id: "cycle-1", businessDay: "2026-09-16", openingCash: 0, cycleNumber: 1, openedAt: "2026-09-16T10:00:00.000Z" });
      orders.execute({ type: "orders.cycle.discard", id: "cycle-1" });

      expect(tenant.readOrderRows("cierres_operativos")).toEqual([]);
      const outbox = tenant.readLocalOutbox().filter((e) => e.tableName === "cierres_operativos");
      expect(outbox.some((e) => e.operation === "delete" && e.rowId === "cycle-1")).toBe(true);
    });
  });

  it("assigns explicit sucursalId when provided on cycle open", () => {
    withStore(({ tenant, orders }) => {
      orders.execute({
        type: "orders.cycle.open",
        id: "cycle-custom-branch",
        businessDay: "2026-09-18",
        openingCash: 1500,
        cycleNumber: 8,
        openedAt: "2026-09-18T10:00:00.000Z",
        sucursalId: "branch-custom",
      });

      const rows = tenant.listCierres({ sucursalId: "branch-custom" });
      expect(rows).toEqual([
        expect.objectContaining({
          id: "cycle-custom-branch",
          sucursal_id: "branch-custom",
          efectivo_inicial: 1500,
          cycle_number: 8,
        }),
      ]);
    });
  });
});
