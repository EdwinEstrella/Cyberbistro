-- Per-tenant switch: menu prices already include ITBIS.
-- When true, billing splits the price into base + ITBIS instead of adding ITBIS on top.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS itbis_incluido_en_precio boolean NOT NULL DEFAULT false;
