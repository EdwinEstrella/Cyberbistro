import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20261024120000_purge_comandas_on_cierre.sql"), "utf8");

describe("cloudix_purge_comandas migration", () => {
  it("is a SECURITY DEFINER function with pinned search_path and the expected signature", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_purge_comandas(p_tenant_id uuid, p_sucursal_id uuid)");
    expect(sql).toContain("RETURNS integer");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'pg_catalog', 'public', 'pg_temp'");
  });

  it("requires an authenticated active member of the tenant", () => {
    expect(sql).toContain("public.cloudix_auth_user_id()");
    expect(sql).toContain("FROM public.tenant_users WHERE auth_user_id = v_auth_user_id AND tenant_id = p_tenant_id AND activo = true");
    expect(sql).toContain("insufficient_privilege");
  });

  it("unlinks consumos before deleting comandas, both tenant-scoped, and returns the count", () => {
    const unlink = sql.indexOf("UPDATE public.consumos SET comanda_id = NULL");
    const del = sql.indexOf("DELETE FROM public.comandas");
    expect(unlink).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(unlink);
    expect(sql).toContain("tenant_id = p_tenant_id");
    expect(sql).toContain("p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id");
    expect(sql).toContain("GET DIAGNOSTICS");
    expect(sql).not.toMatch(/DELETE FROM public\.consumos/);
  });

  it("grants execute to authenticated only", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.cloudix_purge_comandas(uuid, uuid) FROM PUBLIC, anon");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cloudix_purge_comandas(uuid, uuid) TO authenticated");
  });
});
