import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "migrations", "001_init_ecf.sql"),
  "utf8"
);

describe("e-CF infrastructure migration", () => {
  it("adds explicit tenant fiscal mode columns without removing legacy NCF fields", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS fiscal_mode text");
    expect(migration).toContain("ncf_fiscal_activo IS TRUE THEN 'ncf_legacy'");
    expect(migration).toContain("CHECK (fiscal_mode IN ('internal_receipt', 'ncf_legacy', 'dgii_ecf'))");
  });

  it("creates e-CF documents, certificate metadata, fiscal events, and fiscal outbox tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ecf_documents");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ecf_certificate_metadata");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ecf_document_events");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.fiscal_outbox");
    expect(migration).toContain("CONSTRAINT fiscal_outbox_idempotency_key_unique UNIQUE (idempotency_key)");
  });

  it("keeps payment, client sync, and DGII lifecycle states separate", () => {
    expect(migration).toContain("status text NOT NULL DEFAULT 'pending_sync'");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS ecf_documents_tenant_status_idx");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS fiscal_outbox_tenant_status_idx");
    expect(migration).not.toContain("ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS estado_fiscal");
  });

  it("enables RLS and protects worker-only outbox mutation through project_admin", () => {
    expect(migration).toContain("ALTER TABLE public.ecf_documents ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("ALTER TABLE public.fiscal_outbox ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("CREATE POLICY cb_fiscal_outbox_project_admin_all ON public.fiscal_outbox");
    expect(migration).toContain("CREATE POLICY cb_fiscal_outbox_no_app_update ON public.fiscal_outbox");
  });

  it("prevents app roles from updating authoritative DGII document lifecycle fields", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS cb_ecf_documents_tenant_update ON public.ecf_documents;");
    expect(migration).not.toMatch(/CREATE POLICY cb_ecf_documents_tenant_update/);
    expect(migration).toContain("CREATE POLICY cb_ecf_documents_tenant_insert ON public.ecf_documents");
    expect(migration).toContain("CREATE POLICY cb_ecf_documents_no_app_update ON public.ecf_documents");
    expect(migration).toContain("FOR UPDATE TO public\n  USING (false) WITH CHECK (false);");
    expect(migration).toContain("CREATE POLICY cb_ecf_documents_project_admin_all ON public.ecf_documents");
  });
});
