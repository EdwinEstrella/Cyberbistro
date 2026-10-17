import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261017150000_enforce_ecf_sequence_range.sql"),
  "utf8",
);

describe("cloudix_reserve_ecf range enforcement migration", () => {
  it("keeps signature, SECURITY DEFINER and pinned search_path", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_reserve_ecf(p_tenant_id uuid, p_ncf_tipo text)");
    expect(sql).toContain("RETURNS TABLE(ncf_fiscal_activo boolean, ncf_tipo_codigo text, seq_reserved integer)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'pg_catalog', 'public', 'pg_temp'");
  });

  it("keeps the auth, membership, type and active checks and the row lock", () => {
    expect(sql).toContain("public.cloudix_auth_user_id()");
    expect(sql).toContain("v_auth_user_id IS NULL");
    expect(sql).toContain("FROM public.tenant_users WHERE auth_user_id = v_auth_user_id AND tenant_id = p_tenant_id AND activo = true");
    expect(sql).toContain("'E31','E32','E33','E34','E41','E43','E44','E45','E46','E47'");
    expect(sql).toContain("v_fiscal_activo IS NOT TRUE");
    expect(sql).toMatch(/ecf_secuencias_rangos[\s\S]*FROM public\.tenants t WHERE t\.id = p_tenant_id FOR UPDATE/);
  });

  it("raises both stable codes", () => {
    expect(sql).toContain("MESSAGE = 'ECF_RANGE_NOT_CONFIGURED'");
    expect(sql).toContain("MESSAGE = 'ECF_RANGE_EXHAUSTED'");
  });

  it("raises EXHAUSTED before the counter UPDATE and clamps to start", () => {
    const exhausted = sql.indexOf("MESSAGE = 'ECF_RANGE_EXHAUSTED'");
    const update = sql.indexOf("UPDATE public.tenants SET ncf_secuencias_por_tipo");
    expect(exhausted).toBeGreaterThan(-1);
    expect(exhausted).toBeLessThan(update);
    expect(sql).toContain("IF v_seq_actual < v_range_start THEN v_seq_actual := v_range_start; END IF;");
    expect(sql).toContain("IF v_seq_actual > v_range_end THEN");
  });

  it("does not expose the function to anon", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.cloudix_reserve_ecf(uuid, text) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cloudix_reserve_ecf(uuid, text) TO authenticated;");
  });
});
