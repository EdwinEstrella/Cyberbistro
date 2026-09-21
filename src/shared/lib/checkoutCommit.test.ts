import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueLocalWritesAtomically: vi.fn(),
  enqueueThermalPrint: vi.fn(),
  saveLocalInvoice: vi.fn(),
  saveLocalConsumo: vi.fn(),
  deleteLocalComanda: vi.fn(),
}));

vi.mock("./localFirst", () => ({ enqueueLocalWritesAtomically: mocks.enqueueLocalWritesAtomically }));
vi.mock("./thermalPrint", () => ({ enqueueThermalPrint: mocks.enqueueThermalPrint }));
vi.mock("../../features/billing/lib/invoicesLocal", () => ({ saveLocalInvoice: mocks.saveLocalInvoice }));
vi.mock("./ordersLocal", () => ({
  saveLocalConsumo: mocks.saveLocalConsumo,
  deleteLocalComanda: mocks.deleteLocalComanda,
}));

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
      // Presence of saveInvoiceLocal is what routes the checkout through SQLite.
      vi.stubGlobal("window", { electronAPI: { saveInvoiceLocal: vi.fn() } });
      mocks.saveLocalInvoice.mockResolvedValue(undefined);
      mocks.saveLocalConsumo.mockResolvedValue(undefined);
      mocks.deleteLocalComanda.mockResolvedValue(undefined);
      mocks.enqueueLocalWritesAtomically.mockResolvedValue(undefined);
    });
    afterEach(() => vi.unstubAllGlobals());

    const writes = [
      { tenantId: "t1", tableName: "facturas", rowId: "f1", op: "insert", payload: { id: "f1", total: 500 }, deviceId: "d1" },
      { tenantId: "t1", tableName: "consumos", rowId: "c1", op: "update", payload: { estado: "pagado", factura_id: "f1" }, deviceId: "d1" },
      { tenantId: "t1", tableName: "comandas", rowId: "cm1", op: "delete", deviceId: "d1" },
      { tenantId: "t1", tableName: "cuentas_cobrar", rowId: "cxc1", op: "insert", payload: { id: "cxc1" }, deviceId: "d1" },
    ] as const;

    it("routes factura → SQLite invoice, consumo → SQLite consumo, comanda delete → SQLite delete", async () => {
      await commitCheckout({ writes: [...writes], prints: [] });

      expect(mocks.saveLocalInvoice).toHaveBeenCalledWith({ id: "f1", total: 500 });
      expect(mocks.saveLocalConsumo).toHaveBeenCalledWith("t1", { estado: "pagado", factura_id: "f1", id: "c1" });
      expect(mocks.deleteLocalComanda).toHaveBeenCalledWith("t1", "cm1");
    });

    it("keeps fiado (cuentas_cobrar) on the IndexedDB atomic path, not SQLite", async () => {
      await commitCheckout({ writes: [...writes], prints: [] });

      expect(mocks.enqueueLocalWritesAtomically).toHaveBeenCalledTimes(1);
      const otherWrites = mocks.enqueueLocalWritesAtomically.mock.calls[0][0];
      expect(otherWrites).toHaveLength(1);
      expect(otherWrites[0]).toMatchObject({ tableName: "cuentas_cobrar" });
    });

    it("saves the invoice before its paid consumo, and deletes the comanda last", async () => {
      const order: string[] = [];
      mocks.saveLocalInvoice.mockImplementation(async () => { order.push("invoice"); });
      mocks.saveLocalConsumo.mockImplementation(async () => { order.push("consumo"); });
      mocks.deleteLocalComanda.mockImplementation(async () => { order.push("comanda-delete"); });

      await commitCheckout({ writes: [...writes], prints: [] });

      expect(order).toEqual(["invoice", "consumo", "comanda-delete"]);
    });
  });
});
