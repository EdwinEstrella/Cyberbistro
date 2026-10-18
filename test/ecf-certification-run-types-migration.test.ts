import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261018150000_ecf_certification_run_types.sql", "utf8");
const code = sql.replace(/^--.*$/gm, "");

describe("ecf certification run types migration", () => {
  it("adds a constrained run_type that defaults existing runs to test_set", () => {
    expect(code).toContain("ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'test_set'");
    expect(code).toContain("CHECK (run_type IN ('test_set', 'commercial_approval'))");
    expect(code).toContain("DROP CONSTRAINT IF EXISTS ecf_certification_runs_run_type_check");
  });

  it("lets admins read run_type without opening any write grant", () => {
    expect(code).toContain("GRANT SELECT (run_type) ON public.ecf_certification_runs TO authenticated");
    expect(code).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO\s+authenticated/i);
    expect(code).not.toMatch(/TO\s+anon/i);
  });

  it("finds the generated kind constraint by definition and recreates it with acecf", () => {
    expect(code).toContain("pg_get_constraintdef(con.oid) LIKE '%portal_upload%'");
    expect(code).toContain("con.conrelid = 'public.ecf_certification_submissions'::regclass");
    expect(code).toContain("DROP CONSTRAINT %I");
    expect(code).toContain("ADD CONSTRAINT ecf_certification_submissions_kind_check CHECK (kind IN ('ecf', 'rfce', 'portal_upload', 'acecf'))");
  });

  it("drops the old constraint before adding the new one", () => {
    expect(code.indexOf("DROP CONSTRAINT %I")).toBeLessThan(code.indexOf("ADD CONSTRAINT ecf_certification_submissions_kind_check"));
  });
});
