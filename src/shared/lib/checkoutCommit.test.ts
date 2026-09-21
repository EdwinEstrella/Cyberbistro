import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueLocalWritesAtomically: vi.fn(), processInvoiceInventoryDeduction: vi.fn(), enqueueThermalPrint: vi.fn(),
  saveLocalInvoice: vi.fn(), saveLocalConsumo: vi.fn(), deleteLocalComanda: vi.fn(), saveLocalComanda: vi.fn(), saveLocalMesaEstado: vi.fn(),
}));
vi.mock("./localFirst", () => ({ enqueueLocalWritesAtomically: mocks.enqueueLocalWritesAtomically, processInvoiceInventoryDeduction: mocks.processInvoiceInventoryDeduction }));
vi.mock("./thermalPrint", () => ({ enqueueThermalPrint: mocks.enqueueThermalPrint }));
vi.mock("../../features/billing/lib/invoicesLocal", () => ({ saveLocalInvoice: mocks.saveLocalInvoice }));
vi.mock("./ordersLocal", () => ({ saveLocalConsumo: mocks.saveLocalConsumo, deleteLocalComanda: mocks.deleteLocalComanda, saveLocalComanda: mocks.saveLocalComanda, saveLocalMesaEstado: mocks.saveLocalMesaEstado }));

import { commitCheckout } from "./checkoutCommit";

describe("commitCheckout", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.processInvoiceInventoryDeduction.mockResolvedValue(undefined); });

  it("waits for web durability before printing", async () => {
    let release!: () => void;
    mocks.saveLocalInvoice.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    const completion = commitCheckout({ writes: [{ tenantId: "t1", tableName: "facturas", rowId: "f1", op: "insert", payload: { id: "f1" }, deviceId: "d1" }], prints: [{ id: "f1", label: "Invoice", print: vi.fn() }] });
    expect(mocks.enqueueThermalPrint).not.toHaveBeenCalled();
    release(); await completion;
    expect(mocks.processInvoiceInventoryDeduction).toHaveBeenCalledOnce();
    expect(mocks.enqueueThermalPrint).toHaveBeenCalledOnce();
  });

  it("uses one Desktop IPC command and never reaches IndexedDB", async () => {
    const desktopCommit = vi.fn().mockResolvedValue({ ok: true, data: { localStatus: "committed", syncStatus: "pending", inventoryMovementIds: [] } });
    vi.stubGlobal("window", { electronAPI: { commitCheckout: desktopCommit } });
    const writes = [
      { tenantId: "t1", tableName: "facturas", rowId: "f1", op: "insert", payload: { id: "f1", total: 500 }, deviceId: "d1" },
      { tenantId: "t1", tableName: "consumos", rowId: "c1", op: "update", payload: { estado: "pagado" }, deviceId: "d1" },
      { tenantId: "t1", tableName: "comandas", rowId: "cm1", op: "delete", deviceId: "d1" },
      { tenantId: "t1", tableName: "cuentas_cobrar", rowId: "cx1", op: "insert", payload: { customer_id: "customer-1", monto_total: 500 }, deviceId: "d1" },
    ] as const;
    await commitCheckout({ writes, prints: [] });
    expect(desktopCommit).toHaveBeenCalledWith({ tenantId: "t1", writes });
    expect(mocks.saveLocalInvoice).not.toHaveBeenCalled();
    expect(mocks.enqueueLocalWritesAtomically).not.toHaveBeenCalled();
    expect(mocks.processInvoiceInventoryDeduction).not.toHaveBeenCalled();
  });

  it("does not print or fall back when the Desktop transaction fails", async () => {
    vi.stubGlobal("window", { electronAPI: { commitCheckout: vi.fn().mockRejectedValue(new Error("atomic rollback")) } });
    await expect(commitCheckout({ writes: [{ tenantId: "t1", tableName: "facturas", rowId: "f1", op: "insert", payload: { id: "f1" }, deviceId: "d1" }], prints: [{ id: "f1", label: "Invoice", print: vi.fn() }] })).rejects.toThrow("atomic rollback");
    expect(mocks.enqueueLocalWritesAtomically).not.toHaveBeenCalled();
    expect(mocks.enqueueThermalPrint).not.toHaveBeenCalled();
  });

  it("rejects mixed tenants before invoking Desktop IPC", async () => {
    const desktopCommit = vi.fn();
    vi.stubGlobal("window", { electronAPI: { commitCheckout: desktopCommit } });
    await expect(commitCheckout({ writes: [
      { tenantId: "t1", tableName: "facturas", rowId: "f1", op: "insert", payload: { id: "f1" }, deviceId: "d1" },
      { tenantId: "t2", tableName: "facturas", rowId: "f2", op: "insert", payload: { id: "f2" }, deviceId: "d1" },
    ], prints: [] })).rejects.toThrow("exactly one tenant");
    expect(desktopCommit).not.toHaveBeenCalled();
  });

  it("awaits Web inventory deduction before printing", async () => {
    mocks.saveLocalInvoice.mockResolvedValue(undefined);
    mocks.processInvoiceInventoryDeduction.mockRejectedValueOnce(new Error("inventory failed"));
    await expect(commitCheckout({ writes: [{ tenantId: "t1", tableName: "facturas", rowId: "f1", op: "insert", payload: { id: "f1", items: [] }, deviceId: "d1" }], prints: [{ id: "f1", label: "Invoice", print: vi.fn() }] })).rejects.toThrow("inventory failed");
    expect(mocks.enqueueThermalPrint).not.toHaveBeenCalled();
  });
});
