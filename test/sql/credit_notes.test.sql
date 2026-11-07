-- ============================================================
-- Credit Notes Invoice Number Test Suite
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

-- 2. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 3. Stubs matching cloud production schema
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
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_user_id uuid,
  email text NOT NULL,
  password_hash text NOT NULL DEFAULT '',
  rol text NOT NULL DEFAULT 'admin',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cierres_operativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  business_day date DEFAULT CURRENT_DATE,
  cycle_number int DEFAULT 1,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  efectivo_inicial numeric(12,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_id text,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cuentas_cobrar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  factura_id uuid,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  monto_total numeric NOT NULL CHECK (monto_total >= 0.00),
  monto_pagado numeric NOT NULL DEFAULT 0.00 CHECK (monto_pagado >= 0.00),
  fecha_emision timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento timestamptz NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'pendiente',
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Global invoice sequence shared by all tenants (simulates legacy default sequence)
CREATE SEQUENCE IF NOT EXISTS public.facturas_numero_factura_seq START WITH 100000;

CREATE TABLE IF NOT EXISTS public.facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_factura integer NOT NULL DEFAULT nextval('public.facturas_numero_factura_seq'::regclass),
  mesa_numero integer,
  comanda_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  cliente_nombre varchar(255),
  cliente_rnc text,
  metodo_pago varchar(50) NOT NULL DEFAULT 'efectivo',
  estado varchar(20) NOT NULL DEFAULT 'pendiente',
  subtotal numeric NOT NULL DEFAULT 0,
  itbis numeric NOT NULL DEFAULT 0,
  propina numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  moneda varchar(10) NOT NULL DEFAULT 'DOP',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas text,
  creado_por varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  pagada_at timestamptz,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  fiscal_mode text,
  ncf text,
  ncf_tipo text
);

CREATE TABLE IF NOT EXISTS public.ecf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  factura_id uuid NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  certificate_metadata_id uuid,
  ecf_type text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fiscal_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ecf_document_id uuid REFERENCES public.ecf_documents(id) ON DELETE CASCADE,
  factura_id uuid REFERENCES public.facturas(id) ON DELETE CASCADE,
  operation text NOT NULL,
  status text NOT NULL,
  idempotency_key text UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gasto_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.gasto_categorias(id),
  cycle_id uuid REFERENCES public.cierres_operativos(id),
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  descripcion text NOT NULL,
  monto numeric NOT NULL,
  metodo_pago text,
  fecha_gasto timestamptz NOT NULL DEFAULT now(),
  notas text,
  created_by_auth_user_id uuid
);

-- 4. Auth and ECF reservation stubs
CREATE OR REPLACE FUNCTION public.cloudix_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
    NULLIF(current_setting('test.user_id', true), '')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.cloudix_reserve_ecf(p_tenant_id uuid, p_ncf_tipo text)
RETURNS TABLE(ncf_fiscal_activo boolean, ncf_tipo_codigo text, seq_reserved integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq integer;
BEGIN
  SELECT COALESCE(MAX(substring(ncf from 4)::integer), 0) + 1
  INTO v_seq
  FROM public.facturas
  WHERE tenant_id = p_tenant_id AND ncf LIKE (p_ncf_tipo || '%');

  RETURN QUERY SELECT true, p_ncf_tipo, v_seq;
END;
$$;

-- 5. Include migrations
\i supabase/migrations/20260917210000_add-atomic-invoice-number-reservation.sql
\i supabase/migrations/20260917213000_add-invoice-number-reservation-v2.sql
\i supabase/migrations/20261024130000_ecf_credit_notes.sql
\i supabase/migrations/20261106100000_credit_note_tenant_invoice_number.sql

-- 6. Assertion helper
CREATE OR REPLACE FUNCTION test_assert(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT p_cond THEN
    RAISE EXCEPTION 'TEST ASSERTION FAILED: %', p_msg;
  END IF;
END;
$$;

-- 7. Test Suite
DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_sucursal uuid := gen_random_uuid();
  v_admin_auth_user uuid := gen_random_uuid();
  v_orig_factura_id uuid := gen_random_uuid();
  v_orig_numero bigint := 6360;
  v_res jsonb;
  v_credit_note_id uuid;
  v_note_row public.facturas%ROWTYPE;
  v_counter_row public.invoice_number_counters%ROWTYPE;
  v_next_res record;
BEGIN
  -- 1. Setup tenant & branch
  INSERT INTO public.tenants (id, nombre_negocio, activa)
  VALUES (v_tenant, 'Restaurante Salpimentao', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal, v_tenant);

  -- 2. Setup admin user
  INSERT INTO public.tenant_users (tenant_id, auth_user_id, email, rol, activo)
  VALUES (v_tenant, v_admin_auth_user, 'admin@salpimentao.com', 'admin', true);

  PERFORM set_config('test.user_id', v_admin_auth_user::text, true);

  -- 3. Open cash cycle
  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant, v_sucursal, now(), NULL);

  -- 4. Seed tenant invoice counter to 6361 (last invoice was 6360)
  INSERT INTO public.invoice_number_counters (tenant_id, next_number)
  VALUES (v_tenant, 6361);

  -- 5. Seed original invoice (#6360) and accepted ecf_document
  INSERT INTO public.facturas (
    id, tenant_id, sucursal_id, numero_factura, metodo_pago, estado, subtotal, itbis, total,
    fiscal_mode, ncf, ncf_tipo, created_at, pagada_at
  ) VALUES (
    v_orig_factura_id, v_tenant, v_sucursal, v_orig_numero, 'efectivo', 'pagada', 1000.00, 180.00, 1180.00,
    'dgii_ecf', 'E310000000001', 'E31 - Factura de Credito Fiscal Electronica', now(), now()
  );

  INSERT INTO public.ecf_documents (tenant_id, factura_id, ecf_type, status)
  VALUES (v_tenant, v_orig_factura_id, '31', 'accepted');

  -- Ensure global sequence is way ahead (e.g., at 100012)
  PERFORM setval('public.facturas_numero_factura_seq', 100012, false);

  -- 6. Issue credit note
  v_res := public.cloudix_issue_credit_note(
    v_tenant,
    v_orig_factura_id,
    'Devolucion total por producto defectuoso',
    v_sucursal
  );

  v_credit_note_id := (v_res->>'credit_note_factura_id')::uuid;
  SELECT * INTO v_note_row FROM public.facturas WHERE id = v_credit_note_id;
  SELECT * INTO v_counter_row FROM public.invoice_number_counters WHERE tenant_id = v_tenant;

  -- Assertion 1: returned jsonb contains numero_factura and equals 6361
  PERFORM test_assert(v_res ? 'numero_factura', 'Returned jsonb must contain numero_factura');
  PERFORM test_assert((v_res->>'numero_factura')::bigint = 6361, 'Returned numero_factura must equal tenant counter 6361');

  -- Assertion 2: credit note factura row numero_factura equals tenant counter 6361 (NOT global sequence 100012)
  PERFORM test_assert(v_note_row.numero_factura = 6361, 'Credit note row numero_factura must equal 6361, not global sequence');

  -- Assertion 3: tenant counter advances by one (from 6361 to 6362)
  PERFORM test_assert(v_counter_row.next_number = 6362, 'Tenant counter must advance by 1 to 6362');

  -- Assertion 4: a following regular reservation continues right after it (6362)
  SELECT * INTO v_next_res FROM public.cloudix_reserve_invoice_numbers_v2(v_tenant, 1, 1);
  PERFORM test_assert(v_next_res.first_number = 6362, 'Following reservation must continue at 6362');
  PERFORM test_assert(v_next_res.last_number = 6362, 'Following reservation last_number must be 6362');

  RAISE NOTICE 'Credit note tenant invoice number test passed successfully!';
END $$;
