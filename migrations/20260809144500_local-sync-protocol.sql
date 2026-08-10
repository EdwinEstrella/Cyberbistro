-- Foundation only: return every active membership so the client can surface
-- cardinality as an explicit access state rather than selecting a tenant silently.
CREATE OR REPLACE FUNCTION public.cloudix_resolve_tenant_memberships()
RETURNS TABLE (tenant_id uuid, email text, rol text, nombre text, plan text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tu.tenant_id, tu.email, tu.rol, tu.nombre, t.plan
  FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id
  WHERE tu.activo IS TRUE
    AND t.activa IS TRUE
    AND (tu.auth_user_id = public.cloudix_auth_user_id()
      OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), ''))));
$$;

REVOKE ALL ON FUNCTION public.cloudix_resolve_tenant_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cloudix_resolve_tenant_memberships() TO authenticated;
