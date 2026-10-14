import { beforeEach, describe, expect, it, vi } from "vitest";

const readCuentas = vi.fn();
const readPagos = vi.fn();
vi.mock("../../billing/lib/accountsLocal", () => ({
  readLocalCuentasPagar: (...a: unknown[]) => readCuentas(...a),
  readLocalCxpPagos: (...a: unknown[]) => readPagos(...a),
}));

import { buildDeletePurchaseMessage, findPurchasePayments } from "./purchasePayments";

describe("buildDeletePurchaseMessage", () => {
  it("returns the default message when there are no payments", () => {
    expect(buildDeletePurchaseMessage([])).toMatch(/^Esta acción es irreversible\. Se eliminará la factura/);
    expect(buildDeletePurchaseMessage([])).not.toMatch(/pago/);
  });

  it("states count, total, dates and the deletion warning", () => {
    const msg = buildDeletePurchaseMessage([
      { id: "1", monto: 1000, fecha_pago: "2026-01-05", metodo_pago: "efectivo" },
      { id: "2", monto: 250.5, fecha_pago: "2026-02-10T12:00:00Z", metodo_pago: "transferencia" },
    ]);
    expect(msg).toContain("2 pagos registrados");
    expect(msg).toContain("RD$ 1,250.50");
    expect(msg).toContain("05/01/2026");
    expect(msg).toContain("10/02/2026");
    expect(msg).toContain("Si elimina esta compra, estos pagos también se eliminarán.");
    expect(msg).toContain("Esta acción es irreversible.");
  });

  it("uses the singular for one payment", () => {
    const msg = buildDeletePurchaseMessage([{ id: "1", monto: 10, fecha_pago: "2026-01-05", metodo_pago: "" }]);
    expect(msg).toContain("1 pago registrado ");
  });
});

describe("findPurchasePayments", () => {
  beforeEach(() => {
    readCuentas.mockReset();
    readPagos.mockReset();
  });

  it("filters by compra_id and sorts by date ascending", async () => {
    readCuentas.mockResolvedValue([
      { id: "c1", compra_id: "p1" },
      { id: "c2", compra_id: "p2" },
    ]);
    readPagos.mockResolvedValue([
      { id: "a", cuenta_pagar_id: "c1", monto: 5, fecha_pago: "2026-03-01", metodo_pago: "efectivo" },
      { id: "b", cuenta_pagar_id: "c2", monto: 9, fecha_pago: "2026-01-01", metodo_pago: "efectivo" },
      { id: "c", cuenta_pagar_id: "c1", monto: 7, fecha_pago: "2026-02-01", metodo_pago: "tarjeta" },
    ]);
    const res = await findPurchasePayments("t1", "p1");
    expect(res.map((p) => p.id)).toEqual(["c", "a"]);
    expect(res[0].monto).toBe(7);
  });

  it("returns [] when the purchase has no payable", async () => {
    readCuentas.mockResolvedValue([{ id: "c2", compra_id: "other" }]);
    readPagos.mockResolvedValue([]);
    expect(await findPurchasePayments("t1", "p1")).toEqual([]);
  });

  it("returns [] when a reader fails", async () => {
    readCuentas.mockRejectedValue(new Error("boom"));
    readPagos.mockResolvedValue([]);
    expect(await findPurchasePayments("t1", "p1")).toEqual([]);
  });
});
