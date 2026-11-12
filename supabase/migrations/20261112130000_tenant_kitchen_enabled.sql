-- Migration: 20261112130000_tenant_kitchen_enabled.sql
-- Description: Add kitchen_enabled column to public.tenants
--
-- Per-business switch indicating whether the business operates a kitchen.
-- Default is TRUE for backwards compatibility with all existing and new businesses.
-- When false:
--   - Orders do not generate kitchen comandas
--   - Kitchen-closed checks are bypassed
--   - Orders print a dispatch slip at the sales register instead of a kitchen ticket

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS kitchen_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenants.kitchen_enabled IS
  'Per-business switch indicating whether the business operates a kitchen. When false, orders do not create kitchen comandas, skip kitchen closed guards, and print a dispatch slip at the register.';

NOTIFY pgrst, 'reload schema';
