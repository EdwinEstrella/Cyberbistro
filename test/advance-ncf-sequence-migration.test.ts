import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261021120000_cloudix_advance_ncf_sequence.sql"),
  "utf8",
);

describe("cloudix_advance_ncf_sequence migration", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_advance_ncf_sequence(p_tenant_id uuid, p_ncf_tipo text, p_next integer)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'pg_catalog', 'public', 'pg_temp'");
  });

  it("checks auth and active membership before locking the row", () => {
    expect(sql).toContain("public.cloudix_auth_user_id()");
    expect(sql).toContain("v_auth_user_id IS NULL");
    const membership = sql.indexOf("FROM public.tenant_users WHERE auth_user_id = v_auth_user_id AND tenant_id = p_tenant_id AND activo = true");
    const lock = sql.indexOf("FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE");
    expect(membership).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(membership);
  });

  it("validates type and range", () => {
    expect(sql).toContain("v_tipo NOT IN ('B01','B02','B14','B15','B16','B17')");
    expect(sql).toContain("p_next > 100000000");
    expect(sql).toContain("MESSAGE = 'NCF_SEQUENCE_OUT_OF_RANGE'");
  });

  it("only moves forward and keeps the three counter places consistent", () => {
    expect(sql).toContain("IF p_next <= v_current THEN");
    expect(sql).toMatch(/v_b02 := greatest\(v_b02, p_next\)/);
    expect(sql).toContain("ncf_b02_secuencia_siguiente = v_b02");
    expect(sql).toContain("ncf_secuencias_por_tipo = jsonb_build_object(");
    expect(sql).toContain("ncf_secuencia_siguiente = greatest(v_legacy,");
  });

  it("grants execute to authenticated only", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.cloudix_advance_ncf_sequence(uuid, text, integer) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cloudix_advance_ncf_sequence(uuid, text, integer) TO authenticated;");
  });
});
