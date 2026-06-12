import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "migrations", "20260611210000_finish-dgii-ecf-readiness.sql");

describe("DGII e-CF readiness foundation migration", () => {
  it("adds tenant issuer configuration fields required by XML generation", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS ecf_issuer_sucursal text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS ecf_issuer_municipio text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS ecf_issuer_provincia text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS ecf_issuer_actividad_economica text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS ecf_issuer_correo_emisor text");
  });

  it("creates E32 readiness evidence primitives without marking E32 ready by default", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ecf_e32_readiness_evidence");
    expect(migration).toContain("e32_validated boolean NOT NULL DEFAULT false");
    expect(migration).toContain("rfce_validated boolean NOT NULL DEFAULT false");
    expect(migration).toContain("resumen_validated boolean NOT NULL DEFAULT false");
    expect(migration).toContain("approved_at timestamptz");
  });

  it("implements the trusted reenqueue RPC boundary with tenant authorization", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.cloudix_reenqueue_ecf_document");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("public.cyberbistro_has_tenant_role(p_tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])");
    expect(migration).toContain("RAISE EXCEPTION 'Not authorized to reenqueue e-CF document for tenant %', p_tenant_id");
    expect(migration).toContain("USING ERRCODE = '42501'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.cloudix_reenqueue_ecf_document(uuid, uuid) TO authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.cloudix_reenqueue_ecf_document(uuid, uuid) TO project_admin");
  });

  it("limits reenqueue to owned error-state documents and records lifecycle state through the RPC", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("v_document.status NOT IN ('rejected', 'retryable_error', 'terminal_error')");
    expect(migration).toContain("UPDATE public.ecf_documents");
    expect(migration).toContain("status = 'pending_sync'");
    expect(migration).toContain("dgii_status_message = 'Reencolado manualmente'");
    expect(migration).toContain("INSERT INTO public.ecf_document_events");
    expect(migration).toContain("reason, metadata, created_by");
    expect(migration).toContain("'manual_reenqueue'");
    expect(migration).toContain("'trusted_rpc'");
  });

  it("suppresses only active manual reenqueue outbox rows and validates status before idempotent success", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("v_idempotency_key := format('manual_reenqueue:%s:%s:%s', p_tenant_id, p_ecf_document_id, txid_current())");
    expect(migration).toContain("AND operation = 'resubmit'");
    expect(migration).toContain("AND status IN ('queued', 'processing', 'retryable_error')");
    expect(migration).toContain("locked_at >= now() - interval '15 minutes'");
    expect(migration).not.toContain("WHERE idempotency_key = v_idempotency_key;");
    expect(migration).not.toContain("ON CONFLICT (idempotency_key) DO UPDATE");
    expect(migration).toContain("RETURNING * INTO v_outbox");
    expect(migration).toContain("'idempotent', true");
    expect(migration).toContain("'outbox_id', v_outbox.id");

    const activeLookupIndex = migration.indexOf("AND operation = 'resubmit'");
    const idempotentReturnIndex = migration.indexOf("'idempotent', true");
    const statusValidationIndex = migration.indexOf("v_document.status NOT IN ('pending_sync', 'rejected', 'retryable_error', 'terminal_error')");

    expect(activeLookupIndex).toBeGreaterThan(0);
    expect(statusValidationIndex).toBeGreaterThan(activeLookupIndex);
    expect(idempotentReturnIndex).toBeGreaterThan(statusValidationIndex);
  });
});
