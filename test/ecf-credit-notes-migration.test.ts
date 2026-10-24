import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20261024130000_ecf_credit_notes.sql"), "utf8");

describe("e-CF credit notes migration", () => {
  it("adds the nullable credit note columns idempotently", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS credit_note_of uuid REFERENCES public.facturas(id) ON DELETE RESTRICT");
    for (const col of ["ref_ncf text", "ref_fecha_emision date", "ref_codigo_modificacion smallint", "ref_razon_modificacion text"]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
  });

  it("builds a 13-character DGII e-NCF (E34 + 10-digit sequence)", () => {
    expect(sql).toContain("v_encf := 'E34' || lpad(v_seq::text, 10, '0');");
  });

  it("allows only one credit note per original invoice", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS \w+\s+ON public\.facturas \(credit_note_of\)\s+WHERE credit_note_of IS NOT NULL/);
  });

  it("defines a SECURITY DEFINER RPC with pinned search_path granted to authenticated only", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_issue_credit_note(");
    expect(sql).toContain("p_tenant_id uuid");
    expect(sql).toContain("p_factura_id uuid");
    expect(sql).toContain("p_razon text");
    expect(sql).toContain("p_sucursal_id uuid");
    expect(sql).toContain("RETURNS jsonb");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'pg_catalog', 'public', 'pg_temp'");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.cloudix_issue_credit_note(uuid, uuid, text, uuid) FROM PUBLIC, anon");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cloudix_issue_credit_note(uuid, uuid, text, uuid) TO authenticated");
  });

  it("checks authentication, active admin membership and locks the original invoice", () => {
    expect(sql).toContain("public.cloudix_auth_user_id()");
    expect(sql).toContain("tu.activo = true");
    expect(sql).toContain("lower(trim(tu.rol)) = 'admin'");
    expect(sql).toContain("FOR UPDATE");
  });

  it("raises a distinct stable code for every rejection", () => {
    for (const code of [
      "CREDIT_NOTE_FORBIDDEN",
      "CREDIT_NOTE_ORIGINAL_NOT_FOUND",
      "CREDIT_NOTE_ORIGINAL_IS_CREDIT_NOTE",
      "CREDIT_NOTE_TYPE_NOT_ALLOWED",
      "CREDIT_NOTE_ORIGINAL_NOT_ACCEPTED",
      "CREDIT_NOTE_ALREADY_EXISTS",
      "CREDIT_NOTE_WINDOW_EXPIRED",
      "CREDIT_NOTE_REASON_REQUIRED",
      "CREDIT_NOTE_NO_OPEN_CYCLE",
      "CREDIT_NOTE_CREDIT_SALE_UNSUPPORTED",
    ]) {
      expect(sql).toContain(`MESSAGE = '${code}'`);
    }
  });

  it("restricts originals to accepted E31/E32 and a 30 day window in Santo Domingo time", () => {
    expect(sql).toContain("left(v_orig.ncf, 3) NOT IN ('E31', 'E32')");
    expect(sql).toContain("v_ecf.status IS DISTINCT FROM 'accepted'");
    expect(sql).toContain("America/Santo_Domingo");
    expect(sql).toContain("30");
    expect(sql).toContain("v_orig.created_at");
  });

  it("requires an open cash cycle for the tenant and branch", () => {
    expect(sql).toMatch(/FROM public\.cierres_operativos[\s\S]*closed_at IS NULL/);
  });

  it("reserves the E34 before inserting, then writes factura, ecf document, outbox and refund atomically", () => {
    const reserve = sql.indexOf("public.cloudix_reserve_ecf(p_tenant_id, 'E34')");
    const facturaInsert = sql.indexOf("INSERT INTO public.facturas");
    const ecfInsert = sql.indexOf("INSERT INTO public.ecf_documents");
    const outboxInsert = sql.indexOf("INSERT INTO public.fiscal_outbox");
    const gastoInsert = sql.indexOf("INSERT INTO public.gastos");
    expect(reserve).toBeGreaterThan(-1);
    expect(reserve).toBeLessThan(facturaInsert);
    expect(facturaInsert).toBeLessThan(ecfInsert);
    expect(ecfInsert).toBeLessThan(outboxInsert);
    expect(outboxInsert).toBeLessThan(gastoInsert);
  });

  it("stamps the credit note row with the reference fields and a queued submit job", () => {
    expect(sql).toContain("'nota_credito'");
    expect(sql).toContain("credit_note_of");
    expect(sql).toContain("ref_codigo_modificacion");
    expect(sql).toContain("'34'");
    expect(sql).toContain("'queued'");
    expect(sql).toContain("'submit'");
    expect(sql).toContain("':' || v_note_id::text || ':submit'");
  });

  it("books the refund as an operational expense in a per-tenant category", () => {
    expect(sql).toContain("Devolución / Nota de crédito");
    expect(sql).toContain("INSERT INTO public.gasto_categorias");
    expect(sql).toContain("v_cycle_id");
  });

  it("returns the created ids", () => {
    for (const key of ["credit_note_factura_id", "encf", "ecf_document_id", "gasto_id"]) {
      expect(sql).toContain(`'${key}'`);
    }
  });
});
