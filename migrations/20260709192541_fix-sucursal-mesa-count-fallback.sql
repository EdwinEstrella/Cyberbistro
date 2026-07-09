-- Update table count logic to gracefully fallback when sucursal has 0 tables
-- Fixes an issue where sucursales are created with 0 mesas by default but tenants had the actual mesa count configured

CREATE OR REPLACE FUNCTION public.get_public_digital_menu(p_public_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings public.digital_menu_settings%ROWTYPE;
  v_tenant   public.tenants%ROWTYPE;
  v_items    jsonb;
  v_cantidad_mesas integer;
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

CREATE OR REPLACE FUNCTION public.get_table_security_codes(p_tenant_id uuid, p_sucursal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cantidad integer;
  v_result jsonb;
BEGIN
  -- Require a concrete sucursal — never expose all-tenant codes at once.
  IF p_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'p_sucursal_id es obligatorio';
  END IF;

  -- Verify caller has admin role on this tenant
  IF NOT public.cyberbistro_has_tenant_role(p_tenant_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  -- Use the sucursal's own mesa count if available; fall back to tenant-level count.
  SELECT COALESCE(
    NULLIF((SELECT cantidad_mesas FROM public.sucursales WHERE id = p_sucursal_id AND tenant_id = p_tenant_id LIMIT 1), 0),
    (SELECT cantidad_mesas FROM public.tenants WHERE id = p_tenant_id LIMIT 1),
    0
  ) INTO v_cantidad;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'mesa_numero', gs.n,
      'codigo_seguridad', me.codigo_seguridad
    ) ORDER BY gs.n
  ), '[]'::jsonb)
  INTO v_result
  FROM generate_series(1, GREATEST(v_cantidad, 0)) AS gs(n)
  LEFT JOIN public.mesas_estado me
    ON me.tenant_id = p_tenant_id
   AND me.sucursal_id = p_sucursal_id
   AND me.id = gs.n;

  RETURN v_result;
END;
$$;
