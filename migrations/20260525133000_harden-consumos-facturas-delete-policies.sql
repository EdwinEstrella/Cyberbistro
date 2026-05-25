-- Harden destructive operations for operational records.
-- Staff can still operate within their tenant, but deletes are scoped by role and state.

CREATE OR REPLACE FUNCTION public.cyberbistro_has_tenant_role(
  p_tenant_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.cyberbistro_is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = p_tenant_id
        AND tu.activo IS TRUE
        AND tu.rol = ANY(p_roles)
        AND (
          tu.auth_user_id = public.cyberbistro_auth_user_id()
          OR (
            tu.auth_user_id IS NULL
            AND lower(tu.email) = lower(COALESCE(public.cyberbistro_auth_email(), ''))
          )
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.cyberbistro_has_tenant_role(uuid, text[]) TO PUBLIC;

DROP POLICY IF EXISTS cb_consumos_tenant_isolation ON public.consumos;
DROP POLICY IF EXISTS cb_consumos_tenant_select ON public.consumos;
DROP POLICY IF EXISTS cb_consumos_tenant_insert ON public.consumos;
DROP POLICY IF EXISTS cb_consumos_tenant_update ON public.consumos;
DROP POLICY IF EXISTS cb_consumos_delete ON public.consumos;
DROP POLICY IF EXISTS cb_consumos_staff_delete_open ON public.consumos;

CREATE POLICY cb_consumos_tenant_select
ON public.consumos
FOR SELECT
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
);

CREATE POLICY cb_consumos_tenant_insert
ON public.consumos
FOR INSERT
TO PUBLIC
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
);

CREATE POLICY cb_consumos_tenant_update
ON public.consumos
FOR UPDATE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
)
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
);

CREATE POLICY cb_consumos_staff_delete_open
ON public.consumos
FOR DELETE
TO PUBLIC
USING (
  (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
    OR (
      public.cyberbistro_has_tenant_role(tenant_id, ARRAY['cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera'])
      AND created_by_auth_user_id = public.cyberbistro_auth_user_id()
    )
  )
  AND factura_id IS NULL
  AND estado <> 'pagado'
);

DROP POLICY IF EXISTS cb_facturas_tenant_isolation ON public.facturas;
DROP POLICY IF EXISTS cb_facturas_tenant_select ON public.facturas;
DROP POLICY IF EXISTS cb_facturas_tenant_insert ON public.facturas;
DROP POLICY IF EXISTS cb_facturas_tenant_update ON public.facturas;
DROP POLICY IF EXISTS cb_facturas_admin_delete ON public.facturas;
DROP POLICY IF EXISTS cb_facturas_no_app_delete ON public.facturas;

CREATE POLICY cb_facturas_tenant_select
ON public.facturas
FOR SELECT
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
);

CREATE POLICY cb_facturas_tenant_insert
ON public.facturas
FOR INSERT
TO PUBLIC
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
);

CREATE POLICY cb_facturas_tenant_update
ON public.facturas
FOR UPDATE
TO PUBLIC
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
)
WITH CHECK (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
);

CREATE POLICY cb_facturas_no_app_delete
ON public.facturas
FOR DELETE
TO PUBLIC
USING (false);

NOTIFY pgrst, 'reload schema';
