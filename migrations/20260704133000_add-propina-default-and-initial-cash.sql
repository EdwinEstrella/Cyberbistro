ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS propina_cobro_por_defecto boolean NOT NULL DEFAULT false;

ALTER TABLE public.cierres_operativos
  ADD COLUMN IF NOT EXISTS efectivo_inicial numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cierres_operativos_efectivo_inicial_bounds'
      AND conrelid = 'public.cierres_operativos'::regclass
  ) THEN
    ALTER TABLE public.cierres_operativos
      ADD CONSTRAINT cierres_operativos_efectivo_inicial_bounds
      CHECK (efectivo_inicial >= 0 AND efectivo_inicial <= 9999999999.99);
  END IF;
END $$;
