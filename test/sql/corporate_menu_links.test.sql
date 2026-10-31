-- ============================================================
-- Corporate Menu Links Test Suite
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

-- 2. Schema Stubs matching production tables and columns
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio text,
  telefono text,
  direccion text,
  moneda text,
  logo_url text,
  activa boolean DEFAULT true,
  plan varchar
);

CREATE TABLE IF NOT EXISTS public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS public.platos (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  precio numeric NOT NULL DEFAULT 0,
  categoria text,
  disponible boolean DEFAULT true,
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
  description text,
  image_url text,
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
  client_session_id text,
  CONSTRAINT digital_orders_order_type_check CHECK (order_type IN ('takeout', 'in_store'))
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
  RETURN COALESCE(NULLIF(current_setting('test.tenant', true), '')::uuid = p_tenant_id, false);
END;
$$;

-- 3. Include migration file
\i supabase/migrations/20261031120000_corporate_menu_links.sql
\i supabase/migrations/20261031130000_corporate_menu_links_revoke_anon.sql
\i supabase/migrations/20261101090000_add_corporativo_plan.sql

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

-- 5. Test Suite

-- Test 1: Public read hides extras when allow_extras=false
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid;
  v_menu_id uuid;
  v_plato_main int;
  v_plato_extra int;
  v_link_id uuid;
  v_token text;
  v_today date;
  v_dow smallint;
  v_res jsonb;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Restaurante Test', 'empresarial', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (gen_random_uuid(), v_tenant_id)
  RETURNING id INTO v_sucursal_id;

  v_today := public.menu_business_today(v_tenant_id);
  v_dow := public.menu_business_isodow(v_tenant_id, v_today);

  INSERT INTO public.menus (tenant_id, name, schedule_mode)
  VALUES (v_tenant_id, 'Menu Diario', 'recurring')
  RETURNING id INTO v_menu_id;

  INSERT INTO public.platos (tenant_id, nombre, precio, disponible, is_extra)
  VALUES (v_tenant_id, 'Arroz con Pollo', 200, true, false)
  RETURNING id INTO v_plato_main;

  INSERT INTO public.platos (tenant_id, nombre, precio, disponible, is_extra)
  VALUES (v_tenant_id, 'Aguacate Extra', 50, true, true)
  RETURNING id INTO v_plato_extra;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES
    (v_tenant_id, v_menu_id, v_plato_main, ARRAY[v_dow]::smallint[]),
    (v_tenant_id, v_menu_id, v_plato_extra, ARRAY[v_dow]::smallint[]);

  INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, allow_extras, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_menu_id, 'Public Link No Extras', 'public', false, true)
  RETURNING id, token INTO v_link_id, v_token;

  v_res := public.get_menu_by_link(v_token);
  PERFORM test_assert((v_res->>'available')::boolean IS TRUE, 'Public read: menu must be available');
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 1, 'Public read: exactly 1 main item');
  PERFORM test_assert(jsonb_array_length(v_res->'extras') = 0, 'Public read: extras hidden when allow_extras=false');
  PERFORM test_assert((v_res->>'allow_extras')::boolean IS FALSE, 'Public read: allow_extras false flag');
END $$;

-- Test 2: Recurring weekday filter
DO $$
DECLARE
  v_tenant_id uuid;
  v_menu_id uuid;
  v_plato_other int;
  v_token text;
  v_today date;
  v_dow smallint;
  v_other_dow smallint;
  v_res jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT id INTO v_menu_id FROM public.menus WHERE tenant_id = v_tenant_id LIMIT 1;
  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id LIMIT 1;

  v_today := public.menu_business_today(v_tenant_id);
  v_dow := public.menu_business_isodow(v_tenant_id, v_today);
  v_other_dow := CASE WHEN v_dow = 1 THEN 2 ELSE 1 END;

  INSERT INTO public.platos (tenant_id, nombre, precio, disponible, is_extra)
  VALUES (v_tenant_id, 'Plato Otro Dia', 300, true, false)
  RETURNING id INTO v_plato_other;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES (v_tenant_id, v_menu_id, v_plato_other, ARRAY[v_other_dow]::smallint[]);

  v_res := public.get_menu_by_link(v_token);
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 1, 'Recurring weekday filter: hides dishes not scheduled today');
END $$;

-- Test 3: Weekly menu outside its week -> available=false and empty items
DO $$
DECLARE
  v_tenant_id uuid;
  v_sucursal_id uuid;
  v_menu_weekly_id uuid;
  v_token text;
  v_today date;
  v_last_monday date;
  v_past_monday date;
  v_res jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT id INTO v_sucursal_id FROM public.sucursales WHERE tenant_id = v_tenant_id LIMIT 1;
  v_today := public.menu_business_today(v_tenant_id);
  v_last_monday := (v_today - ((EXTRACT(isodow FROM v_today)::int - 1) || ' days')::interval)::date;
  v_past_monday := (v_last_monday - interval '14 days')::date;

  INSERT INTO public.menus (tenant_id, name, schedule_mode, week_start)
  VALUES (v_tenant_id, 'Menu Pasado', 'weekly', v_past_monday)
  RETURNING id INTO v_menu_weekly_id;

  INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, allow_extras, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_menu_weekly_id, 'Weekly Link Past', 'public', true, true)
  RETURNING token INTO v_token;

  v_res := public.get_menu_by_link(v_token);
  PERFORM test_assert((v_res->>'available')::boolean IS FALSE, 'Weekly menu outside week: available must be false');
  PERFORM test_assert(v_res->>'reason' = 'MENU_NOT_AVAILABLE', 'Weekly menu outside week: reason MENU_NOT_AVAILABLE');
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 0, 'Weekly menu outside week: items empty');
END $$;

-- Test 4: Sold-out today hidden and rejected on create
DO $$
DECLARE
  v_tenant_id uuid;
  v_token text;
  v_plato_main int;
  v_today date;
  v_res jsonb;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT p.id INTO v_plato_main FROM public.platos p WHERE p.tenant_id = v_tenant_id AND p.is_extra = false AND p.nombre = 'Arroz con Pollo' LIMIT 1;
  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND label = 'Public Link No Extras' LIMIT 1;
  v_today := public.menu_business_today(v_tenant_id);

  INSERT INTO public.plato_sold_out (tenant_id, plato_id, sold_out_date)
  VALUES (v_tenant_id, v_plato_main, v_today);

  v_res := public.get_menu_by_link(v_token);
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 0, 'Sold out dish must be hidden in get_menu_by_link');

  BEGIN
    PERFORM public.create_order_by_link(v_token, 'Carlos', '', jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ITEM_SOLD_OUT' THEN
      v_caught := true;
    ELSE
      RAISE EXCEPTION 'Expected ITEM_SOLD_OUT, got %', SQLERRM;
    END IF;
  END;
  PERFORM test_assert(v_caught, 'create_order_by_link must raise ITEM_SOLD_OUT');

  DELETE FROM public.plato_sold_out WHERE tenant_id = v_tenant_id AND plato_id = v_plato_main;
END $$;

-- Test 5: Client price ignored (total computed from platos)
DO $$
DECLARE
  v_tenant_id uuid;
  v_menu_id uuid;
  v_token text;
  v_plato_id int;
  v_dow smallint;
  v_res jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT id INTO v_menu_id FROM public.menus WHERE tenant_id = v_tenant_id AND schedule_mode = 'recurring' LIMIT 1;
  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND label = 'Public Link No Extras' LIMIT 1;
  v_dow := public.menu_business_isodow(v_tenant_id);

  INSERT INTO public.platos (tenant_id, nombre, precio, disponible, is_extra)
  VALUES (v_tenant_id, 'Chivo Liniero', 250, true, false)
  RETURNING id INTO v_plato_id;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES (v_tenant_id, v_menu_id, v_plato_id, ARRAY[v_dow]::smallint[]);

  -- Pass client-side fake price 1.00
  v_res := public.create_order_by_link(
    v_token,
    'Maria',
    '',
    jsonb_build_array(jsonb_build_object('plato_id', v_plato_id, 'quantity', 2, 'price', 1.00))
  );

  PERFORM test_assert((v_res->>'total')::numeric = 500.00, 'Client price must be ignored; total computed from platos (2 * 250 = 500)');
END $$;

-- Test 6: Extras rejected with EXTRAS_NOT_ALLOWED when disallowed and accepted+parented when allowed
DO $$
DECLARE
  v_tenant_id uuid;
  v_link_id uuid;
  v_token text;
  v_plato_main int;
  v_plato_extra int;
  v_caught boolean := false;
  v_res jsonb;
  v_order_id uuid;
  v_parent_id uuid;
  v_child_parent_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT id, token INTO v_link_id, v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND label = 'Public Link No Extras' LIMIT 1;
  SELECT id INTO v_plato_main FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Chivo Liniero' LIMIT 1;
  SELECT id INTO v_plato_extra FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Aguacate Extra' LIMIT 1;

  -- Disallowed extras
  BEGIN
    PERFORM public.create_order_by_link(
      v_token,
      'Pedro',
      '',
      jsonb_build_array(
        jsonb_build_object('plato_id', v_plato_main, 'quantity', 1, 'extras', jsonb_build_array(jsonb_build_object('plato_id', v_plato_extra, 'quantity', 1)))
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EXTRAS_NOT_ALLOWED' THEN
      v_caught := true;
    ELSE
      RAISE EXCEPTION 'Expected EXTRAS_NOT_ALLOWED, got %', SQLERRM;
    END IF;
  END;
  PERFORM test_assert(v_caught, 'Disallowed extras must raise EXTRAS_NOT_ALLOWED');

  -- Allow extras
  UPDATE public.menu_links SET allow_extras = true WHERE id = v_link_id;

  v_res := public.create_order_by_link(
    v_token,
    'Pedro',
    '',
    jsonb_build_array(
      jsonb_build_object('plato_id', v_plato_main, 'quantity', 1, 'extras', jsonb_build_array(jsonb_build_object('plato_id', v_plato_extra, 'quantity', 1)))
    )
  );

  v_order_id := (v_res->>'order_id')::uuid;
  PERFORM test_assert((v_res->>'total')::numeric = 300.00, 'Total with extra must be 250 + 50 = 300');

  SELECT id INTO v_parent_id FROM public.digital_order_items WHERE order_id = v_order_id AND plato_id = v_plato_main;
  SELECT parent_item_id INTO v_child_parent_id FROM public.digital_order_items WHERE order_id = v_order_id AND plato_id = v_plato_extra;
  PERFORM test_assert(v_child_parent_id = v_parent_id, 'Child extra must have parent_item_id pointing to main item');
END $$;

-- Test 7: Company link requires employee name
DO $$
DECLARE
  v_tenant_id uuid;
  v_sucursal_id uuid;
  v_menu_id uuid;
  v_cust_id uuid;
  v_token text;
  v_plato_main int;
  v_caught_empty boolean := false;
  v_caught_short boolean := false;
  v_res jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT id INTO v_sucursal_id FROM public.sucursales WHERE tenant_id = v_tenant_id LIMIT 1;
  SELECT id INTO v_menu_id FROM public.menus WHERE tenant_id = v_tenant_id AND schedule_mode = 'recurring' LIMIT 1;
  SELECT id INTO v_plato_main FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Chivo Liniero' LIMIT 1;

  INSERT INTO public.customers (tenant_id, name, document_id)
  VALUES (v_tenant_id, 'Empresa Acero SA', '130000000')
  RETURNING id INTO v_cust_id;

  INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, customer_id, allow_extras, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_menu_id, 'Company Link', 'company', v_cust_id, true, true)
  RETURNING token INTO v_token;

  BEGIN
    PERFORM public.create_order_by_link(v_token, '', '', jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'INVALID_EMPLOYEE_NAME' THEN
      v_caught_empty := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_empty, 'Company order with empty employee name must raise INVALID_EMPLOYEE_NAME');

  BEGIN
    PERFORM public.create_order_by_link(v_token, 'A', '', jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'INVALID_EMPLOYEE_NAME' THEN
      v_caught_short := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_short, 'Company order with 1-char employee name must raise INVALID_EMPLOYEE_NAME');

  v_res := public.create_order_by_link(v_token, 'Luis Gomez', '', jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)));
  PERFORM test_assert(v_res ? 'order_id', 'Company order with valid employee name succeeds');
END $$;

-- Test 8: TENANT_MISMATCH on cross-tenant relations
DO $$
DECLARE
  v_tenant_a uuid;
  v_tenant_b uuid := gen_random_uuid();
  v_sucursal_a uuid;
  v_sucursal_b uuid;
  v_menu_a uuid;
  v_cust_b uuid;
  v_plato_b int;
  v_caught_link boolean := false;
  v_caught_sucursal boolean := false;
  v_caught_null_sucursal boolean := false;
  v_caught_item boolean := false;
  v_caught_sold boolean := false;
BEGIN
  SELECT id INTO v_tenant_a FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT id INTO v_sucursal_a FROM public.sucursales WHERE tenant_id = v_tenant_a LIMIT 1;
  SELECT id INTO v_menu_a FROM public.menus WHERE tenant_id = v_tenant_a LIMIT 1;

  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_b, 'Tenant B', 'empresarial', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (gen_random_uuid(), v_tenant_b)
  RETURNING id INTO v_sucursal_b;

  INSERT INTO public.customers (tenant_id, name)
  VALUES (v_tenant_b, 'Customer Tenant B')
  RETURNING id INTO v_cust_b;

  INSERT INTO public.platos (tenant_id, nombre, precio)
  VALUES (v_tenant_b, 'Plato B', 100)
  RETURNING id INTO v_plato_b;

  -- 1. Cross-tenant customer on menu_links
  BEGIN
    INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, customer_id)
    VALUES (v_tenant_a, v_sucursal_a, v_menu_a, 'Cross Link', 'company', v_cust_b);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TENANT_MISMATCH' THEN
      v_caught_link := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_link, 'Cross-tenant customer in menu_links must raise TENANT_MISMATCH');

  -- 1b. Cross-tenant sucursal on menu_links
  BEGIN
    INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type)
    VALUES (v_tenant_a, v_sucursal_b, v_menu_a, 'Cross Sucursal Link', 'public');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TENANT_MISMATCH' THEN
      v_caught_sucursal := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_sucursal, 'Cross-tenant sucursal in menu_links must raise TENANT_MISMATCH');

  -- 1c. Assertion that inserting a link with NULL sucursal fails (NOT NULL constraint)
  BEGIN
    INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type)
    VALUES (v_tenant_a, NULL, v_menu_a, 'Null Sucursal Link', 'public');
  EXCEPTION WHEN not_null_violation THEN
    v_caught_null_sucursal := true;
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%null value in column "sucursal_id"%' OR SQLSTATE = '23502' THEN
      v_caught_null_sucursal := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_null_sucursal, 'Inserting menu_link with NULL sucursal_id must fail not-null constraint');

  -- 2. Cross-tenant plato in menu_items
  BEGIN
    INSERT INTO public.menu_items (tenant_id, menu_id, plato_id)
    VALUES (v_tenant_a, v_menu_a, v_plato_b);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TENANT_MISMATCH' THEN
      v_caught_item := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_item, 'Cross-tenant plato in menu_items must raise TENANT_MISMATCH');

  -- 3. Cross-tenant plato in plato_sold_out
  BEGIN
    INSERT INTO public.plato_sold_out (tenant_id, plato_id, sold_out_date)
    VALUES (v_tenant_a, v_plato_b, now()::date);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TENANT_MISMATCH' THEN
      v_caught_sold := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_sold, 'Cross-tenant plato in plato_sold_out must raise TENANT_MISMATCH');
END $$;

-- Test 9: Accept creates exactly one CxC with correct monto_total and is idempotent-safe
DO $$
DECLARE
  v_tenant_id uuid;
  v_token text;
  v_plato_main int;
  v_order_res jsonb;
  v_order_id uuid;
  v_accept_res jsonb;
  v_cxc_count int;
  v_cxc_monto numeric;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  PERFORM set_config('test.tenant', v_tenant_id::text, true);

  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND link_type = 'company' LIMIT 1;
  SELECT id INTO v_plato_main FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Chivo Liniero' LIMIT 1;

  v_order_res := public.create_order_by_link(v_token, 'Alberto Diaz', '', jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 2)));
  v_order_id := (v_order_res->>'order_id')::uuid;

  -- First accept
  v_accept_res := public.accept_company_digital_order(v_order_id);
  PERFORM test_assert(v_accept_res->>'status' = 'accepted', 'Order must be accepted');

  SELECT count(*), COALESCE(SUM(monto_total), 0) INTO v_cxc_count, v_cxc_monto
  FROM public.cuentas_cobrar
  WHERE digital_order_id = v_order_id;

  PERFORM test_assert(v_cxc_count = 1, 'Exactly one CxC row created');
  PERFORM test_assert(v_cxc_monto = 500.00, 'CxC monto_total matches order total');

  -- Second accept should raise ORDER_NOT_PENDING
  BEGIN
    PERFORM public.accept_company_digital_order(v_order_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ORDER_NOT_PENDING' THEN
      v_caught := true;
    END IF;
  END;
  PERFORM test_assert(v_caught, 'Second accept must raise ORDER_NOT_PENDING');

  SELECT count(*) INTO v_cxc_count FROM public.cuentas_cobrar WHERE digital_order_id = v_order_id;
  PERFORM test_assert(v_cxc_count = 1, 'Still exactly one CxC row after rejected second accept');
END $$;

-- Test 10: Cancel extra lowers total and CxC
DO $$
DECLARE
  v_tenant_id uuid;
  v_token text;
  v_plato_main int;
  v_plato_extra int;
  v_order_res jsonb;
  v_order_id uuid;
  v_extra_item_id uuid;
  v_cancel_res jsonb;
  v_cxc_monto numeric;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  PERFORM set_config('test.tenant', v_tenant_id::text, true);

  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND link_type = 'company' LIMIT 1;
  SELECT id INTO v_plato_main FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Chivo Liniero' LIMIT 1;
  SELECT id INTO v_plato_extra FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Aguacate Extra' LIMIT 1;

  v_order_res := public.create_order_by_link(
    v_token,
    'Raul',
    '',
    jsonb_build_array(
      jsonb_build_object('plato_id', v_plato_main, 'quantity', 1, 'extras', jsonb_build_array(jsonb_build_object('plato_id', v_plato_extra, 'quantity', 1)))
    )
  );
  v_order_id := (v_order_res->>'order_id')::uuid;

  PERFORM public.accept_company_digital_order(v_order_id);

  SELECT id INTO v_extra_item_id FROM public.digital_order_items WHERE order_id = v_order_id AND plato_id = v_plato_extra;

  v_cancel_res := public.cancel_digital_order_item(v_extra_item_id);
  PERFORM test_assert((v_cancel_res->>'new_total')::numeric = 250.00, 'Order total lowered to 250 after cancelling extra');
  PERFORM test_assert(v_cancel_res->>'order_status' = 'accepted', 'Order remains accepted when active items remain');

  SELECT monto_total INTO v_cxc_monto FROM public.cuentas_cobrar WHERE digital_order_id = v_order_id;
  PERFORM test_assert(v_cxc_monto = 250.00, 'CxC monto_total lowered to 250 after cancelling extra');
END $$;

-- Test 11: Cancel dish cancels its extras
DO $$
DECLARE
  v_tenant_id uuid;
  v_token text;
  v_plato_main int;
  v_plato_extra int;
  v_order_res jsonb;
  v_order_id uuid;
  v_main_item_id uuid;
  v_extra_status text;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  PERFORM set_config('test.tenant', v_tenant_id::text, true);

  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND link_type = 'company' LIMIT 1;
  SELECT id INTO v_plato_main FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Chivo Liniero' LIMIT 1;
  SELECT id INTO v_plato_extra FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Aguacate Extra' LIMIT 1;

  v_order_res := public.create_order_by_link(
    v_token,
    'Sonia',
    '',
    jsonb_build_array(
      jsonb_build_object('plato_id', v_plato_main, 'quantity', 1, 'extras', jsonb_build_array(jsonb_build_object('plato_id', v_plato_extra, 'quantity', 1))),
      jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)
    )
  );
  v_order_id := (v_order_res->>'order_id')::uuid;

  SELECT id INTO v_main_item_id FROM public.digital_order_items WHERE order_id = v_order_id AND parent_item_id IS NULL AND id IN (
    SELECT parent_item_id FROM public.digital_order_items WHERE order_id = v_order_id AND parent_item_id IS NOT NULL
  ) LIMIT 1;

  PERFORM public.cancel_digital_order_item(v_main_item_id);

  SELECT status INTO v_extra_status FROM public.digital_order_items WHERE order_id = v_order_id AND plato_id = v_plato_extra;
  PERFORM test_assert(v_extra_status = 'cancelled', 'Cancelling dish must cancel its child extras');
END $$;

-- Test 12: Cancelling all items voids CxC (estado 'anulada', monto 0) and statement excludes it
DO $$
DECLARE
  v_tenant_id uuid;
  v_cust_id uuid;
  v_token text;
  v_plato_main int;
  v_order_res jsonb;
  v_order_id uuid;
  v_item_id uuid;
  v_cxc_estado text;
  v_cxc_monto numeric;
  v_stmt jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  PERFORM set_config('test.tenant', v_tenant_id::text, true);

  SELECT id INTO v_cust_id FROM public.customers WHERE tenant_id = v_tenant_id AND name = 'Empresa Acero SA' LIMIT 1;
  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND link_type = 'company' LIMIT 1;
  SELECT id INTO v_plato_main FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Chivo Liniero' LIMIT 1;

  v_order_res := public.create_order_by_link(v_token, 'Void Test', '', jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)));
  v_order_id := (v_order_res->>'order_id')::uuid;

  PERFORM public.accept_company_digital_order(v_order_id);

  SELECT id INTO v_item_id FROM public.digital_order_items WHERE order_id = v_order_id;
  PERFORM public.cancel_digital_order_item(v_item_id);

  SELECT estado, monto_total INTO v_cxc_estado, v_cxc_monto FROM public.cuentas_cobrar WHERE digital_order_id = v_order_id;
  PERFORM test_assert(v_cxc_estado = 'anulada', 'CxC estado must be anulada when all items cancelled');
  PERFORM test_assert(v_cxc_monto = 0.00, 'CxC monto_total must be 0 when all items cancelled');

  -- Statement should exclude anulada CxC
  v_stmt := public.get_company_statement(v_cust_id, (now() - interval '1 day')::date, (now() + interval '1 day')::date);
  PERFORM test_assert(NOT (v_stmt->'rows' @> jsonb_build_array(jsonb_build_object('monto_total', 0))), 'Statement excludes voided CxC');
END $$;

-- Test 13: Statement totals for a date range
DO $$
DECLARE
  v_tenant_id uuid;
  v_cust_id uuid;
  v_today date;
  v_stmt jsonb;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  PERFORM set_config('test.tenant', v_tenant_id::text, true);

  SELECT id INTO v_cust_id FROM public.customers WHERE tenant_id = v_tenant_id AND name = 'Empresa Acero SA' LIMIT 1;
  v_today := public.menu_business_today(v_tenant_id);

  -- We accepted 2 valid orders for this company in test 9 (500) and test 10 (250)
  v_stmt := public.get_company_statement(v_cust_id, v_today, v_today);

  PERFORM test_assert((v_stmt->'totals'->>'count')::int = 2, 'Statement count matches 2 active orders');
  PERFORM test_assert((v_stmt->'totals'->>'total')::numeric = 750.00, 'Statement total matches 750.00');
  PERFORM test_assert((v_stmt->'totals'->>'pending')::numeric = 750.00, 'Statement pending matches 750.00');

  -- Out of range query returns 0
  v_stmt := public.get_company_statement(v_cust_id, v_today - 30, v_today - 20);
  PERFORM test_assert((v_stmt->'totals'->>'count')::int = 0, 'Statement out of range count is 0');
  PERFORM test_assert((v_stmt->'totals'->>'total')::numeric = 0.00, 'Statement out of range total is 0');
END $$;

-- Test 14: UNAUTHORIZED when test.tenant is another tenant
DO $$
DECLARE
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_cust_a uuid;
  v_order_a uuid;
  v_item_a uuid;
  v_caught_stmt boolean := false;
  v_caught_accept boolean := false;
  v_caught_cancel boolean := false;
BEGIN
  SELECT id INTO v_tenant_a FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT id INTO v_tenant_b FROM public.tenants WHERE nombre_negocio = 'Tenant B' LIMIT 1;
  SELECT id INTO v_cust_a FROM public.customers WHERE tenant_id = v_tenant_a AND name = 'Empresa Acero SA' LIMIT 1;
  SELECT id INTO v_order_a FROM public.digital_orders WHERE tenant_id = v_tenant_a LIMIT 1;
  SELECT id INTO v_item_a FROM public.digital_order_items WHERE tenant_id = v_tenant_a LIMIT 1;

  -- Switch active tenant to tenant B
  PERFORM set_config('test.tenant', v_tenant_b::text, true);

  -- 1. Statement check
  BEGIN
    PERFORM public.get_company_statement(v_cust_a, now()::date, now()::date);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'UNAUTHORIZED' THEN
      v_caught_stmt := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_stmt, 'Statement must raise UNAUTHORIZED for wrong tenant');

  -- 2. Accept check
  BEGIN
    PERFORM public.accept_company_digital_order(v_order_a);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'UNAUTHORIZED' THEN
      v_caught_accept := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_accept, 'Accept order must raise UNAUTHORIZED for wrong tenant');

  -- 3. Cancel item check
  BEGIN
    PERFORM public.cancel_digital_order_item(v_item_a);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'UNAUTHORIZED' THEN
      v_caught_cancel := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_cancel, 'Cancel item must raise UNAUTHORIZED for wrong tenant');
END $$;

-- Test 15: cancel_digital_order_item guards (ITEM_NOT_ACTIVE and ORDER_NOT_EDITABLE)
DO $$
DECLARE
  v_tenant_id uuid;
  v_token text;
  v_plato_main int;
  v_order_res jsonb;
  v_order_id uuid;
  v_item_id uuid;
  v_caught_active boolean := false;
  v_caught_editable boolean := false;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  PERFORM set_config('test.tenant', v_tenant_id::text, true);

  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND link_type = 'company' LIMIT 1;
  SELECT id INTO v_plato_main FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Chivo Liniero' LIMIT 1;

  v_order_res := public.create_order_by_link(v_token, 'Carlos Item', '', jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)));
  v_order_id := (v_order_res->>'order_id')::uuid;
  SELECT id INTO v_item_id FROM public.digital_order_items WHERE order_id = v_order_id;

  PERFORM public.cancel_digital_order_item(v_item_id);

  BEGIN
    PERFORM public.cancel_digital_order_item(v_item_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ITEM_NOT_ACTIVE' THEN
      v_caught_active := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_active, 'Cancelling non-active item raises ITEM_NOT_ACTIVE');

  UPDATE public.digital_order_items SET status = 'active' WHERE id = v_item_id;
  BEGIN
    PERFORM public.cancel_digital_order_item(v_item_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ORDER_NOT_EDITABLE' THEN
      v_caught_editable := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_editable, 'Cancelling item on rejected order raises ORDER_NOT_EDITABLE');
END $$;

-- Test 16: Abuse guard and regex numeric cast validations
DO $$
DECLARE
  v_tenant_id uuid;
  v_token text;
  v_plato_main int;
  v_session_id text := 'session-abuse-test';
  v_caught_abuse boolean := false;
  v_caught_cast boolean := false;
  i int;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT token INTO v_token FROM public.menu_links WHERE tenant_id = v_tenant_id AND link_type = 'public' LIMIT 1;
  SELECT id INTO v_plato_main FROM public.platos WHERE tenant_id = v_tenant_id AND nombre = 'Chivo Liniero' LIMIT 1;

  FOR i IN 1..5 LOOP
    PERFORM public.create_order_by_link(
      v_token,
      'Abuse Tester',
      '',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)),
      v_session_id
    );
  END LOOP;

  BEGIN
    PERFORM public.create_order_by_link(
      v_token,
      'Abuse Tester',
      '',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_main, 'quantity', 1)),
      v_session_id
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TOO_MANY_PENDING_ORDERS' THEN
      v_caught_abuse := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_abuse, 'Abuse guard raises TOO_MANY_PENDING_ORDERS at 5 pending orders');

  BEGIN
    PERFORM public.create_order_by_link(
      v_token,
      'Cast Tester',
      '',
      jsonb_build_array(jsonb_build_object('plato_id', 'invalid_id', 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'INVALID_ITEMS' THEN
      v_caught_cast := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_cast, 'Invalid plato_id regex validation raises INVALID_ITEMS');
END $$;

-- Test 17: updated_at trigger behavior on menus, menu_items, menu_links
DO $$
DECLARE
  v_tenant_id uuid;
  v_menu_id uuid;
  v_link_id uuid;
  v_item_id uuid;
  v_old_updated timestamptz;
  v_new_updated timestamptz;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE nombre_negocio = 'Restaurante Test' LIMIT 1;
  SELECT id, updated_at INTO v_menu_id, v_old_updated FROM public.menus WHERE tenant_id = v_tenant_id LIMIT 1;

  PERFORM pg_sleep(0.01);
  UPDATE public.menus SET name = name || ' updated' WHERE id = v_menu_id RETURNING updated_at INTO v_new_updated;
  PERFORM test_assert(v_new_updated > v_old_updated, 'menus updated_at trigger must update updated_at');

  SELECT id, updated_at INTO v_link_id, v_old_updated FROM public.menu_links WHERE tenant_id = v_tenant_id LIMIT 1;
  PERFORM pg_sleep(0.01);
  UPDATE public.menu_links SET label = label || ' updated' WHERE id = v_link_id RETURNING updated_at INTO v_new_updated;
  PERFORM test_assert(v_new_updated > v_old_updated, 'menu_links updated_at trigger must update updated_at');

  SELECT id, updated_at INTO v_item_id, v_old_updated FROM public.menu_items WHERE tenant_id = v_tenant_id LIMIT 1;
  PERFORM pg_sleep(0.01);
  UPDATE public.menu_items SET sort_order = sort_order + 1 WHERE id = v_item_id RETURNING updated_at INTO v_new_updated;
  PERFORM test_assert(v_new_updated > v_old_updated, 'menu_items updated_at trigger must update updated_at');
END $$;


-- Test 18: Plan check constraint rejects invalid plans like 'foo' and accepts 'corporativo'
DO $$
DECLARE
  v_caught boolean := false;
  v_tenant_id uuid := gen_random_uuid();
BEGIN
  -- Rejects invalid plan 'foo'
  BEGIN
    INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
    VALUES (v_tenant_id, 'Restaurante Invalido', 'foo', true);
  EXCEPTION WHEN check_violation OR OTHERS THEN
    v_caught := true;
  END;
  PERFORM test_assert(v_caught, 'CHECK tenants_plan_allowed must reject plan foo');

  -- Accepts 'corporativo'
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Restaurante Corporativo Valido', 'corporativo', true);
  PERFORM test_assert(EXISTS(SELECT 1 FROM public.tenants WHERE id = v_tenant_id AND plan = 'corporativo'), 'Plan corporativo must be accepted by CHECK constraint');
END $$;

-- Test 19: Corporativo tenant can read a link menu and create an order via RPCs
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid;
  v_menu_id uuid;
  v_plato_id int;
  v_link_id uuid;
  v_token text;
  v_today date;
  v_dow smallint;
  v_res jsonb;
  v_order_res jsonb;
  v_order_count int;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Corporativo Gourmet', 'corporativo', true);

  v_today := public.menu_business_today(v_tenant_id);
  v_dow := public.menu_business_isodow(v_tenant_id, v_today);

  INSERT INTO public.sucursales (tenant_id)
  VALUES (v_tenant_id)
  RETURNING id INTO v_sucursal_id;

  INSERT INTO public.platos (nombre, precio, disponible, tenant_id, sucursal_id, is_extra)
  VALUES ('Plato Ejecutivo Corp', 350.00, true, v_tenant_id, v_sucursal_id, false)
  RETURNING id INTO v_plato_id;

  INSERT INTO public.menus (tenant_id, sucursal_id, name, schedule_mode)
  VALUES (v_tenant_id, v_sucursal_id, 'Menu Ejecutivo Corp', 'recurring')
  RETURNING id INTO v_menu_id;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays, sort_order)
  VALUES (v_tenant_id, v_menu_id, v_plato_id, ARRAY[v_dow]::smallint[], 1);

  INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, allow_extras, enabled)
  VALUES (v_tenant_id, v_sucursal_id, v_menu_id, 'Link Corp', 'public', false, true)
  RETURNING id, token INTO v_link_id, v_token;

  -- 1. Read link menu as anon
  v_res := public.get_menu_by_link(v_token);
  PERFORM test_assert((v_res->>'available')::boolean = true, 'get_menu_by_link must be available for corporativo plan');
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 1, 'get_menu_by_link should return 1 item for corporativo plan');

  -- 2. Create order by link
  v_order_res := public.create_order_by_link(
    v_token,
    'Ejecutivo Corporativo',
    'Sin cebolla',
    jsonb_build_array(jsonb_build_object('plato_id', v_plato_id, 'quantity', 1))
  );

  PERFORM test_assert(v_order_res->>'order_id' IS NOT NULL, 'create_order_by_link must create order for corporativo plan');
  PERFORM test_assert((v_order_res->>'total')::numeric = 350.00, 'Order total must match 350.00');

  SELECT count(*) INTO v_order_count
  FROM public.digital_orders
  WHERE tenant_id = v_tenant_id;
  PERFORM test_assert(v_order_count = 1, 'Exactly 1 digital order should exist for corporativo tenant');
END $$;

-- ============================================================
-- 6. Include menu link limits migration
-- ============================================================
\i supabase/migrations/20261101100000_menu_link_limits.sql

-- Test 9: Menu Link Limits and Prohibit New Public Links
DO $$
DECLARE
  v_tenant_emp uuid := gen_random_uuid();
  v_tenant_corp uuid := gen_random_uuid();
  v_sucursal_emp uuid := gen_random_uuid();
  v_sucursal_corp uuid := gen_random_uuid();
  v_menu_emp uuid := gen_random_uuid();
  v_menu_corp uuid := gen_random_uuid();
  v_cust_1 uuid := gen_random_uuid();
  v_cust_2 uuid := gen_random_uuid();
  v_cust_3 uuid := gen_random_uuid();
  v_link_1 uuid;
  v_link_2 uuid;
  v_link_3 uuid;
  v_caught_public boolean := false;
  v_caught_limit_emp boolean := false;
  v_caught_reenable_emp boolean := false;
  v_caught_limit_corp boolean := false;
  v_existing_public_count int;
  i int;
  v_cust_corp uuid;
  v_link_corp uuid;
BEGIN
  -- Unit assertions for menu_links_plan_limit
  PERFORM test_assert(public.menu_links_plan_limit('empresarial') = 2, 'menu_links_plan_limit empresarial = 2');
  PERFORM test_assert(public.menu_links_plan_limit('corporativo') = 6, 'menu_links_plan_limit corporativo = 6');
  PERFORM test_assert(public.menu_links_plan_limit('profesional') = 0, 'menu_links_plan_limit profesional = 0');
  PERFORM test_assert(public.menu_links_plan_limit('basico') = 0, 'menu_links_plan_limit basico = 0');
  PERFORM test_assert(public.menu_links_plan_limit(NULL) = 0, 'menu_links_plan_limit NULL = 0');

  -- Verify existing public links created BEFORE migration are untouched
  SELECT count(*) INTO v_existing_public_count FROM public.menu_links WHERE link_type = 'public';
  PERFORM test_assert(v_existing_public_count > 0, 'Existing public links created before migration must remain in table');

  -- 1. Inserting new public link raises PUBLIC_LINK_NOT_ALLOWED
  BEGIN
    INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type)
    VALUES (v_tenant_emp, v_sucursal_emp, v_menu_emp, 'Attempted Public Link', 'public');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'PUBLIC_LINK_NOT_ALLOWED' THEN
      v_caught_public := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_public, 'New public link insert must raise PUBLIC_LINK_NOT_ALLOWED');

  -- Setup Empresarial Tenant
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_emp, 'Tenant Empresarial Limits', 'empresarial', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal_emp, v_tenant_emp);

  INSERT INTO public.menus (id, tenant_id, sucursal_id, name)
  VALUES (v_menu_emp, v_tenant_emp, v_sucursal_emp, 'Menu Emp');

  INSERT INTO public.customers (id, tenant_id, name) VALUES (v_cust_1, v_tenant_emp, 'Empresa 1');
  INSERT INTO public.customers (id, tenant_id, name) VALUES (v_cust_2, v_tenant_emp, 'Empresa 2');
  INSERT INTO public.customers (id, tenant_id, name) VALUES (v_cust_3, v_tenant_emp, 'Empresa 3');

  -- Empresarial: 1st enabled company link -> OK
  INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, customer_id, enabled)
  VALUES (v_tenant_emp, v_sucursal_emp, v_menu_emp, 'Link Emp 1', 'company', v_cust_1, true)
  RETURNING id INTO v_link_1;

  -- Empresarial: 2nd enabled company link -> OK
  INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, customer_id, enabled)
  VALUES (v_tenant_emp, v_sucursal_emp, v_menu_emp, 'Link Emp 2', 'company', v_cust_2, true)
  RETURNING id INTO v_link_2;

  -- Empresarial: 3rd enabled company link -> raises LINK_LIMIT_REACHED
  BEGIN
    INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, customer_id, enabled)
    VALUES (v_tenant_emp, v_sucursal_emp, v_menu_emp, 'Link Emp 3', 'company', v_cust_3, true)
    RETURNING id INTO v_link_3;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'LINK_LIMIT_REACHED' THEN
      v_caught_limit_emp := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_limit_emp, '3rd company link on empresarial must raise LINK_LIMIT_REACHED');

  -- Disabling one link frees a slot
  UPDATE public.menu_links
  SET enabled = false
  WHERE id = v_link_2;

  -- Now inserting 3rd enabled company link succeeds
  INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, customer_id, enabled)
  VALUES (v_tenant_emp, v_sucursal_emp, v_menu_emp, 'Link Emp 3', 'company', v_cust_3, true)
  RETURNING id INTO v_link_3;

  PERFORM test_assert(v_link_3 IS NOT NULL, 'Inserting company link after freeing slot must succeed');

  -- Re-enabling link 2 over the limit raises LINK_LIMIT_REACHED
  BEGIN
    UPDATE public.menu_links
    SET enabled = true
    WHERE id = v_link_2;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'LINK_LIMIT_REACHED' THEN
      v_caught_reenable_emp := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_reenable_emp, 'Re-enabling company link over limit must raise LINK_LIMIT_REACHED');

  -- Setup Corporativo Tenant: allows 6, 7th raises
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_corp, 'Tenant Corporativo Limits', 'corporativo', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal_corp, v_tenant_corp);

  INSERT INTO public.menus (id, tenant_id, sucursal_id, name)
  VALUES (v_menu_corp, v_tenant_corp, v_sucursal_corp, 'Menu Corp');

  FOR i IN 1..6 LOOP
    v_cust_corp := gen_random_uuid();
    INSERT INTO public.customers (id, tenant_id, name)
    VALUES (v_cust_corp, v_tenant_corp, 'Corp Cust ' || i);

    INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, customer_id, enabled)
    VALUES (v_tenant_corp, v_sucursal_corp, v_menu_corp, 'Corp Link ' || i, 'company', v_cust_corp, true)
    RETURNING id INTO v_link_corp;
  END LOOP;

  -- 7th company link insert raises LINK_LIMIT_REACHED
  v_cust_corp := gen_random_uuid();
  INSERT INTO public.customers (id, tenant_id, name)
  VALUES (v_cust_corp, v_tenant_corp, 'Corp Cust 7');

  BEGIN
    INSERT INTO public.menu_links (tenant_id, sucursal_id, menu_id, label, link_type, customer_id, enabled)
    VALUES (v_tenant_corp, v_sucursal_corp, v_menu_corp, 'Corp Link 7', 'company', v_cust_corp, true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'LINK_LIMIT_REACHED' THEN
      v_caught_limit_corp := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_limit_corp, '7th company link on corporativo must raise LINK_LIMIT_REACHED');
END $$;
