import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261018140000_ecf_certification_submissions.sql", "utf8");
const code = sql.replace(/^--.*$/gm, "");
const TABLES = ["ecf_certification_runs", "ecf_certification_submissions"];

describe("ecf certification submissions migration", () => {
  it("creates both tables idempotently with RLS enabled and anon locked out", () => {
    for (const table of TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated`);
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO service_role`);
    }
    expect(code).not.toMatch(/TO\s+anon/i);
  });

  it("never lets client roles write", () => {
    for (const table of TABLES) {
      expect(code).not.toMatch(new RegExp(`GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*${table}[^;]*TO\s+authenticated`, "i"));
    }
    expect(code).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("shows runs and submissions to tenant admins only, without the unsigned XML", () => {
    for (const table of TABLES) {
      const policy = sql.match(new RegExp(`CREATE POLICY ${table}_admin_select[\\s\\S]*?;(\\r?\\n|$)`))![0];
      expect(policy).toContain("FOR SELECT TO authenticated");
      expect(policy).toContain("tu.rol IN ('admin', 'super_admin')");
      expect(policy).toContain("tu.activo = true");
      expect(policy).toContain("tu.auth_user_id = (SELECT auth.uid())");
    }
    const grant = sql.match(/GRANT SELECT \([^)]*\)\s+ON public\.ecf_certification_submissions TO authenticated/)![0];
    expect(grant).toContain("signed_xml");
    expect(grant).not.toContain("unsigned_xml");
  });

  it("constrains kinds, statuses, environments and uniqueness", () => {
    expect(sql).toContain("CHECK (kind IN ('ecf', 'rfce', 'portal_upload'))");
    expect(sql).toContain("CHECK (status IN ('pending', 'sent', 'accepted', 'accepted_conditional', 'rejected', 'error', 'ready_for_portal'))");
    expect(sql.match(/CHECK \(environment IN \('test', 'certification'\)\)/g)).toHaveLength(2);
    expect(sql).toContain("UNIQUE (run_id, case_id, kind)");
    expect(sql).toContain("UNIQUE (run_id, sequence_order)");
    expect(sql).toContain("run_id uuid NOT NULL REFERENCES public.ecf_certification_runs(id) ON DELETE CASCADE");
    expect(sql).toContain("CHECK (jsonb_typeof(dgii_messages) = 'array')");
  });
});
