-- Keep public digital order validation aligned with the public menu visibility rules.
-- A dish is orderable when it is available and either:
-- - it has no digital_menu_items override, or
-- - it has a digital_menu_items override with visible = true.

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
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_settings public.digital_menu_settings%ROWTYPE;
  v_tenant_active boolean;
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_plato_id integer;
  v_quantity integer;
  v_notes text;
  v_row record;
  v_subtotal numeric;
BEGIN
  IF length(trim(COALESCE(p_customer_name, ''))) < 2 OR length(trim(COALESCE(p_customer_name, ''))) > 120 THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;

  IF length(trim(COALESCE(p_customer_phone, ''))) > 40 THEN
    RAISE EXCEPTION 'El teléfono es demasiado largo';
  END IF;

  IF length(trim(COALESCE(p_notes, ''))) > 500 THEN
    RAISE EXCEPTION 'La nota es demasiado larga';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
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

  SELECT COALESCE(t.activa, true) INTO v_tenant_active
  FROM public.tenants t
  WHERE t.id = v_settings.tenant_id
  LIMIT 1;

  IF COALESCE(v_tenant_active, false) IS NOT TRUE THEN
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
    v_notes := NULLIF(left(trim(COALESCE(v_item->>'notes', '')), 300), '');

    SELECT
      p.id,
      COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre) AS item_name,
      p.precio
    INTO v_row
    FROM public.platos p
    LEFT JOIN public.digital_menu_items dmi
      ON dmi.plato_id = p.id
      AND dmi.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_settings.tenant_id
      AND p.id = v_plato_id
      AND p.disponible IS TRUE
      AND (dmi.id IS NULL OR dmi.visible IS TRUE)
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
$function$;
