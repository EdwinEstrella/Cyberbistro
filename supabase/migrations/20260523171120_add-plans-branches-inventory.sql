-- 1. Agregar columna de plan al tenant
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS plan varchar(20) NOT NULL DEFAULT 'basico';

-- 2. Crear tabla de sucursales
CREATE TABLE IF NOT EXISTS public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  direccion text,
  telefono text,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS en sucursales
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_sucursales_tenant_isolation ON public.sucursales;
CREATE POLICY cb_sucursales_tenant_isolation ON public.sucursales
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = sucursales.tenant_id AND tu.activo IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = sucursales.tenant_id AND tu.activo IS TRUE
    )
  );

-- 3. Crear tablas de inventario
CREATE TABLE IF NOT EXISTS public.productos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  categoria text NOT NULL,
  unidad_base varchar(20) NOT NULL,
  stock_actual numeric NOT NULL DEFAULT 0,
  stock_minimo numeric NOT NULL DEFAULT 0,
  costo_promedio numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventario_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  producto_id uuid NOT NULL REFERENCES public.productos_inventario(id) ON DELETE CASCADE,
  tipo varchar(20) NOT NULL, -- 'entrada', 'salida', 'consumo', 'merma', 'ajuste', 'transferencia'
  cantidad numeric NOT NULL,
  stock_antes numeric NOT NULL,
  stock_despues numeric NOT NULL,
  costo_unitario numeric NOT NULL DEFAULT 0,
  motivo text,
  referencia text,
  fecha timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid REFERENCES public.tenant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plato_id integer NOT NULL REFERENCES public.platos(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES public.productos_inventario(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL,
  unidad varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plato_id, insumo_id)
);

CREATE TABLE IF NOT EXISTS public.produccion_cocina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  area text NOT NULL,
  producto_id uuid NOT NULL REFERENCES public.productos_inventario(id) ON DELETE CASCADE,
  cantidad_usada numeric NOT NULL,
  responsable text,
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS en tablas de inventario
ALTER TABLE public.productos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produccion_cocina ENABLE ROW LEVEL SECURITY;

-- Políticas de aislamiento multi-tenant para las nuevas tablas
DROP POLICY IF EXISTS cb_productos_inventario_tenant_isolation ON public.productos_inventario;
CREATE POLICY cb_productos_inventario_tenant_isolation ON public.productos_inventario
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = productos_inventario.tenant_id AND tu.activo IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = productos_inventario.tenant_id AND tu.activo IS TRUE
    )
  );

DROP POLICY IF EXISTS cb_inventario_movimientos_tenant_isolation ON public.inventario_movimientos;
CREATE POLICY cb_inventario_movimientos_tenant_isolation ON public.inventario_movimientos
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = inventario_movimientos.tenant_id AND tu.activo IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = inventario_movimientos.tenant_id AND tu.activo IS TRUE
    )
  );

DROP POLICY IF EXISTS cb_recetas_tenant_isolation ON public.recetas;
CREATE POLICY cb_recetas_tenant_isolation ON public.recetas
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = recetas.tenant_id AND tu.activo IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = recetas.tenant_id AND tu.activo IS TRUE
    )
  );

DROP POLICY IF EXISTS cb_produccion_cocina_tenant_isolation ON public.produccion_cocina;
CREATE POLICY cb_produccion_cocina_tenant_isolation ON public.produccion_cocina
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = produccion_cocina.tenant_id AND tu.activo IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_users tu 
      WHERE tu.tenant_id = produccion_cocina.tenant_id AND tu.activo IS TRUE
    )
  );

NOTIFY pgrst, 'reload schema';
