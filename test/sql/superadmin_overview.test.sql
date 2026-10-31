-- ============================================================
-- SuperAdmin Overview ("Ficha 360") Test Suite
-- Runs against plain PostgreSQL 16 (psql -v ON_ERROR_STOP=1)
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
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio text,
  rnc text,
  telefono text,
  direccion text,
  moneda text DEFAULT 'DOP',
  activa boolean DEFAULT true,
  plan varchar(20) DEFAULT 'basico',
  created_at timestamptz DEFAULT now(),
  payment_day_of_month smallint,
  fiscal_mode text DEFAULT 'ncf_legacy',
  ecf_environment text DEFAULT 'test',
  user_limit_enabled boolean DEFAULT false,
  admin_user_limit integer DEFAULT 1,
  cajera_user_limit integer,
  cocina_user_limit integer,
  mesero_user_limit integer,
  sucursal_limit_enabled boolean DEFAULT true,
  sucursal_limit integer
);

CREATE TABLE IF NOT EXISTS public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  direccion text,
  telefono text,
  activa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  nombre text,
  rol text NOT NULL,
  activo boolean DEFAULT true,
  auth_user_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  total numeric NOT NULL DEFAULT 0,
  fiscal_mode text DEFAULT 'ncf_legacy',
  fiscal_status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  estado varchar(20) DEFAULT 'pendiente',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_devices (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  last_ack_cursor bigint NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  disabled_at timestamptz,
  PRIMARY KEY (tenant_id, device_id)
);

CREATE TABLE IF NOT EXISTS public.sync_operations (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  device_id uuid NOT NULL,
  device_sequence bigint NOT NULL DEFAULT 0,
  request_hash text NOT NULL DEFAULT repeat('0', 64),
  table_name text NOT NULL,
  row_id text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, operation_id)
);

CREATE TABLE IF NOT EXISTS public.sync_stream_heads (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_cursor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ecf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  factura_id uuid NOT NULL,
  certificate_metadata_id uuid,
  ecf_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  last_error text,
  dgii_status_message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fiscal_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ecf_document_id uuid,
  factura_id uuid,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  idempotency_key text UNIQUE,
  attempts integer DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  credit_limit numeric(12,2),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cuentas_cobrar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  monto_total numeric NOT NULL CHECK (monto_total >= 0.00),
  monto_pagado numeric NOT NULL DEFAULT 0.00 CHECK (monto_pagado >= 0.00),
  fecha_vencimiento timestamptz NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  link_type text NOT NULL DEFAULT 'company',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.digital_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  total numeric NOT NULL DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- 4. Auth & Helper Stubs
CREATE OR REPLACE FUNCTION public.menu_links_plan_limit(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_plan, '')))
    WHEN 'empresarial' THEN 2
    WHEN 'corporativo' THEN 6
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.company_credit_used_internal(p_tenant uuid, p_customer uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(sum(cc.monto_total - cc.monto_pagado), 0.00)
  FROM public.cuentas_cobrar cc
  WHERE cc.tenant_id = p_tenant
    AND cc.customer_id = p_customer
    AND cc.estado IN ('pendiente', 'parcial');
$$;

-- Flag to control super admin mock in tests
CREATE OR REPLACE FUNCTION public.cyberbistro_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('test.is_super_admin', true) = 'true', false);
$$;

-- 5. Load the Superadmin Overview Function under test
\i supabase/migrations/20261101130000_superadmin_tenant_overview.sql

-- ============================================================
-- TESTS
-- ============================================================
DO $$
DECLARE
  v_tenant_id uuid;
  v_customer_id uuid;
  v_factura_id uuid;
  v_result jsonb;
  v_failed boolean := false;
BEGIN
  -- Insert tenant fixture
  INSERT INTO public.tenants (
    nombre_negocio, rnc, plan, activa, payment_day_of_month,
    fiscal_mode, ecf_environment, user_limit_enabled, admin_user_limit,
    cajera_user_limit, sucursal_limit_enabled, sucursal_limit
  ) VALUES (
    'Bistro Test Corp', '131999888', 'corporativo', true, 20,
    'dgii_ecf', 'test', true, 1, 3, true, 5
  ) RETURNING id INTO v_tenant_id;

  -- Insert sucursales
  INSERT INTO public.sucursales (tenant_id, nombre, activa)
  VALUES
    (v_tenant_id, 'Sucursal Central', true),
    (v_tenant_id, 'Sucursal Norte', false);

  -- Insert users
  INSERT INTO public.tenant_users (tenant_id, email, nombre, rol, activo)
  VALUES
    (v_tenant_id, 'admin@bistro.com', 'Admin User', 'admin', true),
    (v_tenant_id, 'cajera@bistro.com', 'Cajera User', 'cajera', true);

  -- Insert facturas & comandas
  INSERT INTO public.facturas (tenant_id, total, fiscal_mode, created_at)
  VALUES (v_tenant_id, 1500.00, 'dgii_ecf', now() - interval '2 hours')
  RETURNING id INTO v_factura_id;

  INSERT INTO public.comandas (tenant_id, estado, created_at)
  VALUES (v_tenant_id, 'completada', now() - interval '1 hour');

  -- Insert device
  INSERT INTO public.sync_devices (tenant_id, device_id, last_ack_cursor, last_seen_at)
  VALUES (v_tenant_id, gen_random_uuid(), 42, now() - interval '30 minutes');

  -- Insert e-CF documents and outbox
  INSERT INTO public.ecf_documents (tenant_id, factura_id, ecf_type, status, last_error, created_at)
  VALUES
    (v_tenant_id, v_factura_id, 'E31', 'accepted', NULL, now() - interval '2 days');

  INSERT INTO public.fiscal_outbox (tenant_id, factura_id, operation, status, idempotency_key)
  VALUES (v_tenant_id, v_factura_id, 'submit', 'retryable_error', 'test_key_1');

  -- Insert corporate customer & CxC
  INSERT INTO public.customers (tenant_id, name, credit_limit)
  VALUES (v_tenant_id, 'Empresa Cliente SA', 50000.00)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.cuentas_cobrar (tenant_id, customer_id, monto_total, monto_pagado, fecha_vencimiento, estado)
  VALUES
    (v_tenant_id, v_customer_id, 5000.00, 1500.00, now() + interval '10 days', 'parcial');

  -- Insert corporate menu link
  INSERT INTO public.menu_links (tenant_id, customer_id, token, link_type, enabled)
  VALUES (v_tenant_id, v_customer_id, 'corp-link-token-1', 'company', true);

  -- Insert digital order
  INSERT INTO public.digital_orders (tenant_id, total, status, created_at)
  VALUES (v_tenant_id, 450.00, 'accepted', now() - interval '3 days');

  -- ------------------------------------------------------------
  -- TEST 1: Non-super-admin is rejected with UNAUTHORIZED
  -- ------------------------------------------------------------
  PERFORM set_config('test.is_super_admin', 'false', true);
  BEGIN
    PERFORM public.superadmin_tenant_overview(v_tenant_id);
    v_failed := true;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UNAUTHORIZED%' THEN
      RAISE EXCEPTION 'Expected UNAUTHORIZED exception, got: %', SQLERRM;
    END IF;
  END;

  IF v_failed THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Non-super-admin was NOT rejected with UNAUTHORIZED';
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Non-super-admin was rejected with UNAUTHORIZED';

  -- ------------------------------------------------------------
  -- TEST 2: Super admin gets complete overview jsonb with all keys
  -- ------------------------------------------------------------
  PERFORM set_config('test.is_super_admin', 'true', true);
  v_result := public.superadmin_tenant_overview(v_tenant_id);

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected jsonb result, got NULL';
  END IF;

  -- Validate top-level keys
  IF NOT (
    v_result ? 'tenant' AND
    v_result ? 'sucursales' AND
    v_result ? 'users' AND
    v_result ? 'activity' AND
    v_result ? 'devices' AND
    v_result ? 'sync' AND
    v_result ? 'fiscal' AND
    v_result ? 'cxc' AND
    v_result ? 'corporate'
  ) THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Missing required top-level keys in result: %', v_result;
  END IF;

  -- Validate specific aggregated values
  ASSERT (v_result -> 'tenant' ->> 'nombre_negocio') = 'Bistro Test Corp', 'Unexpected tenant name';
  ASSERT (v_result -> 'tenant' ->> 'plan') = 'corporativo', 'Unexpected plan';
  ASSERT (v_result -> 'tenant' ->> 'payment_day_of_month') = '20', 'Unexpected payment day';
  ASSERT (v_result -> 'tenant' -> 'limits' ->> 'user_limit_enabled') = 'true', 'Unexpected user_limit_enabled';
  ASSERT jsonb_array_length(v_result -> 'sucursales') = 2, 'Expected 2 sucursales';
  ASSERT (v_result -> 'users' -> 'stats' ->> 'total') = '2', 'Expected 2 users';
  ASSERT (v_result -> 'fiscal' -> 'outbox' ->> 'retryable_count') = '1', 'Expected 1 retryable fiscal item';
  ASSERT (v_result -> 'corporate' -> 'menu_links' ->> 'plan_limit') = '6', 'Expected plan limit 6 for corporativo';
  ASSERT (v_result -> 'corporate' -> 'menu_links' ->> 'enabled') = '1', 'Expected 1 enabled menu link';
  ASSERT (v_result -> 'corporate' -> 'digital_orders_7d' ->> 'count') = '1', 'Expected 1 digital order';
  ASSERT (v_result -> 'cxc' ->> 'total_pending')::numeric = 3500.00, 'Expected total pending CxC 3500.00';
  ASSERT (v_result -> 'corporate' -> 'companies' -> 0 ->> 'credit_used')::numeric = 3500.00, 'Expected company credit used 3500.00';

  RAISE NOTICE 'TEST 2 PASSED: Super admin received complete and accurate 360 overview jsonb';
END $$;
