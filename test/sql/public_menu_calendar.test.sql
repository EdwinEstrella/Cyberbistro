-- ============================================================
-- Public Menu Calendar Test Suite
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

-- 3. Include migration files in order
\i supabase/migrations/20261031120000_corporate_menu_links.sql
\i supabase/migrations/20261031130000_corporate_menu_links_revoke_anon.sql
\i supabase/migrations/20261101090000_add_corporativo_plan.sql
\i supabase/migrations/20261101150000_menus_closed_without_cycle.sql
\i supabase/migrations/20261101160000_public_menu_calendar.sql

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

-- Test 1: Legacy (no menu_id) behavior unchanged
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug text := 'legacy-restaurant-' || substr(gen_random_uuid()::text, 1, 8);
  v_plato_a int;
  v_plato_b int;
  v_res jsonb;
  v_order_res jsonb;
  v_caught boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Legacy Restaurant', 'profesional', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal_id, v_tenant_id);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled, menu_id)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true, NULL);

  INSERT INTO public.platos (nombre, precio, categoria, disponible, tenant_id, sucursal_id)
  VALUES ('Plato Visible Legacy', 250.00, 'Comidas', true, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_a;

  INSERT INTO public.platos (nombre, precio, categoria, disponible, tenant_id, sucursal_id)
  VALUES ('Plato Oculto Legacy', 350.00, 'Comidas', true, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_b;

  INSERT INTO public.digital_menu_items (tenant_id, plato_id, visible)
  VALUES (v_tenant_id, v_plato_a, true);

  INSERT INTO public.digital_menu_items (tenant_id, plato_id, visible)
  VALUES (v_tenant_id, v_plato_b, false);

  -- Fetch public menu
  v_res := public.get_public_digital_menu(v_slug);
  PERFORM test_assert((v_res->'settings')->>'public_slug' = v_slug, 'Legacy menu settings returned');
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 1, 'Legacy menu returns exactly 1 visible item');
  PERFORM test_assert((v_res->'items'->0->>'plato_id')::int = v_plato_a, 'Legacy item is Plato A');

  -- Order Plato A -> succeeds
  v_order_res := public.create_public_digital_order(
    v_slug,
    'Cliente Legacy',
    '809-555-0001',
    'Nota',
    jsonb_build_array(jsonb_build_object('plato_id', v_plato_a, 'quantity', 1))
  );
  PERFORM test_assert(v_order_res->>'status' = 'pending', 'Legacy order for Plato A placed');

  -- Order Plato B -> rejected
  BEGIN
    PERFORM public.create_public_digital_order(
      v_slug,
      'Cliente Legacy',
      '809-555-0001',
      'Nota',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_b, 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  PERFORM test_assert(v_caught, 'Legacy order for hidden Plato B must be rejected');
END $$;

-- Test 2: Recurring menu → only today's weekday items, sold-out excluded, extras excluded
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_menu_id uuid := gen_random_uuid();
  v_slug text := 'recurring-menu-' || substr(gen_random_uuid()::text, 1, 8);
  v_today date;
  v_isodow smallint;
  v_other_dow smallint;
  v_plato_today int;
  v_plato_other int;
  v_plato_sold_out int;
  v_plato_extra int;
  v_res jsonb;
  v_order_res jsonb;
  v_caught_sold_out boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Recurring Restaurant', 'profesional', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal_id, v_tenant_id);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  v_today := public.menu_business_today(v_tenant_id);
  v_isodow := public.menu_business_isodow(v_tenant_id, v_today);
  v_other_dow := CASE WHEN v_isodow = 1 THEN 2 ELSE 1 END;

  INSERT INTO public.menus (id, tenant_id, sucursal_id, name, schedule_mode)
  VALUES (v_menu_id, v_tenant_id, v_sucursal_id, 'Menu Recurrente', 'recurring');

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled, menu_id)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true, v_menu_id);

  -- Plato Today (valid for today)
  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato Hoy', 300.00, 'Comidas', true, false, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_today;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays, display_name)
  VALUES (v_tenant_id, v_menu_id, v_plato_today, ARRAY[v_isodow], 'Plato Hoy Display');

  -- Plato Other Day (not valid today)
  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato Otro Dia', 320.00, 'Comidas', true, false, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_other;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES (v_tenant_id, v_menu_id, v_plato_other, ARRAY[v_other_dow]);

  -- Plato Sold Out today
  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato Agotado', 400.00, 'Comidas', true, false, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_sold_out;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES (v_tenant_id, v_menu_id, v_plato_sold_out, ARRAY[v_isodow]);

  INSERT INTO public.plato_sold_out (tenant_id, plato_id, sold_out_date)
  VALUES (v_tenant_id, v_plato_sold_out, v_today);

  -- Plato Extra (must be excluded from public menu)
  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato Extra', 80.00, 'Extras', true, true, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_extra;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES (v_tenant_id, v_menu_id, v_plato_extra, ARRAY[v_isodow]);

  -- Query public menu
  v_res := public.get_public_digital_menu(v_slug);
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 1, 'Only today non-sold-out non-extra dish returned');
  PERFORM test_assert((v_res->'items'->0->>'plato_id')::int = v_plato_today, 'Returned item is Plato Today');
  PERFORM test_assert((v_res->'items'->0->>'name') = 'Plato Hoy Display', 'Custom display_name from menu_items respected');

  -- Order Plato Today -> succeeds
  v_order_res := public.create_public_digital_order(
    v_slug,
    'Cliente Recurring',
    '809-555-0002',
    'Nota',
    jsonb_build_array(jsonb_build_object('plato_id', v_plato_today, 'quantity', 2))
  );
  PERFORM test_assert(v_order_res->>'status' = 'pending', 'Order for Plato Today placed successfully');
  PERFORM test_assert((v_order_res->>'total')::numeric = 600.00, 'Order total matches quantity * price');

  -- Order sold out item -> rejected
  BEGIN
    PERFORM public.create_public_digital_order(
      v_slug,
      'Cliente Recurring',
      '809-555-0002',
      'Nota',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_sold_out, 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_sold_out := true;
  END;
  PERFORM test_assert(v_caught_sold_out, 'Sold-out dish order must be rejected');
END $$;

-- Test 3: Weekly menu outside its week → empty dishes and order rejected
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_menu_id uuid := gen_random_uuid();
  v_slug text := 'weekly-past-' || substr(gen_random_uuid()::text, 1, 8);
  v_plato_id int;
  v_past_monday date;
  v_res jsonb;
  v_caught boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Weekly Past Restaurant', 'empresarial', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal_id, v_tenant_id);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  -- Weekly menu starting 2 weeks ago on a Monday
  v_past_monday := (date_trunc('week', CURRENT_DATE)::date - 14);

  INSERT INTO public.menus (id, tenant_id, sucursal_id, name, schedule_mode, week_start)
  VALUES (v_menu_id, v_tenant_id, v_sucursal_id, 'Menu Semanal Pasado', 'weekly', v_past_monday);

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled, menu_id)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true, v_menu_id);

  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato Semanal', 380.00, 'Comidas', true, false, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_id;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES (v_tenant_id, v_menu_id, v_plato_id, ARRAY[1,2,3,4,5,6,7]);

  -- get_public_digital_menu returns empty items
  v_res := public.get_public_digital_menu(v_slug);
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 0, 'Weekly menu outside its week must return empty items');

  -- create_public_digital_order must be rejected
  BEGIN
    PERFORM public.create_public_digital_order(
      v_slug,
      'Cliente Weekly Past',
      '809-555-0003',
      'Nota',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_id, 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  PERFORM test_assert(v_caught, 'Order on weekly menu outside its week must be rejected');
END $$;

-- Test 4: Order with a dish not in today's set rejected
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_menu_id uuid := gen_random_uuid();
  v_slug text := 'wrong-dish-' || substr(gen_random_uuid()::text, 1, 8);
  v_today date;
  v_isodow smallint;
  v_other_dow smallint;
  v_plato_other int;
  v_plato_unrelated int;
  v_caught_other boolean := false;
  v_caught_unrelated boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Wrong Dish Restaurant', 'corporativo', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal_id, v_tenant_id);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  v_today := public.menu_business_today(v_tenant_id);
  v_isodow := public.menu_business_isodow(v_tenant_id, v_today);
  v_other_dow := CASE WHEN v_isodow = 1 THEN 2 ELSE 1 END;

  INSERT INTO public.menus (id, tenant_id, sucursal_id, name, schedule_mode)
  VALUES (v_menu_id, v_tenant_id, v_sucursal_id, 'Menu Corporativo', 'recurring');

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled, menu_id)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true, v_menu_id);

  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato de Otro Dia', 290.00, 'Comidas', true, false, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_other;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES (v_tenant_id, v_menu_id, v_plato_other, ARRAY[v_other_dow]);

  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato Suelto', 190.00, 'Comidas', true, false, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_unrelated;

  -- Try to order dish scheduled for another day
  BEGIN
    PERFORM public.create_public_digital_order(
      v_slug,
      'Cliente Wrong Day',
      '809-555-0004',
      'Nota',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_other, 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_other := true;
  END;
  PERFORM test_assert(v_caught_other, 'Order with dish scheduled for another weekday must be rejected');

  -- Try to order dish not in the menu at all
  BEGIN
    PERFORM public.create_public_digital_order(
      v_slug,
      'Cliente Unrelated',
      '809-555-0004',
      'Nota',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_unrelated, 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_unrelated := true;
  END;
  PERFORM test_assert(v_caught_unrelated, 'Order with dish not in calendar menu must be rejected');
END $$;

-- Test 5: Plan basico with menu_id → behaves as legacy
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_menu_id uuid := gen_random_uuid();
  v_slug text := 'basico-plan-' || substr(gen_random_uuid()::text, 1, 8);
  v_today date;
  v_isodow smallint;
  v_plato_legacy int;
  v_plato_calendar_only int;
  v_res jsonb;
  v_order_res jsonb;
  v_caught boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Basico Restaurant', 'basico', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal_id, v_tenant_id);

  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now(), NULL);

  v_today := public.menu_business_today(v_tenant_id);
  v_isodow := public.menu_business_isodow(v_tenant_id, v_today);

  INSERT INTO public.menus (id, tenant_id, sucursal_id, name, schedule_mode)
  VALUES (v_menu_id, v_tenant_id, v_sucursal_id, 'Menu Inactivo para Basico', 'recurring');

  -- Settings has menu_id assigned, but plan is 'basico'
  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled, menu_id)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true, v_menu_id);

  -- Plato 1: visible in legacy digital_menu_items
  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato Legacy Basico', 150.00, 'Comidas', true, false, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_legacy;

  INSERT INTO public.digital_menu_items (tenant_id, plato_id, visible)
  VALUES (v_tenant_id, v_plato_legacy, true);

  -- Plato 2: only in calendar menu, hidden in legacy
  INSERT INTO public.platos (nombre, precio, categoria, disponible, is_extra, tenant_id, sucursal_id)
  VALUES ('Plato Calendar Solo', 220.00, 'Comidas', true, false, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_calendar_only;

  INSERT INTO public.menu_items (tenant_id, menu_id, plato_id, weekdays)
  VALUES (v_tenant_id, v_menu_id, v_plato_calendar_only, ARRAY[v_isodow]);

  INSERT INTO public.digital_menu_items (tenant_id, plato_id, visible)
  VALUES (v_tenant_id, v_plato_calendar_only, false);

  -- get_public_digital_menu should behave as legacy: return Plato Legacy, exclude Plato Calendar
  v_res := public.get_public_digital_menu(v_slug);
  PERFORM test_assert(jsonb_array_length(v_res->'items') = 1, 'Basico plan must serve legacy items');
  PERFORM test_assert((v_res->'items'->0->>'plato_id')::int = v_plato_legacy, 'Basico item is Plato Legacy');

  -- Order for Plato Legacy succeeds
  v_order_res := public.create_public_digital_order(
    v_slug,
    'Cliente Basico',
    '809-555-0005',
    'Nota',
    jsonb_build_array(jsonb_build_object('plato_id', v_plato_legacy, 'quantity', 1))
  );
  PERFORM test_assert(v_order_res->>'status' = 'pending', 'Order for legacy item on basico plan placed');

  -- Order for Plato Calendar (hidden in legacy) is rejected
  BEGIN
    PERFORM public.create_public_digital_order(
      v_slug,
      'Cliente Basico',
      '809-555-0005',
      'Nota',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_calendar_only, 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  PERFORM test_assert(v_caught, 'Order for calendar dish not visible in legacy must be rejected on basico plan');
END $$;

-- Test 6: Cross-tenant menu_id rejected by trigger
DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_menu_b uuid := gen_random_uuid();
  v_settings_a uuid := gen_random_uuid();
  v_caught_insert boolean := false;
  v_caught_update boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_a, 'Tenant A', 'profesional', true);

  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_b, 'Tenant B', 'profesional', true);

  INSERT INTO public.menus (id, tenant_id, name, schedule_mode)
  VALUES (v_menu_b, v_tenant_b, 'Menu de Tenant B', 'recurring');

  -- Insert cross-tenant menu_id -> rejected
  BEGIN
    INSERT INTO public.digital_menu_settings (id, tenant_id, public_slug, menu_id)
    VALUES (v_settings_a, v_tenant_a, 'cross-tenant-slug', v_menu_b);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TENANT_MISMATCH' THEN
      v_caught_insert := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_insert, 'INSERT digital_menu_settings with cross-tenant menu_id must raise TENANT_MISMATCH');

  -- Insert valid settings first
  INSERT INTO public.digital_menu_settings (id, tenant_id, public_slug, menu_id)
  VALUES (v_settings_a, v_tenant_a, 'valid-slug', NULL);

  -- Update with cross-tenant menu_id -> rejected
  BEGIN
    UPDATE public.digital_menu_settings
    SET menu_id = v_menu_b
    WHERE id = v_settings_a;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TENANT_MISMATCH' THEN
      v_caught_update := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_update, 'UPDATE digital_menu_settings with cross-tenant menu_id must raise TENANT_MISMATCH');
END $$;

-- Test 7: anon cannot execute the internal helper
DO $$
DECLARE
  v_priv_anon boolean;
  v_caught_anon boolean := false;
BEGIN
  SELECT has_function_privilege('anon', 'public.get_menu_today_plato_ids(uuid, uuid, uuid)', 'execute')
  INTO v_priv_anon;
  PERFORM test_assert(v_priv_anon IS FALSE, 'anon must not have execute privilege on get_menu_today_plato_ids');

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.get_menu_today_plato_ids(gen_random_uuid(), gen_random_uuid(), NULL);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLSTATE = '42501' THEN
      v_caught_anon := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_anon, 'anon execution of get_menu_today_plato_ids must raise 42501 permission denied');
END $$;

-- Test 8: RESTAURANT_CLOSED trigger keeps working
DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_sucursal_id uuid := gen_random_uuid();
  v_slug text := 'closed-restaurant-' || substr(gen_random_uuid()::text, 1, 8);
  v_plato_id int;
  v_caught_closed boolean := false;
BEGIN
  INSERT INTO public.tenants (id, nombre_negocio, plan, activa)
  VALUES (v_tenant_id, 'Closed Restaurant', 'profesional', true);

  INSERT INTO public.sucursales (id, tenant_id)
  VALUES (v_sucursal_id, v_tenant_id);

  -- No open cycle in cierres_operativos (or all cycles closed)
  INSERT INTO public.cierres_operativos (tenant_id, sucursal_id, opened_at, closed_at)
  VALUES (v_tenant_id, v_sucursal_id, now() - interval '2 hours', now() - interval '1 hour');

  INSERT INTO public.digital_menu_settings (tenant_id, sucursal_id, public_slug, enabled, menu_id)
  VALUES (v_tenant_id, v_sucursal_id, v_slug, true, NULL);

  INSERT INTO public.platos (nombre, precio, categoria, disponible, tenant_id, sucursal_id)
  VALUES ('Plato Closed', 200.00, 'Comidas', true, v_tenant_id, v_sucursal_id)
  RETURNING id INTO v_plato_id;

  INSERT INTO public.digital_menu_items (tenant_id, plato_id, visible)
  VALUES (v_tenant_id, v_plato_id, true);

  BEGIN
    PERFORM public.create_public_digital_order(
      v_slug,
      'Cliente Cerrado',
      '809-555-0006',
      'Nota',
      jsonb_build_array(jsonb_build_object('plato_id', v_plato_id, 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'RESTAURANT_CLOSED' THEN
      v_caught_closed := true;
    END IF;
  END;
  PERFORM test_assert(v_caught_closed, 'Order when operational cycle is closed must raise RESTAURANT_CLOSED');
END $$;
