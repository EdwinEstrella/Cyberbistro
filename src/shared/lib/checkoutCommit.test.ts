import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueLocalWritesAtomically: vi.fn(),
  enqueueThermalPrint: vi.fn(),
  saveLocalInvoice: vi.fn(),
  saveLocalConsumo: vi.fn(),
  deleteLocalComanda: vi.fn(),
  executeReceivablesCommandLocally: vi.fn(),
}));

vi.mock("./localFirst", () => ({ enqueueLocalWritesAtomically: mocks.enqueueLocalWritesAtomically }));
vi.mock("./thermalPrint", () => ({ enqueueThermalPrint: mocks.enqueueThermalPrint }));
vi.mock("../../features/billing/lib/invoicesLocal", () => ({ saveLocalInvoice: mocks.saveLocalInvoice }));
vi.mock("./ordersLocal", () => ({
  saveLocalConsumo: mocks.saveLocalConsumo,
  deleteLocalComanda: mocks.deleteLocalComanda,
}));
vi.mock("./receivablesUiAdapter", () => ({ executeReceivablesCommandLocally: mocks.executeReceivablesCommandLocally }));

import { commitCheckout } from "./checkoutCommit";

describe("commitCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals(); // web path by default: no electronAPI → IndexedDB atomic
  });

  it("does not hand a receipt to printing until every checkout write is durable", async () => {
    let commit!: () => void;
    mocks.enqueueLocalWritesAtomically.mockReturnValue(new Promise<void>((resolve) => { commit = resolve; }));
    const completion = commitCheckout({
      writes: [{ tenantId: "tenant-1", tableName: "facturas", rowId: "invoice-1", op: "insert", deviceId: "device-1" }],
      prints: [{ id: "invoice-1", label: "Factura #1", print: vi.fn() }],
    });

    expect(mocks.enqueueThermalPrint).not.toHaveBeenCalled();
    commit();
    await completion;
    expect(mocks.enqueueThermalPrint).toHaveBeenCalledWith(expect.objectContaining({ id: "invoice-1" }));
  });

  it("returns after queue handoff without awaiting receipt printing", async () => {
    mocks.enqueueLocalWritesAtomically.mockResolvedValue(undefined);
    mocks.enqueueThermalPrint.mockReturnValue(true);
    const print = vi.fn(() => new Promise<never>(() => undefined));

    await expect(commitCheckout({ writes: [], prints: [{ id: "invoice-1", label: "Factura #1", print }] })).resolves.toBeUndefined();
    expect(mocks.enqueueThermalPrint).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();
  });

  describe("desktop SQLite path", () => {
    beforeEach(() => {
      // Presence of saveInvoiceLocal routes the checkout through SQLite;
      // executeReceivablesCommand additionally routes the fiado there.
      vi.stubGlobal("window", { electronAPI: { saveInvoiceLocal: vi.fn(), executeReceivablesCommand: vi.fn() } });
      mocks.saveLocalInvoice.mockResolvedValue(undefined);
      mocks.saveLocalConsumo.mockResolvedValue(undefined);
      mocks.deleteLocalComanda.mockResolvedValue(undefined);
      mocks.enqueueLocalWritesAtomically.mockResolvedValue(undefined);
      mocks.executeReceivablesCommandLocally.mockResolvedValue({ commitId: "c", localStatus: "committed", syncStatus: "pending" });
    });
    afterEach(() => vi.unstubAllGlobals());

    const orderWrites = [
      { tenantId: "t1", tableName: "facturas", rowId: "f1", op: "insert", payload: { id: "f1", total: 500 }, deviceId: "d1" },
      { tenantId: "t1", tableName: "consumos", rowId: "c1", op: "update", payload: { estado: "pagado", factura_id: "f1" }, deviceId: "d1" },
      { tenantId: "t1", tableName: "comandas", rowId: "cm1", op: "delete", deviceId: "d1" },
    ] as const;

    const fiadoWrites = [
      { tenantId: "t1", tableName: "cuentas_cobrar", rowId: "cxc1", op: "insert", payload: { id: "cxc1", customer_id: "cust1", factura_id: "f1", monto_total: 500, fecha_vencimiento: "2026-10-21", sucursal_id: "suc1", fecha_emision: "2026-09-21", observacion: "POS" }, deviceId: "d1" },
      { tenantId: "t1", tableName: "cxc_pagos", rowId: "pago1", op: "insert", payload: { id: "pago1", cuenta_cobrar_id: "cxc1", monto: 200, metodo_pago: "efectivo", sucursal_id: "suc1", cycle_id: null, notas: "Adelanto", created_by_auth_user_id: "u1", fecha_pago: "2026-09-21" }, deviceId: "d1" },
    ] as const;

    it("routes factura → SQLite invoice, consumo → SQLite consumo, comanda delete → SQLite delete", async () => {
      await commitCheckout({ writes: [...orderWrites], prints: [] });

      expect(mocks.saveLocalInvoice).toHaveBeenCalledWith({ id: "f1", total: 500 });
      expect(mocks.saveLocalConsumo).toHaveBeenCalledWith("t1", { estado: "pagado", factura_id: "f1", id: "c1" });
      expect(mocks.deleteLocalComanda).toHaveBeenCalledWith("t1", "cm1");
    });

    it("routes fiado to the SQLite receivables command, not IndexedDB", async () => {
      await commitCheckout({ writes: [...orderWrites, ...fiadoWrites], prints: [] });

      expect(mocks.executeReceivablesCommandLocally).toHaveBeenCalledWith(
        expect.objectContaining({ type: "receivables.create", id: "cxc1", customerId: "cust1", facturaId: "f1", totalAmount: 500 }),
      );
      expect(mocks.executeReceivablesCommandLocally).toHaveBeenCalledWith(
        expect.objectContaining({ type: "receivables.payment.record", paymentId: "pago1", receivableId: "cxc1", amount: 200 }),
      );
      expect(mocks.enqueueLocalWritesAtomically).not.toHaveBeenCalled();
    });

    it("creates the debt before recording its down-payment", async () => {
      const order: string[] = [];
      mocks.executeReceivablesCommandLocally.mockImplementation(async (cmd: { type: string }) => {
        order.push(cmd.type);
        return { commitId: "c", localStatus: "committed", syncStatus: "pending" };
      });

      await commitCheckout({ writes: [...fiadoWrites], prints: [] });

      expect(order).toEqual(["receivables.create", "receivables.payment.record"]);
    });

    it("falls the fiado back to the IndexedDB atomic path if the SQLite command fails", async () => {
      mocks.executeReceivablesCommandLocally.mockRejectedValue(new Error("debt not found"));

      await commitCheckout({ writes: [...fiadoWrites], prints: [] });

      expect(mocks.enqueueLocalWritesAtomically).toHaveBeenCalledTimes(1);
      const fellBack = mocks.enqueueLocalWritesAtomically.mock.calls[0][0] as Array<{ tableName: string }>;
      expect(fellBack.map((w) => w.tableName).sort()).toEqual(["cuentas_cobrar", "cxc_pagos"]);
    });

    it("saves the invoice before its paid consumo, and deletes the comanda last", async () => {
      const order: string[] = [];
      mocks.saveLocalInvoice.mockImplementation(async () => { order.push("invoice"); });
      mocks.saveLocalConsumo.mockImplementation(async () => { order.push("consumo"); });
      mocks.deleteLocalComanda.mockImplementation(async () => { order.push("comanda-delete"); });

      await commitCheckout({ writes: [...orderWrites], prints: [] });

      expect(order).toEqual(["invoice", "consumo", "comanda-delete"]);
    });
  });
});
