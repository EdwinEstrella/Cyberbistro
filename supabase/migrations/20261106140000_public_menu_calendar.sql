-- ==============================================================================
-- Migration: Public Digital Menu Per-Day Calendar
-- Part of Feature: unified-digital-menu (Task U1)
-- ==============================================================================

-- 1. Add menu_id column to digital_menu_settings
ALTER TABLE public.digital_menu_settings
  ADD COLUMN IF NOT EXISTS menu_id uuid NULL REFERENCES public.menus(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS digital_menu_settings_menu_id_idx
  ON public.digital_menu_settings (menu_id);

-- 2. Enforce same-tenant integrity on digital_menu_settings.menu_id
CREATE OR REPLACE FUNCTION public.check_digital_menu_settings_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_menu_tenant_id uuid;
BEGIN
  IF NEW.menu_id IS NOT NULL THEN
    SELECT tenant_id INTO v_menu_tenant_id
    FROM public.menus
    WHERE id = NEW.menu_id;

    IF v_menu_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'TENANT_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_digital_menu_settings_tenant_integrity ON public.digital_menu_settings;
CREATE TRIGGER trg_digital_menu_settings_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.digital_menu_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_digital_menu_settings_tenant_integrity();

REVOKE ALL ON FUNCTION public.check_digital_menu_settings_tenant_integrity() FROM PUBLIC, anon, authenticated;

-- 3. Shared internal helper: today's plato ids of a menu
CREATE OR REPLACE FUNCTION public.get_menu_today_plato_ids(
  p_menu_id     uuid,
  p_tenant_id   uuid,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE(plato_id integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_menu   public.menus%ROWTYPE;
  v_today  date;
  v_isodow smallint;
BEGIN
  IF p_menu_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_menu
  FROM public.menus
  WHERE id = p_menu_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_today  := public.menu_business_today(p_tenant_id);
  v_isodow := public.menu_business_isodow(p_tenant_id, v_today);

  -- Weekly menu outside its week -> empty
  IF v_menu.schedule_mode = 'weekly' AND (
    v_menu.week_start IS NULL
    OR v_today < v_menu.week_start
    OR v_today > (v_menu.week_start + 6)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id AS plato_id
  FROM public.menu_items mi
  JOIN public.platos p ON p.id = mi.plato_id AND p.tenant_id = mi.tenant_id
  WHERE mi.menu_id = p_menu_id
    AND mi.tenant_id = p_tenant_id
    AND p.tenant_id = p_tenant_id
    AND p.disponible IS TRUE
    AND COALESCE(p.is_extra, false) IS FALSE
    AND v_isodow = ANY(mi.weekdays)
    AND NOT EXISTS (
      SELECT 1 FROM public.plato_sold_out so
      WHERE so.tenant_id = p_tenant_id
        AND so.plato_id = p.id
        AND so.sold_out_date = v_today
    )
    AND (p_sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = p_sucursal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_menu_today_plato_ids(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4. Redefine get_public_digital_menu
CREATE OR REPLACE FUNCTION public.get_public_digital_menu(p_public_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings       public.digital_menu_settings%ROWTYPE;
  v_tenant         public.tenants%ROWTYPE;
  v_items          jsonb;
  v_cantidad_mesas integer;
  v_use_calendar   boolean;
  v_today          date;
  v_isodow         smallint;
BEGIN
  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE public_slug = lower(trim(p_public_slug))
    AND enabled IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('settings', NULL, 'items', '[]'::jsonb, 'cantidad_mesas', 0);
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = v_settings.tenant_id
    AND COALESCE(activa, true) IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('settings', NULL, 'items', '[]'::jsonb, 'cantidad_mesas', 0);
  END IF;

  v_use_calendar := (
    v_settings.menu_id IS NOT NULL
    AND lower(trim(COALESCE(v_tenant.plan, ''))) IN ('profesional', 'empresarial', 'corporativo')
  );

  IF v_use_calendar THEN
    v_today  := public.menu_business_today(v_settings.tenant_id);
    v_isodow := public.menu_business_isodow(v_settings.tenant_id, v_today);

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
    WHERE mi.menu_id = v_settings.menu_id
      AND v_isodow = ANY(mi.weekdays)
      AND p.id IN (
        SELECT plato_id
        FROM public.get_menu_today_plato_ids(v_settings.menu_id, v_settings.tenant_id, v_settings.sucursal_id)
      );
  ELSE
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',          COALESCE(dmi.id, gen_random_uuid()),
        'plato_id',    p.id,
        'name',        COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre),
        'description', NULLIF(trim(COALESCE(dmi.description, '')), ''),
        'image_url',   NULLIF(trim(COALESCE(dmi.image_url, '')), ''),
        'price',       p.precio,
        'category',    COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
        'sort_order',  COALESCE(dmi.sort_order, 0)
      )
      ORDER BY
        COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
        COALESCE(dmi.sort_order, 0),
        COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre)
    ), '[]'::jsonb)
    INTO v_items
    FROM public.platos p
    LEFT JOIN public.digital_menu_items dmi
      ON p.id = dmi.plato_id AND p.tenant_id = dmi.tenant_id
    WHERE p.tenant_id = v_settings.tenant_id
      AND p.disponible IS TRUE
      AND COALESCE(dmi.visible, true) IS TRUE
      AND (v_settings.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_settings.sucursal_id);
  END IF;

  -- Resolve table count: prefer sucursal-level when the menu is sucursal-scoped,
  -- fall back to tenant-level if the sucursal has 0 or null.
  IF v_settings.sucursal_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF((SELECT cantidad_mesas FROM public.sucursales
       WHERE id = v_settings.sucursal_id AND tenant_id = v_settings.tenant_id LIMIT 1), 0),
      COALESCE(v_tenant.cantidad_mesas, 0)
    ) INTO v_cantidad_mesas;
  ELSE
    v_cantidad_mesas := COALESCE(v_tenant.cantidad_mesas, 0);
  END IF;

  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'id',            v_settings.id,
      'tenant_id',     v_settings.tenant_id,
      'sucursal_id',   v_settings.sucursal_id,
      'public_slug',   v_settings.public_slug,
      'menu_id',       v_settings.menu_id,
      'title',         COALESCE(NULLIF(trim(v_settings.title), ''), v_tenant.nombre_negocio),
      'description',   NULLIF(trim(COALESCE(v_settings.description, '')), ''),
      'logo_url',      COALESCE(NULLIF(trim(v_settings.logo_url), ''), NULLIF(trim(COALESCE(v_tenant.logo_url, '')), '')),
      'banner_url',    NULLIF(trim(COALESCE(v_settings.banner_url, '')), ''),
      'business_name', v_tenant.nombre_negocio,
      'phone',         v_tenant.telefono,
      'address',       v_tenant.direccion,
      'currency',      COALESCE(v_tenant.moneda, 'DOP')
    ),
    'items',           v_items,
    'cantidad_mesas',  v_cantidad_mesas
  );
END;
$$;

-- 5. Redefine create_public_digital_order
CREATE OR REPLACE FUNCTION public.create_public_digital_order(
  p_public_slug       text,
  p_customer_name     text,
  p_customer_phone    text,
  p_notes             text,
  p_items             jsonb,
  p_order_type        text    DEFAULT 'takeout',   -- 'takeout' | 'in_store'
  p_mesa_numero       integer DEFAULT NULL,
  p_mesa_codigo       text    DEFAULT NULL,         -- 4-digit code for in_store
  p_client_session_id text    DEFAULT NULL          -- browser session token
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings         public.digital_menu_settings%ROWTYPE;
  v_tenant_active    boolean;
  v_tenant_mesas     integer;
  v_tenant_plan      text;
  v_use_calendar     boolean;
  v_order_id         uuid;
  v_total            numeric := 0;
  v_item             jsonb;
  v_plato_id         integer;
  v_quantity         integer;
  v_item_notes       text;
  v_row              record;
  v_subtotal         numeric;
  v_stored_code      text;
  v_active_orders    integer;
  v_numero_pedido    integer;
  v_today            date;
  v_isodow           smallint;
BEGIN
  -- ── Basic input validation ──────────────────────────────────────────────────
  IF length(trim(COALESCE(p_customer_name, ''))) < 2
     OR length(trim(COALESCE(p_customer_name, ''))) > 120 THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;

  IF length(trim(COALESCE(p_customer_phone, ''))) > 40 THEN
    RAISE EXCEPTION 'El teléfono es demasiado largo';
  END IF;

  IF length(trim(COALESCE(p_notes, ''))) > 500 THEN
    RAISE EXCEPTION 'La nota es demasiado larga';
  END IF;

  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'El pedido debe incluir al menos un producto';
  END IF;

  IF COALESCE(p_order_type, 'takeout') NOT IN ('takeout', 'in_store') THEN
    RAISE EXCEPTION 'Tipo de pedido inválido';
  END IF;

  -- ── Resolve menu settings ───────────────────────────────────────────────────
  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE public_slug = lower(trim(p_public_slug))
    AND enabled IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  SELECT COALESCE(t.activa, true), COALESCE(t.cantidad_mesas, 0), t.plan
  INTO v_tenant_active, v_tenant_mesas, v_tenant_plan
  FROM public.tenants t
  WHERE t.id = v_settings.tenant_id
  LIMIT 1;

  IF COALESCE(v_tenant_active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  v_use_calendar := (
    v_settings.menu_id IS NOT NULL
    AND lower(trim(COALESCE(v_tenant_plan, ''))) IN ('profesional', 'empresarial', 'corporativo')
  );

  IF v_use_calendar THEN
    v_today  := public.menu_business_today(v_settings.tenant_id);
    v_isodow := public.menu_business_isodow(v_settings.tenant_id, v_today);
  END IF;

  -- ── In-store: validate table number and code ─────────────────────────────
  IF p_order_type = 'in_store' THEN
    IF v_settings.sucursal_id IS NOT NULL THEN
      SELECT COALESCE(
        NULLIF((SELECT cantidad_mesas FROM public.sucursales
         WHERE id = v_settings.sucursal_id AND tenant_id = v_settings.tenant_id LIMIT 1), 0),
        COALESCE(v_tenant_mesas, 0)
      ) INTO v_tenant_mesas;
    END IF;

    IF p_mesa_numero IS NULL OR p_mesa_numero < 1 THEN
      RAISE EXCEPTION 'Debes seleccionar una mesa';
    END IF;

    IF p_mesa_numero > v_tenant_mesas THEN
      RAISE EXCEPTION 'Mesa inválida';
    END IF;

    IF length(trim(COALESCE(p_mesa_codigo, ''))) = 0 THEN
      RAISE EXCEPTION 'El código de mesa es obligatorio';
    END IF;

    SELECT me.codigo_seguridad INTO v_stored_code
    FROM public.mesas_estado me
    WHERE me.tenant_id   = v_settings.tenant_id
      AND me.sucursal_id = v_settings.sucursal_id
      AND me.id          = p_mesa_numero
    LIMIT 1;

    IF v_stored_code IS NULL THEN
      RAISE EXCEPTION 'El código de mesa no ha sido configurado. Pide asistencia al personal.';
    END IF;

    IF trim(p_mesa_codigo) <> v_stored_code THEN
      RAISE EXCEPTION 'Código de mesa incorrecto';
    END IF;

    IF p_client_session_id IS NOT NULL AND length(trim(p_client_session_id)) > 0 THEN
      SELECT COUNT(*) INTO v_active_orders
      FROM public.digital_orders
      WHERE tenant_id         = v_settings.tenant_id
        AND sucursal_id       = v_settings.sucursal_id
        AND client_session_id = trim(p_client_session_id)
        AND status = 'pending';

      IF v_active_orders > 0 THEN
        RAISE EXCEPTION 'Ya tenés un pedido activo. Pedí asistencia al personal para más pedidos.';
      END IF;
    END IF;
  END IF;

  -- ── Assign sequential order number (per tenant) ─────────────────────────
  INSERT INTO public.tenant_order_counters (tenant_id, next_numero)
  VALUES (v_settings.tenant_id, 2)
  ON CONFLICT (tenant_id) DO UPDATE
    SET next_numero = tenant_order_counters.next_numero + 1
  RETURNING next_numero - 1 INTO v_numero_pedido;

  -- ── Insert order ─────────────────────────────────────────────────────────
  INSERT INTO public.digital_orders (
    tenant_id, sucursal_id, customer_name, customer_phone, notes,
    status, total, order_type, mesa_numero, client_session_id, numero_pedido
  )
  VALUES (
    v_settings.tenant_id,
    v_settings.sucursal_id,
    trim(p_customer_name),
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    'pending',
    0,
    COALESCE(p_order_type, 'takeout'),
    CASE WHEN p_order_type = 'in_store' THEN p_mesa_numero ELSE NULL END,
    NULLIF(trim(COALESCE(p_client_session_id, '')), ''),
    v_numero_pedido
  )
  RETURNING id INTO v_order_id;

  -- ── Insert items ──────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_plato_id   := NULLIF(v_item->>'plato_id', '')::integer;
    v_quantity   := GREATEST(1, LEAST(99, COALESCE(NULLIF(v_item->>'quantity', '')::integer, 1)));
    v_item_notes := NULLIF(left(trim(COALESCE(v_item->>'notes', '')), 300), '');

    IF v_use_calendar THEN
      IF v_plato_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.get_menu_today_plato_ids(v_settings.menu_id, v_settings.tenant_id, v_settings.sucursal_id)
        WHERE plato_id = v_plato_id
      ) THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible';
      END IF;

      SELECT
        p.id,
        COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre) AS item_name,
        p.precio
      INTO v_row
      FROM public.platos p
      LEFT JOIN public.menu_items mi
        ON mi.plato_id = p.id AND mi.menu_id = v_settings.menu_id AND v_isodow = ANY(mi.weekdays)
      WHERE p.tenant_id = v_settings.tenant_id
        AND p.id = v_plato_id
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible';
      END IF;
    ELSE
      SELECT
        p.id,
        COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre) AS item_name,
        p.precio
      INTO v_row
      FROM public.platos p
      LEFT JOIN public.digital_menu_items dmi
        ON dmi.plato_id = p.id AND dmi.tenant_id = p.tenant_id
      WHERE p.tenant_id   = v_settings.tenant_id
        AND p.id          = v_plato_id
        AND p.disponible IS TRUE
        AND (dmi.id IS NULL OR dmi.visible IS TRUE)
        AND (v_settings.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_settings.sucursal_id)
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible';
      END IF;
    END IF;

    v_subtotal := v_row.precio * v_quantity;
    v_total    := v_total + v_subtotal;

    INSERT INTO public.digital_order_items (
      tenant_id, order_id, plato_id, name_snapshot, price_snapshot,
      quantity, notes, subtotal
    )
    VALUES (
      v_settings.tenant_id, v_order_id, v_row.id, v_row.item_name,
      v_row.precio, v_quantity, v_item_notes, v_subtotal
    );
  END LOOP;

  UPDATE public.digital_orders SET total = v_total WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id',      v_order_id,
    'total',         v_total,
    'status',        'pending',
    'numero_pedido', v_numero_pedido
  );
END;
$$;

-- 6. Public RPC Grants
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_digital_order(text, text, text, text, jsonb, text, integer, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
