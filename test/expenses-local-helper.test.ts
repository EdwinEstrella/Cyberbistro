import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readLocalMirrorMock = vi.fn();
const shouldReadLocalFirstMock = vi.fn();

vi.mock("../src/shared/lib/localFirst", () => ({
  readLocalMirror: (...args: unknown[]) => readLocalMirrorMock(...args),
  shouldReadLocalFirst: (...args: unknown[]) => shouldReadLocalFirstMock(...args),
}));

import {
  normalizeExpense,
  normalizeExpenseCategory,
  readLocalExpenses,
  readLocalExpenseCategories,
} from "../src/features/gastos/lib/expensesLocal";

function setListExpenses(rows: Array<Record<string, unknown>> | null) {
  (globalThis as any).window = {
    electronAPI: rows === null ? {} : {
      listExpenses: vi.fn(async () => ({ ok: true, data: rows })),
      listExpenseCategories: vi.fn(async () => ({ ok: true, data: rows })),
    },
  };
}

beforeEach(() => {
  readLocalMirrorMock.mockReset();
  shouldReadLocalFirstMock.mockReset();
  readLocalMirrorMock.mockResolvedValue([]);
  shouldReadLocalFirstMock.mockResolvedValue(false);
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe("normalizeExpense", () => {
  it("maps SQLite english columns into both naming conventions", () => {
    const row = normalizeExpense({
      id: "e1",
      tenant_id: "t1",
      sucursal_id: "s1",
      category_id: "c1",
      cycle_id: "cy1",
      description: "Vegetales",
      supplier: "Mercado",
      amount: 150,
      payment_method: "cash",
      expense_date: "2026-09-10T10:00:00.000Z",
      notes: "factura 5",
      expense_type: "operational",
    });
    expect(row.descripcion).toBe("Vegetales");
    expect(row.description).toBe("Vegetales");
    expect(row.proveedor).toBe("Mercado");
    expect(row.monto).toBe(150);
    expect(row.amount).toBe(150);
    expect(row.metodo_pago).toBe("efectivo"); // cash normalized to efectivo
    expect(row.fecha_gasto).toBe("2026-09-10T10:00:00.000Z");
    expect(row.notas).toBe("factura 5");
  });

  it("falls back to amount_cents when amount is missing", () => {
    const row = normalizeExpense({ id: "e2", amount_cents: 2599 });
    expect(row.monto).toBeCloseTo(25.99, 2);
  });

  it("reads legacy spanish mirror fields", () => {
    const row = normalizeExpense({ id: "e3", descripcion: "Luz", monto: 90, metodo_pago: "transferencia", fecha_gasto: "2026-01-01T00:00:00.000Z" });
    expect(row.description).toBe("Luz");
    expect(row.amount).toBe(90);
    expect(row.payment_method).toBe("transferencia");
  });
});

describe("normalizeExpenseCategory", () => {
  it("maps name/active from SQLite and nombre/activa from mirror", () => {
    expect(normalizeExpenseCategory({ id: "c1", name: "Servicios", active: 1 }).nombre).toBe("Servicios");
    expect(normalizeExpenseCategory({ id: "c1", name: "Servicios", active: 1 }).activa).toBe(true);
    expect(normalizeExpenseCategory({ id: "c2", nombre: "Nómina", activa: false }).active).toBe(false);
  });
});

describe("readLocalExpenses union", () => {
  it("unions SQLite (authoritative) with IndexedDB-only rows, SQLite winning collisions", async () => {
    setListExpenses([
      { id: "shared", description: "SQLite version", amount: 100, expense_date: "2026-09-02T00:00:00.000Z" },
      { id: "sqlite-only", description: "Op expense", amount: 50, expense_date: "2026-09-03T00:00:00.000Z" },
    ]);
    // Mirror still holds an offline purchase expense not yet in SQLite + a stale copy of shared.
    readLocalMirrorMock.mockResolvedValue([
      { id: "shared", descripcion: "Mirror stale", monto: 999, fecha_gasto: "2026-09-01T00:00:00.000Z" },
      { id: "idb-only", descripcion: "Compra offline", monto: 75, fecha_gasto: "2026-09-04T00:00:00.000Z", expense_type: "purchase" },
    ]);

    const rows = await readLocalExpenses("t1");
    expect(rows).toHaveLength(3);
    const shared = rows.find((r) => r.id === "shared");
    expect(shared?.descripcion).toBe("SQLite version"); // SQLite wins
    expect(rows.some((r) => r.id === "idb-only")).toBe(true); // offline purchase preserved
    // Sorted by date desc: idb-only (09-04) first.
    expect(rows[0].id).toBe("idb-only");
  });

  it("filters by cycle and sucursal", async () => {
    setListExpenses([
      { id: "a", description: "A", amount: 1, cycle_id: "cy1", sucursal_id: "s1", expense_date: "2026-09-02T00:00:00.000Z" },
      { id: "b", description: "B", amount: 1, cycle_id: "cy2", sucursal_id: "s1", expense_date: "2026-09-02T00:00:00.000Z" },
      { id: "c", description: "C", amount: 1, cycle_id: "cy1", sucursal_id: "s2", expense_date: "2026-09-02T00:00:00.000Z" },
      { id: "d", description: "D", amount: 1, cycle_id: "cy1", sucursal_id: null, expense_date: "2026-09-02T00:00:00.000Z" },
    ]);
    const rows = await readLocalExpenses("t1", { cycleId: "cy1", sucursalId: "s1" });
    // a (cy1/s1) and d (cy1/null → visible everywhere); not b (cy2), not c (s2).
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "d"]);
  });

  it("falls back to mirror when the desktop bridge is unavailable", async () => {
    setListExpenses(null); // electronAPI present but no listExpenses
    shouldReadLocalFirstMock.mockResolvedValue(true);
    readLocalMirrorMock.mockResolvedValue([
      { id: "m1", descripcion: "Solo IDB", monto: 10, fecha_gasto: "2026-09-02T00:00:00.000Z" },
    ]);
    const rows = await readLocalExpenses("t1");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("m1");
  });
});

describe("readLocalExpenseCategories", () => {
  it("returns only active categories by default and dedupes by id", async () => {
    setListExpenses([
      { id: "c1", name: "Servicios", active: 1 },
      { id: "c2", name: "Vieja", active: 0 },
    ]);
    readLocalMirrorMock.mockResolvedValue([
      { id: "c1", nombre: "Servicios (stale)", activa: true },
      { id: "c3", nombre: "Solo IDB", activa: true },
    ]);
    const cats = await readLocalExpenseCategories("t1");
    const ids = cats.map((c) => c.id).sort();
    expect(ids).toEqual(["c1", "c3"]); // c2 inactive filtered out
    expect(cats.find((c) => c.id === "c1")?.nombre).toBe("Servicios"); // SQLite wins
  });
});
