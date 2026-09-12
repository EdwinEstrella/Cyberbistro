-- Add advanced inventory columns (ml_por_botella, costo_compra)
-- and update catalog guard trigger function to protect them.

-- 1. Añadir las columnas ml_por_botella y costo_compra
ALTER TABLE public.productos_inventario 
ADD COLUMN IF NOT EXISTS ml_por_botella numeric,
ADD COLUMN IF NOT EXISTS costo_compra numeric DEFAULT 0.00;

-- 2. Reemplazar la función trigger para proteger las nuevas columnas
CREATE OR REPLACE FUNCTION public.cyberbistro_guard_productos_inventario_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.cyberbistro_has_tenant_role(OLD.tenant_id, ARRAY['admin']) THEN
    RETURN NEW;
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(OLD.tenant_id, ARRAY['cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero']) THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar inventario.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
    OR NEW.nombre IS DISTINCT FROM OLD.nombre
    OR NEW.categoria IS DISTINCT FROM OLD.categoria
    OR NEW.unidad_base IS DISTINCT FROM OLD.unidad_base
    OR NEW.stock_minimo IS DISTINCT FROM OLD.stock_minimo
    OR NEW.costo_promedio IS DISTINCT FROM OLD.costo_promedio
    OR NEW.ml_por_botella IS DISTINCT FROM OLD.ml_por_botella
    OR NEW.costo_compra IS DISTINCT FROM OLD.costo_compra
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo admin puede cambiar datos de catálogo de inventario.';
  END IF;

  RETURN NEW;
END;
$$;
