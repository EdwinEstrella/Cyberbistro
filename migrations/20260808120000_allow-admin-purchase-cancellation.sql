-- An admin may cancel an erroneous purchase. The client reverses inventory and
-- removes the related records before deleting the purchase itself.

DROP POLICY IF EXISTS cb_compras_no_app_delete ON public.compras;
DROP POLICY IF EXISTS cb_compras_admin_delete ON public.compras;
CREATE POLICY cb_compras_admin_delete ON public.compras
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_compra_detalles_no_app_delete ON public.compra_detalles;
DROP POLICY IF EXISTS cb_compra_detalles_admin_delete ON public.compra_detalles;
CREATE POLICY cb_compra_detalles_admin_delete ON public.compra_detalles
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_inventario_movimientos_no_app_delete ON public.inventario_movimientos;
DROP POLICY IF EXISTS cb_inventario_movimientos_admin_delete ON public.inventario_movimientos;
CREATE POLICY cb_inventario_movimientos_admin_delete ON public.inventario_movimientos
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_compra_fiscal_admin_delete ON public.compra_fiscal;
CREATE POLICY cb_compra_fiscal_admin_delete ON public.compra_fiscal
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));
