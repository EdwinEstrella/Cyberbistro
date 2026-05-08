-- Permite que el admin/dueño de un restaurante vea el equipo completo en Soporte.
-- Mantiene el aislamiento por tenant y evita recursión RLS usando SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.cyberbistro_current_admin_tenant_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT tu.tenant_id), ARRAY[]::uuid[])
  FROM public.tenant_users tu
  WHERE tu.activo IS TRUE
    AND tu.rol = 'admin'
    AND (
      tu.auth_user_id = public.cyberbistro_auth_user_id()
      OR lower(tu.email) = lower(COALESCE(public.cyberbistro_auth_email(), ''))
    );
$$;

GRANT EXECUTE ON FUNCTION public.cyberbistro_current_admin_tenant_ids() TO PUBLIC;

DROP POLICY IF EXISTS cb_tenant_users_admin_team_select ON public.tenant_users;

CREATE POLICY cb_tenant_users_admin_team_select
ON public.tenant_users
FOR SELECT
TO PUBLIC
USING (
  tenant_id = ANY(public.cyberbistro_current_admin_tenant_ids())
);
