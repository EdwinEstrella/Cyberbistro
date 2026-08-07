-- Backfill records whose historical timestamp has one unambiguous matching cycle.
UPDATE public.cuentas_pagar AS cuenta
SET cycle_id = (
  SELECT id
  FROM public.cierres_operativos
  WHERE tenant_id = cuenta.tenant_id
    AND (sucursal_id = cuenta.sucursal_id OR sucursal_id IS NULL)
    AND cuenta.fecha_emision >= opened_at
    AND (closed_at IS NULL OR cuenta.fecha_emision < closed_at)
  ORDER BY (sucursal_id = cuenta.sucursal_id) DESC, opened_at DESC
  LIMIT 1
)
WHERE cuenta.cycle_id IS NULL;

UPDATE public.cxp_pagos AS pago
SET cycle_id = (
  SELECT id
  FROM public.cierres_operativos
  WHERE tenant_id = pago.tenant_id
    AND (sucursal_id = pago.sucursal_id OR sucursal_id IS NULL)
    AND pago.fecha_pago >= opened_at
    AND (closed_at IS NULL OR pago.fecha_pago < closed_at)
  ORDER BY (sucursal_id = pago.sucursal_id) DESC, opened_at DESC
  LIMIT 1
)
WHERE pago.cycle_id IS NULL;
