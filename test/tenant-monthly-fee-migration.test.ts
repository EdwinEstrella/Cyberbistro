import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261119200000_tenant_monthly_fee.sql"),
  "utf8"
);

describe("tenant monthly fee migration", () => {
  it("adds monthly fee and anchor columns to public.tenants idempotently with checks", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS monthly_fee_amount numeric(12,2)");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS monthly_fee_currency text NOT NULL DEFAULT 'DOP'");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS last_charged_period date");

    expect(sql).toContain("tenants_monthly_fee_amount_non_negative");
    expect(sql).toContain("CHECK (monthly_fee_amount IS NULL OR monthly_fee_amount >= 0)");

    expect(sql).toContain("tenants_monthly_fee_currency_check");
    expect(sql).toContain("CHECK (monthly_fee_currency IN ('DOP', 'USD'))");
  });

  it("creates tenant_billing_payments table with cascading FK and indexes", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_billing_payments");
    expect(sql).toContain("tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE");
    expect(sql).toContain("amount numeric(12,2) NOT NULL CHECK (amount > 0)");
    expect(sql).toContain("currency text NOT NULL CHECK (currency IN ('DOP', 'USD'))");
    expect(sql).toContain("paid_at timestamptz NOT NULL DEFAULT now()");
    expect(sql).toContain("recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL");
    expect(sql).toContain("notes text");
    expect(sql).toContain("created_at timestamptz NOT NULL DEFAULT now()");

    expect(sql).toContain("idx_tenant_billing_payments_tenant_paid_at");
    expect(sql).toContain("ON public.tenant_billing_payments (tenant_id, paid_at DESC)");
  });

  it("enforces least privilege and RLS on tenant_billing_payments with super admin ALL and tenant member SELECT", () => {
    expect(sql).toContain("ALTER TABLE public.tenant_billing_payments ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("REVOKE ALL ON TABLE public.tenant_billing_payments FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT SELECT ON TABLE public.tenant_billing_payments TO authenticated;");
    expect(sql).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_billing_payments TO authenticated;");
    expect(sql).toContain("GRANT ALL ON TABLE public.tenant_billing_payments TO service_role;");

    expect(sql).toContain("cb_tenant_billing_payments_superadmin");
    expect(sql).toContain("USING (COALESCE(public.cloudix_is_super_admin(), false))");
    expect(sql).toContain("WITH CHECK (COALESCE(public.cloudix_is_super_admin(), false))");

    expect(sql).toContain("cb_tenant_billing_payments_member_select");
    expect(sql).toContain("FOR SELECT TO authenticated");
    expect(sql).toContain("FROM public.tenant_users tu");
    expect(sql).toContain("tu.tenant_id = tenant_billing_payments.tenant_id");
    expect(sql).toContain("tu.activo IS TRUE");
    expect(sql).toContain("tu.auth_user_id = public.cloudix_auth_user_id()");
    expect(sql).toContain("lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), ''))");
  });

  it("extends debt protection trigger to cover monthly fee columns", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_protect_tenant_debt_columns()");
    expect(sql).toContain("NEW.monthly_fee_amount := OLD.monthly_fee_amount;");
    expect(sql).toContain("NEW.monthly_fee_currency := OLD.monthly_fee_currency;");
    expect(sql).toContain("NEW.last_charged_period := OLD.last_charged_period;");
    expect(sql).toContain("NEW.debt_amount := OLD.debt_amount;");

    // Comment confirms why SECURITY DEFINER functions can write
    expect(sql).toMatch(/Inside SECURITY DEFINER functions, current_user switches to the function owner/i);

    expect(sql).toContain("BEFORE UPDATE OF debt_amount, debt_currency, debt_due_date, debt_updated_at,");
    expect(sql).toContain("monthly_fee_amount, monthly_fee_currency, last_charged_period");
    expect(sql).toContain("ON public.tenants");
  });

  it("defines immutable billing date helpers", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_billing_date(p_month date, p_day int)");
    expect(sql).toContain("RETURNS date");
    expect(sql).toContain("IMMUTABLE");

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.cloudix_latest_billing_date_on_or_before(p_day int, p_as_of date)"
    );
    expect(sql).toContain("RETURNS date");
    expect(sql).toContain("IMMUTABLE");
  });

  it("defines cloudix_super_admin_set_monthly_fee with auth, validations, and anchor logic", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_super_admin_set_monthly_fee(");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("IF NOT COALESCE(public.cloudix_is_super_admin(), false) THEN");
    expect(sql).toContain("RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';");

    // Validations
    expect(sql).toContain("INVALID_AMOUNT");
    expect(sql).toContain("INVALID_CURRENCY");
    expect(sql).toContain("INVALID_PAYMENT_DAY");
    expect(sql).toContain("CURRENCY_MISMATCH");

    // Anchor rule
    expect(sql).toContain("cloudix_latest_billing_date_on_or_before(p_payment_day, current_date)");
    expect(sql).toContain("(NOT v_had_fee) OR v_day_changed OR (v_anchor IS NULL)");
  });

  it("defines cloudix_accrue_tenant_monthly_fee with lazy accrual, 120 guard, and due date preservation", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_accrue_tenant_monthly_fee(");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");

    // Dual authorization: superadmin OR tenant member
    expect(sql).toContain("v_is_super := COALESCE(public.cloudix_is_super_admin(), false);");
    expect(sql).toContain("FROM public.tenant_users tu");
    expect(sql).toContain("IF NOT (v_is_super OR v_is_member) THEN");
    expect(sql).toContain("RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';");

    // Row lock
    expect(sql).toContain("FOR UPDATE;");

    // Null anchor / missing fee no-op
    expect(sql).toContain("v_tenant.last_charged_period IS NULL");
    expect(sql).toContain("'accrued_cycles', 0");

    // 120 loop guard
    expect(sql).toContain("v_iterations < 120");

    // Preserve existing due date when outstanding debt already exists
    expect(sql).toContain(
      "WHEN v_tenant.debt_amount IS NOT NULL AND v_tenant.debt_amount > 0 AND v_tenant.debt_due_date IS NOT NULL"
    );
    expect(sql).toContain("THEN v_tenant.debt_due_date");
    expect(sql).toContain("ELSE v_earliest_new_due");

    // Updates debt_amount and returns jsonb shape
    expect(sql).toContain("v_new_debt_amount := COALESCE(v_tenant.debt_amount, 0) + v_total_accrued;");
    expect(sql).toContain("'ok', true");
    expect(sql).toContain("'accrued_cycles', v_accrued_count");
    expect(sql).toContain("'accrued_amount', v_total_accrued");
    expect(sql).toContain("'debt_amount', v_new_debt_amount");
    expect(sql).toContain("'debt_due_date', v_new_debt_due_date");
  });

  it("defines cloudix_super_admin_accrue_all_monthly_fees", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_super_admin_accrue_all_monthly_fees()");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("public.cloudix_accrue_tenant_monthly_fee(r.id, current_date)");
    expect(sql).toContain("RETURN v_count;");
  });

  it("defines cloudix_register_tenant_payment to accrue first, log payment, and clear balance keeping fee", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cloudix_register_tenant_payment(");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("IF NOT COALESCE(public.cloudix_is_super_admin(), false) THEN");

    // Accrues today first
    const fnIndex = sql.indexOf("FUNCTION public.cloudix_register_tenant_payment");
    const accrueIndex = sql.indexOf("PERFORM public.cloudix_accrue_tenant_monthly_fee(p_tenant_id, current_date);", fnIndex);
    const insertIndex = sql.indexOf("INSERT INTO public.tenant_billing_payments", fnIndex);
    const updateIndex = sql.indexOf("UPDATE public.tenants", insertIndex);

    expect(fnIndex).toBeGreaterThan(-1);
    expect(accrueIndex).toBeGreaterThan(fnIndex);
    expect(insertIndex).toBeGreaterThan(accrueIndex);
    expect(updateIndex).toBeGreaterThan(insertIndex);

    // No debt no-op
    expect(sql).toContain("IF v_tenant.debt_amount IS NULL OR v_tenant.debt_amount <= 0 THEN");
    expect(sql).toContain("'settled', false");

    // Clears debt_amount and debt_due_date while preserving fee and anchor
    expect(sql).toContain("debt_amount = NULL,");
    expect(sql).toContain("debt_due_date = NULL,");
    expect(sql).not.toMatch(/UPDATE\s+public\.tenants[\s\S]*monthly_fee_amount\s*=\s*NULL/i);

    expect(sql).toContain("'settled', true");
    expect(sql).toContain("'payment_id', v_payment_id");
  });

  it("configures execute grants for authenticated users and revokes from public and anon", () => {
    for (const fn of [
      "public.cloudix_billing_date(date, int)",
      "public.cloudix_latest_billing_date_on_or_before(int, date)",
      "public.cloudix_super_admin_set_monthly_fee(uuid, numeric, text, smallint)",
      "public.cloudix_accrue_tenant_monthly_fee(uuid, date)",
      "public.cloudix_super_admin_accrue_all_monthly_fees()",
      "public.cloudix_register_tenant_payment(uuid, text)",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated;`);
    }
  });

  it("extends cyberbistro_audit_tenant_changes with debt and fee diff blocks and restores comment", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.cyberbistro_audit_tenant_changes()");
    expect(sql).toContain("-- Insert a row ONLY when cyberbistro_is_super_admin() is true");
    for (const col of [
      "debt_amount",
      "debt_currency",
      "debt_due_date",
      "monthly_fee_amount",
      "monthly_fee_currency",
      "last_charged_period",
    ]) {
      expect(sql).toContain(`IF OLD.${col} IS DISTINCT FROM NEW.${col} THEN`);
      expect(sql).toContain(`v_details := v_details || jsonb_build_object('${col}', jsonb_build_object('old', OLD.${col}, 'new', NEW.${col}));`);
    }
  });

  it("signals PostgREST to reload schema", () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
