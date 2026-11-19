-- ============================================================
-- Tenant Monthly Fee & Lazy Accrual Test Suite
-- Standalone SQL test (psql -v ON_ERROR_STOP=1)
-- ============================================================

-- 1. Roles Stub
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;

-- 2. Schema and Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 3. Auth schema stub for foreign keys and auth.uid()
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  created_at timestamptz DEFAULT now()
);

-- 4. Cloudix / CyberBistro Core Stubs matching production
CREATE TABLE IF NOT EXISTS public.cyberbistro_super_admins (
  auth_user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cloudix_super_admins (
  auth_user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.superadmin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_user_id uuid,
  action text NOT NULL,
  tenant_id uuid,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio text,
  rnc text,
  direccion text,
  telefono text,
  email text,
  moneda text DEFAULT 'DOP',
  idioma text DEFAULT 'es',
  activa boolean DEFAULT true,
  plan varchar(20) DEFAULT 'basico',
  payment_day_of_month smallint,
  user_limit_enabled boolean NOT NULL DEFAULT false,
  admin_user_limit integer NOT NULL DEFAULT 1,
  cajera_user_limit integer,
  cocina_user_limit integer,
  mesero_user_limit integer,
  sucursal_limit_enabled boolean NOT NULL DEFAULT true,
  sucursal_limit integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL DEFAULT '',
  rol text NOT NULL,
  nombre text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  auth_user_id uuid
);

-- 5. Auth helper stubs
CREATE OR REPLACE FUNCTION public.cloudix_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
    NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.cloudix_auth_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.email', true), ''),
    NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.cyberbistro_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT public.cloudix_auth_user_id();
$$;

CREATE OR REPLACE FUNCTION public.cyberbistro_auth_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT public.cloudix_auth_email();
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT public.cloudix_auth_user_id();
$$;

CREATE OR REPLACE FUNCTION public.cyberbistro_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cyberbistro_super_admins
    WHERE auth_user_id = public.cloudix_auth_user_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.cloudix_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.cyberbistro_is_super_admin();
$$;

-- 6. Load baseline debt billing migration
\i supabase/migrations/20261111200000_tenant_debt_billing.sql

-- 7. Load monthly fee migration under test
\i supabase/migrations/20261119200000_tenant_monthly_fee.sql

-- ============================================================
-- TESTS
-- ============================================================
DO $$
DECLARE
  v_super_admin uuid := gen_random_uuid();
  v_tenant_member uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_res jsonb;
  v_tenant_row record;
  v_payment_count int;
  v_exception_caught boolean;
  v_clamped_date date;
BEGIN
  -- Setup super admin user
  INSERT INTO auth.users (id, email) VALUES (v_super_admin, 'super@cloudix.com');
  INSERT INTO public.cyberbistro_super_admins (auth_user_id, email) VALUES (v_super_admin, 'super@cloudix.com');

  -- Setup regular users
  INSERT INTO auth.users (id, email) VALUES (v_tenant_member, 'member@restaurant.com');
  INSERT INTO auth.users (id, email) VALUES (v_outsider, 'outsider@other.com');

  -- Setup tenant
  INSERT INTO public.tenants (
    nombre_negocio, rnc, payment_day_of_month
  ) VALUES (
    'Restaurante Test', '130000001', 13
  ) RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_users (
    tenant_id, email, rol, activo, auth_user_id
  ) VALUES (
    v_tenant_id, 'member@restaurant.com', 'admin', true, v_tenant_member
  );

  -- Act as super admin
  PERFORM set_config('request.jwt.claim.sub', v_super_admin::text, true);
  PERFORM set_config('request.jwt.claim.email', 'super@cloudix.com', true);

  -- ------------------------------------------------------------
  -- TEST 1: Date clamping in short months and leap year
  -- ------------------------------------------------------------
  -- Day 31 in February 2026 clamps to 28
  v_clamped_date := public.cloudix_billing_date('2026-02-01'::date, 31);
  IF v_clamped_date <> '2026-02-28'::date THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected 2026-02-28, got %', v_clamped_date;
  END IF;

  -- Day 31 in leap February 2024 clamps to 29
  v_clamped_date := public.cloudix_billing_date('2024-02-01'::date, 31);
  IF v_clamped_date <> '2024-02-29'::date THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected 2024-02-29 in leap year, got %', v_clamped_date;
  END IF;

  -- latest_billing_date_on_or_before(31, '2026-03-30') -> clamps previous month to 2026-02-28
  v_clamped_date := public.cloudix_latest_billing_date_on_or_before(31, '2026-03-30'::date);
  IF v_clamped_date <> '2026-02-28'::date THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected 2026-02-28 for latest on or before 2026-03-30 with day 31, got %', v_clamped_date;
  END IF;

  -- ------------------------------------------------------------
  -- TEST 2: Set fee on 2026-11-19 with day 13 -> anchor 2026-11-13
  -- ------------------------------------------------------------
  v_res := public.cloudix_super_admin_set_monthly_fee(v_tenant_id, 2500.00, 'DOP', 13::smallint);
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 2 FAILED: set_monthly_fee returned not ok';
  END IF;

  SELECT monthly_fee_amount, monthly_fee_currency, payment_day_of_month, last_charged_period
  INTO v_tenant_row
  FROM public.tenants
  WHERE id = v_tenant_id;

  IF v_tenant_row.monthly_fee_amount <> 2500.00
     OR v_tenant_row.monthly_fee_currency <> 'DOP'
     OR v_tenant_row.payment_day_of_month <> 13
     OR v_tenant_row.last_charged_period <> '2026-11-13'::date THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Tenant row unexpected after set_monthly_fee: %', row_to_json(v_tenant_row);
  END IF;

  -- ------------------------------------------------------------
  -- TEST 3: Accrue as of 2026-11-30 charges 0 (next payment is 2026-12-13)
  -- ------------------------------------------------------------
  v_res := public.cloudix_accrue_tenant_monthly_fee(v_tenant_id, '2026-11-30'::date);
  IF (v_res->>'accrued_cycles')::int <> 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected 0 cycles accrued on 2026-11-30, got %', v_res->>'accrued_cycles';
  END IF;

  SELECT debt_amount, debt_due_date, last_charged_period INTO v_tenant_row
  FROM public.tenants WHERE id = v_tenant_id;
  IF v_tenant_row.debt_amount IS NOT NULL OR v_tenant_row.debt_due_date IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 3 FAILED: debt_amount or debt_due_date should remain NULL after 0 cycles';
  END IF;

  -- ------------------------------------------------------------
  -- TEST 4: Accrue as of 2026-12-13 charges 1 cycle (2500 DOP, due date 2026-12-13)
  -- ------------------------------------------------------------
  v_res := public.cloudix_accrue_tenant_monthly_fee(v_tenant_id, '2026-12-13'::date);
  IF (v_res->>'accrued_cycles')::int <> 1 OR (v_res->>'debt_amount')::numeric <> 2500.00 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Expected 1 cycle and 2500.00 debt, got %', v_res;
  END IF;

  SELECT debt_amount, debt_due_date, last_charged_period INTO v_tenant_row
  FROM public.tenants WHERE id = v_tenant_id;
  IF v_tenant_row.debt_due_date <> '2026-12-13'::date OR v_tenant_row.last_charged_period <> '2026-12-13'::date THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Expected debt_due_date and last_charged_period 2026-12-13, got %', row_to_json(v_tenant_row);
  END IF;

  -- ------------------------------------------------------------
  -- TEST 5: Accrue as of 2027-02-13 charges 2 more (total 3 cycles, 7500 DOP, due date 2026-12-13 kept)
  -- ------------------------------------------------------------
  v_res := public.cloudix_accrue_tenant_monthly_fee(v_tenant_id, '2027-02-13'::date);
  IF (v_res->>'accrued_cycles')::int <> 2 OR (v_res->>'debt_amount')::numeric <> 7500.00 THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Expected 2 cycles and 7500.00 total debt, got %', v_res;
  END IF;

  SELECT debt_amount, debt_due_date, last_charged_period INTO v_tenant_row
  FROM public.tenants WHERE id = v_tenant_id;
  IF v_tenant_row.debt_due_date <> '2026-12-13'::date THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Original due date 2026-12-13 was not preserved! Got: %', v_tenant_row.debt_due_date;
  END IF;
  IF v_tenant_row.last_charged_period <> '2027-02-13'::date THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Expected last_charged_period 2027-02-13, got: %', v_tenant_row.last_charged_period;
  END IF;

  -- ------------------------------------------------------------
  -- TEST 6: Register payment -> balance NULL, history row inserted, fee kept
  -- ------------------------------------------------------------
  v_res := public.cloudix_register_tenant_payment(v_tenant_id, 'Efectivo en oficina');
  IF (v_res->>'ok')::boolean IS NOT TRUE OR (v_res->>'settled')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Payment registration returned not ok/settled: %', v_res;
  END IF;
  IF (v_res->>'amount')::numeric <> 7500.00 OR (v_res->>'currency') <> 'DOP' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Payment amount/currency incorrect: %', v_res;
  END IF;

  SELECT debt_amount, debt_due_date, monthly_fee_amount, last_charged_period INTO v_tenant_row
  FROM public.tenants WHERE id = v_tenant_id;
  IF v_tenant_row.debt_amount IS NOT NULL OR v_tenant_row.debt_due_date IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Debt was not cleared after payment: %', row_to_json(v_tenant_row);
  END IF;
  IF v_tenant_row.monthly_fee_amount <> 2500.00 OR v_tenant_row.last_charged_period <> '2027-02-13'::date THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Monthly fee or anchor was lost after payment: %', row_to_json(v_tenant_row);
  END IF;

  SELECT count(*) INTO v_payment_count
  FROM public.tenant_billing_payments
  WHERE tenant_id = v_tenant_id AND amount = 7500.00 AND notes = 'Efectivo en oficina';
  IF v_payment_count <> 1 THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Payment history row not found in tenant_billing_payments';
  END IF;

  -- ------------------------------------------------------------
  -- TEST 7: Accrue again same day (2027-02-13) -> 0 cycles, balance remains null
  -- ------------------------------------------------------------
  v_res := public.cloudix_accrue_tenant_monthly_fee(v_tenant_id, '2027-02-13'::date);
  IF (v_res->>'accrued_cycles')::int <> 0 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Idempotent re-accrual should charge 0 cycles, got %', v_res->>'accrued_cycles';
  END IF;

  SELECT debt_amount INTO v_tenant_row FROM public.tenants WHERE id = v_tenant_id;
  IF v_tenant_row.debt_amount IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Debt should remain NULL after 0 cycles re-accrual';
  END IF;

  -- ------------------------------------------------------------
  -- TEST 8: Currency mismatch raises error
  -- ------------------------------------------------------------
  UPDATE public.tenants
  SET debt_amount = 100.00, debt_currency = 'USD', debt_due_date = '2026-11-20'
  WHERE id = v_tenant_id;

  v_exception_caught := false;
  BEGIN
    PERFORM public.cloudix_super_admin_set_monthly_fee(v_tenant_id, 2500.00, 'DOP', 13::smallint);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%CURRENCY_MISMATCH%' THEN
      v_exception_caught := true;
    ELSE
      RAISE EXCEPTION 'TEST 8 FAILED: Unexpected exception message: %', SQLERRM;
    END IF;
  END;

  IF NOT v_exception_caught THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Currency mismatch did not raise exception';
  END IF;

  -- Restore tenant debt
  UPDATE public.tenants SET debt_amount = NULL, debt_due_date = NULL WHERE id = v_tenant_id;

  -- ------------------------------------------------------------
  -- TEST 9: Non-member accrual raises 42501 (UNAUTHORIZED)
  -- ------------------------------------------------------------
  -- Act as outsider
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  PERFORM set_config('request.jwt.claim.email', 'outsider@other.com', true);

  v_exception_caught := false;
  BEGIN
    PERFORM public.cloudix_accrue_tenant_monthly_fee(v_tenant_id, '2027-02-13'::date);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_exception_caught := true;
  END;

  IF NOT v_exception_caught THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Non-member accrual did not raise 42501 UNAUTHORIZED';
  END IF;

  -- Act as tenant member -> accrual succeeds
  PERFORM set_config('request.jwt.claim.sub', v_tenant_member::text, true);
  PERFORM set_config('request.jwt.claim.email', 'member@restaurant.com', true);

  v_res := public.cloudix_accrue_tenant_monthly_fee(v_tenant_id, '2027-02-13'::date);
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Tenant member was unauthorized to accrue';
  END IF;

  RAISE NOTICE 'ALL TENANT MONTHLY FEE SQL TESTS PASSED SUCCESSFULLY';
END $$;
