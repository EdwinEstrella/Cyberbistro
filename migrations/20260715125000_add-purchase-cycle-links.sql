-- Every purchase belongs to the operating cycle in which it was registered.
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES public.cierres_operativos(id) ON DELETE RESTRICT;

ALTER TABLE public.cuentas_pagar
  ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES public.cierres_operativos(id) ON DELETE RESTRICT;

-- Preserve the cycle of historical purchases whenever their timestamp fits a known cycle.
UPDATE public.compras AS compra
SET cycle_id = (
  SELECT ciclo.id
  FROM public.cierres_operativos AS ciclo
  WHERE ciclo.tenant_id = compra.tenant_id
    AND (ciclo.sucursal_id = compra.sucursal_id OR ciclo.sucursal_id IS NULL)
    AND compra.fecha_compra >= ciclo.opened_at
    AND (ciclo.closed_at IS NULL OR compra.fecha_compra < ciclo.closed_at)
  ORDER BY ciclo.opened_at DESC
  LIMIT 1
)
WHERE compra.cycle_id IS NULL;

UPDATE public.cuentas_pagar AS cuenta
SET cycle_id = compra.cycle_id
FROM public.compras AS compra
WHERE cuenta.compra_id = compra.id
  AND cuenta.cycle_id IS NULL
  AND compra.cycle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compras_cycle_id
  ON public.compras (tenant_id, cycle_id);

CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_cycle_id
  ON public.cuentas_pagar (tenant_id, cycle_id);
