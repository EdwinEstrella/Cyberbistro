import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261018160000_ecf_certification_simulation.sql", "utf8");
const code = sql.replace(/^--.*$/gm, "");

describe("ecf certification simulation migration", () => {
  it("recreates the run type check with simulation", () => {
    expect(code).toContain("DROP CONSTRAINT IF EXISTS ecf_certification_runs_run_type_check");
    expect(code).toContain("CHECK (run_type IN ('test_set', 'commercial_approval', 'simulation'))");
    expect(code.indexOf("DROP CONSTRAINT IF EXISTS ecf_certification_runs_run_type_check")).toBeLessThan(
      code.indexOf("ADD CONSTRAINT ecf_certification_runs_run_type_check"),
    );
  });

  it("denormalizes run_type on submissions and backfills it from the run", () => {
    expect(code).toContain("ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'test_set'");
    expect(code).toContain("ADD COLUMN IF NOT EXISTS source_case_id text");
    expect(code).toMatch(/UPDATE public\.ecf_certification_submissions s\s+SET run_type = r\.run_type\s+FROM public\.ecf_certification_runs r\s+WHERE r\.id = s\.run_id/);
    expect(code.indexOf("UPDATE public.ecf_certification_submissions")).toBeLessThan(code.indexOf("CREATE UNIQUE INDEX"));
  });

  it("makes a simulation e-NCF unique per tenant and environment, excluding RFCE rows", () => {
    expect(code).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS ecf_certification_submissions_simulation_encf_key\s+ON public\.ecf_certification_submissions \(tenant_id, environment, encf\)\s+WHERE run_type = 'simulation' AND kind IN \('ecf', 'portal_upload'\)/,
    );
  });

  it("guards test-set vs simulation reuse in a trigger that also sets run_type from the run", () => {
    expect(code).toContain("SELECT r.run_type INTO NEW.run_type FROM public.ecf_certification_runs r WHERE r.id = NEW.run_id");
    expect(code).toContain("s.run_type <> NEW.run_type");
    expect(code).toContain("ERRCODE = 'unique_violation'");
    expect(code).toContain("SET search_path = ''");
    expect(code).toMatch(/BEFORE INSERT ON public\.ecf_certification_submissions\s+FOR EACH ROW EXECUTE FUNCTION public\.ecf_certification_submissions_issued_guard\(\)/);
  });

  it("opens no write grant to clients", () => {
    expect(code).toContain("GRANT SELECT (run_type, source_case_id) ON public.ecf_certification_submissions TO authenticated");
    expect(code).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO\s+authenticated/i);
    expect(code).not.toMatch(/GRANT[^;]*TO\s+anon/i);
  });
});
