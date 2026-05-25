import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "migrations", "20260525133000_harden-consumos-facturas-delete-policies.sql"),
  "utf8"
);

describe("consumos and facturas destructive RLS policies", () => {
  it("replaces broad FOR ALL tenant policies with action-specific policies", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS cb_consumos_tenant_isolation");
    expect(migration).toContain("DROP POLICY IF EXISTS cb_facturas_tenant_isolation");
    expect(migration).not.toMatch(/CREATE POLICY cb_(consumos|facturas)_tenant_isolation[\s\S]*FOR ALL/);
  });

  it("allows venta and mesero roles to delete only their own open, unbilled consumos", () => {
    expect(migration).toContain("CREATE POLICY cb_consumos_staff_delete_open");
    expect(migration).toContain("ARRAY['cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera']");
    expect(migration).toContain("created_by_auth_user_id = public.cyberbistro_auth_user_id()");
    expect(migration).toContain("factura_id IS NULL");
    expect(migration).toContain("estado <> 'pagado'");
  });

  it("blocks physical factura deletes for app users", () => {
    expect(migration).toContain("CREATE POLICY cb_facturas_no_app_delete");
    expect(migration).toContain("USING (false)");
    expect(migration).not.toContain("CREATE POLICY cb_facturas_admin_delete");
  });

  it("keeps factura writes out of mesero and cocina roles", () => {
    expect(migration).toContain("ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']");
    expect(migration).not.toContain("ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera']");
  });
});
