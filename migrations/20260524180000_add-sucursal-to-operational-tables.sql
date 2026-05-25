-- Migración: Aislamiento de datos operativos por sucursal
-- 1. Asegurar que todos los tenants tengan al menos una sucursal activa
INSERT INTO public.sucursales (id, tenant_id, nombre, direccion, telefono, activa, created_at, updated_at)
SELECT gen_random_uuid(), id, 'Sucursal Central', 'Dirección Principal', '', true, now(), now()
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.sucursales s WHERE s.tenant_id = t.id
);

-- 2. Agregar columna sucursal_id a las tablas operativas
ALTER TABLE public.platos ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.mesas_estado ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.comandas ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.consumos ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.cierres_operativos ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.gasto_categorias ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;
ALTER TABLE public.cocina_estado ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL;

-- 3. Vincular datos preexistentes a la primera sucursal activa de su respectivo tenant
UPDATE public.platos p
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = p.tenant_id AND s.activa = true LIMIT 1)
WHERE p.sucursal_id IS NULL;

UPDATE public.menu_categories mc
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = mc.tenant_id AND s.activa = true LIMIT 1)
WHERE mc.sucursal_id IS NULL;

UPDATE public.mesas_estado me
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = me.tenant_id AND s.activa = true LIMIT 1)
WHERE me.sucursal_id IS NULL;

UPDATE public.comandas c
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = c.tenant_id AND s.activa = true LIMIT 1)
WHERE c.sucursal_id IS NULL;

UPDATE public.consumos c
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = c.tenant_id AND s.activa = true LIMIT 1)
WHERE c.sucursal_id IS NULL;

UPDATE public.facturas f
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = f.tenant_id AND s.activa = true LIMIT 1)
WHERE f.sucursal_id IS NULL;

UPDATE public.cierres_operativos co
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = co.tenant_id AND s.activa = true LIMIT 1)
WHERE co.sucursal_id IS NULL;

UPDATE public.gastos g
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = g.tenant_id AND s.activa = true LIMIT 1)
WHERE g.sucursal_id IS NULL;

UPDATE public.gasto_categorias gc
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = gc.tenant_id AND s.activa = true LIMIT 1)
WHERE gc.sucursal_id IS NULL;

UPDATE public.cocina_estado ce
SET sucursal_id = (SELECT id FROM public.sucursales s WHERE s.tenant_id = ce.tenant_id AND s.activa = true LIMIT 1)
WHERE ce.sucursal_id IS NULL;

-- 4. Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';
