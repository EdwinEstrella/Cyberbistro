-- ============================================================
-- Digital orders: table code validation, order type, mesa link,
-- sequential order number, and kitchen comanda/consumos on accept
-- ============================================================

-- 1. Add new columns to digital_orders
ALTER TABLE public.digital_orders
  ADD COLUMN IF NOT EXISTS order_type   text NOT NULL DEFAULT 'takeout'
                                         CHECK (order_type IN ('takeout', 'in_store')),
  ADD COLUMN IF NOT EXISTS mesa_numero  integer,
  ADD COLUMN IF NOT EXISTS numero_pedido integer,
  ADD COLUMN IF NOT EXISTS client_session_id text;

CREATE INDEX IF NOT EXISTS digital_orders_session_status_idx
  ON public.digital_orders (tenant_id, client_session_id, status)
  WHERE client_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS digital_orders_mesa_status_idx
  ON public.digital_orders (tenant_id, mesa_numero, status)
  WHERE mesa_numero IS NOT NULL;

-- 2. Add security code column to mesas_estado
ALTER TABLE public.mesas_estado
  ADD COLUMN IF NOT EXISTS codigo_seguridad text;

-- Index so validation lookups are fast (tenant + sucursal + id for branch isolation)
CREATE INDEX IF NOT EXISTS mesas_estado_tenant_sucursal_id_idx
  ON public.mesas_estado (tenant_id, sucursal_id, id);

-- 3. Per-tenant order number counter table
CREATE TABLE IF NOT EXISTS public.tenant_order_counters (
  tenant_id   uuid    NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  next_numero integer NOT NULL DEFAULT 1
);

-- Allow authenticated tenant users to read counter (for display), but mutations only via security-definer RPC.
ALTER TABLE public.tenant_order_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_order_counters_tenant_select ON public.tenant_order_counters;
CREATE POLICY cb_order_counters_tenant_select ON public.tenant_order_counters
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin','cajera','cajero','ventas','vender','vendedor']));

-- 4. RPC: generate_table_security_code
-- Creates or refreshes a random 4-digit code for a specific table number on a tenant+sucursal.
-- Called only by authenticated admin tooling — NOT callable by public/anon.
-- Auth check is enforced here so even direct RPC calls are blocked.
-- p_sucursal_id is required (non-null) to enforce branch isolation.
CREATE OR REPLACE FUNCTION public.generate_table_security_code(
  p_tenant_id   uuid,
  p_sucursal_id uuid,
  p_mesa_numero integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_code text;
BEGIN
  -- Require a concrete sucursal — never generate a tenant-global code.
  IF p_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'p_sucursal_id es obligatorio para generar códigos de mesa';
  END IF;

  -- Only tenant admins may generate/rotate table codes.
  IF NOT public.cyberbistro_has_tenant_role(p_tenant_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  -- 4-digit zero-padded random code: 0000-9999
  v_code := lpad(floor(random() * 10000)::text, 4, '0');

  -- Upsert scoped by (tenant_id, sucursal_id, id = mesa_numero).
  INSERT INTO public.mesas_estado (id, tenant_id, sucursal_id, codigo_seguridad)
  VALUES (p_mesa_numero, p_tenant_id, p_sucursal_id, v_code)
  ON CONFLICT (tenant_id, id) DO UPDATE
    SET codigo_seguridad = EXCLUDED.codigo_seguridad
    -- Only update if the row belongs to the same sucursal; refuse cross-branch overwrites.
    WHERE mesas_estado.sucursal_id = p_sucursal_id OR mesas_estado.sucursal_id IS NULL;

  -- Confirm the row was actually written for this sucursal (conflict without WHERE match = no-op).
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La mesa % pertenece a otra sucursal', p_mesa_numero;
  END IF;

  RETURN v_code;
END;
$$;

-- 5. RPC: get_table_security_codes (admin-only, for display/print)
-- Returns list of {mesa_numero, codigo_seguridad} for all configured tables in a sucursal.
-- p_sucursal_id is required to enforce branch isolation — never returns cross-branch codes.
-- Only callable by authenticated tenant admin.
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
    (SELECT cantidad_mesas FROM public.sucursales WHERE id = p_sucursal_id AND tenant_id = p_tenant_id LIMIT 1),
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

-- Restrict admin-only RPCs: revoke public execute, grant only to authenticated users.
-- generate_table_security_code is admin-only (enforced inside the function).
-- get_table_security_codes is admin-only (enforced inside the function).
REVOKE EXECUTE ON FUNCTION public.generate_table_security_code(uuid, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_table_security_codes(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_table_security_code(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_table_security_codes(uuid, uuid) TO authenticated;

-- Drop the old single-arg signature to avoid ambiguity.
DROP FUNCTION IF EXISTS public.get_table_security_codes(uuid);

-- 6. Update get_public_digital_menu to expose table count (not codes)
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
  -- fall back to tenant-level (for single-branch setups without a sucursales row).
  IF v_settings.sucursal_id IS NOT NULL THEN
    SELECT COALESCE(
      (SELECT cantidad_mesas FROM public.sucursales
       WHERE id = v_settings.sucursal_id AND tenant_id = v_settings.tenant_id LIMIT 1),
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
    -- Only expose the count, NOT the codes. Client builds 1..N list.
    -- Count is scoped to the menu's sucursal when one is set.
    'cantidad_mesas',  v_cantidad_mesas
  );
END;
$$;

-- 7. Update create_public_digital_order to handle order_type, mesa validation,
--    active-order prevention (per session), and sequential order number.
CREATE OR REPLACE FUNCTION public.create_public_digital_order(
  p_public_slug      text,
  p_customer_name    text,
  p_customer_phone   text,
  p_notes            text,
  p_items            jsonb,
  p_order_type       text    DEFAULT 'takeout',   -- 'takeout' | 'in_store'
  p_mesa_numero      integer DEFAULT NULL,
  p_mesa_codigo      text    DEFAULT NULL,         -- 4-digit code for in_store
  p_client_session_id text   DEFAULT NULL          -- browser session token
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

  SELECT COALESCE(t.activa, true), COALESCE(t.cantidad_mesas, 0)
  INTO v_tenant_active, v_tenant_mesas
  FROM public.tenants t
  WHERE t.id = v_settings.tenant_id
  LIMIT 1;

  IF COALESCE(v_tenant_active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  -- ── In-store: validate table number and code ─────────────────────────────
  IF p_order_type = 'in_store' THEN
    IF p_mesa_numero IS NULL OR p_mesa_numero < 1 THEN
      RAISE EXCEPTION 'Debes seleccionar una mesa';
    END IF;

    IF p_mesa_numero > v_tenant_mesas THEN
      RAISE EXCEPTION 'Mesa inválida';
    END IF;

    IF length(trim(COALESCE(p_mesa_codigo, ''))) = 0 THEN
      RAISE EXCEPTION 'El código de mesa es obligatorio';
    END IF;

    -- Fetch the stored code for this table, scoped to the menu's sucursal.
    -- Without sucursal_id isolation a customer at branch A could use branch B's code.
    SELECT me.codigo_seguridad INTO v_stored_code
    FROM public.mesas_estado me
    WHERE me.tenant_id   = v_settings.tenant_id
      AND me.sucursal_id = v_settings.sucursal_id
      AND me.id          = p_mesa_numero
    LIMIT 1;

    IF v_stored_code IS NULL THEN
      -- No code configured yet — reject; admin must generate codes first.
      RAISE EXCEPTION 'El código de mesa no ha sido configurado. Pide asistencia al personal.';
    END IF;

    IF trim(p_mesa_codigo) <> v_stored_code THEN
      RAISE EXCEPTION 'Código de mesa incorrecto';
    END IF;

    -- ── Prevent double-ordering while a pending order exists for this session ─
    -- Only block on 'pending' — once staff accepts, the same browser is no longer
    -- blocked (avoids permanent lock-out after payment/table release).
    -- Accepted in-store orders are visible to staff; new orders are fine once the
    -- previous one has been accepted.
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
    v_plato_id  := NULLIF(v_item->>'plato_id', '')::integer;
    v_quantity  := GREATEST(1, LEAST(99, COALESCE(NULLIF(v_item->>'quantity', '')::integer, 1)));
    v_item_notes := NULLIF(left(trim(COALESCE(v_item->>'notes', '')), 300), '');

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
    'order_id',     v_order_id,
    'total',        v_total,
    'status',       'pending',
    'numero_pedido', v_numero_pedido
  );
END;
$$;

-- 8. Re-grant public execute on the updated RPCs
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_digital_order(text, text, text, text, jsonb, text, integer, text, text) TO PUBLIC;

-- Drop the old signature (fewer args) to avoid ambiguity
DROP FUNCTION IF EXISTS public.create_public_digital_order(text, text, text, text, jsonb);

NOTIFY pgrst, 'reload schema';
