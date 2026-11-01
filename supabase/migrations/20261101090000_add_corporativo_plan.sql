-- ============================================================
-- Migration: Add 'corporativo' Plan Foundation
-- Part of Feature: corporativo-plan (Task T1)
-- ============================================================

-- 1. Default sucursal limit helper
CREATE OR REPLACE FUNCTION public.cyberbistro_default_sucursal_limit(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_plan, 'basico')))
    WHEN 'basico' THEN 1
    WHEN 'profesional' THEN 3
    WHEN 'empresarial' THEN NULL::integer
    WHEN 'corporativo' THEN NULL::integer
    ELSE 1
  END;
$$;

-- 2. Ensure sucursal limit columns and update CHECK constraint on tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS sucursal_limit_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sucursal_limit integer NULL;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_plan_allowed;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_plan_allowed
  CHECK (plan IN ('basico', 'profesional', 'empresarial', 'corporativo'));

-- 3. Recreate normalize_tenant_plan_limits trigger function
CREATE OR REPLACE FUNCTION public.normalize_tenant_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_default integer;
BEGIN
  NEW.plan := lower(trim(COALESCE(NEW.plan, 'basico')));

  IF NEW.plan NOT IN ('basico', 'profesional', 'empresarial', 'corporativo') THEN
    RAISE EXCEPTION 'plan inválido: %', NEW.plan;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sucursal_limit IS NULL THEN
      NEW.sucursal_limit := public.cyberbistro_default_sucursal_limit(NEW.plan);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    v_previous_default := public.cyberbistro_default_sucursal_limit(OLD.plan);

    IF NEW.sucursal_limit IS NULL OR NEW.sucursal_limit IS NOT DISTINCT FROM v_previous_default THEN
      NEW.sucursal_limit := public.cyberbistro_default_sucursal_limit(NEW.plan);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_tenant_plan_limits_trg ON public.tenants;

CREATE TRIGGER normalize_tenant_plan_limits_trg
  BEFORE INSERT OR UPDATE OF plan
  ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_tenant_plan_limits();

-- 4. Recreate cyberbistro_register_tenant
CREATE OR REPLACE FUNCTION public.cyberbistro_register_tenant(
  p_auth_user_id uuid,
  p_email text,
  p_nombre_negocio text,
  p_rnc text DEFAULT NULL,
  p_direccion text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_plan text DEFAULT 'basico'
)
RETURNS TABLE (
  tenant_id uuid,
  email text,
  rol text,
  nombre text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_claim_auth_user_id uuid := public.cyberbistro_auth_user_id();
  v_claim_email text := public.cyberbistro_auth_email();
  v_tenant_id uuid;
  v_plan text := lower(trim(COALESCE(p_plan, 'basico')));
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_id requerido';
  END IF;

  IF NULLIF(trim(p_email), '') IS NULL THEN
    RAISE EXCEPTION 'email requerido';
  END IF;

  IF NULLIF(trim(p_nombre_negocio), '') IS NULL THEN
    RAISE EXCEPTION 'nombre del negocio requerido';
  END IF;

  IF v_plan NOT IN ('basico', 'profesional', 'empresarial', 'corporativo') THEN
    RAISE EXCEPTION 'plan inválido: %', p_plan;
  END IF;

  IF v_claim_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'sesión autenticada requerida para registrar tenant';
  END IF;

  IF v_claim_auth_user_id <> p_auth_user_id THEN
    RAISE EXCEPTION 'el usuario autenticado no coincide con el registro solicitado';
  END IF;

  IF v_claim_email IS NOT NULL AND lower(v_claim_email) <> lower(trim(p_email)) THEN
    RAISE EXCEPTION 'el correo autenticado no coincide con el registro solicitado';
  END IF;

  INSERT INTO public.tenants (
    nombre_negocio,
    rnc,
    direccion,
    telefono,
    activa,
    plan,
    sucursal_limit_enabled,
    sucursal_limit
  )
  VALUES (
    trim(p_nombre_negocio),
    NULLIF(trim(COALESCE(p_rnc, '')), ''),
    NULLIF(trim(COALESCE(p_direccion, '')), ''),
    NULLIF(trim(COALESCE(p_telefono, '')), ''),
    true,
    v_plan,
    true,
    public.cyberbistro_default_sucursal_limit(v_plan)
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.sucursales (
    tenant_id,
    nombre,
    direccion,
    telefono,
    activa
  )
  VALUES (
    v_tenant_id,
    'Sucursal Central',
    NULLIF(trim(COALESCE(p_direccion, '')), ''),
    NULLIF(trim(COALESCE(p_telefono, '')), ''),
    true
  );

  INSERT INTO public.tenant_users (
    auth_user_id,
    tenant_id,
    email,
    password_hash,
    rol,
    nombre,
    activo
  )
  VALUES (
    p_auth_user_id,
    v_tenant_id,
    trim(p_email),
    'MANAGED_BY_AUTH',
    'admin',
    trim(p_nombre_negocio),
    true
  );

  RETURN QUERY
  SELECT
    v_tenant_id,
    trim(p_email),
    'admin'::text,
    trim(p_nombre_negocio);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text) TO PUBLIC;

-- 5. Recreate menu_link_menu_available
CREATE OR REPLACE FUNCTION public.menu_link_menu_available(p_link_id uuid, p_today date DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.menu_links%ROWTYPE;
  v_menu public.menus%ROWTYPE;
  v_plan text;
  v_today date;
BEGIN
  SELECT * INTO v_link FROM public.menu_links WHERE id = p_link_id;
  IF NOT FOUND OR NOT v_link.enabled THEN
    RETURN false;
  END IF;

  v_today := COALESCE(p_today, public.menu_business_today(v_link.tenant_id));

  SELECT plan INTO v_plan FROM public.tenants WHERE id = v_link.tenant_id;
  IF lower(trim(COALESCE(v_plan, ''))) NOT IN ('empresarial', 'corporativo') THEN
    RETURN false;
  END IF;

  SELECT * INTO v_menu FROM public.menus WHERE id = v_link.menu_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_menu.schedule_mode = 'weekly' THEN
    IF v_menu.week_start IS NULL OR v_today < v_menu.week_start OR v_today > (v_menu.week_start + 6) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- 6. Recreate get_menu_by_link
CREATE OR REPLACE FUNCTION public.get_menu_by_link(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

  v_today := public.menu_business_today(v_link.tenant_id);
  v_isodow := public.menu_business_isodow(v_link.tenant_id, v_today);

  IF NOT v_link.enabled THEN
    v_available := false;
    v_reason := 'LINK_DISABLED';
  ELSIF lower(trim(COALESCE(v_tenant.plan, ''))) NOT IN ('empresarial', 'corporativo') THEN
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

  IF v_link.link_type = 'company' AND v_link.customer_id IS NOT NULL THEN
    SELECT name INTO v_company_name
    FROM public.customers
    WHERE id = v_link.customer_id;
  END IF;

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
    'available',    v_available,
    'reason',       v_reason,
    'label',        v_link.label,
    'link_type',    v_link.link_type,
    'allow_extras', v_link.allow_extras,
    'company_name', v_company_name,
    'restaurant',   v_restaurant,
    'settings',     v_restaurant,
    'items',        v_items,
    'extras',       v_extras
  );
END;
$$;

-- 7. Recreate create_order_by_link
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
SET search_path = public
AS $$
DECLARE
  v_link            public.menu_links%ROWTYPE;
  v_menu            public.menus%ROWTYPE;
  v_tenant          public.tenants%ROWTYPE;
  v_today           date;
  v_isodow          smallint;
  v_order_id        uuid;
  v_parent_item_id  uuid;
  v_numero_pedido   integer;
  v_order_total     numeric := 0;
  v_item            jsonb;
  v_plato_id        integer;
  v_quantity        integer;
  v_item_notes      text;
  v_main_row        record;
  v_subtotal        numeric;
  v_extra           jsonb;
  v_extra_plato_id  integer;
  v_extra_quantity  integer;
  v_extra_row       record;
  v_extra_subtotal  numeric;
  v_trimmed_emp     text;
  v_pending_count   integer;
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

  IF lower(trim(COALESCE(v_tenant.plan, ''))) NOT IN ('empresarial', 'corporativo') THEN
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

  -- 4. Validate employee name
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

  -- 8. Create digital order
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

    -- Validate main dish: must be in menu, scheduled today, not is_extra, not sold out
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

    -- Process extras attached to this dish line
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
REVOKE EXECUTE ON FUNCTION public.menu_link_menu_available(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_menu_by_link(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_by_link(text, text, text, jsonb, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.menu_link_menu_available(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_by_link(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_by_link(text, text, text, jsonb, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.menu_link_menu_available(uuid, date) FROM anon;

NOTIFY pgrst, 'reload schema';
