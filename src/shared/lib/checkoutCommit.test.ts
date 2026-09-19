import { describe, expect, it } from "vitest";
import { unlinkPaidConsumoFromComanda } from "./checkoutCommit";
import type { LocalFirstWrite } from "./localFirst";

const base = (payload: Record<string, unknown> | undefined, table: LocalFirstWrite["tableName"] = "consumos"): LocalFirstWrite => ({
  tenantId: "t",
  tableName: table,
  rowId: "consumo-1",
  op: "update",
  payload,
  deviceId: "dev-1",
});

describe("unlinkPaidConsumoFromComanda", () => {
  it("nulls comanda_id on a paid consumo (estado pagado)", () => {
    const out = unlinkPaidConsumoFromComanda(base({ estado: "pagado", comanda_id: "comanda-x", factura_id: "f-1" }));
    expect(out.payload?.comanda_id).toBeNull();
  });

  it("nulls comanda_id when a factura_id is present even if estado is not yet 'pagado'", () => {
    const out = unlinkPaidConsumoFromComanda(base({ estado: "pendiente", comanda_id: "comanda-x", factura_id: "f-1" }));
    expect(out.payload?.comanda_id).toBeNull();
  });

  it("preserves factura_id and the rest of the row (dropping the invoice link reopens tables)", () => {
    const out = unlinkPaidConsumoFromComanda(base({ estado: "pagado", comanda_id: "comanda-x", factura_id: "f-1", subtotal: 400 }));
    expect(out.payload?.factura_id).toBe("f-1");
    expect(out.payload?.subtotal).toBe(400);
    expect(out.payload?.estado).toBe("pagado");
  });

  it("leaves an unpaid consumo (no factura, not paid) untouched so it stays on its comanda", () => {
    const write = base({ estado: "pendiente", comanda_id: "comanda-x" });
    const out = unlinkPaidConsumoFromComanda(write);
    expect(out.payload?.comanda_id).toBe("comanda-x");
    expect(out).toBe(write);
  });

  it("ignores non-consumos writes", () => {
    const write = base({ estado: "pagado", comanda_id: "comanda-x", factura_id: "f-1" }, "facturas");
    expect(unlinkPaidConsumoFromComanda(write)).toBe(write);
  });

  it("ignores writes without a payload", () => {
    const write = base(undefined);
    expect(unlinkPaidConsumoFromComanda(write)).toBe(write);
  });

  it("does not mutate the original payload", () => {
    const payload = { estado: "pagado", comanda_id: "comanda-x", factura_id: "f-1" };
    const snapshot = { ...payload };
    unlinkPaidConsumoFromComanda(base(payload));
    expect(payload).toEqual(snapshot);
  });
});
