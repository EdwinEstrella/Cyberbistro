-- This forward migration closes privilege drift in the canonical registration RPC.
REVOKE EXECUTE ON FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text) TO authenticated;
ALTER FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text)
  SET search_path TO pg_catalog, public, pg_temp;
