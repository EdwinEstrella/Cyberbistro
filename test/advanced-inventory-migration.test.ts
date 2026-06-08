import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "migrations", "20260608150000_add-advanced-inventory-columns.sql"),
  "utf8"
);

describe("advanced inventory columns migration", () => {
  it("adds ml_por_botella and costo_compra columns to productos_inventario", () => {
    expect(migration).toContain("ALTER TABLE public.productos_inventario");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS ml_por_botella numeric");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS costo_compra numeric DEFAULT 0.00");
  });

  it("replaces the guard trigger function with updated column checks", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.cyberbistro_guard_productos_inventario_update()");
    expect(migration).toContain("OR NEW.ml_por_botella IS DISTINCT FROM OLD.ml_por_botella");
    expect(migration).toContain("OR NEW.costo_compra IS DISTINCT FROM OLD.costo_compra");
    expect(migration).toContain("Solo admin puede cambiar datos de catálogo de inventario.");
  });
});
