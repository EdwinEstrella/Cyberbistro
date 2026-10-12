-- Per-tenant switch: menu prices already include ITBIS.
-- Mirror of supabase/migrations/20261011120000_add_tenant_itbis_incluido_en_precio.sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS itbis_incluido_en_precio boolean NOT NULL DEFAULT false;
