import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "migrations", "20260608160000_add-compras-and-proveedores-tables.sql"),
  "utf8"
);

describe("compras and proveedores tables migration", () => {
  it("creates tables: proveedores, compras and compra_detalles", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.proveedores");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.compras");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.compra_detalles");
  });

  it("enforces RLS on all three tables", () => {
    expect(migration).toContain("ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("ALTER TABLE public.compra_detalles ENABLE ROW LEVEL SECURITY;");
  });

  it("defines tenant isolation and role permissions for proveedores", () => {
    expect(migration).toContain("CREATE POLICY cb_proveedores_tenant_select ON public.proveedores");
    expect(migration).toContain("CREATE POLICY cb_proveedores_tenant_write ON public.proveedores");
    expect(migration).toContain("CREATE POLICY cb_proveedores_tenant_update ON public.proveedores");
    expect(migration).toContain("CREATE POLICY cb_proveedores_admin_delete ON public.proveedores");
    expect(migration).toContain("public.cyberbistro_has_tenant_role");
  });

  it("restricts modifications (update/delete) on compras and compra_detalles", () => {
    expect(migration).toContain("CREATE POLICY cb_compras_no_app_update ON public.compras");
    expect(migration).toContain("CREATE POLICY cb_compras_no_app_delete ON public.compras");
    expect(migration).toContain("CREATE POLICY cb_compra_detalles_no_app_update ON public.compra_detalles");
    expect(migration).toContain("CREATE POLICY cb_compra_detalles_no_app_delete ON public.compra_detalles");
    expect(migration).toContain("USING (false)");
  });
});
