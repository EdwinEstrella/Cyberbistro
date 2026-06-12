import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "migrations", "20260611220000_create_ecf_batches.sql");

describe("e-CF batches and document extensions migration", () => {
  it("creates public.ecf_batches table with status and track id fields", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ecf_batches");
    expect(migration).toContain("status text NOT NULL DEFAULT 'pending'");
    expect(migration).toContain("dgii_track_id text");
    expect(migration).toContain("dgii_status_code text");
  });

  it("adds batch reference and rfce threshold/rejection scope columns to ecf_documents", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("batch_id uuid REFERENCES public.ecf_batches(id)");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS rejection_scope text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS rfce_threshold_used numeric");
  });

  it("updates check constraints to allow pending_configuration and blocked_configuration states", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("pending_configuration");
    expect(migration).toContain("blocked_configuration");
    expect(migration).toContain("rejection_scope IN ('individual', 'batch')");
  });

  it("enables RLS and configures public select/insert and project_admin bypass policies on ecf_batches", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("ALTER TABLE public.ecf_batches ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("CREATE POLICY cb_ecf_batches_tenant_select ON public.ecf_batches");
    expect(migration).toContain("CREATE POLICY cb_ecf_batches_tenant_insert ON public.ecf_batches");
    expect(migration).toContain("CREATE POLICY cb_ecf_batches_no_app_update ON public.ecf_batches");
    expect(migration).toContain("CREATE POLICY cb_ecf_batches_project_admin_all ON public.ecf_batches");
  });
});
