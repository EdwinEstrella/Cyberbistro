-- Migración: Agregar columna updated_at a tablas de inventario para soportar la sincronización local-first incremental
-- 1. Agregar columna a inventario_movimientos
ALTER TABLE public.inventario_movimientos ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Agregar columna a produccion_cocina
ALTER TABLE public.produccion_cocina ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 3. Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';
