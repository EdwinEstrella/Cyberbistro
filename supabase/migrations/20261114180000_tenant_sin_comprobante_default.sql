-- Migration: 20261114180000_tenant_sin_comprobante_default.sql
-- Description: Add sin_comprobante_por_defecto column to public.tenants
--
-- Per-business setting. When true, the "Sin comprobante" switch at checkout
-- starts ON for every sale (internal receipt, nothing is sent to DGII).
-- The cashier can still turn it OFF per sale.
-- Default is FALSE so existing businesses keep billing fiscal receipts as before.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS sin_comprobante_por_defecto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.sin_comprobante_por_defecto IS
  'Per-business setting: when true, the "Sin comprobante" checkout switch starts ON (internal receipt, no NCF/e-CF). The cashier can turn it off per sale.';

NOTIFY pgrst, 'reload schema';
