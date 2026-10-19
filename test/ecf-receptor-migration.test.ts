import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261017160000_ecf_receptor.sql", "utf8");
const code = sql.replace(/^--.*$/gm, "");
const tables = ["ecf_receptor_seeds", "ecf_receptor_tokens", "ecf_received_documents", "ecf_received_approvals"];

describe("ecf receptor migration", () => {
  it("creates every table idempotently with RLS enabled", () => {
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated`);
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO service_role`);
    }
  });

  it("never grants write access or secret hashes to client roles", () => {
    expect(code).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO\s+(anon|authenticated)/i);
    expect(code).not.toMatch(/GRANT[^;]*(seed_hash|token_hash)/i);
    expect(code).not.toMatch(/GRANT[^;]*ON TABLE public\.ecf_receptor_(seeds|tokens)[^;]*TO\s+(anon|authenticated)/i);
  });

  it("stores only hashes for seeds and tokens, and seeds are unique", () => {
    expect(sql).toContain("seed_hash text NOT NULL CHECK (seed_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain("token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain("UNIQUE (seed_hash)");
    expect(sql).toContain("UNIQUE (token_hash)");
  });

  it("limits client reads of received documents to non-XML columns of their own tenant", () => {
    const grant = sql.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.ecf_received_documents TO authenticated/);
    expect(grant).not.toBeNull();
    expect(grant![1]).not.toMatch(/\bxml\b|arecf_xml/);
    expect(sql).toContain("tu.auth_user_id = auth.uid()");
  });

  it("enforces one accepted document per tenant, emisor and eNCF", () => {
    expect(sql).toMatch(/UNIQUE INDEX IF NOT EXISTS ecf_received_documents_accepted_uidx[\s\S]*\(tenant_id, emisor_rnc, encf\) WHERE estado = 0/);
    expect(sql).toContain("CHECK ((estado = 1) = (motivo_no_recibido IS NOT NULL))");
  });

  it("restricts the SECURITY DEFINER helpers to service_role with a pinned search_path", () => {
    for (const fn of ["ecf_receptor_resolve_tenant(text)", "ecf_receptor_purge_expired()"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role`);
    }
    expect(sql.match(/SECURITY DEFINER\s+SET search_path = public/g)?.length).toBe(2);
  });

  it("does not modify existing tables", () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.(tenants|ecf_certificate_metadata)/);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
