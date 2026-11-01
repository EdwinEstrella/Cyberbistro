-- ============================================================
-- Superadmin Hardening Test Suite
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

-- 3. Stubs matching cloud production schema
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  plan varchar(20) DEFAULT 'basico',
  payment_day_of_month smallint,
  user_limit_enabled boolean NOT NULL DEFAULT false,
  admin_user_limit integer NOT NULL DEFAULT 1,
  cajera_user_limit integer,
  cocina_user_limit integer,
  mesero_user_limit integer,
  sucursal_limit_enabled boolean NOT NULL DEFAULT true,
  sucursal_limit integer
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

-- 4. Auth & Helper Stubs
CREATE OR REPLACE FUNCTION public.cyberbistro_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
    NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.cyberbistro_auth_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.email', true), ''),
    NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '')
  );
$$;

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

-- 5. Load the migration under test
\i supabase/migrations/20261101140000_superadmin_hardening.sql

-- ============================================================
-- TESTS
-- ============================================================
DO $$
DECLARE
  v_fake_user uuid := gen_random_uuid();
  v_super_user uuid := gen_random_uuid();
  v_normal_admin uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_count_before bigint;
  v_count_after bigint;
  v_audit_action text;
  v_audit_actor uuid;
  v_audit_details jsonb;
BEGIN
  -- ------------------------------------------------------------
  -- TEST 1: email claim 'admin@gmail.com' without table row -> false
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_fake_user::text, true);
  PERFORM set_config('request.jwt.claim.email', 'admin@gmail.com', true);

  DELETE FROM public.cyberbistro_super_admins WHERE auth_user_id = v_fake_user;

  IF public.cyberbistro_is_super_admin() IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST 1 FAILED: cyberbistro_is_super_admin() returned true for claim admin@gmail.com without table row';
  END IF;

  IF public.cloudix_is_super_admin() IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST 1 FAILED: cloudix_is_super_admin() returned true for claim admin@gmail.com without table row';
  END IF;

  IF public.cyberbistro_am_i_super_admin() IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST 1 FAILED: cyberbistro_am_i_super_admin() returned true for claim admin@gmail.com without table row';
  END IF;

  -- ------------------------------------------------------------
  -- TEST 2: table row by auth_user_id -> true (even with different email)
  -- ------------------------------------------------------------
  INSERT INTO public.cyberbistro_super_admins (auth_user_id, email)
  VALUES (v_super_user, 'sec_auditor@domain.org');

  PERFORM set_config('request.jwt.claim.sub', v_super_user::text, true);
  PERFORM set_config('request.jwt.claim.email', 'sec_auditor@domain.org', true);

  IF public.cyberbistro_is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 2 FAILED: cyberbistro_is_super_admin() returned false for user present in cyberbistro_super_admins';
  END IF;

  IF public.cloudix_is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 2 FAILED: cloudix_is_super_admin() returned false for user present in cyberbistro_super_admins';
  END IF;

  IF public.cyberbistro_am_i_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 2 FAILED: cyberbistro_am_i_super_admin() returned false for user present in cyberbistro_super_admins';
  END IF;

  -- ------------------------------------------------------------
  -- TEST 3: audit row written when super admin changes plan
  -- ------------------------------------------------------------
  INSERT INTO public.tenants (nombre_negocio, plan, activa)
  VALUES ('Audit Test Bistro', 'basico', true)
  RETURNING id INTO v_tenant_id;

  -- Verify super admin actor
  PERFORM set_config('request.jwt.claim.sub', v_super_user::text, true);

  SELECT count(*) INTO v_count_before FROM public.superadmin_audit_log WHERE tenant_id = v_tenant_id;

  UPDATE public.tenants
  SET plan = 'profesional'
  WHERE id = v_tenant_id;

  SELECT count(*) INTO v_count_after FROM public.superadmin_audit_log WHERE tenant_id = v_tenant_id;
  IF v_count_after <= v_count_before THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expected audit row to be written when super admin changes plan';
  END IF;

  SELECT action, actor_auth_user_id, details
  INTO v_audit_action, v_audit_actor, v_audit_details
  FROM public.superadmin_audit_log
  WHERE tenant_id = v_tenant_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_audit_action <> 'tenant.update' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expected action tenant.update, got %', v_audit_action;
  END IF;

  IF v_audit_actor <> v_super_user THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expected actor % got %', v_super_user, v_audit_actor;
  END IF;

  IF (v_audit_details->'plan'->>'old') <> 'basico' OR (v_audit_details->'plan'->>'new') <> 'profesional' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: details do not contain old/new plan: %', v_audit_details;
  END IF;

  -- ------------------------------------------------------------
  -- TEST 4: audit row NOT written for a normal tenant admin update
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_normal_admin::text, true);
  PERFORM set_config('request.jwt.claim.email', 'manager@auditbistro.com', true);

  SELECT count(*) INTO v_count_before FROM public.superadmin_audit_log WHERE tenant_id = v_tenant_id;

  UPDATE public.tenants
  SET plan = 'corporativo'
  WHERE id = v_tenant_id;

  SELECT count(*) INTO v_count_after FROM public.superadmin_audit_log WHERE tenant_id = v_tenant_id;
  IF v_count_after <> v_count_before THEN
    RAISE EXCEPTION 'TEST 4 FAILED: audit row was written for a normal tenant admin update (must only write for super admin)';
  END IF;

  RAISE NOTICE 'ALL SUPERADMIN HARDENING SQL TESTS PASSED SUCCESSFULLY!';
END $$;
