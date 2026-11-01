-- ==============================================================================
-- Migration: Menus Closed Without Open Operational Cycle
-- Description: Ensures online menus (public slug & company links) reflect open/closed
-- cycle status and blocks order creation when no operational cycle is open.
-- ==============================================================================

-- 1. Helper function: Checks if an operational cycle is currently open
CREATE OR REPLACE FUNCTION public.restaurant_cycle_open(p_tenant uuid, p_sucursal uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_tenant IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cierres_operativos
    WHERE tenant_id = p_tenant
      AND closed_at IS NULL
      AND (
        sucursal_id = p_sucursal
        OR sucursal_id IS NULL
        OR p_sucursal IS NULL
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_cycle_open(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2. Status RPC: Returns { "open": boolean } only for a given slug or token
CREATE OR REPLACE FUNCTION public.get_online_menu_status(
  p_public_slug text DEFAULT NULL,
  p_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id   uuid;
  v_sucursal_id uuid;
BEGIN
  IF (p_public_slug IS NULL AND p_token IS NULL)
     OR (p_public_slug IS NOT NULL AND p_token IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of p_public_slug or p_token must be non-null';
  END IF;

  IF p_public_slug IS NOT NULL THEN
    SELECT tenant_id, sucursal_id
    INTO v_tenant_id, v_sucursal_id
    FROM public.digital_menu_settings
    WHERE public_slug = lower(trim(p_public_slug))
      AND enabled IS TRUE
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('open', false);
    END IF;
  ELSE
    SELECT tenant_id, sucursal_id
    INTO v_tenant_id, v_sucursal_id
    FROM public.menu_links
    WHERE token = trim(p_token)
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('open', false);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'open',
    COALESCE(public.restaurant_cycle_open(v_tenant_id, v_sucursal_id), false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_online_menu_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_online_menu_status(text, text) TO anon, authenticated;

-- 3. Trigger on digital_orders: Enforces open operational cycle before inserting orders
CREATE OR REPLACE FUNCTION public.check_digital_order_cycle_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.restaurant_cycle_open(NEW.tenant_id, NEW.sucursal_id) THEN
    RAISE EXCEPTION 'RESTAURANT_CLOSED';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_digital_order_cycle_open() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_check_digital_order_cycle_open ON public.digital_orders;
CREATE TRIGGER trg_check_digital_order_cycle_open
  BEFORE INSERT ON public.digital_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_digital_order_cycle_open();
