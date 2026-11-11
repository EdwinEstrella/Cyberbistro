-- Migration: 20261111200000_tenant_debt_billing.sql
-- Description: Add tenant debt and billing status columns to public.tenants
--
-- Security & Access Verification:
-- 1. Super Admin access:
--    Super admin updates public.tenants directly via table UPDATE queries, governed by
--    the policy `cb_tenants_super_admin_all` (FOR ALL USING cloudix_is_super_admin()
--    WITH CHECK cloudix_is_super_admin()). Service_role, postgres, and super admin
--    sessions remain unrestricted.
-- 2. Tenant member access:
--    Tenant members read their own tenant row via table SELECT, governed by the policy
--    `cb_tenants_member_select` (FOR SELECT USING activa IS TRUE AND user belongs to tenant).
--    Tenant members can SELECT these columns (debt_amount, debt_currency, debt_due_date,
--    debt_updated_at) on their own tenant row without column-level restrictions.
-- 3. Tenant admin write protection:
--    Policy `cb_tenants_admin_update` allows tenant admins to UPDATE their own tenant row,
--    and role `authenticated` has table-level UPDATE grants. To prevent tenant admins or
--    desktop client mirror pushes from modifying or clearing debt fields, the trigger
--    `tenants_protect_debt_columns` is added to silently preserve old values for non-superadmin
--    authenticated/anon callers.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS debt_amount numeric(12,2);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS debt_currency text NOT NULL DEFAULT 'DOP';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS debt_due_date date;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS debt_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_debt_amount_non_negative'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_debt_amount_non_negative
      CHECK (debt_amount IS NULL OR debt_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_debt_currency_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_debt_currency_check
      CHECK (debt_currency IN ('DOP', 'USD'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_debt_due_date_required'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_debt_due_date_required
      CHECK (debt_amount IS NULL OR debt_amount = 0 OR debt_due_date IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.debt_amount IS
  'Outstanding SaaS subscription or service debt amount owed by the tenant. NULL or 0 indicates no active debt.';

COMMENT ON COLUMN public.tenants.debt_currency IS
  'Currency of the outstanding tenant debt: DOP or USD. Defaults to DOP.';

COMMENT ON COLUMN public.tenants.debt_due_date IS
  'Payment due date for the outstanding debt. Required when debt_amount is greater than 0.';

COMMENT ON COLUMN public.tenants.debt_updated_at IS
  'Timestamp when debt status, amount, due date, or clearance was last modified.';

CREATE OR REPLACE FUNCTION public.cloudix_protect_tenant_debt_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT COALESCE(public.cloudix_is_super_admin(), false) THEN
    NEW.debt_amount := OLD.debt_amount;
    NEW.debt_currency := OLD.debt_currency;
    NEW.debt_due_date := OLD.debt_due_date;
    NEW.debt_updated_at := OLD.debt_updated_at;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cloudix_protect_tenant_debt_columns() IS
  'Silently preserves tenant debt column values when updated by non-superadmin authenticated or anon roles.';

DROP TRIGGER IF EXISTS tenants_protect_debt_columns ON public.tenants;
CREATE TRIGGER tenants_protect_debt_columns
  BEFORE UPDATE OF debt_amount, debt_currency, debt_due_date, debt_updated_at
  ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.cloudix_protect_tenant_debt_columns();

NOTIFY pgrst, 'reload schema';
