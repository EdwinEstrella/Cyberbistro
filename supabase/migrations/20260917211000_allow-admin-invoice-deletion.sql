-- The application only exposes invoice deletion to tenant admins. Mirror that
-- authorization in RLS so local-first deletes do not remain cloud-only ghosts.
DROP POLICY IF EXISTS cb_facturas_no_app_delete ON public.facturas;
DROP POLICY IF EXISTS cb_facturas_admin_delete ON public.facturas;
CREATE POLICY cb_facturas_admin_delete
ON public.facturas
FOR DELETE
TO authenticated
USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_consumos_staff_delete_open ON public.consumos;
CREATE POLICY cb_consumos_staff_delete_open
ON public.consumos
FOR DELETE
TO authenticated
USING (
  public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
  OR (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera'])
    AND created_by_auth_user_id = public.cyberbistro_auth_user_id()
    AND factura_id IS NULL
    AND estado <> 'pagado'
  )
);

NOTIFY pgrst, 'reload schema';
