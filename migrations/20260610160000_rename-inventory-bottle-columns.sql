-- Add generic inventory presentation columns and rename bottle ones.
-- Idempotent so it can run safely on databases that already advanced the schema.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'productos_inventario'
      AND column_name = 'ml_por_botella'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'productos_inventario'
      AND column_name = 'contenido_por_unidad_compra'
  ) THEN
    ALTER TABLE public.productos_inventario
      RENAME COLUMN ml_por_botella TO contenido_por_unidad_compra;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'productos_inventario'
      AND column_name = 'costo_compra'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'productos_inventario'
      AND column_name = 'costo_unidad_compra'
  ) THEN
    ALTER TABLE public.productos_inventario
      RENAME COLUMN costo_compra TO costo_unidad_compra;
  END IF;
END $$;

ALTER TABLE public.productos_inventario
  ADD COLUMN IF NOT EXISTS unidad_compra text,
  ADD COLUMN IF NOT EXISTS mostrar_en_fracciones boolean DEFAULT false;

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

  IF NOT public.cyberbistro_has_tenant_role(
    OLD.tenant_id,
    ARRAY['cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero']
  ) THEN
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
    OR NEW.contenido_por_unidad_compra IS DISTINCT FROM OLD.contenido_por_unidad_compra
    OR NEW.costo_unidad_compra IS DISTINCT FROM OLD.costo_unidad_compra
    OR NEW.unidad_compra IS DISTINCT FROM OLD.unidad_compra
    OR NEW.mostrar_en_fracciones IS DISTINCT FROM OLD.mostrar_en_fracciones
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo admin puede cambiar datos de catálogo de inventario.';
  END IF;

  RETURN NEW;
END;
$$;
