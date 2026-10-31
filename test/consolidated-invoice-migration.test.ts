import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261101120000_consolidated_invoice.sql"),
  "utf8"
);

describe("Consolidated invoice migration (20261101120000_consolidated_invoice.sql)", () => {
  it("adds the consolidated columns to facturas idempotently", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS consolidated_cxc_ids uuid[] NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS consolidated_from date NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS consolidated_to date NULL");
  });

  it("defines SECURITY DEFINER RPCs with pinned search_path", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_preview_consolidated_invoice(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_issue_consolidated_invoice(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.revert_company_digital_order_accept(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cancel_digital_order_item(");

    const matches = sql.match(/SET search_path = pg_catalog, public, pg_temp/g);
    expect(matches?.length).toBeGreaterThanOrEqual(4);
  });

  it("revokes EXECUTE from anon and PUBLIC, granting only to authenticated", () => {
    for (const fn of [
      "cloudix_preview_consolidated_invoice(uuid, date, date, uuid)",
      "cloudix_issue_consolidated_invoice(uuid, date, date, uuid)",
      "revert_company_digital_order_accept(uuid)",
      "cancel_digital_order_item(uuid)",
    ]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn} FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated;`);
    }
  });

  it("checks authorization, corporativo plan, buyer RNC, and ITBIS included requirement", () => {
    expect(sql).toContain("public.cloudix_auth_user_id()");
    expect(sql).toContain("public.cyberbistro_has_tenant_role(");
    expect(sql).toContain("'PLAN_REQUIRED'");
    expect(sql).toContain("'BUYER_RNC_INVALID'");
    expect(sql).toContain("'NOTHING_TO_INVOICE'");
    expect(sql).toContain("'ORDER_ALREADY_INVOICED'");
    expect(sql).toContain("'ITBIS_NOT_INCLUDED_UNSUPPORTED'");
    expect(sql).toContain("'TOTAL_MISMATCH'");
  });

  it("defines ITBIS rate constant and enforces total equals debt invariant", () => {
    expect(sql).toContain("v_itbis_rate numeric := 0.18;");
    expect(sql).toContain("IF v_total <> round(v_orders_total, 2) THEN");
    expect(sql).toContain("RAISE EXCEPTION 'TOTAL_MISMATCH';");
  });

  it("locks CxC rows with FOR UPDATE and updates factura_id without changing amounts", () => {
    expect(sql).toContain("FOR UPDATE OF cxc");
    expect(sql).toContain("UPDATE public.cuentas_cobrar");
    expect(sql).toContain("SET factura_id = v_factura_id");
  });

  it("reserves E31 and queues ecf_documents and fiscal_outbox atomically", () => {
    expect(sql).toContain("public.cloudix_reserve_ecf(v_customer.tenant_id, 'E31')");
    expect(sql).toContain("INSERT INTO public.facturas");
    expect(sql).toContain("INSERT INTO public.ecf_documents");
    expect(sql).toContain("INSERT INTO public.fiscal_outbox");
  });
});
