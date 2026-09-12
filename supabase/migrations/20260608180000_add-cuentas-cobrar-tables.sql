-- Add cuentas_cobrar and cxc_pagos tables with RLS and multi-tenant isolation.

-- 1. Crear tabla de cuentas por cobrar
CREATE TABLE IF NOT EXISTS public.cuentas_cobrar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  factura_id uuid REFERENCES public.facturas(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  monto_total numeric NOT NULL CHECK (monto_total >= 0.00),
  monto_pagado numeric NOT NULL DEFAULT 0.00 CHECK (monto_pagado >= 0.00),
  fecha_emision timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento timestamptz NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'parcial' | 'pagada'
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Crear tabla de pagos de cuentas por cobrar (abonos)
CREATE TABLE IF NOT EXISTS public.cxc_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  cuenta_cobrar_id uuid NOT NULL REFERENCES public.cuentas_cobrar(id) ON DELETE CASCADE,
  monto numeric NOT NULL CHECK (monto > 0.00),
  fecha_pago timestamptz NOT NULL DEFAULT now(),
  metodo_pago varchar(20) NOT NULL, -- 'efectivo' | 'tarjeta' | 'transferencia' | 'digital'
  notas text,
  cycle_id uuid REFERENCES public.cierres_operativos(id) ON DELETE SET NULL,
  created_by_auth_user_id uuid REFERENCES public.tenant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Habilitar RLS en las nuevas tablas
ALTER TABLE public.cuentas_cobrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cxc_pagos ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas de aislamiento multi-tenant y roles

-- CUENTAS_COBRAR:
-- Select y Modificaciones permitidas para admin y roles operativos
DROP POLICY IF EXISTS cb_cuentas_cobrar_tenant_select ON public.cuentas_cobrar;
CREATE POLICY cb_cuentas_cobrar_tenant_select ON public.cuentas_cobrar
  FOR SELECT TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

DROP POLICY IF EXISTS cb_cuentas_cobrar_tenant_insert ON public.cuentas_cobrar;
CREATE POLICY cb_cuentas_cobrar_tenant_insert ON public.cuentas_cobrar
  FOR INSERT TO public
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

DROP POLICY IF EXISTS cb_cuentas_cobrar_tenant_update ON public.cuentas_cobrar;
CREATE POLICY cb_cuentas_cobrar_tenant_update ON public.cuentas_cobrar
  FOR UPDATE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  )
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

DROP POLICY IF EXISTS cb_cuentas_cobrar_admin_delete ON public.cuentas_cobrar;
CREATE POLICY cb_cuentas_cobrar_admin_delete ON public.cuentas_cobrar
  FOR DELETE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
  );

-- CXC_PAGOS:
-- Select y Modificaciones (Insert) permitidas para admin y roles operativos
DROP POLICY IF EXISTS cb_cxc_pagos_tenant_select ON public.cxc_pagos;
CREATE POLICY cb_cxc_pagos_tenant_select ON public.cxc_pagos
  FOR SELECT TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

DROP POLICY IF EXISTS cb_cxc_pagos_tenant_insert ON public.cxc_pagos;
CREATE POLICY cb_cxc_pagos_tenant_insert ON public.cxc_pagos
  FOR INSERT TO public
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

-- Bloqueo total de update y delete en pagos (registro histórico inmutable)
DROP POLICY IF EXISTS cb_cxc_pagos_no_app_update ON public.cxc_pagos;
CREATE POLICY cb_cxc_pagos_no_app_update ON public.cxc_pagos
  FOR UPDATE TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS cb_cxc_pagos_no_app_delete ON public.cxc_pagos;
CREATE POLICY cb_cxc_pagos_no_app_delete ON public.cxc_pagos
  FOR DELETE TO public
  USING (false);

-- 5. Crear índices de rendimiento
CREATE INDEX IF NOT EXISTS cuentas_cobrar_tenant_cust_idx ON public.cuentas_cobrar (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS cuentas_cobrar_estado_idx ON public.cuentas_cobrar (tenant_id, estado);
CREATE INDEX IF NOT EXISTS cxc_pagos_cuenta_cobrar_idx ON public.cxc_pagos (tenant_id, cuenta_cobrar_id);
