import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("migrations/20260905120000_saved-accounts-and-branch-grants.sql", "utf8");

describe("branch grants migration", () => {
  it("keeps owners tenant-wide while requiring explicit staff branch grants", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.tenant_user_sucursales");
    expect(migration).toContain("tu.rol = 'admin' OR EXISTS");
    expect(migration).toContain("tenant_user_id = tu.id");
    expect(migration).toContain("cloudix_branch_grant_required");
    expect(migration).toContain("AS RESTRICTIVE FOR ALL TO authenticated");
    expect(migration).toContain("WITH CHECK (public.cyberbistro_can_access_branch");
  });

  it("enforces branch grants against both tenant-scoped parents", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_tenant_id_id_key");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS sucursales_tenant_id_id_key");
    expect(migration).toContain("FOREIGN KEY (tenant_id, tenant_user_id)");
    expect(migration).toContain("REFERENCES public.tenant_users (tenant_id, id) ON DELETE CASCADE");
    expect(migration).toContain("FOREIGN KEY (tenant_id, sucursal_id)");
    expect(migration).toContain("REFERENCES public.sucursales (tenant_id, id) ON DELETE CASCADE");
  });

  it("installs explicit restrictive policies for direct branch columns", () => {
    const tables = ["sucursales", "productos_inventario", "inventario_movimientos", "produccion_cocina", "platos", "menu_categories", "mesas_estado", "comandas", "consumos", "facturas", "cierres_operativos", "gastos", "gasto_categorias", "cocina_estado", "compras", "cuentas_pagar", "cxp_pagos", "cuentas_cobrar", "cxc_pagos", "digital_menu_settings", "digital_orders", "nomina_empleados"];
    expect(migration).not.toContain("DO $branch_policies$");
    for (const table of tables) {
      expect(migration).toMatch(new RegExp(`CREATE POLICY cloudix_branch_grant_required ON public\\.${table} AS RESTRICTIVE\\s+FOR ALL TO authenticated`));
    }
  });

  it("derives every child policy from its authoritative parent branch", () => {
    const derivedScopes = {
      nomina_pagos: ["cloudix_can_access_nomina_employee_branch", "empleado_id", "public.nomina_empleados e", "e.id = p_empleado_id"],
      nomina_ajustes: ["cloudix_can_access_nomina_employee_branch", "empleado_id", "public.nomina_empleados e", "e.id = p_empleado_id"],
      compra_detalles: ["cloudix_can_access_compra_detalle_branch", "compra_id", "public.compras c", "c.id = p_compra_id", "c.tenant_id = p_tenant_id"],
      digital_menu_items: ["cloudix_can_access_plato_branch", "plato_id", "public.platos p", "p.id = p_plato_id", "p.tenant_id = p_tenant_id"],
      digital_order_items: ["cloudix_can_access_digital_order_branch", "order_id", "public.digital_orders o", "o.id = p_order_id", "o.tenant_id = p_tenant_id"],
      recetas: ["cloudix_can_access_plato_branch", "plato_id", "public.platos p", "p.id = p_plato_id", "p.tenant_id = p_tenant_id"],
    } as const;

    for (const [table, [helper, foreignKey, ...helperAssertions]] of Object.entries(derivedScopes)) {
      expect(migration).toMatch(new RegExp(`CREATE POLICY cloudix_branch_grant_required ON public\\.${table} AS RESTRICTIVE FOR ALL TO authenticated USING \\(public\\.${helper}\\([^)]*${foreignKey}\\)\\) WITH CHECK \\(public\\.${helper}\\([^)]*${foreignKey}\\)\\)`));
      const helperStart = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${helper}`);
      expect(helperStart).toBeGreaterThanOrEqual(0);
      const helperSql = migration.slice(helperStart, migration.indexOf("$$;", helperStart));
      expect(helperSql).toContain("SECURITY DEFINER");
      expect(helperSql).toContain("SET search_path = pg_catalog, public, pg_temp");
      for (const assertion of helperAssertions) expect(helperSql).toContain(assertion);
    }
  });

  it("does not let the SECURITY DEFINER payroll payment RPC bypass the employee branch grant", () => {
    const rpcStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.register_nomina_pago");
    const rpcSql = migration.slice(rpcStart, migration.indexOf("$$;", rpcStart));
    expect(rpcSql).toContain("public.cyberbistro_can_access_branch(v_employee.tenant_id, v_employee.sucursal_id)");
    expect(rpcSql).toContain("RAISE EXCEPTION 'Not authorized to register payroll payments'");
  });

  it("limits derived restrictions to authenticated operators so public menu RPCs remain unaffected", () => {
    expect(migration).toContain("FOR ALL TO authenticated");
    expect(migration).toContain("This migration covers only");
    expect(migration).not.toContain("New tables with tenant_id");
  });

  it("requires branch assignments atomically when an owner provisions staff", () => {
    expect(migration).toContain("cloudix_owner_create_staff_membership");
    expect(migration).toContain("cardinality(p_sucursal_ids) = 0");
    expect(migration).toContain("Invalid branch assignment");
    expect(migration).toContain("INSERT INTO public.tenant_user_sucursales");
    expect(migration).toContain("p_rol NOT IN ('cajera', 'contabilidad', 'mesero', 'cocina')");
    expect(migration).toContain("Invalid staff role");
  });

  it("binds staff provisioning to a real auth user with the supplied email", () => {
    const rpcStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.cloudix_owner_create_staff_membership");
    const rpcSql = migration.slice(rpcStart, migration.indexOf("$$;", rpcStart));

    expect(rpcSql).toContain("SECURITY DEFINER");
    expect(rpcSql).toContain("SET search_path = pg_catalog, public, pg_temp");
    expect(rpcSql).toContain("IF p_auth_user_id IS NULL THEN");
    expect(rpcSql).toContain("v_normalized_email := lower(btrim(COALESCE(p_email, '')))");
    expect(rpcSql).toContain("FROM auth.users AS u");
    expect(rpcSql).toContain("WHERE u.id = p_auth_user_id");
    expect(rpcSql).toContain("v_auth_email IS NULL OR v_auth_email <> v_normalized_email");
    expect(rpcSql).toContain("Auth user email does not match staff email");
    expect(rpcSql).toContain("VALUES (v_tenant_id, p_auth_user_id, v_normalized_email");

    const authValidation = rpcSql.indexOf("Auth user email does not match staff email");
    expect(authValidation).toBeGreaterThanOrEqual(0);
    expect(authValidation).toBeLessThan(rpcSql.indexOf("INSERT INTO public.tenant_users"));
    expect(authValidation).toBeLessThan(rpcSql.indexOf("INSERT INTO public.tenant_user_sucursales"));
  });
});
