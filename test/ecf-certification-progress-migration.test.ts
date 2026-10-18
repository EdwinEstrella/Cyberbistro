import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261018130000_ecf_certification_progress.sql", "utf8");
const code = sql.replace(/^--.*$/gm, "");

describe("ecf certification progress migration", () => {
  it("creates both tables idempotently with RLS enabled and anon locked out", () => {
    for (const table of ["ecf_certification_progress", "ecf_signed_documents"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated`);
    }
    expect(code).not.toMatch(/TO\s+anon/i);
  });

  it("keys progress by tenant, bounds the step and restricts completed steps", () => {
    expect(sql).toContain("tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE");
    expect(sql).toContain("current_step smallint NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 15)");
    expect(sql).toContain("completed_steps smallint[] NOT NULL DEFAULT '{}'");
    expect(sql).toContain("completed_steps <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]::smallint[]");
  });

  it("lets members read progress but only tenant admins write it", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.ecf_certification_progress TO authenticated/);
    expect(code).not.toMatch(/GRANT[^;]*DELETE[^;]*ecf_certification_progress[^;]*TO\s+authenticated/i);
    const select = sql.match(/CREATE POLICY ecf_certification_progress_member_select[\s\S]*?;\n/)![0];
    expect(select).not.toContain("rol IN");
    for (const name of ["admin_insert", "admin_update"]) {
      const policy = sql.match(new RegExp(`CREATE POLICY ecf_certification_progress_${name}[\\s\\S]*?;\\n`))![0];
      expect(policy).toContain("tu.rol IN ('admin', 'super_admin')");
      expect(policy).toContain("tu.activo = true");
      expect(policy).toContain("tu.auth_user_id = auth.uid()");
    }
  });

  it("never grants write access on the signing audit to client roles", () => {
    expect(code).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*ecf_signed_documents[^;]*TO\s+(anon|authenticated)/i);
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_signed_documents TO service_role");
  });

  it("stores only hashes in the audit and shows it to tenant admins only", () => {
    expect(sql).toContain("input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain("output_sha256 text NOT NULL CHECK (output_sha256 ~ '^[0-9a-f]{64}$')");
    expect(code).not.toMatch(/\bxml\b\s+text/i);
    const policy = sql.match(/CREATE POLICY ecf_signed_documents_admin_select[\s\S]*?;\n/)![0];
    expect(policy).toContain("tu.rol IN ('admin', 'super_admin')");
  });

  it("restricts document types to the ones the edge function signs", () => {
    expect(sql).toContain("CHECK (document_type IN ('postulacion', 'declaracion_jurada'))");
  });
});
