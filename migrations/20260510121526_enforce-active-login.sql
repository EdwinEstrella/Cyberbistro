CREATE OR REPLACE FUNCTION public.cloudix_resolve_tenant_user()
RETURNS TABLE (
  tenant_id uuid,
  email text,
  rol text,
  nombre text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tu.tenant_id, tu.email, tu.rol, tu.nombre
  FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id
  WHERE tu.activo IS TRUE
    AND t.activa IS TRUE
    AND (
      tu.auth_user_id = public.cloudix_auth_user_id()
      OR lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), ''))
    )
  ORDER BY (tu.auth_user_id = public.cloudix_auth_user_id()) DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.cloudix_resolve_tenant_user() TO PUBLIC;

NOTIFY pgrst, 'reload schema';
