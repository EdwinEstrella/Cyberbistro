import { describe, it, expect, vi } from "vitest";
import {
  filterActiveComandas,
  comandaDedupKey,
  planAdvance,
  persistAdvance,
  KITCHEN_COLUMNS,
  type CocinaComanda,
  type AdvancePersistenceDeps,
} from "./cocinaBoard";

let seq = 0;
const comanda = (over: Partial<CocinaComanda> = {}): CocinaComanda => ({
  id: `c-${++seq}`,
  tenant_id: "t1",
  sucursal_id: "suc1",
  numero_comanda: seq,
  mesa_id: null,
  mesa_numero: 1,
  estado: "pendiente",
  items: [],
  notas: null,
  creado_por: "u1",
  created_at: "2026-09-21T10:00:00.000Z",
  ...over,
});

describe("filterActiveComandas", () => {
  it("keeps only active estados and sorts oldest-first", () => {
    const rows = [
      comanda({ id: "b", estado: "listo", created_at: "2026-09-21T10:02:00.000Z" }),
      comanda({ id: "a", estado: "pendiente", created_at: "2026-09-21T10:00:00.000Z" }),
      comanda({ id: "done", estado: "entregado", created_at: "2026-09-21T10:01:00.000Z" }),
      comanda({ id: "c", estado: "en_preparacion", created_at: "2026-09-21T10:03:00.000Z" }),
    ];
    const result = filterActiveComandas(rows, { tenantId: "t1", sucursalId: "suc1" });
    expect(result.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("drops comandas from another sucursal but keeps sucursal-less (global) rows", () => {
    const rows = [
      comanda({ id: "mine", sucursal_id: "suc1" }),
      comanda({ id: "other", sucursal_id: "suc2" }),
      comanda({ id: "global", sucursal_id: null }),
    ];
    const result = filterActiveComandas(rows, { tenantId: "t1", sucursalId: "suc1" });
    expect(result.map((c) => c.id).sort()).toEqual(["global", "mine"]);
  });

  it("drops comandas from another tenant but keeps tenant-less (legacy) rows", () => {
    const rows = [
      comanda({ id: "mine", tenant_id: "t1" }),
      comanda({ id: "foreign", tenant_id: "t2" }),
      comanda({ id: "legacy", tenant_id: undefined }),
    ];
    const result = filterActiveComandas(rows, { tenantId: "t1", sucursalId: "suc1" });
    expect(result.map((c) => c.id).sort()).toEqual(["legacy", "mine"]);
  });
});

describe("comandaDedupKey", () => {
  it("uses updated_at when present so a new revision prints again", () => {
    const key = comandaDedupKey({ id: "c1", created_at: "2026-09-21T10:00:00.000Z", updated_at: "2026-09-21T10:05:00.000Z" });
    expect(key).toBe(`c1_${new Date("2026-09-21T10:05:00.000Z").getTime()}`);
  });

  it("falls back to created_at when there is no updated_at", () => {
    const key = comandaDedupKey({ id: "c1", created_at: "2026-09-21T10:00:00.000Z" });
    expect(key).toBe(`c1_${new Date("2026-09-21T10:00:00.000Z").getTime()}`);
  });

  it("two events for the same revision collapse to the same key", () => {
    const c = { id: "c1", created_at: "2026-09-21T10:00:00.000Z", updated_at: "2026-09-21T10:05:00.000Z" };
    expect(comandaDedupKey(c)).toBe(comandaDedupKey(c));
  });
});

describe("planAdvance", () => {
  const opts = { now: "2026-09-21T11:00:00.000Z", sucursalId: "suc1" };

  it("pendiente -> en_preparacion rewrites the comanda without touching consumos", () => {
    const plan = planAdvance(comanda({ id: "c1", estado: "pendiente" }), "c1", "en_preparacion", opts);
    expect(plan.action).toBe("save");
    expect(plan.comanda).toMatchObject({ id: "c1", estado: "en_preparacion", updated_at: opts.now, sucursal_id: "suc1" });
    expect(plan.consumoPatch).toBeNull();
  });

  it("en_preparacion -> listo marks the linked consumos as listo", () => {
    const plan = planAdvance(comanda({ id: "c1", estado: "en_preparacion" }), "c1", "listo", opts);
    expect(plan.action).toBe("save");
    expect(plan.comanda?.estado).toBe("listo");
    expect(plan.consumoPatch).toEqual({ estado: "listo", updated_at: opts.now });
  });

  it("listo -> entregado deletes the comanda and patches nothing", () => {
    const plan = planAdvance(comanda({ id: "c1", estado: "listo" }), "c1", "entregado", opts);
    expect(plan.action).toBe("delete");
    expect(plan.comanda).toBeNull();
    expect(plan.consumoPatch).toBeNull();
  });

  it("preserves existing fields while overriding id/estado/updated_at/sucursal", () => {
    const existing = comanda({ id: "c1", numero_comanda: 42, mesa_numero: 7, sucursal_id: "old" });
    const plan = planAdvance(existing, "c1", "en_preparacion", opts);
    expect(plan.comanda).toMatchObject({ numero_comanda: 42, mesa_numero: 7, sucursal_id: "suc1" });
  });

  it("column config wires each stage to the next transition", () => {
    expect(KITCHEN_COLUMNS.map((c) => [c.key, c.next])).toEqual([
      ["pendiente", "en_preparacion"],
      ["en_preparacion", "listo"],
      ["listo", "entregado"],
    ]);
  });
});

describe("persistAdvance", () => {
  const deps = (): AdvancePersistenceDeps & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      saveComanda: vi.fn(async () => { calls.push("saveComanda"); }),
      deleteComanda: vi.fn(async () => { calls.push("deleteComanda"); }),
      readConsumos: vi.fn(async () => { calls.push("readConsumos"); return []; }),
      saveConsumo: vi.fn(async () => { calls.push("saveConsumo"); }),
    };
  };

  it("delete plan only deletes the comanda", async () => {
    const d = deps();
    await persistAdvance(d, "t1", "c1", { action: "delete", comanda: null, consumoPatch: null });
    expect(d.deleteComanda).toHaveBeenCalledWith("t1", "c1");
    expect(d.calls).toEqual(["deleteComanda"]);
  });

  it("save plan without patch writes the comanda and never reads consumos", async () => {
    const d = deps();
    const plan = planAdvance(undefined, "c1", "en_preparacion", { now: "N", sucursalId: "suc1" });
    await persistAdvance(d, "t1", "c1", plan);
    expect(d.saveComanda).toHaveBeenCalledWith("t1", plan.comanda);
    expect(d.readConsumos).not.toHaveBeenCalled();
    expect(d.calls).toEqual(["saveComanda"]);
  });

  it("listo plan saves the comanda first, then patches only its own consumos", async () => {
    const d = deps();
    d.readConsumos = vi.fn(async () => {
      d.calls.push("readConsumos");
      return [
        { id: "k1", comanda_id: "c1", estado: "enviado_cocina" },
        { id: "k2", comanda_id: "c1", estado: "enviado_cocina" },
        { id: "other", comanda_id: "c9", estado: "enviado_cocina" },
      ];
    });
    const plan = planAdvance(undefined, "c1", "listo", { now: "2026-09-21T11:00:00.000Z", sucursalId: "suc1" });
    await persistAdvance(d, "t1", "c1", plan);

    expect(d.calls[0]).toBe("saveComanda");
    expect(d.calls[1]).toBe("readConsumos");
    expect(d.saveConsumo).toHaveBeenCalledTimes(2);
    expect(d.saveConsumo).toHaveBeenCalledWith("t1", { id: "k1", comanda_id: "c1", estado: "listo", updated_at: "2026-09-21T11:00:00.000Z" });
    expect(d.saveConsumo).not.toHaveBeenCalledWith("t1", expect.objectContaining({ id: "other" }));
  });
});
