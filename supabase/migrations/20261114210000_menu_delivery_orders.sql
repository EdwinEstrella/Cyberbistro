-- Home delivery for public-menu takeout orders.
--
-- A takeout order is either 'pickup' (default, today's behavior) or 'delivery' (new): the customer shares their
-- location (GPS or a map pin) and/or a free-text reference point. Table orders and company-link orders never use it.
-- Validation lives in the RPC (not only in the UI): delivery needs a phone number and a location or reference.
--
-- NOTE ON OVERLOADS: adding defaulted parameters creates a new overload under CREATE OR REPLACE, so the previous
-- 10-argument signature is dropped explicitly; callers that send 10 or fewer arguments keep working through the defaults.

ALTER TABLE public.digital_orders
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS delivery_reference text;

ALTER TABLE public.digital_orders DROP CONSTRAINT IF EXISTS digital_orders_delivery_mode_check;
ALTER TABLE public.digital_orders ADD CONSTRAINT digital_orders_delivery_mode_check
  CHECK (delivery_mode IN ('pickup', 'delivery'));

ALTER TABLE public.digital_orders DROP CONSTRAINT IF EXISTS digital_orders_delivery_coords_check;
ALTER TABLE public.digital_orders ADD CONSTRAINT digital_orders_delivery_coords_check
  CHECK (
    (delivery_lat IS NULL AND delivery_lng IS NULL)
    OR (delivery_lat BETWEEN -90 AND 90 AND delivery_lng BETWEEN -180 AND 180)
  );

CREATE OR REPLACE FUNCTION public.create_public_digital_order(
  p_public_slug       text,
  p_customer_name     text,
  p_customer_phone    text,
  p_notes             text,
  p_items             jsonb,
  p_order_type        text    DEFAULT 'takeout',   -- 'takeout' | 'in_store'
  p_mesa_numero       integer DEFAULT NULL,
  p_mesa_codigo       text    DEFAULT NULL,         -- 4-digit code for in_store
  p_client_session_id text    DEFAULT NULL,         -- browser session token
  p_party_size        integer DEFAULT NULL,         -- number of diners (1..99)
  p_delivery_mode      text             DEFAULT 'pickup', -- 'pickup' | 'delivery' (delivery only for takeout)
  p_delivery_lat       double precision DEFAULT NULL,
  p_delivery_lng       double precision DEFAULT NULL,
  p_delivery_reference text             DEFAULT NULL      -- free-text reference point / address
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
  v_delivery_mode    text := lower(trim(COALESCE(p_delivery_mode, 'pickup')));
  v_delivery_ref     text := NULLIF(left(trim(COALESCE(p_delivery_reference, '')), 300), '');
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

  IF p_party_size IS NOT NULL THEN
    IF p_party_size < 1 OR p_party_size > 99 THEN
      RAISE EXCEPTION 'Cantidad de personas inválida';
    END IF;
  END IF;

  -- ── Delivery validation (home delivery exists only for public takeout orders) ──
  IF v_delivery_mode NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'Tipo de entrega inválido';
  END IF;

  IF v_delivery_mode = 'delivery' THEN
    IF COALESCE(p_order_type, 'takeout') <> 'takeout' THEN
      RAISE EXCEPTION 'La entrega a domicilio solo aplica a pedidos para llevar';
    END IF;

    IF length(trim(COALESCE(p_customer_phone, ''))) = 0 THEN
      RAISE EXCEPTION 'El teléfono es obligatorio para entregas a domicilio';
    END IF;

    IF length(trim(COALESCE(p_delivery_reference, ''))) > 300 THEN
      RAISE EXCEPTION 'La referencia de entrega es demasiado larga';
    END IF;

    IF (p_delivery_lat IS NULL) <> (p_delivery_lng IS NULL) THEN
      RAISE EXCEPTION 'Ubicación de entrega inválida';
    END IF;

    IF p_delivery_lat IS NOT NULL AND (
         p_delivery_lat NOT BETWEEN -90 AND 90
         OR p_delivery_lng NOT BETWEEN -180 AND 180
       ) THEN
      RAISE EXCEPTION 'Ubicación de entrega inválida';
    END IF;

    IF p_delivery_lat IS NULL AND v_delivery_ref IS NULL THEN
      RAISE EXCEPTION 'Indica tu ubicación o un punto de referencia para la entrega';
    END IF;
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
      AND me.sucursal_id IS NOT DISTINCT FROM v_settings.sucursal_id
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
        AND sucursal_id       IS NOT DISTINCT FROM v_settings.sucursal_id
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
    status, total, order_type, mesa_numero, client_session_id, numero_pedido,
    party_size, delivery_mode, delivery_lat, delivery_lng, delivery_reference
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
    v_numero_pedido,
    p_party_size,
    v_delivery_mode,
    CASE WHEN v_delivery_mode = 'delivery' THEN p_delivery_lat ELSE NULL END,
    CASE WHEN v_delivery_mode = 'delivery' THEN p_delivery_lng ELSE NULL END,
    CASE WHEN v_delivery_mode = 'delivery' THEN v_delivery_ref ELSE NULL END
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

DROP FUNCTION IF EXISTS public.create_public_digital_order(text, text, text, text, jsonb, text, integer, text, text, integer);

GRANT EXECUTE ON FUNCTION public.create_public_digital_order(
  text, text, text, text, jsonb, text, integer, text, text, integer, text, double precision, double precision, text
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
