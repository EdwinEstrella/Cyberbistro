-- ============================================================
-- Migration: Employee Roster & Credit Limit (Corporativo only)
-- Part of Feature: corporativo-plan (Tasks C-T4 & C-T5)
-- ============================================================

-- 1. Alter menu_links: require_roster
ALTER TABLE public.menu_links
  ADD COLUMN IF NOT EXISTS require_roster boolean NOT NULL DEFAULT false;

-- 2. Alter customers: credit_limit
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2) NULL CHECK (credit_limit IS NULL OR credit_limit >= 0);

-- 3. Table menu_link_employees
CREATE TABLE IF NOT EXISTS public.menu_link_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_link_id uuid NOT NULL REFERENCES public.menu_links(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(trim(full_name)) >= 2 AND length(trim(full_name)) <= 80),
  document_id text NULL CHECK (document_id IS NULL OR document_id ~ '^[0-9]{11}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraints per link
CREATE UNIQUE INDEX IF NOT EXISTS menu_link_employees_link_document_idx
  ON public.menu_link_employees (menu_link_id, document_id)
  WHERE document_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS menu_link_employees_link_lower_name_idx
  ON public.menu_link_employees (menu_link_id, lower(full_name));

CREATE INDEX IF NOT EXISTS menu_link_employees_tenant_link_idx
  ON public.menu_link_employees (tenant_id, menu_link_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS set_public_menu_link_employees_updated_at ON public.menu_link_employees;
CREATE TRIGGER set_public_menu_link_employees_updated_at
  BEFORE UPDATE ON public.menu_link_employees
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Tenant consistency trigger
CREATE OR REPLACE FUNCTION public.check_menu_link_employees_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_link_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_link_tenant_id
  FROM public.menu_links
  WHERE id = NEW.menu_link_id;

  IF v_link_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_link_employees_tenant_integrity ON public.menu_link_employees;
CREATE TRIGGER trg_menu_link_employees_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.menu_link_employees
  FOR EACH ROW
  EXECUTE FUNCTION public.check_menu_link_employees_tenant_integrity();

-- RLS on menu_link_employees
ALTER TABLE public.menu_link_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_menu_link_employees_tenant_select ON public.menu_link_employees;
CREATE POLICY cb_menu_link_employees_tenant_select ON public.menu_link_employees
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'cocina', 'cocinero', 'contabilidad']));

DROP POLICY IF EXISTS cb_menu_link_employees_tenant_insert ON public.menu_link_employees;
CREATE POLICY cb_menu_link_employees_tenant_insert ON public.menu_link_employees
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_menu_link_employees_tenant_update ON public.menu_link_employees;
CREATE POLICY cb_menu_link_employees_tenant_update ON public.menu_link_employees
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_menu_link_employees_admin_delete ON public.menu_link_employees;
CREATE POLICY cb_menu_link_employees_admin_delete ON public.menu_link_employees
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

-- Permissions on table
REVOKE ALL ON TABLE public.menu_link_employees FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_link_employees TO authenticated;

-- 4. Pure SQL, IMMUTABLE normalization helpers
CREATE OR REPLACE FUNCTION public.menu_link_normalize_cedula(p_doc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT regexp_replace(COALESCE(p_doc, ''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.menu_link_normalize_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT trim(regexp_replace(translate(lower(COALESCE(p_name, '')), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g'));
$$;

-- 5. Helper company_credit_used_internal and client wrapper company_credit_used
CREATE OR REPLACE FUNCTION public.company_credit_used_internal(p_tenant uuid, p_customer uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cxc numeric := 0;
  v_pending numeric := 0;
BEGIN
  IF p_tenant IS NULL OR p_customer IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(monto_total - monto_pagado), 0)
  INTO v_cxc
  FROM public.cuentas_cobrar
  WHERE tenant_id = p_tenant
    AND customer_id = p_customer
    AND estado NOT IN ('anulada', 'pagada');

  SELECT COALESCE(SUM(d.total), 0)
  INTO v_pending
  FROM public.digital_orders d
  JOIN public.menu_links ml ON ml.id = d.menu_link_id
  WHERE d.tenant_id = p_tenant
    AND ml.tenant_id = p_tenant
    AND ml.customer_id = p_customer
    AND d.status = 'pending';

  RETURN v_cxc + v_pending;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_credit_used(p_tenant uuid, p_customer uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.cyberbistro_has_tenant_role(p_tenant, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer AND tenant_id = p_tenant
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  RETURN public.company_credit_used_internal(p_tenant, p_customer);
END;
$$;

-- 6. Recreate get_menu_by_link with require_roster & credit_limit check
CREATE OR REPLACE FUNCTION public.get_menu_by_link(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_link         public.menu_links%ROWTYPE;
  v_menu         public.menus%ROWTYPE;
  v_tenant       public.tenants%ROWTYPE;
  v_settings     public.digital_menu_settings%ROWTYPE;
  v_today        date;
  v_isodow       smallint;
  v_available    boolean := true;
  v_reason       text := NULL;
  v_items        jsonb := '[]'::jsonb;
  v_extras       jsonb := '[]'::jsonb;
  v_company_name text := NULL;
  v_credit_limit numeric := NULL;
  v_plan         text := NULL;
  v_restaurant   jsonb;
BEGIN
  SELECT * INTO v_link
  FROM public.menu_links
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'MENU_NOT_AVAILABLE',
      'items', '[]'::jsonb,
      'extras', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = v_link.tenant_id
    AND COALESCE(activa, true) IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'MENU_NOT_AVAILABLE',
      'items', '[]'::jsonb,
      'extras', '[]'::jsonb
    );
  END IF;

  v_plan := lower(trim(COALESCE(v_tenant.plan, '')));
  v_today := public.menu_business_today(v_link.tenant_id);
  v_isodow := public.menu_business_isodow(v_link.tenant_id, v_today);

  IF NOT v_link.enabled THEN
    v_available := false;
    v_reason := 'LINK_DISABLED';
  ELSIF v_plan NOT IN ('empresarial', 'corporativo') THEN
    v_available := false;
    v_reason := 'PLAN_REQUIRED';
  ELSE
    SELECT * INTO v_menu FROM public.menus WHERE id = v_link.menu_id;
    IF NOT FOUND THEN
      v_available := false;
      v_reason := 'MENU_NOT_AVAILABLE';
    ELSIF v_menu.schedule_mode = 'weekly' AND (v_menu.week_start IS NULL OR v_today < v_menu.week_start OR v_today > (v_menu.week_start + 6)) THEN
      v_available := false;
      v_reason := 'MENU_NOT_AVAILABLE';
    END IF;
  END IF;

  IF v_link.link_type = 'company' AND v_link.customer_id IS NOT NULL THEN
    SELECT name, credit_limit INTO v_company_name, v_credit_limit
    FROM public.customers
    WHERE id = v_link.customer_id;

    -- Credit limit auto-block (corporativo only)
    IF v_available AND v_plan = 'corporativo' AND v_credit_limit IS NOT NULL THEN
      IF public.company_credit_used_internal(v_link.tenant_id, v_link.customer_id) >= v_credit_limit THEN
        v_available := false;
        v_reason := 'CREDIT_LIMIT_REACHED';
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE tenant_id = v_link.tenant_id
    AND (sucursal_id IS NULL OR sucursal_id = v_link.sucursal_id)
  ORDER BY (sucursal_id = v_link.sucursal_id) DESC NULLS LAST
  LIMIT 1;

  v_restaurant := jsonb_build_object(
    'title',         COALESCE(NULLIF(trim(v_settings.title), ''), v_tenant.nombre_negocio),
    'description',   NULLIF(trim(COALESCE(v_settings.description, '')), ''),
    'logo_url',      COALESCE(NULLIF(trim(v_settings.logo_url), ''), NULLIF(trim(COALESCE(v_tenant.logo_url, '')), '')),
    'banner_url',    NULLIF(trim(COALESCE(v_settings.banner_url, '')), ''),
    'business_name', v_tenant.nombre_negocio,
    'phone',         v_tenant.telefono,
    'address',       v_tenant.direccion,
    'currency',      COALESCE(v_tenant.moneda, 'DOP'),
    'theme',         v_settings.theme
  );

  IF v_available THEN
    -- Main dishes
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',          mi.id,
        'plato_id',    p.id,
        'name',        COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre),
        'description', NULLIF(trim(COALESCE(dmi.description, '')), ''),
        'image_url',   NULLIF(trim(COALESCE(dmi.image_url, '')), ''),
        'price',       p.precio,
        'category',    COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
        'sort_order',  COALESCE(mi.sort_order, 0)
      )
      ORDER BY
        COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
        COALESCE(mi.sort_order, 0),
        COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre)
    ), '[]'::jsonb)
    INTO v_items
    FROM public.menu_items mi
    JOIN public.platos p ON p.id = mi.plato_id AND p.tenant_id = mi.tenant_id
    LEFT JOIN LATERAL (
      SELECT description, image_url
      FROM public.digital_menu_items d
      WHERE d.plato_id = p.id AND d.tenant_id = p.tenant_id
      ORDER BY d.updated_at DESC
      LIMIT 1
    ) dmi ON true
    WHERE mi.menu_id = v_link.menu_id
      AND p.disponible IS TRUE
      AND p.is_extra IS FALSE
      AND v_isodow = ANY(mi.weekdays)
      AND NOT EXISTS (
        SELECT 1 FROM public.plato_sold_out so
        WHERE so.tenant_id = v_link.tenant_id
          AND so.plato_id = p.id
          AND so.sold_out_date = v_today
      )
      AND (p.sucursal_id IS NULL OR p.sucursal_id = v_link.sucursal_id);

    -- Extras if allowed
    IF v_link.allow_extras IS TRUE THEN
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',          mi.id,
          'plato_id',    p.id,
          'name',        COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre),
          'description', NULLIF(trim(COALESCE(dmi.description, '')), ''),
          'image_url',   NULLIF(trim(COALESCE(dmi.image_url, '')), ''),
          'price',       p.precio,
          'category',    COALESCE(NULLIF(trim(p.categoria), ''), 'Extras'),
          'sort_order',  COALESCE(mi.sort_order, 0)
        )
        ORDER BY
          COALESCE(mi.sort_order, 0),
          COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre)
      ), '[]'::jsonb)
      INTO v_extras
      FROM public.menu_items mi
      JOIN public.platos p ON p.id = mi.plato_id AND p.tenant_id = mi.tenant_id
      LEFT JOIN LATERAL (
        SELECT description, image_url
        FROM public.digital_menu_items d
        WHERE d.plato_id = p.id AND d.tenant_id = p.tenant_id
        ORDER BY d.updated_at DESC
        LIMIT 1
      ) dmi ON true
      WHERE mi.menu_id = v_link.menu_id
        AND p.disponible IS TRUE
        AND p.is_extra IS TRUE
        AND v_isodow = ANY(mi.weekdays)
        AND NOT EXISTS (
          SELECT 1 FROM public.plato_sold_out so
          WHERE so.tenant_id = v_link.tenant_id
            AND so.plato_id = p.id
            AND so.sold_out_date = v_today
        )
        AND (p.sucursal_id IS NULL OR p.sucursal_id = v_link.sucursal_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'available',      v_available,
    'reason',         v_reason,
    'label',          v_link.label,
    'link_type',      v_link.link_type,
    'allow_extras',   v_link.allow_extras,
    'require_roster', COALESCE(v_link.require_roster, false),
    'company_name',   v_company_name,
    'restaurant',     v_restaurant,
    'settings',       v_restaurant,
    'items',          v_items,
    'extras',         v_extras
  );
END;
$$;

-- 7. Recreate create_order_by_link with roster matching & credit limit enforcement
CREATE OR REPLACE FUNCTION public.create_order_by_link(
  p_token         text,
  p_employee_name text,
  p_notes         text,
  p_items         jsonb,
  p_session_id    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_link                    public.menu_links%ROWTYPE;
  v_menu                    public.menus%ROWTYPE;
  v_tenant                  public.tenants%ROWTYPE;
  v_plan                    text;
  v_today                   date;
  v_isodow                  smallint;
  v_order_id                uuid;
  v_parent_item_id          uuid;
  v_numero_pedido           integer;
  v_order_total             numeric := 0;
  v_item                    jsonb;
  v_plato_id                integer;
  v_quantity                integer;
  v_item_notes              text;
  v_main_row                record;
  v_subtotal                numeric;
  v_extra                   jsonb;
  v_extra_plato_id          integer;
  v_extra_quantity          integer;
  v_extra_row               record;
  v_extra_subtotal          numeric;
  v_trimmed_emp             text;
  v_pending_count           integer;
  v_norm_doc                text;
  v_norm_name               text;
  v_matched_employee_name   text := NULL;
  v_credit_limit            numeric := NULL;
BEGIN
  -- 1. Validate link
  SELECT * INTO v_link
  FROM public.menu_links
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MENU_NOT_AVAILABLE';
  END IF;

  IF NOT v_link.enabled THEN
    RAISE EXCEPTION 'LINK_DISABLED';
  END IF;

  -- 2. Validate tenant & plan
  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = v_link.tenant_id
  LIMIT 1;

  IF COALESCE(v_tenant.activa, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'MENU_NOT_AVAILABLE';
  END IF;

  v_plan := lower(trim(COALESCE(v_tenant.plan, '')));
  IF v_plan NOT IN ('empresarial', 'corporativo') THEN
    RAISE EXCEPTION 'PLAN_REQUIRED';
  END IF;

  -- 3. Validate schedule
  v_today := public.menu_business_today(v_link.tenant_id);
  v_isodow := public.menu_business_isodow(v_link.tenant_id, v_today);

  SELECT * INTO v_menu FROM public.menus WHERE id = v_link.menu_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MENU_NOT_AVAILABLE';
  END IF;

  IF v_menu.schedule_mode = 'weekly' AND (v_menu.week_start IS NULL OR v_today < v_menu.week_start OR v_today > (v_menu.week_start + 6)) THEN
    RAISE EXCEPTION 'MENU_NOT_AVAILABLE';
  END IF;

  -- 4. Validate employee / customer name & optional roster check
  IF v_link.require_roster IS TRUE AND v_plan = 'corporativo' THEN
    v_norm_doc := public.menu_link_normalize_cedula(p_employee_name);
    v_norm_name := public.menu_link_normalize_name(p_employee_name);

    IF length(v_norm_doc) = 11 THEN
      -- Match by cédula (11 digits)
      SELECT full_name INTO v_matched_employee_name
      FROM public.menu_link_employees
      WHERE menu_link_id = v_link.id
        AND tenant_id = v_link.tenant_id
        AND document_id = v_norm_doc
        AND active IS TRUE
      LIMIT 1;
    ELSE
      -- Match by normalized full name
      SELECT full_name INTO v_matched_employee_name
      FROM public.menu_link_employees
      WHERE menu_link_id = v_link.id
        AND tenant_id = v_link.tenant_id
        AND public.menu_link_normalize_name(full_name) = v_norm_name
        AND active IS TRUE
      LIMIT 1;
    END IF;

    IF v_matched_employee_name IS NULL THEN
      RAISE EXCEPTION 'EMPLOYEE_NOT_AUTHORIZED';
    END IF;

    -- Store canonical roster full_name
    v_trimmed_emp := v_matched_employee_name;
  ELSE
    -- Default name handling (require_roster ignored if not corporativo or if false)
    v_trimmed_emp := trim(COALESCE(p_employee_name, ''));
    IF v_link.link_type = 'company' THEN
      IF length(v_trimmed_emp) < 2 OR length(v_trimmed_emp) > 80 THEN
        RAISE EXCEPTION 'INVALID_EMPLOYEE_NAME';
      END IF;
    ELSE
      IF length(v_trimmed_emp) > 0 AND (length(v_trimmed_emp) < 2 OR length(v_trimmed_emp) > 80) THEN
        RAISE EXCEPTION 'INVALID_EMPLOYEE_NAME';
      END IF;
      IF length(v_trimmed_emp) = 0 THEN
        v_trimmed_emp := 'Cliente';
      END IF;
    END IF;
  END IF;

  -- 5. Validate notes
  IF length(trim(COALESCE(p_notes, ''))) > 500 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;

  -- 6. Validate items array
  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1
     OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;

  -- 6b. Abuse guard for client sessions
  IF NULLIF(trim(p_session_id), '') IS NOT NULL THEN
    SELECT count(*) INTO v_pending_count
    FROM public.digital_orders
    WHERE menu_link_id = v_link.id
      AND client_session_id = trim(p_session_id)
      AND status = 'pending';

    IF v_pending_count >= 5 THEN
      RAISE EXCEPTION 'TOO_MANY_PENDING_ORDERS';
    END IF;
  END IF;

  -- 7. Get sequential order number
  INSERT INTO public.tenant_order_counters (tenant_id, next_numero)
  VALUES (v_link.tenant_id, 2)
  ON CONFLICT (tenant_id) DO UPDATE
    SET next_numero = tenant_order_counters.next_numero + 1
  RETURNING next_numero - 1 INTO v_numero_pedido;

  -- 8. Create digital order (total initially 0)
  INSERT INTO public.digital_orders (
    tenant_id,
    sucursal_id,
    menu_link_id,
    employee_name,
    customer_name,
    order_type,
    status,
    total,
    notes,
    client_session_id,
    numero_pedido
  )
  VALUES (
    v_link.tenant_id,
    v_link.sucursal_id,
    v_link.id,
    v_trimmed_emp,
    v_trimmed_emp,
    CASE WHEN v_link.link_type = 'company' THEN 'company' ELSE 'takeout' END,
    'pending',
    0,
    NULLIF(trim(p_notes), ''),
    NULLIF(trim(p_session_id), ''),
    v_numero_pedido
  )
  RETURNING id INTO v_order_id;

  -- 9. Insert items and extras
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_ITEMS';
    END IF;

    IF (v_item->>'plato_id') IS NULL OR (v_item->>'plato_id') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'INVALID_ITEMS';
    END IF;

    IF (v_item ? 'quantity') AND ((v_item->>'quantity') IS NULL OR (v_item->>'quantity') !~ '^[0-9]+$') THEN
      RAISE EXCEPTION 'INVALID_ITEMS';
    END IF;

    v_plato_id := (v_item->>'plato_id')::integer;
    v_quantity := COALESCE((v_item->>'quantity')::integer, 1);
    v_item_notes := NULLIF(left(trim(COALESCE(v_item->>'notes', '')), 300), '');

    IF v_quantity < 1 OR v_quantity > 50 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    SELECT p.id, COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre) AS item_name, p.precio
    INTO v_main_row
    FROM public.menu_items mi
    JOIN public.platos p ON p.id = mi.plato_id AND p.tenant_id = mi.tenant_id
    WHERE mi.menu_id = v_link.menu_id
      AND p.id = v_plato_id
      AND p.disponible IS TRUE
      AND p.is_extra IS FALSE
      AND v_isodow = ANY(mi.weekdays)
      AND (p.sucursal_id IS NULL OR p.sucursal_id = v_link.sucursal_id);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_NOT_AVAILABLE';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.plato_sold_out
      WHERE tenant_id = v_link.tenant_id AND plato_id = v_plato_id AND sold_out_date = v_today
    ) THEN
      RAISE EXCEPTION 'ITEM_SOLD_OUT';
    END IF;

    v_subtotal := v_main_row.precio * v_quantity;
    v_order_total := v_order_total + v_subtotal;

    INSERT INTO public.digital_order_items (
      tenant_id,
      order_id,
      plato_id,
      name_snapshot,
      price_snapshot,
      quantity,
      notes,
      subtotal,
      status,
      parent_item_id
    )
    VALUES (
      v_link.tenant_id,
      v_order_id,
      v_main_row.id,
      v_main_row.item_name,
      v_main_row.precio,
      v_quantity,
      v_item_notes,
      v_subtotal,
      'active',
      NULL
    )
    RETURNING id INTO v_parent_item_id;

    -- Extras
    IF v_item ? 'extras' AND jsonb_typeof(v_item->'extras') = 'array' AND jsonb_array_length(v_item->'extras') > 0 THEN
      IF NOT v_link.allow_extras THEN
        RAISE EXCEPTION 'EXTRAS_NOT_ALLOWED';
      END IF;

      FOR v_extra IN SELECT * FROM jsonb_array_elements(v_item->'extras')
      LOOP
        IF jsonb_typeof(v_extra) <> 'object' THEN
          RAISE EXCEPTION 'INVALID_ITEMS';
        END IF;

        IF (v_extra->>'plato_id') IS NULL OR (v_extra->>'plato_id') !~ '^[0-9]+$' THEN
          RAISE EXCEPTION 'INVALID_ITEMS';
        END IF;

        IF (v_extra ? 'quantity') AND ((v_extra->>'quantity') IS NULL OR (v_extra->>'quantity') !~ '^[0-9]+$') THEN
          RAISE EXCEPTION 'INVALID_ITEMS';
        END IF;

        v_extra_plato_id := (v_extra->>'plato_id')::integer;
        v_extra_quantity := COALESCE((v_extra->>'quantity')::integer, 1);

        IF v_extra_quantity < 1 OR v_extra_quantity > 50 THEN
          RAISE EXCEPTION 'INVALID_QUANTITY';
        END IF;

        SELECT p.id, COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre) AS item_name, p.precio
        INTO v_extra_row
        FROM public.menu_items mi
        JOIN public.platos p ON p.id = mi.plato_id AND p.tenant_id = mi.tenant_id
        WHERE mi.menu_id = v_link.menu_id
          AND p.id = v_extra_plato_id
          AND p.disponible IS TRUE
          AND p.is_extra IS TRUE
          AND v_isodow = ANY(mi.weekdays)
          AND (p.sucursal_id IS NULL OR p.sucursal_id = v_link.sucursal_id);

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ITEM_NOT_AVAILABLE';
        END IF;

        IF EXISTS (
          SELECT 1 FROM public.plato_sold_out
          WHERE tenant_id = v_link.tenant_id AND plato_id = v_extra_plato_id AND sold_out_date = v_today
        ) THEN
          RAISE EXCEPTION 'ITEM_SOLD_OUT';
        END IF;

        v_extra_subtotal := v_extra_row.precio * v_extra_quantity;
        v_order_total := v_order_total + v_extra_subtotal;

        INSERT INTO public.digital_order_items (
          tenant_id,
          order_id,
          plato_id,
          name_snapshot,
          price_snapshot,
          quantity,
          notes,
          subtotal,
          status,
          parent_item_id
        )
        VALUES (
          v_link.tenant_id,
          v_order_id,
          v_extra_row.id,
          v_extra_row.item_name,
          v_extra_row.precio,
          v_extra_quantity,
          NULL,
          v_extra_subtotal,
          'active',
          v_parent_item_id
        );
      END LOOP;
    END IF;
  END LOOP;

  -- 10. Credit limit check for company orders on corporativo plan
  IF v_link.link_type = 'company' AND v_plan = 'corporativo' AND v_link.customer_id IS NOT NULL THEN
    SELECT credit_limit INTO v_credit_limit
    FROM public.customers
    WHERE id = v_link.customer_id AND tenant_id = v_link.tenant_id
    FOR UPDATE;

    IF v_credit_limit IS NOT NULL THEN
      -- Digital order total is still 0 at this point in the DB, so company_credit_used counts prior debt + other pending orders
      IF (public.company_credit_used_internal(v_link.tenant_id, v_link.customer_id) + v_order_total) > v_credit_limit THEN
        RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED';
      END IF;
    END IF;
  END IF;

  -- 11. Finalize total
  UPDATE public.digital_orders
  SET total = v_order_total
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id',      v_order_id,
    'numero_pedido', v_numero_pedido,
    'total',         v_order_total
  );
END;
$$;

-- 8. Grants and Revokes
REVOKE EXECUTE ON FUNCTION public.company_credit_used_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.company_credit_used(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_credit_used(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.menu_link_normalize_cedula(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.menu_link_normalize_cedula(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.menu_link_normalize_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.menu_link_normalize_name(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_menu_link_employees_tenant_integrity() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_menu_by_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_by_link(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_order_by_link(text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_by_link(text, text, text, jsonb, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
