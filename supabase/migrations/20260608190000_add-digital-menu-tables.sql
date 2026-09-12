-- Add digital menu tables with RLS and public/tenant access policies.

-- 1. Table: digital_menu_settings
CREATE TABLE IF NOT EXISTS public.digital_menu_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT false,
  public_slug text UNIQUE NOT NULL,
  title text,
  description text,
  logo_url text,
  banner_url text,
  theme jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Table: digital_menu_items
CREATE TABLE IF NOT EXISTS public.digital_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plato_id integer NOT NULL REFERENCES public.platos(id) ON DELETE CASCADE,
  display_name text,
  description text,
  image_url text,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Table: digital_orders
CREATE TABLE IF NOT EXISTS public.digital_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'confirming' | 'accepted' | 'rejected'
  total numeric NOT NULL DEFAULT 0.00 CHECK (total >= 0.00),
  notes text,
  rejection_reason text,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Table: digital_order_items
CREATE TABLE IF NOT EXISTS public.digital_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.digital_orders(id) ON DELETE CASCADE,
  plato_id integer REFERENCES public.platos(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  price_snapshot numeric NOT NULL CHECK (price_snapshot >= 0.00),
  quantity integer NOT NULL CHECK (quantity > 0),
  notes text,
  subtotal numeric NOT NULL CHECK (subtotal >= 0.00),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.digital_menu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_order_items ENABLE ROW LEVEL SECURITY;

-- 5. Policies

-- DIGITAL_MENU_SETTINGS
-- Select: Public
DROP POLICY IF EXISTS cb_digital_menu_settings_public_select ON public.digital_menu_settings;
CREATE POLICY cb_digital_menu_settings_public_select ON public.digital_menu_settings
  FOR SELECT TO public
  USING (true);

-- Insert/Update/Delete: Tenant admins
DROP POLICY IF EXISTS cb_digital_menu_settings_admin_insert ON public.digital_menu_settings;
CREATE POLICY cb_digital_menu_settings_admin_insert ON public.digital_menu_settings
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_digital_menu_settings_admin_update ON public.digital_menu_settings;
CREATE POLICY cb_digital_menu_settings_admin_update ON public.digital_menu_settings
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_digital_menu_settings_admin_delete ON public.digital_menu_settings;
CREATE POLICY cb_digital_menu_settings_admin_delete ON public.digital_menu_settings
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));


-- DIGITAL_MENU_ITEMS
-- Select: Public
DROP POLICY IF EXISTS cb_digital_menu_items_public_select ON public.digital_menu_items;
CREATE POLICY cb_digital_menu_items_public_select ON public.digital_menu_items
  FOR SELECT TO public
  USING (true);

-- Insert/Update/Delete: Tenant admins
DROP POLICY IF EXISTS cb_digital_menu_items_admin_insert ON public.digital_menu_items;
CREATE POLICY cb_digital_menu_items_admin_insert ON public.digital_menu_items
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_digital_menu_items_admin_update ON public.digital_menu_items;
CREATE POLICY cb_digital_menu_items_admin_update ON public.digital_menu_items
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_digital_menu_items_admin_delete ON public.digital_menu_items;
CREATE POLICY cb_digital_menu_items_admin_delete ON public.digital_menu_items
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));


-- DIGITAL_ORDERS
-- Select: Public (so client can check their own status) and Tenant users
DROP POLICY IF EXISTS cb_digital_orders_select ON public.digital_orders;
CREATE POLICY cb_digital_orders_select ON public.digital_orders
  FOR SELECT TO public
  USING (true);

-- Insert: Public (anyone visiting the website can place an order)
DROP POLICY IF EXISTS cb_digital_orders_public_insert ON public.digital_orders;
CREATE POLICY cb_digital_orders_public_insert ON public.digital_orders
  FOR INSERT TO public
  WITH CHECK (true);

-- Update: Tenant users (to accept/reject orders)
DROP POLICY IF EXISTS cb_digital_orders_tenant_update ON public.digital_orders;
CREATE POLICY cb_digital_orders_tenant_update ON public.digital_orders
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

-- Delete: Tenant admins
DROP POLICY IF EXISTS cb_digital_orders_admin_delete ON public.digital_orders;
CREATE POLICY cb_digital_orders_admin_delete ON public.digital_orders
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));


-- DIGITAL_ORDER_ITEMS
-- Select: Public
DROP POLICY IF EXISTS cb_digital_order_items_select ON public.digital_order_items;
CREATE POLICY cb_digital_order_items_select ON public.digital_order_items
  FOR SELECT TO public
  USING (true);

-- Insert: Public
DROP POLICY IF EXISTS cb_digital_order_items_public_insert ON public.digital_order_items;
CREATE POLICY cb_digital_order_items_public_insert ON public.digital_order_items
  FOR INSERT TO public
  WITH CHECK (true);

-- Update/Delete: None (immutable)


-- 6. Indexes
CREATE INDEX IF NOT EXISTS digital_menu_settings_slug_idx ON public.digital_menu_settings (public_slug);
CREATE INDEX IF NOT EXISTS digital_menu_settings_tenant_idx ON public.digital_menu_settings (tenant_id);
CREATE INDEX IF NOT EXISTS digital_menu_items_plato_idx ON public.digital_menu_items (tenant_id, plato_id);
CREATE INDEX IF NOT EXISTS digital_orders_tenant_status_idx ON public.digital_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS digital_order_items_order_idx ON public.digital_order_items (tenant_id, order_id);
