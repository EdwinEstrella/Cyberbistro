-- Allow tenant roles to update compras, compra_detalles, inventario_movimientos and compra_fiscal
-- so durable sync worker upserts (INSERT ... ON CONFLICT DO UPDATE) do not fail with
-- "new row violates row-level security policy (USING expression)".

DROP POLICY IF EXISTS cb_compras_no_app_update ON public.compras;
DROP POLICY IF EXISTS cb_compras_tenant_update ON public.compras;
CREATE POLICY cb_compras_tenant_update ON public.compras
  FOR UPDATE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  )
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  );

DROP POLICY IF EXISTS cb_compra_detalles_no_app_update ON public.compra_detalles;
DROP POLICY IF EXISTS cb_compra_detalles_tenant_update ON public.compra_detalles;
CREATE POLICY cb_compra_detalles_tenant_update ON public.compra_detalles
  FOR UPDATE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  )
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  );

DROP POLICY IF EXISTS cb_inventario_movimientos_no_app_update ON public.inventario_movimientos;
DROP POLICY IF EXISTS cb_inventario_movimientos_tenant_update ON public.inventario_movimientos;
CREATE POLICY cb_inventario_movimientos_tenant_update ON public.inventario_movimientos
  FOR UPDATE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  )
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  );

DROP POLICY IF EXISTS cb_compra_fiscal_insert ON public.compra_fiscal;
CREATE POLICY cb_compra_fiscal_insert ON public.compra_fiscal
  FOR INSERT TO public
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  );

DROP POLICY IF EXISTS cb_compra_fiscal_update ON public.compra_fiscal;
CREATE POLICY cb_compra_fiscal_update ON public.compra_fiscal
  FOR UPDATE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  )
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad'])
  );
