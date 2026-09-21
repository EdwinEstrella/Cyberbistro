import { describe, it, expect, vi } from "vitest";
import { buildOrderWrites, persistOrderWrites, splitCartByDestination, type OrderCartLine, type OrderWriteContext } from "./orderWrites";

const plato = (over: Partial<OrderCartLine["plato"]> = {}): OrderCartLine["plato"] => ({
  id: 1,
  nombre: "Pizza",
  precio: 100,
  categoria: "Platos Fuertes",
  va_a_cocina: true,
  ...over,
});

let seq = 0;
const ctx = (over: Partial<OrderWriteContext> = {}): OrderWriteContext => {
  seq = 0;
  return {
    tenantId: "t1",
    sucursalId: "suc1",
    mesaNumero: 5,
    userId: "u1",
    notes: "",
    newId: () => `id-${++seq}`,
    now: () => "2026-09-21T00:00:00.000Z",
    ...over,
  };
};

describe("splitCartByDestination", () => {
  it("routes only va_a_cocina === false to direct; everything else to kitchen", () => {
    const cart: OrderCartLine[] = [
      { plato: plato({ va_a_cocina: true }), cantidad: 1 },
      { plato: plato({ va_a_cocina: false }), cantidad: 1 },
    ];
    const { kitchenItems, directItems } = splitCartByDestination(cart);
    expect(kitchenItems).toHaveLength(1);
    expect(directItems).toHaveLength(1);
  });
});

describe("buildOrderWrites", () => {
  it("kitchen-only: creates a comanda and links every consumo to it as sent-to-kitchen", () => {
    const cart: OrderCartLine[] = [
      { plato: plato({ id: 1, nombre: "Pizza", precio: 100 }), cantidad: 2 },
      { plato: plato({ id: 2, nombre: "Pasta", precio: 150 }), cantidad: 1 },
    ];
    const writes = buildOrderWrites(cart, ctx());

    expect(writes.comanda).toMatchObject({
      mesa_numero: 5,
      estado: "pendiente",
      tenant_id: "t1",
      sucursal_id: "suc1",
      creado_por: "u1",
      items: [
        { nombre: "Pizza", categoria: "Platos Fuertes", cantidad: 2, precio: 100 },
        { nombre: "Pasta", categoria: "Platos Fuertes", cantidad: 1, precio: 150 },
      ],
    });
    expect(writes.comandaId).toBe(writes.comanda!.id);

    expect(writes.consumos).toHaveLength(2);
    for (const c of writes.consumos) {
      expect(c.tipo).toBe("cocina");
      expect(c.estado).toBe("enviado_cocina");
      expect(c.comanda_id).toBe(writes.comandaId);
      expect(c.tenant_id).toBe("t1");
      expect(c.sucursal_id).toBe("suc1");
      expect(c.mesa_numero).toBe(5);
    }
    expect(writes.consumos[0]).toMatchObject({ plato_id: 1, cantidad: 2, precio_unitario: 100, subtotal: 200 });
    expect(writes.consumos[1]).toMatchObject({ plato_id: 2, cantidad: 1, precio_unitario: 150, subtotal: 150 });
  });

  it("direct-only: no comanda, consumos are unlinked and already delivered", () => {
    const cart: OrderCartLine[] = [{ plato: plato({ va_a_cocina: false, precio: 120 }), cantidad: 3 }];
    const writes = buildOrderWrites(cart, ctx());

    expect(writes.comanda).toBeNull();
    expect(writes.comandaId).toBeNull();
    expect(writes.consumos).toHaveLength(1);
    expect(writes.consumos[0]).toMatchObject({
      tipo: "directo",
      estado: "entregado",
      comanda_id: null,
      subtotal: 360,
    });
  });

  it("mixed: comanda holds only kitchen items; direct consumo stays unlinked", () => {
    const cart: OrderCartLine[] = [
      { plato: plato({ id: 1, nombre: "Pizza", va_a_cocina: true }), cantidad: 1 },
      { plato: plato({ id: 9, nombre: "Refresco", va_a_cocina: false }), cantidad: 2 },
    ];
    const writes = buildOrderWrites(cart, ctx());

    expect((writes.comanda!.items as unknown[])).toHaveLength(1);
    expect((writes.comanda!.items as Array<{ nombre: string }>)[0].nombre).toBe("Pizza");

    const kitchen = writes.consumos.find((c) => c.plato_id === 1)!;
    const direct = writes.consumos.find((c) => c.plato_id === 9)!;
    expect(kitchen).toMatchObject({ tipo: "cocina", estado: "enviado_cocina", comanda_id: writes.comandaId });
    expect(direct).toMatchObject({ tipo: "directo", estado: "entregado", comanda_id: null });
  });

  it("empty cart: no comanda, no consumos", () => {
    const writes = buildOrderWrites([], ctx());
    expect(writes.comanda).toBeNull();
    expect(writes.consumos).toEqual([]);
  });

  it("blank notes become null; non-blank notes are trimmed onto the comanda", () => {
    expect(buildOrderWrites([{ plato: plato(), cantidad: 1 }], ctx({ notes: "   " })).comanda!.notas).toBeNull();
    expect(buildOrderWrites([{ plato: plato(), cantidad: 1 }], ctx({ notes: "  sin cebolla  " })).comanda!.notas).toBe("sin cebolla");
  });

  it("falls back to 'General' when a kitchen item has no category", () => {
    const writes = buildOrderWrites([{ plato: plato({ categoria: "" }), cantidad: 1 }], ctx());
    expect((writes.comanda!.items as Array<{ categoria: string }>)[0].categoria).toBe("General");
  });
});

describe("persistOrderWrites", () => {
  it("saves the comanda before the consumos, through the SQLite save functions only", async () => {
    const calls: string[] = [];
    const saveComanda = vi.fn(async () => { calls.push("comanda"); });
    const saveConsumo = vi.fn(async () => { calls.push("consumo"); });

    const cart: OrderCartLine[] = [
      { plato: plato({ id: 1, va_a_cocina: true }), cantidad: 1 },
      { plato: plato({ id: 2, va_a_cocina: false }), cantidad: 1 },
    ];
    const writes = buildOrderWrites(cart, ctx());
    await persistOrderWrites({ saveComanda, saveConsumo }, "t1", writes);

    expect(calls).toEqual(["comanda", "consumo", "consumo"]);
    expect(saveComanda).toHaveBeenCalledWith("t1", writes.comanda);
    expect(saveConsumo).toHaveBeenCalledTimes(2);
    expect(saveConsumo).toHaveBeenNthCalledWith(1, "t1", writes.consumos[0]);
  });

  it("skips the comanda save when nothing goes to the kitchen", async () => {
    const saveComanda = vi.fn(async () => {});
    const saveConsumo = vi.fn(async () => {});
    const writes = buildOrderWrites([{ plato: plato({ va_a_cocina: false }), cantidad: 1 }], ctx());

    await persistOrderWrites({ saveComanda, saveConsumo }, "t1", writes);

    expect(saveComanda).not.toHaveBeenCalled();
    expect(saveConsumo).toHaveBeenCalledTimes(1);
  });
});
