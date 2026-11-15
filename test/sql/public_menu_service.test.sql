-- ============================================================
-- Public Menu Service Test Suite
-- Tests for: service_requests, menu_suggestions, public_contact,
-- party_size and public RPCs.
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

-- 2. Schema Stubs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio text,
  telefono text,
  direccion text,
  moneda text,
  logo_url text,
  activa boolean DEFAULT true,
  plan varchar,
  cantidad_mesas integer DEFAULT 10
);

CREATE TABLE IF NOT EXISTS public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  cantidad_mesas integer DEFAULT 0
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

CREATE TABLE IF NOT EXISTS public.comandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  estado varchar(20) DEFAULT 'pendiente',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mesas_estado (
  id integer NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  codigo_seguridad text,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.platos (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  precio numeric NOT NULL DEFAULT 0,
  categoria text,
  disponible boolean DEFAULT true,
  is_extra boolean DEFAULT false,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  document_id text,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.digital_menu_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  title text,
  description text,
  logo_url text,
  banner_url text,
  theme jsonb,
  public_slug text,
  enabled boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.digital_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  plato_id int REFERENCES public.platos(id) ON DELETE CASCADE,
  display_name text,
  description text,
  image_url text,
  visible boolean DEFAULT true,
  sort_order int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.digital_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  status text,
  total numeric CHECK (total >= 0),
  notes text,
  rejection_reason text,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  order_type text,
  mesa_numero int,
  numero_pedido int,
  client_session_id text
);

CREATE TABLE IF NOT EXISTS public.digital_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.digital_orders(id) ON DELETE CASCADE,
  plato_id int,
  name_snapshot text,
  price_snapshot numeric,
  quantity int CHECK (quantity > 0),
  notes text,
  subtotal numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_order_counters (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  next_numero int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.cuentas_cobrar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  factura_id uuid,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  monto_total numeric NOT NULL CHECK (monto_total >= 0.00),
  monto_pagado numeric NOT NULL DEFAULT 0.00 CHECK (monto_pagado >= 0.00),
  fecha_emision timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento timestamptz NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'pendiente',
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cxc_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  cuenta_cobrar_id uuid NOT NULL REFERENCES public.cuentas_cobrar(id) ON DELETE CASCADE,
  monto numeric NOT NULL CHECK (monto > 0.00),
  fecha_pago timestamptz NOT NULL DEFAULT now(),
  metodo_pago varchar(20) NOT NULL,
  notas text,
  cycle_id uuid,
  created_by_auth_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.cyberbistro_has_tenant_role(p_tenant_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN true;
END;
$$;

-- 3. Include required migrations
\i supabase/migrations/20261031120000_corporate_menu_links.sql
\i supabase/migrations/20261031130000_corporate_menu_links_revoke_anon.sql
\i supabase/migrations/20261101090000_add_corporativo_plan.sql
\i supabase/migrations/20261101150000_menus_closed_without_cycle.sql
\i supabase/migrations/20261106140000_public_menu_calendar.sql
\i supabase/migrations/20261110180000_public_menu_service.sql
\i supabase/migrations/20261114210000_menu_delivery_orders.sql

-- 4. Test Assertion Helper
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

-- ============================================================
-- 5. Test Suite
-- ============================================================

-- Test 1: Unique pending request and already_pending resolution
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug text := 'svc-test-' || substr(gen_random_uuid()::text, 1, 8);
  v_res1 jsonb;
  v_res2 jsonb;
  v_res3 jsonb;
  v_direct_caught boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa, cantidad_mesas)
  VALUES (v_tenant_id, 'Service Bistro', 'profesional', true, 10);

  INSERT INTO public.sucursales (id, tenant_id, cantidad_mesas)
  VALUES (v_sucursal_id, v_tenant_id, 10);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  INSERT INTO public.mesas_estado (id, tenant_id, sucursal_id, codigo_seguridad)
  VALUES (1, v_tenant_id, v_sucursal_id, '1234');

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true);

  -- First request: created fresh (already_pending: false)
  v_res1 := public.create_public_service_request(v_slug, 1, '1234', 'waiter');
  PERFORM test_assert((v_res1->>'already_pending')::boolean IS FALSE, 'First request must not be already pending');
  PERFORM test_assert(v_res1->>'id' IS NOT NULL, 'First request returns created id');

  -- Second call: returns existing id and already_pending: true
  v_res2 := public.create_public_service_request(v_slug, 1, '1234', 'waiter');
  PERFORM test_assert((v_res2->>'already_pending')::boolean IS TRUE, 'Second request must report already_pending');
  PERFORM test_assert(v_res2->>'id' = v_res1->>'id', 'Second request returns identical id');

  -- Direct SQL insert of another pending request violates unique index
  BEGIN
    INSERT INTO public.service_requests (tenant_id, sucursal_id, mesa_numero, kind, status)
    VALUES (v_tenant_id, v_sucursal_id, 1, 'waiter', 'pending');
  EXCEPTION WHEN unique_violation THEN
    v_direct_caught := true;
  END;
  PERFORM test_assert(v_direct_caught, 'Duplicate pending request must violate partial unique index');

  -- Attend the request
  UPDATE public.service_requests
  SET status = 'attended', attended_at = now()
  WHERE id = (v_res1->>'id')::uuid;

  -- Subsequent call after attended creates a fresh pending request
  v_res3 := public.create_public_service_request(v_slug, 1, '1234', 'waiter');
  PERFORM test_assert((v_res3->>'already_pending')::boolean IS FALSE, 'Request after attended is fresh');
  PERFORM test_assert(v_res3->>'id' <> v_res1->>'id', 'Request after attended gets new id');
END $$;

-- Test 2: Wrong table code rejected
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug text := 'code-test-' || substr(gen_random_uuid()::text, 1, 8);
  v_caught_wrong boolean := false;
  v_caught_empty boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa, cantidad_mesas)
  VALUES (v_tenant_id, 'Code Bistro', 'profesional', true, 10);

  INSERT INTO public.sucursales (id, tenant_id, cantidad_mesas)
  VALUES (v_sucursal_id, v_tenant_id, 10);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  INSERT INTO public.mesas_estado (id, tenant_id, sucursal_id, codigo_seguridad)
  VALUES (2, v_tenant_id, v_sucursal_id, '4321');

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true);

  -- Wrong code
  BEGIN
    PERFORM public.create_public_service_request(v_slug, 2, '9999', 'bill');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Código de mesa incorrecto%' THEN
      v_caught_wrong := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_wrong, 'Wrong table code must be rejected with Spanish error');

  -- Empty code
  BEGIN
    PERFORM public.create_public_service_request(v_slug, 2, '   ', 'bill');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%El código de mesa es obligatorio%' THEN
      v_caught_empty := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_empty, 'Empty table code must be rejected with Spanish error');
END $$;

-- Test 3: Disabled or unknown slug rejected
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug_disabled text := 'disabled-menu-' || substr(gen_random_uuid()::text, 1, 8);
  v_caught_unknown boolean := false;
  v_caught_disabled boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa, cantidad_mesas)
  VALUES (v_tenant_id, 'Disabled Bistro', 'profesional', true, 10);

  INSERT INTO public.sucursales (id, tenant_id, cantidad_mesas)
  VALUES (v_sucursal_id, v_tenant_id, 10);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  INSERT INTO public.mesas_estado (id, tenant_id, sucursal_id, codigo_seguridad)
  VALUES (1, v_tenant_id, v_sucursal_id, '1111');

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_slug_disabled, false);

  -- Unknown slug
  BEGIN
    PERFORM public.create_public_service_request('non-existent-slug', 1, '1111', 'waiter');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%El menú no está disponible%' THEN
      v_caught_unknown := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_unknown, 'Unknown slug must be rejected');

  -- Disabled slug
  BEGIN
    PERFORM public.create_public_service_request(v_slug_disabled, 1, '1111', 'waiter');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%El menú no está disponible%' THEN
      v_caught_disabled := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_disabled, 'Disabled menu slug must be rejected');
END $$;

-- Test 4: Anon cannot SELECT service_requests or menu_suggestions
DO $$
DECLARE
  v_caught_sr boolean := false;
  v_caught_sug boolean := false;
BEGIN
  -- Verify table privileges
  PERFORM test_assert(has_table_privilege('anon', 'public.service_requests', 'select') IS FALSE,
    'anon must not have select privilege on service_requests');
  PERFORM test_assert(has_table_privilege('anon', 'public.menu_suggestions', 'select') IS FALSE,
    'anon must not have select privilege on menu_suggestions');

  -- Attempt query under anon role
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.service_requests;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLSTATE = '42501' THEN
      v_caught_sr := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_sr, 'anon query on service_requests must raise 42501');

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.menu_suggestions;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLSTATE = '42501' THEN
      v_caught_sug := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_sug, 'anon query on menu_suggestions must raise 42501');
END $$;

-- Test 5: Suggestion rate limit (10 per rolling hour)
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug text := 'sug-rate-' || substr(gen_random_uuid()::text, 1, 8);
  v_i integer;
  v_caught_limit boolean := false;
  v_res jsonb;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa, cantidad_mesas)
  VALUES (v_tenant_id, 'Suggestion Bistro', 'profesional', true, 10);

  INSERT INTO public.sucursales (id, tenant_id, cantidad_mesas)
  VALUES (v_sucursal_id, v_tenant_id, 10);

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true);

  -- Insert 10 suggestions: all must succeed
  FOR v_i IN 1..10 LOOP
    v_res := public.create_public_suggestion(v_slug, 'Excelente servicio #' || v_i, 1, '809-555-0001');
    PERFORM test_assert(v_res->>'id' IS NOT NULL, 'Suggestion within rate limit must return id');
  END LOOP;

  -- 11th suggestion must be blocked by rate limit
  BEGIN
    PERFORM public.create_public_suggestion(v_slug, 'Sugerencia numero 11', 1, NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%límite de sugerencias%' THEN
      v_caught_limit := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_limit, '11th suggestion in rolling hour must be blocked by rate limit');
END $$;

-- Test 6: suggestion_email is never exposed in get_public_digital_menu
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug text := 'email-strip-' || substr(gen_random_uuid()::text, 1, 8);
  v_res jsonb;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa, cantidad_mesas)
  VALUES (v_tenant_id, 'Private Email Bistro', 'profesional', true, 10);

  INSERT INTO public.sucursales (id, tenant_id, cantidad_mesas)
  VALUES (v_sucursal_id, v_tenant_id, 10);

  INSERT INTO public.digital_menu_settings (
    tenant_id, sucursal_id, public_slug, enabled, public_contact
  )
  VALUES (
    v_tenant_id,
    v_sucursal_id,
    v_slug,
    true,
    jsonb_build_object(
      'wifi_name', 'BistroWiFi',
      'wifi_password', 'secretpass123',
      'whatsapp', '+18095550199',
      'instagram', '@bistro',
      'suggestion_email', 'supersecretowner@domain.com'
    )
  );

  v_res := public.get_public_digital_menu(v_slug);

  -- Public fields must be present
  PERFORM test_assert((v_res->'contact'->>'wifi_name') = 'BistroWiFi', 'wifi_name must be present');
  PERFORM test_assert((v_res->'contact'->>'wifi_password') = 'secretpass123', 'wifi_password must be present');
  PERFORM test_assert((v_res->'contact'->>'whatsapp') = '+18095550199', 'whatsapp must be present');

  -- suggestion_email must be stripped and not present anywhere in returned json
  PERFORM test_assert((v_res->'contact' ? 'suggestion_email') IS FALSE,
    'suggestion_email must be absent from top-level contact');
  PERFORM test_assert(v_res::text NOT LIKE '%suggestion_email%',
    'suggestion_email must not appear anywhere in returned json');
END $$;

-- Test 7: create_public_digital_order backward compatibility & party_size storage
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug text := 'party-test-' || substr(gen_random_uuid()::text, 1, 8);
  v_plato_id int;
  v_res9 jsonb;
  v_res10 jsonb;
  v_stored_party_9 int;
  v_stored_party_10 int;
  v_caught_invalid_party boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa, cantidad_mesas)
  VALUES (v_tenant_id, 'Party Bistro', 'profesional', true, 10);

  INSERT INTO public.sucursales (id, tenant_id, cantidad_mesas)
  VALUES (v_sucursal_id, v_tenant_id, 10);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true);

  INSERT INTO public.platos (nombre, precio, categoria, disponible, tenant_id, sucursal_id)
  VALUES ('Mofongo', 350.00, 'Especiales', true, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_id;

  INSERT INTO public.digital_menu_items (tenant_id, plato_id, visible)
  VALUES (v_tenant_id, v_plato_id, true);

  -- 1. Call with 9 arguments (backward compatibility without party_size)
  v_res9 := public.create_public_digital_order(
    v_slug,
    'Diner Legacy',
    '809-555-1111',
    'Sin cebolla',
    jsonb_build_array(jsonb_build_object('plato_id', v_plato_id, 'quantity', 1)),
    'takeout',
    NULL,
    NULL,
    'session-legacy-1'
  );
  PERFORM test_assert(v_res9->>'order_id' IS NOT NULL, '9-arg order succeeds');

  SELECT party_size INTO v_stored_party_9
  FROM public.digital_orders
  WHERE id = (v_res9->>'order_id')::uuid;
  PERFORM test_assert(v_stored_party_9 IS NULL, '9-arg order stores NULL party_size');

  -- 2. Call with 10 arguments providing party_size
  v_res10 := public.create_public_digital_order(
    v_slug,
    'Diner Group',
    '809-555-2222',
    'Mesa grande',
    jsonb_build_array(jsonb_build_object('plato_id', v_plato_id, 'quantity', 2)),
    'takeout',
    NULL,
    NULL,
    'session-group-1',
    5
  );
  PERFORM test_assert(v_res10->>'order_id' IS NOT NULL, '10-arg order succeeds');

  SELECT party_size INTO v_stored_party_10
  FROM public.digital_orders
  WHERE id = (v_res10->>'order_id')::uuid;
  PERFORM test_assert(v_stored_party_10 = 5, '10-arg order stores party_size = 5');

  -- 3. Invalid party size rejected (< 1 or > 99)
  BEGIN
    PERFORM public.create_public_digital_order(
      v_slug,
      'Invalid Diner',
      '809-555-3333',
      '',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_id, 'quantity', 1)),
      'takeout',
      NULL,
      NULL,
      'session-inv-1',
      120
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cantidad de personas inválida%' THEN
      v_caught_invalid_party := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_invalid_party, 'Invalid party_size > 99 must be rejected');
END $$;

-- Test 8: home delivery on public takeout orders (20261114210000_menu_delivery_orders.sql)
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug text := 'delivery-test-' || substr(gen_random_uuid()::text, 1, 8);
  v_plato_id int;
  v_items jsonb;
  v_res jsonb;
  v_row public.digital_orders%ROWTYPE;
  v_msg text;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa, cantidad_mesas)
  VALUES (v_tenant_id, 'Delivery Bistro', 'profesional', true, 10);

  INSERT INTO public.sucursales (id, tenant_id, cantidad_mesas)
  VALUES (v_sucursal_id, v_tenant_id, 10);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true);

  INSERT INTO public.platos (nombre, precio, categoria, disponible, tenant_id, sucursal_id)
  VALUES ('Pollo frito', 300.00, 'Especiales', true, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_id;

  INSERT INTO public.digital_menu_items (tenant_id, plato_id, visible)
  VALUES (v_tenant_id, v_plato_id, true);

  v_items := jsonb_build_array(jsonb_build_object('plato_id', v_plato_id, 'quantity', 1));

  -- 1. Legacy 10-arg call keeps working and defaults to pickup without location
  v_res := public.create_public_digital_order(v_slug, 'Cliente Legacy', '809-555-0001', '', v_items, 'takeout', NULL, NULL, 'sess-d1', NULL);
  SELECT * INTO v_row FROM public.digital_orders WHERE id = (v_res->>'order_id')::uuid;
  PERFORM test_assert(v_row.delivery_mode = 'pickup', 'legacy call defaults to pickup');
  PERFORM test_assert(v_row.delivery_lat IS NULL AND v_row.delivery_lng IS NULL AND v_row.delivery_reference IS NULL,
    'pickup stores no location');

  -- 2. Delivery with coordinates and reference is stored
  v_res := public.create_public_digital_order(v_slug, 'Cliente GPS', '809-555-0002', '', v_items, 'takeout', NULL, NULL, 'sess-d2', NULL,
    'delivery', 18.4861, -69.9312, '  Casa azul frente al colmado  ');
  SELECT * INTO v_row FROM public.digital_orders WHERE id = (v_res->>'order_id')::uuid;
  PERFORM test_assert(v_row.delivery_mode = 'delivery', 'delivery mode stored');
  PERFORM test_assert(v_row.delivery_lat = 18.4861 AND v_row.delivery_lng = -69.9312, 'delivery coordinates stored');
  PERFORM test_assert(v_row.delivery_reference = 'Casa azul frente al colmado', 'delivery reference is trimmed and stored');
  PERFORM test_assert(v_row.order_type = 'takeout', 'delivery keeps order_type takeout');

  -- 3. Delivery with only a reference (no coordinates) is accepted
  v_res := public.create_public_digital_order(v_slug, 'Cliente Texto', '809-555-0003', '', v_items, 'takeout', NULL, NULL, 'sess-d3', NULL,
    'delivery', NULL, NULL, 'Al lado de la iglesia');
  SELECT * INTO v_row FROM public.digital_orders WHERE id = (v_res->>'order_id')::uuid;
  PERFORM test_assert(v_row.delivery_lat IS NULL AND v_row.delivery_reference = 'Al lado de la iglesia',
    'delivery with only a reference is accepted');

  -- 4. Pickup ignores any location that is sent along
  v_res := public.create_public_digital_order(v_slug, 'Cliente Recoge', '809-555-0004', '', v_items, 'takeout', NULL, NULL, 'sess-d4', NULL,
    'pickup', 18.5, -69.9, 'No debe guardarse');
  SELECT * INTO v_row FROM public.digital_orders WHERE id = (v_res->>'order_id')::uuid;
  PERFORM test_assert(v_row.delivery_mode = 'pickup' AND v_row.delivery_lat IS NULL AND v_row.delivery_reference IS NULL,
    'pickup discards location data');

  -- 5. Delivery without any location or reference is rejected
  v_msg := NULL;
  BEGIN
    PERFORM public.create_public_digital_order(v_slug, 'Sin ubicacion', '809-555-0005', '', v_items, 'takeout', NULL, NULL, 'sess-d5', NULL,
      'delivery', NULL, NULL, '   ');
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
  PERFORM test_assert(v_msg LIKE '%Indica tu ubicación%', 'delivery without location or reference is rejected');

  -- 6. Delivery without a phone is rejected
  v_msg := NULL;
  BEGIN
    PERFORM public.create_public_digital_order(v_slug, 'Sin telefono', '', '', v_items, 'takeout', NULL, NULL, 'sess-d6', NULL,
      'delivery', 18.4861, -69.9312, 'Casa azul');
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
  PERFORM test_assert(v_msg LIKE '%teléfono es obligatorio%', 'delivery without phone is rejected');

  -- 7. Half a coordinate pair and out-of-range coordinates are rejected
  v_msg := NULL;
  BEGIN
    PERFORM public.create_public_digital_order(v_slug, 'Media coord', '809-555-0007', '', v_items, 'takeout', NULL, NULL, 'sess-d7', NULL,
      'delivery', 18.4861, NULL, 'Casa azul');
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
  PERFORM test_assert(v_msg LIKE '%Ubicación de entrega inválida%', 'lat without lng is rejected');

  v_msg := NULL;
  BEGIN
    PERFORM public.create_public_digital_order(v_slug, 'Fuera de rango', '809-555-0008', '', v_items, 'takeout', NULL, NULL, 'sess-d8', NULL,
      'delivery', 95, -69.9312, 'Casa azul');
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
  PERFORM test_assert(v_msg LIKE '%Ubicación de entrega inválida%', 'latitude out of range is rejected');

  -- 8. Unknown delivery mode and delivery on a table order are rejected
  v_msg := NULL;
  BEGIN
    PERFORM public.create_public_digital_order(v_slug, 'Modo raro', '809-555-0009', '', v_items, 'takeout', NULL, NULL, 'sess-d9', NULL,
      'courier', 18.4861, -69.9312, 'Casa azul');
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
  PERFORM test_assert(v_msg LIKE '%Tipo de entrega inválido%', 'unknown delivery mode is rejected');

  v_msg := NULL;
  BEGIN
    PERFORM public.create_public_digital_order(v_slug, 'Mesa con delivery', '809-555-0010', '', v_items, 'in_store', 1, '1234', 'sess-d10', NULL,
      'delivery', 18.4861, -69.9312, 'Casa azul');
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;
  PERFORM test_assert(v_msg LIKE '%solo aplica a pedidos para llevar%', 'delivery on a table order is rejected');
END $$;
