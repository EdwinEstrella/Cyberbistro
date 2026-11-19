-- Migration: 20261119200000_tenant_monthly_fee.sql
-- Description: Recurring monthly fee configuration, payment history, and lazy accrual engine
--
-- Security & Access Verification:
-- 1. Tenant columns write protection:
--    Trigger `tenants_protect_debt_columns` is extended to cover `monthly_fee_amount`,
--    `monthly_fee_currency`, and `last_charged_period`.
--    SECURITY DEFINER functions (`cloudix_super_admin_set_monthly_fee`, `cloudix_accrue_tenant_monthly_fee`,
--    `cloudix_register_tenant_payment`) execute as the function owner (postgres / superuser).
--    When evaluated inside SECURITY DEFINER execution, `current_user` is the owner, NOT 'authenticated'
--    or 'anon'. Therefore, the condition `current_user IN ('authenticated', 'anon')` evaluates to FALSE,
--    allowing authorized RPC writes while silently discarding unauthorized client-side updates.
-- 2. Tenant payments table:
--    Protected by RLS: super admins have ALL permissions; authenticated tenant members can SELECT
--    their own tenant's payment history using the same membership check as `cb_tenants_member_select`.
--    No direct client insert, update, or delete is permitted for regular members.
-- 3. Accrual Authorization:
--    `cloudix_accrue_tenant_monthly_fee` permits execution by either super admins or active tenant members
--    so that reading billing triggers automatic on-demand balance updates without needing background cron.
-- 4. Set Fee, Accrue All, & Register Payment RPCs:
--    Restricted strictly to super admin callers (`cloudix_is_super_admin()`).

-- ============================================================================
-- 1. Add monthly fee & anchor tracking columns to public.tenants
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS monthly_fee_amount numeric(12,2);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS monthly_fee_currency text NOT NULL DEFAULT 'DOP';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS last_charged_period date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_monthly_fee_amount_non_negative'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_monthly_fee_amount_non_negative
      CHECK (monthly_fee_amount IS NULL OR monthly_fee_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_monthly_fee_currency_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_monthly_fee_currency_check
      CHECK (monthly_fee_currency IN ('DOP', 'USD'));
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.monthly_fee_amount IS
  'Configured recurring monthly SaaS subscription fee. NULL indicates no recurring fee configured.';

COMMENT ON COLUMN public.tenants.monthly_fee_currency IS
  'Currency denomination of the recurring monthly fee: DOP or USD. Defaults to DOP.';

COMMENT ON COLUMN public.tenants.last_charged_period IS
  'Date of the latest payment day already charged to debt_amount, or the non-retroactive anchor date.';

-- ============================================================================
-- 2. Create tenant_billing_payments history table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('DOP', 'USD')),
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_payments_tenant_paid_at
  ON public.tenant_billing_payments (tenant_id, paid_at DESC);

ALTER TABLE public.tenant_billing_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_billing_payments FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.tenant_billing_payments TO authenticated;
GRANT ALL ON TABLE public.tenant_billing_payments TO service_role;

DROP POLICY IF EXISTS cb_tenant_billing_payments_superadmin ON public.tenant_billing_payments;
CREATE POLICY cb_tenant_billing_payments_superadmin ON public.tenant_billing_payments
  FOR ALL TO authenticated
  USING (COALESCE(public.cloudix_is_super_admin(), false))
  WITH CHECK (COALESCE(public.cloudix_is_super_admin(), false));

DROP POLICY IF EXISTS cb_tenant_billing_payments_member_select ON public.tenant_billing_payments;
CREATE POLICY cb_tenant_billing_payments_member_select ON public.tenant_billing_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = tenant_billing_payments.tenant_id
        AND tu.activo IS TRUE
        AND (
          tu.auth_user_id = public.cloudix_auth_user_id()
          OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
        )
    )
  );

COMMENT ON TABLE public.tenant_billing_payments IS
  'Historical record of SaaS subscription debt payments registered by super administration.';

-- ============================================================================
-- 3. Extend debt protection trigger to cover monthly fee columns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cloudix_protect_tenant_debt_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Inside SECURITY DEFINER functions, current_user switches to the function owner
  -- (e.g. postgres / supabase_admin), which bypasses this condition and permits
  -- authorized internal RPC mutations. When called via direct client PostgREST
  -- requests by authenticated or anon roles without super admin privileges,
  -- modifications to debt and monthly fee columns are silently restored to OLD values.
  IF current_user IN ('authenticated', 'anon') AND NOT COALESCE(public.cloudix_is_super_admin(), false) THEN
    NEW.debt_amount := OLD.debt_amount;
    NEW.debt_currency := OLD.debt_currency;
    NEW.debt_due_date := OLD.debt_due_date;
    NEW.debt_updated_at := OLD.debt_updated_at;
    NEW.monthly_fee_amount := OLD.monthly_fee_amount;
    NEW.monthly_fee_currency := OLD.monthly_fee_currency;
    NEW.last_charged_period := OLD.last_charged_period;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_protect_debt_columns ON public.tenants;
CREATE TRIGGER tenants_protect_debt_columns
  BEFORE UPDATE OF debt_amount, debt_currency, debt_due_date, debt_updated_at,
                   monthly_fee_amount, monthly_fee_currency, last_charged_period
  ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.cloudix_protect_tenant_debt_columns();

-- ============================================================================
-- 4. Helper: calculate clamped billing date for a given month and target day
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cloudix_billing_date(p_month date, p_day int)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_y int;
  v_m int;
  v_last_day int;
  v_target_day int;
BEGIN
  IF p_month IS NULL OR p_day IS NULL THEN
    RETURN NULL;
  END IF;
  v_y := EXTRACT(YEAR FROM p_month)::int;
  v_m := EXTRACT(MONTH FROM p_month)::int;
  v_last_day := EXTRACT(DAY FROM (
    CASE WHEN v_m = 12 THEN make_date(v_y + 1, 1, 1) ELSE make_date(v_y, v_m + 1, 1) END - 1
  ))::int;
  v_target_day := LEAST(GREATEST(p_day, 1), v_last_day);
  RETURN make_date(v_y, v_m, v_target_day);
END;
$$;

COMMENT ON FUNCTION public.cloudix_billing_date(date, int) IS
  'Returns the date within p_month clamped to the month''s last day if p_day exceeds month length.';

-- ============================================================================
-- 5. Helper: latest billing date on or before an as_of date
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cloudix_latest_billing_date_on_or_before(p_day int, p_as_of date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_this_month_billing date;
  v_first_of_month date;
  v_prev_month date;
BEGIN
  IF p_day IS NULL OR p_as_of IS NULL THEN
    RETURN NULL;
  END IF;
  v_this_month_billing := public.cloudix_billing_date(p_as_of, p_day);
  IF v_this_month_billing <= p_as_of THEN
    RETURN v_this_month_billing;
  END IF;
  v_first_of_month := make_date(EXTRACT(YEAR FROM p_as_of)::int, EXTRACT(MONTH FROM p_as_of)::int, 1);
  v_prev_month := v_first_of_month - 1;
  RETURN public.cloudix_billing_date(v_prev_month, p_day);
END;
$$;

COMMENT ON FUNCTION public.cloudix_latest_billing_date_on_or_before(int, date) IS
  'Returns this month''s clamped billing date if on or before p_as_of, else the previous month''s clamped billing date.';

-- ============================================================================
-- 6. RPC: Super Admin set monthly fee
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cloudix_super_admin_set_monthly_fee(
  p_tenant_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_day smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant record;
  v_had_fee boolean;
  v_has_fee boolean;
  v_day_changed boolean;
  v_anchor date;
  v_fee_amount numeric(12,2);
BEGIN
  IF NOT COALESCE(public.cloudix_is_super_admin(), false) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Monthly fee amount cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_currency IS NULL OR p_currency NOT IN ('DOP', 'USD') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY: Currency must be DOP or USD' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NOT NULL AND p_amount > 0 THEN
    v_fee_amount := round(p_amount, 2);
    v_has_fee := true;
    IF p_payment_day IS NULL OR p_payment_day < 1 OR p_payment_day > 31 THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_DAY: Payment day must be between 1 and 31 when fee is configured' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_fee_amount := NULL;
    v_has_fee := false;
    IF p_payment_day IS NOT NULL AND (p_payment_day < 1 OR p_payment_day > 31) THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_DAY: Payment day must be between 1 and 31' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT id, monthly_fee_amount, monthly_fee_currency, payment_day_of_month,
         last_charged_period, debt_amount, debt_currency
  INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_tenant.debt_amount IS NOT NULL AND v_tenant.debt_amount > 0 AND v_tenant.debt_currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'CURRENCY_MISMATCH: Outstanding debt currency (%) differs from fee currency (%)', v_tenant.debt_currency, p_currency USING ERRCODE = '22023';
  END IF;

  v_had_fee := (v_tenant.monthly_fee_amount IS NOT NULL AND v_tenant.monthly_fee_amount > 0);
  v_day_changed := (v_tenant.payment_day_of_month IS DISTINCT FROM p_payment_day);
  v_anchor := v_tenant.last_charged_period;

  -- Anchor rule: when the fee goes from none to > 0, OR the payment day changes,
  -- OR last_charged_period IS NULL with a fee -> anchor to latest billing date on or before current_date.
  -- Changing only the amount preserves the anchor.
  IF v_has_fee THEN
    IF (NOT v_had_fee) OR v_day_changed OR (v_anchor IS NULL) THEN
      v_anchor := public.cloudix_latest_billing_date_on_or_before(p_payment_day, current_date);
    END IF;
  END IF;

  UPDATE public.tenants
  SET
    monthly_fee_amount = v_fee_amount,
    monthly_fee_currency = p_currency,
    payment_day_of_month = p_payment_day,
    last_charged_period = v_anchor,
    updated_at = now()
  WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'monthly_fee_amount', v_fee_amount,
    'monthly_fee_currency', p_currency,
    'payment_day_of_month', p_payment_day,
    'last_charged_period', v_anchor
  );
END;
$$;

-- ============================================================================
-- 7. RPC: Accrue tenant monthly fee (idempotent, lazy accrual)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cloudix_accrue_tenant_monthly_fee(
  p_tenant_id uuid,
  p_as_of date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_is_member boolean;
  v_tenant record;
  v_cur_month date;
  v_end_month date;
  v_cycle_date date;
  v_accrued_count int := 0;
  v_total_accrued numeric(12,2) := 0.00;
  v_earliest_new_due date := NULL;
  v_latest_period date;
  v_new_debt_amount numeric(12,2);
  v_new_debt_due_date date;
  v_iterations int := 0;
BEGIN
  v_is_super := COALESCE(public.cloudix_is_super_admin(), false);
  v_is_member := EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
      )
  );

  IF NOT (v_is_super OR v_is_member) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT id, monthly_fee_amount, monthly_fee_currency, payment_day_of_month,
         last_charged_period, debt_amount, debt_currency, debt_due_date
  INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- No-op if fee is null/<=0, day is null, or last_charged_period is null
  -- (a NULL anchor never charges retroactively; it must be anchored by set_monthly_fee)
  IF v_tenant.monthly_fee_amount IS NULL
     OR v_tenant.monthly_fee_amount <= 0
     OR v_tenant.payment_day_of_month IS NULL
     OR v_tenant.last_charged_period IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'accrued_cycles', 0,
      'accrued_amount', 0.00,
      'debt_amount', v_tenant.debt_amount,
      'debt_due_date', v_tenant.debt_due_date
    );
  END IF;

  v_cur_month := (date_trunc('month', v_tenant.last_charged_period) + interval '1 month')::date;
  v_end_month := date_trunc('month', p_as_of)::date;
  v_latest_period := v_tenant.last_charged_period;

  -- Iterate through candidate billing months up to p_as_of with 120-month guard
  WHILE v_cur_month <= v_end_month AND v_iterations < 120 LOOP
    v_iterations := v_iterations + 1;
    v_cycle_date := public.cloudix_billing_date(v_cur_month, v_tenant.payment_day_of_month);

    IF v_cycle_date > v_latest_period AND v_cycle_date <= p_as_of THEN
      v_accrued_count := v_accrued_count + 1;
      v_total_accrued := v_total_accrued + v_tenant.monthly_fee_amount;
      IF v_earliest_new_due IS NULL THEN
        v_earliest_new_due := v_cycle_date;
      END IF;
      v_latest_period := v_cycle_date;
    END IF;

    v_cur_month := (date_trunc('month', v_cur_month) + interval '1 month')::date;
  END LOOP;

  IF v_accrued_count > 0 THEN
    -- Anchor grace clock: preserve existing unpaid due date if tenant already had outstanding debt
    v_new_debt_due_date := CASE
      WHEN v_tenant.debt_amount IS NOT NULL AND v_tenant.debt_amount > 0 AND v_tenant.debt_due_date IS NOT NULL
      THEN v_tenant.debt_due_date
      ELSE v_earliest_new_due
    END;
    v_new_debt_amount := COALESCE(v_tenant.debt_amount, 0) + v_total_accrued;

    UPDATE public.tenants
    SET
      debt_amount = v_new_debt_amount,
      debt_currency = v_tenant.monthly_fee_currency,
      debt_due_date = v_new_debt_due_date,
      last_charged_period = v_latest_period,
      debt_updated_at = now()
    WHERE id = p_tenant_id;
  ELSE
    v_new_debt_amount := v_tenant.debt_amount;
    v_new_debt_due_date := v_tenant.debt_due_date;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'accrued_cycles', v_accrued_count,
    'accrued_amount', v_total_accrued,
    'debt_amount', v_new_debt_amount,
    'debt_due_date', v_new_debt_due_date
  );
END;
$$;

-- ============================================================================
-- 8. RPC: Super Admin accrue all monthly fees
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cloudix_super_admin_accrue_all_monthly_fees()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_res jsonb;
  v_count integer := 0;
BEGIN
  IF NOT COALESCE(public.cloudix_is_super_admin(), false) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT id
    FROM public.tenants
    WHERE monthly_fee_amount IS NOT NULL
      AND monthly_fee_amount > 0
      AND payment_day_of_month IS NOT NULL
      AND last_charged_period IS NOT NULL
  LOOP
    v_res := public.cloudix_accrue_tenant_monthly_fee(r.id, current_date);
    IF (v_res->>'accrued_cycles')::int > 0 THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- 9. RPC: Super Admin register tenant payment
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cloudix_register_tenant_payment(
  p_tenant_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant record;
  v_payment_id uuid;
BEGIN
  IF NOT COALESCE(public.cloudix_is_super_admin(), false) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  -- Accrue unbilled cycles up to today first so payment covers everything currently due
  PERFORM public.cloudix_accrue_tenant_monthly_fee(p_tenant_id, current_date);

  SELECT id, debt_amount, debt_currency, monthly_fee_amount, last_charged_period
  INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_tenant.debt_amount IS NULL OR v_tenant.debt_amount <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'settled', false);
  END IF;

  INSERT INTO public.tenant_billing_payments (
    tenant_id,
    amount,
    currency,
    paid_at,
    recorded_by,
    notes
  ) VALUES (
    p_tenant_id,
    v_tenant.debt_amount,
    v_tenant.debt_currency,
    now(),
    auth.uid(),
    p_notes
  )
  RETURNING id INTO v_payment_id;

  -- Clear debt balance; preserve monthly_fee_amount, monthly_fee_currency, and last_charged_period
  UPDATE public.tenants
  SET
    debt_amount = NULL,
    debt_due_date = NULL,
    debt_updated_at = now()
  WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'settled', true,
    'amount', v_tenant.debt_amount,
    'currency', v_tenant.debt_currency,
    'payment_id', v_payment_id
  );
END;
$$;

-- ============================================================================
-- 10. Grants and Revocations
-- ============================================================================

REVOKE ALL ON FUNCTION public.cloudix_billing_date(date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_billing_date(date, int) TO authenticated;

REVOKE ALL ON FUNCTION public.cloudix_latest_billing_date_on_or_before(int, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_latest_billing_date_on_or_before(int, date) TO authenticated;

REVOKE ALL ON FUNCTION public.cloudix_super_admin_set_monthly_fee(uuid, numeric, text, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_super_admin_set_monthly_fee(uuid, numeric, text, smallint) TO authenticated;

REVOKE ALL ON FUNCTION public.cloudix_accrue_tenant_monthly_fee(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_accrue_tenant_monthly_fee(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.cloudix_super_admin_accrue_all_monthly_fees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_super_admin_accrue_all_monthly_fees() TO authenticated;

REVOKE ALL ON FUNCTION public.cloudix_register_tenant_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_register_tenant_payment(uuid, text) TO authenticated;

-- ============================================================================
-- 11. Extend superadmin audit trigger with debt and monthly fee columns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cyberbistro_audit_tenant_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_details jsonb := '{}'::jsonb;
  v_actor uuid := COALESCE(public.cyberbistro_auth_user_id(), public.cloudix_auth_user_id());
BEGIN
  -- Insert a row ONLY when cyberbistro_is_super_admin() is true
  IF NOT public.cyberbistro_is_super_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.superadmin_audit_log (
      actor_auth_user_id,
      action,
      tenant_id,
      target_id,
      details,
      created_at
    ) VALUES (
      v_actor,
      'tenant.delete',
      OLD.id,
      OLD.id::text,
      jsonb_build_object(
        'nombre_negocio', OLD.nombre_negocio,
        'rnc', OLD.rnc,
        'plan', OLD.plan,
        'activa', OLD.activa
      ),
      now()
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.plan IS DISTINCT FROM NEW.plan THEN
      v_details := v_details || jsonb_build_object('plan', jsonb_build_object('old', OLD.plan, 'new', NEW.plan));
    END IF;
    IF OLD.activa IS DISTINCT FROM NEW.activa THEN
      v_details := v_details || jsonb_build_object('activa', jsonb_build_object('old', OLD.activa, 'new', NEW.activa));
    END IF;
    IF OLD.sucursal_limit IS DISTINCT FROM NEW.sucursal_limit THEN
      v_details := v_details || jsonb_build_object('sucursal_limit', jsonb_build_object('old', OLD.sucursal_limit, 'new', NEW.sucursal_limit));
    END IF;
    IF OLD.sucursal_limit_enabled IS DISTINCT FROM NEW.sucursal_limit_enabled THEN
      v_details := v_details || jsonb_build_object('sucursal_limit_enabled', jsonb_build_object('old', OLD.sucursal_limit_enabled, 'new', NEW.sucursal_limit_enabled));
    END IF;
    IF OLD.user_limit_enabled IS DISTINCT FROM NEW.user_limit_enabled THEN
      v_details := v_details || jsonb_build_object('user_limit_enabled', jsonb_build_object('old', OLD.user_limit_enabled, 'new', NEW.user_limit_enabled));
    END IF;
    IF OLD.admin_user_limit IS DISTINCT FROM NEW.admin_user_limit THEN
      v_details := v_details || jsonb_build_object('admin_user_limit', jsonb_build_object('old', OLD.admin_user_limit, 'new', NEW.admin_user_limit));
    END IF;
    IF OLD.cajera_user_limit IS DISTINCT FROM NEW.cajera_user_limit THEN
      v_details := v_details || jsonb_build_object('cajera_user_limit', jsonb_build_object('old', OLD.cajera_user_limit, 'new', NEW.cajera_user_limit));
    END IF;
    IF OLD.cocina_user_limit IS DISTINCT FROM NEW.cocina_user_limit THEN
      v_details := v_details || jsonb_build_object('cocina_user_limit', jsonb_build_object('old', OLD.cocina_user_limit, 'new', NEW.cocina_user_limit));
    END IF;
    IF OLD.mesero_user_limit IS DISTINCT FROM NEW.mesero_user_limit THEN
      v_details := v_details || jsonb_build_object('mesero_user_limit', jsonb_build_object('old', OLD.mesero_user_limit, 'new', NEW.mesero_user_limit));
    END IF;
    IF OLD.payment_day_of_month IS DISTINCT FROM NEW.payment_day_of_month THEN
      v_details := v_details || jsonb_build_object('payment_day_of_month', jsonb_build_object('old', OLD.payment_day_of_month, 'new', NEW.payment_day_of_month));
    END IF;
    IF OLD.debt_amount IS DISTINCT FROM NEW.debt_amount THEN
      v_details := v_details || jsonb_build_object('debt_amount', jsonb_build_object('old', OLD.debt_amount, 'new', NEW.debt_amount));
    END IF;
    IF OLD.debt_currency IS DISTINCT FROM NEW.debt_currency THEN
      v_details := v_details || jsonb_build_object('debt_currency', jsonb_build_object('old', OLD.debt_currency, 'new', NEW.debt_currency));
    END IF;
    IF OLD.debt_due_date IS DISTINCT FROM NEW.debt_due_date THEN
      v_details := v_details || jsonb_build_object('debt_due_date', jsonb_build_object('old', OLD.debt_due_date, 'new', NEW.debt_due_date));
    END IF;
    IF OLD.monthly_fee_amount IS DISTINCT FROM NEW.monthly_fee_amount THEN
      v_details := v_details || jsonb_build_object('monthly_fee_amount', jsonb_build_object('old', OLD.monthly_fee_amount, 'new', NEW.monthly_fee_amount));
    END IF;
    IF OLD.monthly_fee_currency IS DISTINCT FROM NEW.monthly_fee_currency THEN
      v_details := v_details || jsonb_build_object('monthly_fee_currency', jsonb_build_object('old', OLD.monthly_fee_currency, 'new', NEW.monthly_fee_currency));
    END IF;
    IF OLD.last_charged_period IS DISTINCT FROM NEW.last_charged_period THEN
      v_details := v_details || jsonb_build_object('last_charged_period', jsonb_build_object('old', OLD.last_charged_period, 'new', NEW.last_charged_period));
    END IF;

    IF v_details <> '{}'::jsonb THEN
      INSERT INTO public.superadmin_audit_log (
        actor_auth_user_id,
        action,
        tenant_id,
        target_id,
        details,
        created_at
      ) VALUES (
        v_actor,
        'tenant.update',
        NEW.id,
        NEW.id::text,
        v_details,
        now()
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.cyberbistro_audit_tenant_changes() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 12. Schema cache reload notify
-- ============================================================================

NOTIFY pgrst, 'reload schema';
