import { describe, expect, it } from "vitest";
import { planConsumoForeignKeyRecovery } from "./localFirst";

describe("planConsumoForeignKeyRecovery", () => {
  const paidConsumo = {
    id: "consumo-1",
    tenant_id: "t",
    comanda_id: "comanda-gone",
    factura_id: "factura-1",
    estado: "pagado",
    subtotal: 250,
  };

  it("nulls comanda_id when the cloud rejects with consumos_comanda_id_fkey", () => {
    const recovery = planConsumoForeignKeyRecovery(
      "consumos",
      'insert or update on table "consumos" violates foreign key constraint "consumos_comanda_id_fkey"',
      paidConsumo,
    );
    expect(recovery).not.toBeNull();
    expect(recovery?.comanda_id).toBeNull();
  });

  it("keeps factura_id intact — dropping the invoice link would reopen the paid table", () => {
    const recovery = planConsumoForeignKeyRecovery(
      "consumos",
      "violates foreign key constraint \"consumos_comanda_id_fkey\"",
      paidConsumo,
    );
    // The payment link and the rest of the row must survive untouched.
    expect(recovery?.factura_id).toBe("factura-1");
    expect(recovery?.estado).toBe("pagado");
    expect(recovery?.subtotal).toBe(250);
  });

  it("never recovers a factura FK violation by nulling factura_id (that path waits/orders instead)", () => {
    const recovery = planConsumoForeignKeyRecovery(
      "consumos",
      'violates foreign key constraint "consumos_factura_id_fkey"',
      paidConsumo,
    );
    expect(recovery).toBeNull();
  });

  it("does not touch non-consumos tables", () => {
    expect(
      planConsumoForeignKeyRecovery(
        "facturas",
        'violates foreign key constraint "consumos_comanda_id_fkey"',
        { id: "f-1" },
      ),
    ).toBeNull();
  });

  it("returns null for an unrelated error or a missing payload", () => {
    expect(planConsumoForeignKeyRecovery("consumos", "network timeout", paidConsumo)).toBeNull();
    expect(planConsumoForeignKeyRecovery("consumos", "consumos_comanda_id_fkey", null)).toBeNull();
  });

  it("does not mutate the original payload", () => {
    const original = { ...paidConsumo };
    planConsumoForeignKeyRecovery("consumos", "consumos_comanda_id_fkey", paidConsumo);
    expect(paidConsumo).toEqual(original);
  });
});
