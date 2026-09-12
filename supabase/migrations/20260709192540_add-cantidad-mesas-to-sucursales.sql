-- Add cantidad_mesas to sucursales table if it doesn't exist
-- Fixes an issue where get_public_digital_menu RPC fails with 400 Bad Request
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS cantidad_mesas integer DEFAULT 0;
