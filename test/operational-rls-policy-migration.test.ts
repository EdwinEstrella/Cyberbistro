import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "migrations", "20260525141000_harden-operational-table-rls.sql"),
  "utf8"
);

describe("operational table RLS hardening migration", () => {
  const broadPolicies = [
    "cb_sucursales_tenant_isolation",
    "cb_productos_inventario_tenant_isolation",
    "cb_inventario_movimientos_tenant_isolation",
    "cb_recetas_tenant_isolation",
    "cb_produccion_cocina_tenant_isolation",
  ];

  it("drops broad tenant-only FOR ALL policies", () => {
    for (const policy of broadPolicies) {
      expect(migration).toContain(`DROP POLICY IF EXISTS ${policy}`);
    }
    expect(migration).not.toMatch(/CREATE POLICY cb_.*_tenant_isolation[\s\S]*FOR ALL/);
  });

  it("uses authenticated tenant role helper instead of active-tenant existence checks", () => {
    expect(migration).toContain("public.cyberbistro_has_tenant_role");
    expect(migration).not.toContain("WHERE tu.tenant_id = sucursales.tenant_id AND tu.activo IS TRUE");
    expect(migration).not.toContain("WHERE tu.tenant_id = productos_inventario.tenant_id AND tu.activo IS TRUE");
  });

  it("keeps sucursales writes admin-only and blocks physical deletes", () => {
    expect(migration).toContain("CREATE POLICY cb_sucursales_admin_insert");
    expect(migration).toContain("CREATE POLICY cb_sucursales_admin_update");
    expect(migration).toContain("CREATE POLICY cb_sucursales_no_app_delete");
    expect(migration).toContain("activa IS TRUE");
    expect(migration).toMatch(/cb_sucursales_no_app_delete[\s\S]*USING \(false\)/);
  });

  it("protects inventory catalog columns while allowing operational stock updates", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.cyberbistro_guard_productos_inventario_update()");
    expect(migration).toContain("CREATE TRIGGER trg_guard_productos_inventario_update");
    expect(migration).toContain("NEW.id IS DISTINCT FROM OLD.id");
    expect(migration).toContain("NEW.stock_minimo IS DISTINCT FROM OLD.stock_minimo");
    expect(migration).toContain("NEW.costo_promedio IS DISTINCT FROM OLD.costo_promedio");
    expect(migration).toContain("Solo admin puede cambiar datos de catálogo de inventario.");
  });

  it("keeps recetas writes admin-only", () => {
    expect(migration).toContain("CREATE POLICY cb_recetas_admin_insert");
    expect(migration).toContain("CREATE POLICY cb_recetas_admin_update");
    expect(migration).toContain("CREATE POLICY cb_recetas_admin_delete");
  });

  it("keeps inventory movement logs append-only", () => {
    expect(migration).toContain("CREATE POLICY cb_inventario_movimientos_operational_insert");
    expect(migration).toMatch(/cb_inventario_movimientos_no_app_update[\s\S]*USING \(false\)[\s\S]*WITH CHECK \(false\)/);
    expect(migration).toMatch(/cb_inventario_movimientos_no_app_delete[\s\S]*USING \(false\)/);
  });

  it("guards accounting tables only when they exist", () => {
    expect(migration).toContain("to_regclass('public.accounting_accounts') IS NOT NULL");
    expect(migration).toContain("to_regclass('public.accounting_posting_rules') IS NOT NULL");
    expect(migration).toContain("cb_accounting_accounts_no_app_delete");
    expect(migration).toContain("cb_accounting_posting_rules_no_app_delete");
  });
});
