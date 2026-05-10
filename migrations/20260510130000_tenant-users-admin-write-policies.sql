-- Permite que el dueño/admin del negocio gestione usuarios de staff de su tenant.
-- Evita recursión RLS usando cyberbistro_current_admin_tenant_ids() SECURITY DEFINER.

DROP POLICY IF EXISTS cb_tenant_users_admin_staff_insert ON public.tenant_users;
DROP POLICY IF EXISTS cb_tenant_users_admin_staff_update ON public.tenant_users;
DROP POLICY IF EXISTS cb_tenant_users_admin_staff_delete ON public.tenant_users;

CREATE POLICY cb_tenant_users_admin_staff_insert
ON public.tenant_users
FOR INSERT
TO PUBLIC
WITH CHECK (
  tenant_id = ANY(public.cyberbistro_current_admin_tenant_ids())
  AND rol IN ('cajera', 'mesero', 'cocina', 'cocinero')
  AND activo IS TRUE
);

CREATE POLICY cb_tenant_users_admin_staff_update
ON public.tenant_users
FOR UPDATE
TO PUBLIC
USING (
  tenant_id = ANY(public.cyberbistro_current_admin_tenant_ids())
  AND rol IN ('cajera', 'mesero', 'cocina', 'cocinero')
)
WITH CHECK (
  tenant_id = ANY(public.cyberbistro_current_admin_tenant_ids())
  AND rol IN ('cajera', 'mesero', 'cocina', 'cocinero')
);

CREATE POLICY cb_tenant_users_admin_staff_delete
ON public.tenant_users
FOR DELETE
TO PUBLIC
USING (
  tenant_id = ANY(public.cyberbistro_current_admin_tenant_ids())
  AND rol IN ('cajera', 'mesero', 'cocina', 'cocinero')
);
