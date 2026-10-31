-- ============================================================
-- Migration: Corporate Menu Links, Custom Menus, Extras, and Statements
-- Part of Feature: corporate-menu-links (Task T1)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Alter platos: is_extra flag for add-on dishes
ALTER TABLE public.platos
  ADD COLUMN IF NOT EXISTS is_extra boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS platos_tenant_is_extra_idx
  ON public.platos (tenant_id, is_extra)
  WHERE disponible IS TRUE;

-- 2. Menus table: named set of dishes with recurring or weekly schedule
CREATE TABLE IF NOT EXISTS public.menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  name text NOT NULL,
  schedule_mode text NOT NULL DEFAULT 'recurring' CHECK (schedule_mode IN ('recurring', 'weekly')),
  week_start date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menus_weekly_schedule_check CHECK (
    schedule_mode <> 'weekly' OR (week_start IS NOT NULL AND EXTRACT(isodow FROM week_start) = 1)
  )
);

CREATE INDEX IF NOT EXISTS menus_tenant_sucursal_idx
  ON public.menus (tenant_id, sucursal_id);

-- 3. Menu items table: mapping dishes to menus and weekdays
CREATE TABLE IF NOT EXISTS public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_id uuid NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  plato_id integer NOT NULL REFERENCES public.platos(id) ON DELETE CASCADE,
  weekdays smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  sort_order integer NOT NULL DEFAULT 0,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_items_weekdays_check CHECK (
    cardinality(weekdays) > 0 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  ),
  CONSTRAINT menu_items_menu_plato_unique UNIQUE (menu_id, plato_id)
);

CREATE INDEX IF NOT EXISTS menu_items_menu_sort_idx
  ON public.menu_items (menu_id, sort_order);

CREATE INDEX IF NOT EXISTS menu_items_plato_idx
  ON public.menu_items (tenant_id, plato_id);

-- 4. Menu links table: public or company-scoped access tokens
CREATE TABLE IF NOT EXISTS public.menu_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  menu_id uuid NOT NULL REFERENCES public.menus(id) ON DELETE RESTRICT,
  label text NOT NULL,
  link_type text NOT NULL CHECK (link_type IN ('public', 'company')),
  token text NOT NULL UNIQUE DEFAULT translate(replace(encode(gen_random_bytes(16), 'base64'), '=', ''), '+/', '-_'),
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  allow_extras boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_links_company_customer_check CHECK (
    link_type <> 'company' OR customer_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS menu_links_tenant_idx
  ON public.menu_links (tenant_id, enabled);

DROP INDEX IF EXISTS public.menu_links_token_idx;

-- 5. Plato sold out table: day-specific sold out dishes
CREATE TABLE IF NOT EXISTS public.plato_sold_out (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plato_id integer NOT NULL REFERENCES public.platos(id) ON DELETE CASCADE,
  sold_out_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, plato_id, sold_out_date)
);

CREATE INDEX IF NOT EXISTS plato_sold_out_tenant_date_idx
  ON public.plato_sold_out (tenant_id, sold_out_date);

-- 5b. Cross-tenant integrity and updated_at triggers
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_public_menus_updated_at ON public.menus;
CREATE TRIGGER set_public_menus_updated_at
  BEFORE UPDATE ON public.menus
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_public_menu_items_updated_at ON public.menu_items;
CREATE TRIGGER set_public_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_public_menu_links_updated_at ON public.menu_links;
CREATE TRIGGER set_public_menu_links_updated_at
  BEFORE UPDATE ON public.menu_links
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Cross-tenant trigger: menu_items
CREATE OR REPLACE FUNCTION public.check_menu_items_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_menu_tenant_id uuid;
  v_plato_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_menu_tenant_id
  FROM public.menus
  WHERE id = NEW.menu_id;

  SELECT tenant_id INTO v_plato_tenant_id
  FROM public.platos
  WHERE id = NEW.plato_id;

  IF v_menu_tenant_id IS DISTINCT FROM NEW.tenant_id OR v_plato_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_items_tenant_integrity ON public.menu_items;
CREATE TRIGGER trg_menu_items_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.check_menu_items_tenant_integrity();

-- Cross-tenant trigger: menu_links
CREATE OR REPLACE FUNCTION public.check_menu_links_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_menu_tenant_id uuid;
  v_customer_tenant_id uuid;
  v_customer_deleted_at timestamptz;
BEGIN
  SELECT tenant_id INTO v_menu_tenant_id
  FROM public.menus
  WHERE id = NEW.menu_id;

  IF v_menu_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    SELECT tenant_id, deleted_at INTO v_customer_tenant_id, v_customer_deleted_at
    FROM public.customers
    WHERE id = NEW.customer_id;

    IF v_customer_tenant_id IS DISTINCT FROM NEW.tenant_id OR v_customer_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'TENANT_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_links_tenant_integrity ON public.menu_links;
CREATE TRIGGER trg_menu_links_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.menu_links
  FOR EACH ROW
  EXECUTE FUNCTION public.check_menu_links_tenant_integrity();

-- Cross-tenant trigger: plato_sold_out
CREATE OR REPLACE FUNCTION public.check_plato_sold_out_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plato_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_plato_tenant_id
  FROM public.platos
  WHERE id = NEW.plato_id;

  IF v_plato_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plato_sold_out_tenant_integrity ON public.plato_sold_out;
CREATE TRIGGER trg_plato_sold_out_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.plato_sold_out
  FOR EACH ROW
  EXECUTE FUNCTION public.check_plato_sold_out_tenant_integrity();

-- 6. Alter digital_orders: link to menu_link, employee name, and extend order_type check
ALTER TABLE public.digital_orders
  ADD COLUMN IF NOT EXISTS menu_link_id uuid REFERENCES public.menu_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_name text;

CREATE INDEX IF NOT EXISTS digital_orders_menu_link_created_idx
  ON public.digital_orders (menu_link_id, created_at DESC)
  WHERE menu_link_id IS NOT NULL;

ALTER TABLE public.digital_orders DROP CONSTRAINT IF EXISTS digital_orders_order_type_check;
ALTER TABLE public.digital_orders ADD CONSTRAINT digital_orders_order_type_check
  CHECK (order_type IN ('takeout', 'in_store', 'company'));

-- 7. Alter digital_order_items: parent item for extras, status, and plato_id
ALTER TABLE public.digital_order_items
  ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES public.digital_order_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  ADD COLUMN IF NOT EXISTS plato_id integer REFERENCES public.platos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS digital_order_items_parent_idx
  ON public.digital_order_items (parent_item_id)
  WHERE parent_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS digital_order_items_order_status_idx
  ON public.digital_order_items (order_id, status);

-- 8. Alter cuentas_cobrar: digital_order_id link and voided (anulada) status
ALTER TABLE public.cuentas_cobrar
  ADD COLUMN IF NOT EXISTS digital_order_id uuid UNIQUE REFERENCES public.digital_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cuentas_cobrar_digital_order_idx
  ON public.cuentas_cobrar (digital_order_id)
  WHERE digital_order_id IS NOT NULL;

ALTER TABLE public.cuentas_cobrar DROP CONSTRAINT IF EXISTS cuentas_cobrar_estado_check;
ALTER TABLE public.cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_estado_check
  CHECK (estado::text = ANY (ARRAY['pendiente', 'parcial', 'pagada', 'anulada']::text[]));

-- 9. Row Level Security on new tables
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plato_sold_out ENABLE ROW LEVEL SECURITY;

-- MENUS policies
DROP POLICY IF EXISTS cb_menus_tenant_select ON public.menus;
CREATE POLICY cb_menus_tenant_select ON public.menus
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'cocina', 'cocinero', 'contabilidad']));

DROP POLICY IF EXISTS cb_menus_tenant_insert ON public.menus;
CREATE POLICY cb_menus_tenant_insert ON public.menus
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_menus_tenant_update ON public.menus;
CREATE POLICY cb_menus_tenant_update ON public.menus
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_menus_admin_delete ON public.menus;
CREATE POLICY cb_menus_admin_delete ON public.menus
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

-- MENU_ITEMS policies
DROP POLICY IF EXISTS cb_menu_items_tenant_select ON public.menu_items;
CREATE POLICY cb_menu_items_tenant_select ON public.menu_items
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'cocina', 'cocinero', 'contabilidad']));

DROP POLICY IF EXISTS cb_menu_items_tenant_insert ON public.menu_items;
CREATE POLICY cb_menu_items_tenant_insert ON public.menu_items
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_menu_items_tenant_update ON public.menu_items;
CREATE POLICY cb_menu_items_tenant_update ON public.menu_items
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_menu_items_admin_delete ON public.menu_items;
CREATE POLICY cb_menu_items_admin_delete ON public.menu_items
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

-- MENU_LINKS policies
DROP POLICY IF EXISTS cb_menu_links_tenant_select ON public.menu_links;
CREATE POLICY cb_menu_links_tenant_select ON public.menu_links
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'cocina', 'cocinero', 'contabilidad']));

DROP POLICY IF EXISTS cb_menu_links_tenant_insert ON public.menu_links;
CREATE POLICY cb_menu_links_tenant_insert ON public.menu_links
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_menu_links_tenant_update ON public.menu_links;
CREATE POLICY cb_menu_links_tenant_update ON public.menu_links
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_menu_links_admin_delete ON public.menu_links;
CREATE POLICY cb_menu_links_admin_delete ON public.menu_links
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

-- PLATO_SOLD_OUT policies
DROP POLICY IF EXISTS cb_plato_sold_out_tenant_select ON public.plato_sold_out;
CREATE POLICY cb_plato_sold_out_tenant_select ON public.plato_sold_out
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'cocina', 'cocinero', 'contabilidad']));

DROP POLICY IF EXISTS cb_plato_sold_out_tenant_insert ON public.plato_sold_out;
CREATE POLICY cb_plato_sold_out_tenant_insert ON public.plato_sold_out
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'cocina', 'cocinero']));

DROP POLICY IF EXISTS cb_plato_sold_out_tenant_delete ON public.plato_sold_out;
CREATE POLICY cb_plato_sold_out_tenant_delete ON public.plato_sold_out
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'cocina', 'cocinero']));

-- 10. Business timezone helpers
CREATE OR REPLACE FUNCTION public.menu_business_today(p_tenant_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (now() AT TIME ZONE 'America/Santo_Domingo')::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.menu_business_date(p_ts timestamptz)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (p_ts AT TIME ZONE 'America/Santo_Domingo')::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.menu_business_isodow(p_tenant_id uuid, p_date date DEFAULT NULL)
RETURNS smallint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXTRACT(isodow FROM COALESCE(p_date, public.menu_business_today(p_tenant_id)))::smallint;
END;
$$;

-- Availability helper
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
  IF lower(trim(COALESCE(v_plan, ''))) <> 'empresarial' THEN
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

-- 11. RPC 1: get_menu_by_link
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
  ELSIF lower(trim(COALESCE(v_tenant.plan, ''))) <> 'empresarial' THEN
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
    AND (v_link.sucursal_id IS NULL OR sucursal_id IS NULL OR sucursal_id = v_link.sucursal_id)
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
      AND (v_link.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_link.sucursal_id);

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
        AND (v_link.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_link.sucursal_id);
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

-- 12. RPC 2: create_order_by_link
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

  IF lower(trim(COALESCE(v_tenant.plan, ''))) <> 'empresarial' THEN
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
      AND (v_link.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_link.sucursal_id);

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
          AND (v_link.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_link.sucursal_id);

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

-- 13. RPC 3: accept_company_digital_order
CREATE OR REPLACE FUNCTION public.accept_company_digital_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order         public.digital_orders%ROWTYPE;
  v_link          public.menu_links%ROWTYPE;
  v_active_total  numeric;
  v_cxc_id        uuid;
BEGIN
  -- 1. Lock order
  SELECT * INTO v_order
  FROM public.digital_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- 2. Tenant authorization
  IF NOT public.cyberbistro_has_tenant_role(v_order.tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- 3. Atomic claim pending -> accepted
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'ORDER_NOT_PENDING';
  END IF;

  -- 4. Require company link
  IF v_order.menu_link_id IS NULL THEN
    RAISE EXCEPTION 'NOT_A_COMPANY_ORDER';
  END IF;

  SELECT * INTO v_link
  FROM public.menu_links
  WHERE id = v_order.menu_link_id;

  IF NOT FOUND OR v_link.link_type <> 'company' OR v_link.customer_id IS NULL THEN
    RAISE EXCEPTION 'NOT_A_COMPANY_ORDER';
  END IF;

  -- Calculate sum of active items
  SELECT COALESCE(SUM(subtotal), 0) INTO v_active_total
  FROM public.digital_order_items
  WHERE order_id = p_order_id
    AND status = 'active';

  -- Update order
  UPDATE public.digital_orders
  SET status = 'accepted',
      accepted_at = now(),
      total = v_active_total,
      updated_at = now()
  WHERE id = p_order_id;

  -- Insert cuentas_cobrar row idempotently
  INSERT INTO public.cuentas_cobrar (
    tenant_id,
    sucursal_id,
    factura_id,
    customer_id,
    monto_total,
    monto_pagado,
    fecha_emision,
    fecha_vencimiento,
    estado,
    observacion,
    digital_order_id
  )
  VALUES (
    v_order.tenant_id,
    COALESCE(v_order.sucursal_id, v_link.sucursal_id),
    NULL,
    v_link.customer_id,
    v_active_total,
    0.00,
    now(),
    now() + interval '30 days',
    'pendiente',
    'Pedido digital #' || COALESCE(v_order.numero_pedido::text, '') || COALESCE(' - ' || v_order.employee_name, ''),
    v_order.id
  )
  ON CONFLICT (digital_order_id) DO NOTHING
  RETURNING id INTO v_cxc_id;

  IF v_cxc_id IS NULL THEN
    SELECT id INTO v_cxc_id
    FROM public.cuentas_cobrar
    WHERE digital_order_id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'order_id',     v_order.id,
    'status',       'accepted',
    'cxc_id',       v_cxc_id,
    'monto_total',  v_active_total
  );
END;
$$;

-- 14. RPC 4: revert_company_digital_order_accept
CREATE OR REPLACE FUNCTION public.revert_company_digital_order_accept(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.digital_orders%ROWTYPE;
  v_cxc     public.cuentas_cobrar%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.digital_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(v_order.tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_order.status <> 'accepted' THEN
    RAISE EXCEPTION 'ORDER_NOT_ACCEPTED';
  END IF;

  SELECT * INTO v_cxc
  FROM public.cuentas_cobrar
  WHERE digital_order_id = p_order_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_cxc.monto_pagado > 0 THEN
      RAISE EXCEPTION 'PAYMENTS_EXIST';
    END IF;

    IF EXISTS (SELECT 1 FROM public.cxc_pagos WHERE cuenta_cobrar_id = v_cxc.id) THEN
      RAISE EXCEPTION 'PAYMENTS_EXIST';
    END IF;

    DELETE FROM public.cuentas_cobrar WHERE id = v_cxc.id;
  END IF;

  UPDATE public.digital_orders
  SET status = 'pending',
      accepted_at = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status',   'pending'
  );
END;
$$;

-- 15. RPC 5: cancel_digital_order_item
CREATE OR REPLACE FUNCTION public.cancel_digital_order_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          public.digital_order_items%ROWTYPE;
  v_order         public.digital_orders%ROWTYPE;
  v_cxc           public.cuentas_cobrar%ROWTYPE;
  v_new_total     numeric;
  v_active_count  integer;
  v_new_estado    varchar(20);
BEGIN
  -- 1. Lock item
  SELECT * INTO v_item
  FROM public.digital_order_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND';
  END IF;

  -- 2. Tenant check
  IF NOT public.cyberbistro_has_tenant_role(v_item.tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_item.status <> 'active' THEN
    RAISE EXCEPTION 'ITEM_NOT_ACTIVE';
  END IF;

  -- 3. Lock order
  SELECT * INTO v_order
  FROM public.digital_orders
  WHERE id = v_item.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'ORDER_NOT_EDITABLE';
  END IF;

  -- 4. Mark item cancelled (and child extras if any)
  UPDATE public.digital_order_items
  SET status = 'cancelled'
  WHERE id = p_item_id;

  IF v_item.parent_item_id IS NULL THEN
    UPDATE public.digital_order_items
    SET status = 'cancelled'
    WHERE parent_item_id = p_item_id;
  END IF;

  -- 5. Recompute order total from active rows
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_new_total, v_active_count
  FROM public.digital_order_items
  WHERE order_id = v_order.id
    AND status = 'active';

  -- 6. Check CxC
  SELECT * INTO v_cxc
  FROM public.cuentas_cobrar
  WHERE digital_order_id = v_order.id
  FOR UPDATE;

  -- 7. If no active rows remain
  IF v_active_count = 0 THEN
    UPDATE public.digital_orders
    SET status = 'rejected',
        rejected_at = now(),
        total = 0,
        updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    IF v_cxc.id IS NOT NULL THEN
      IF v_cxc.monto_pagado > 0 THEN
        RAISE EXCEPTION 'PAYMENT_EXCEEDS_TOTAL';
      END IF;

      UPDATE public.cuentas_cobrar
      SET estado = 'anulada',
          monto_total = 0,
          updated_at = now()
      WHERE id = v_cxc.id;
    END IF;
  ELSE
    -- Active rows remain
    UPDATE public.digital_orders
    SET total = v_new_total,
        updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    IF v_cxc.id IS NOT NULL THEN
      IF v_new_total < v_cxc.monto_pagado THEN
        RAISE EXCEPTION 'PAYMENT_EXCEEDS_TOTAL';
      END IF;

      v_new_estado := CASE
        WHEN v_cxc.monto_pagado >= v_new_total AND v_new_total > 0 THEN 'pagada'
        WHEN v_cxc.monto_pagado > 0 THEN 'parcial'
        ELSE 'pendiente'
      END;

      UPDATE public.cuentas_cobrar
      SET monto_total = v_new_total,
          estado = v_new_estado,
          updated_at = now()
      WHERE id = v_cxc.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_id',            v_order.id,
    'item_id',             p_item_id,
    'new_total',           v_new_total,
    'active_items_count',  v_active_count,
    'order_status',        v_order.status
  );
END;
$$;

-- 16. RPC 6: get_company_statement
CREATE OR REPLACE FUNCTION public.get_company_statement(
  p_customer_id uuid,
  p_from        date,
  p_to          date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer   public.customers%ROWTYPE;
  v_rows       jsonb;
  v_count      integer := 0;
  v_total      numeric := 0;
  v_paid       numeric := 0;
  v_pending    numeric := 0;
BEGIN
  -- 1. Validate customer
  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- 2. Tenant check
  IF NOT public.cyberbistro_has_tenant_role(v_customer.tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- 3. Query statement rows
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'date',          public.menu_business_date(ord.created_at),
        'numero_pedido', ord.numero_pedido,
        'employee_name', ord.employee_name,
        'monto_total',   cxc.monto_total,
        'monto_pagado',  cxc.monto_pagado
      )
      ORDER BY public.menu_business_date(ord.created_at) ASC, ord.numero_pedido ASC
    ), '[]'::jsonb),
    COALESCE(COUNT(*), 0),
    COALESCE(SUM(cxc.monto_total), 0),
    COALESCE(SUM(cxc.monto_pagado), 0),
    COALESCE(SUM(cxc.monto_total - cxc.monto_pagado), 0)
  INTO v_rows, v_count, v_total, v_paid, v_pending
  FROM public.cuentas_cobrar cxc
  JOIN public.digital_orders ord ON ord.id = cxc.digital_order_id
  WHERE cxc.tenant_id = v_customer.tenant_id
    AND cxc.customer_id = p_customer_id
    AND cxc.digital_order_id IS NOT NULL
    AND cxc.estado <> 'anulada'
    AND public.menu_business_date(ord.created_at) BETWEEN p_from AND p_to;

  RETURN jsonb_build_object(
    'customer', jsonb_build_object(
      'name',        v_customer.name,
      'document_id', v_customer.document_id
    ),
    'from',    p_from,
    'to',      p_to,
    'rows',    v_rows,
    'totals',  jsonb_build_object(
      'count',   v_count,
      'total',   v_total,
      'paid',    v_paid,
      'pending', v_pending
    )
  );
END;
$$;

-- 17. Grant & Revoke permissions
REVOKE EXECUTE ON FUNCTION public.menu_business_today(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.menu_business_isodow(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.menu_business_date(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.menu_link_menu_available(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_menu_by_link(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_by_link(text, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_company_digital_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revert_company_digital_order_accept(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_digital_order_item(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_company_statement(uuid, date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.menu_business_today(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.menu_business_isodow(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.menu_business_date(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.menu_link_menu_available(uuid, date) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_menu_by_link(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_by_link(text, text, text, jsonb, text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_company_digital_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_company_digital_order_accept(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_digital_order_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_statement(uuid, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
