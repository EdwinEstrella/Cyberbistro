-- Harden digital menu public access and expose safe public RPCs.

ALTER TABLE public.digital_menu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_order_items ENABLE ROW LEVEL SECURITY;

-- Remove broad public policies from the original digital menu migration.
DROP POLICY IF EXISTS cb_digital_menu_settings_public_select ON public.digital_menu_settings;
DROP POLICY IF EXISTS cb_digital_menu_items_public_select ON public.digital_menu_items;
DROP POLICY IF EXISTS cb_digital_orders_select ON public.digital_orders;
DROP POLICY IF EXISTS cb_digital_orders_public_insert ON public.digital_orders;
DROP POLICY IF EXISTS cb_digital_order_items_select ON public.digital_order_items;
DROP POLICY IF EXISTS cb_digital_order_items_public_insert ON public.digital_order_items;

-- Authenticated tenant operators may read/administer their own digital menu surface.
DROP POLICY IF EXISTS cb_digital_menu_settings_tenant_select ON public.digital_menu_settings;
CREATE POLICY cb_digital_menu_settings_tenant_select ON public.digital_menu_settings
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_digital_menu_items_tenant_select ON public.digital_menu_items;
CREATE POLICY cb_digital_menu_items_tenant_select ON public.digital_menu_items
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_digital_orders_tenant_select ON public.digital_orders;
CREATE POLICY cb_digital_orders_tenant_select ON public.digital_orders
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_digital_order_items_tenant_select ON public.digital_order_items;
CREATE POLICY cb_digital_order_items_tenant_select ON public.digital_order_items
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

CREATE INDEX IF NOT EXISTS digital_menu_items_visible_idx ON public.digital_menu_items (tenant_id, visible, sort_order);
CREATE INDEX IF NOT EXISTS digital_orders_created_idx ON public.digital_orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS digital_orders_sucursal_status_idx ON public.digital_orders (tenant_id, sucursal_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_public_digital_menu(p_public_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings public.digital_menu_settings%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_items jsonb;
BEGIN
  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE public_slug = lower(trim(p_public_slug))
    AND enabled IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('settings', NULL, 'items', '[]'::jsonb);
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = v_settings.tenant_id
    AND COALESCE(activa, true) IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('settings', NULL, 'items', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', dmi.id,
      'plato_id', p.id,
      'name', COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre),
      'description', NULLIF(trim(COALESCE(dmi.description, '')), ''),
      'image_url', NULLIF(trim(COALESCE(dmi.image_url, '')), ''),
      'price', p.precio,
      'category', COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
      'sort_order', dmi.sort_order
    )
    ORDER BY COALESCE(NULLIF(trim(p.categoria), ''), 'General'), dmi.sort_order, COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre)
  ), '[]'::jsonb)
  INTO v_items
  FROM public.digital_menu_items dmi
  JOIN public.platos p ON p.id = dmi.plato_id AND p.tenant_id = dmi.tenant_id
  WHERE dmi.tenant_id = v_settings.tenant_id
    AND dmi.visible IS TRUE
    AND p.disponible IS TRUE
    AND (v_settings.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_settings.sucursal_id);

  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'id', v_settings.id,
      'tenant_id', v_settings.tenant_id,
      'sucursal_id', v_settings.sucursal_id,
      'public_slug', v_settings.public_slug,
      'title', COALESCE(NULLIF(trim(v_settings.title), ''), v_tenant.nombre_negocio),
      'description', NULLIF(trim(COALESCE(v_settings.description, '')), ''),
      'logo_url', COALESCE(NULLIF(trim(v_settings.logo_url), ''), NULLIF(trim(COALESCE(v_tenant.logo_url, '')), '')),
      'banner_url', NULLIF(trim(COALESCE(v_settings.banner_url, '')), ''),
      'business_name', v_tenant.nombre_negocio,
      'phone', v_tenant.telefono,
      'address', v_tenant.direccion,
      'currency', COALESCE(v_tenant.moneda, 'DOP')
    ),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_public_digital_order(
  p_public_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings public.digital_menu_settings%ROWTYPE;
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_plato_id integer;
  v_quantity integer;
  v_notes text;
  v_row record;
  v_subtotal numeric;
BEGIN
  IF length(trim(COALESCE(p_customer_name, ''))) < 2 THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe incluir al menos un producto';
  END IF;

  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE public_slug = lower(trim(p_public_slug))
    AND enabled IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  INSERT INTO public.digital_orders (tenant_id, sucursal_id, customer_name, customer_phone, notes, status, total)
  VALUES (
    v_settings.tenant_id,
    v_settings.sucursal_id,
    trim(p_customer_name),
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    'pending',
    0
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_plato_id := NULLIF(v_item->>'plato_id', '')::integer;
    v_quantity := GREATEST(1, LEAST(99, COALESCE(NULLIF(v_item->>'quantity', '')::integer, 1)));
    v_notes := NULLIF(trim(COALESCE(v_item->>'notes', '')), '');

    SELECT p.id, COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre) AS item_name, p.precio
    INTO v_row
    FROM public.digital_menu_items dmi
    JOIN public.platos p ON p.id = dmi.plato_id AND p.tenant_id = dmi.tenant_id
    WHERE dmi.tenant_id = v_settings.tenant_id
      AND dmi.plato_id = v_plato_id
      AND dmi.visible IS TRUE
      AND p.disponible IS TRUE
      AND (v_settings.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_settings.sucursal_id)
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uno de los productos ya no está disponible';
    END IF;

    v_subtotal := v_row.precio * v_quantity;
    v_total := v_total + v_subtotal;

    INSERT INTO public.digital_order_items (tenant_id, order_id, plato_id, name_snapshot, price_snapshot, quantity, notes, subtotal)
    VALUES (v_settings.tenant_id, v_order_id, v_row.id, v_row.item_name, v_row.precio, v_quantity, v_notes, v_subtotal);
  END LOOP;

  UPDATE public.digital_orders
  SET total = v_total
  WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_total, 'status', 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_digital_order(text, text, text, text, jsonb) TO PUBLIC;

NOTIFY pgrst, 'reload schema';
