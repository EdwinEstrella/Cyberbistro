-- Accounting manages financial records and inventory without gaining sales or staff access.
CREATE OR REPLACE FUNCTION public.cyberbistro_guard_productos_inventario_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.cyberbistro_has_tenant_role(OLD.tenant_id, ARRAY['admin', 'contabilidad']) THEN
    RETURN NEW;
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(
    OLD.tenant_id,
    ARRAY['cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero']
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar inventario.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
    OR NEW.nombre IS DISTINCT FROM OLD.nombre
    OR NEW.categoria IS DISTINCT FROM OLD.categoria
    OR NEW.unidad_base IS DISTINCT FROM OLD.unidad_base
    OR NEW.stock_minimo IS DISTINCT FROM OLD.stock_minimo
    OR NEW.costo_promedio IS DISTINCT FROM OLD.costo_promedio
    OR NEW.contenido_por_unidad_compra IS DISTINCT FROM OLD.contenido_por_unidad_compra
    OR NEW.costo_unidad_compra IS DISTINCT FROM OLD.costo_unidad_compra
    OR NEW.unidad_compra IS DISTINCT FROM OLD.unidad_compra
    OR NEW.mostrar_en_fracciones IS DISTINCT FROM OLD.mostrar_en_fracciones
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Solo admin o contabilidad puede cambiar datos de catálogo de inventario.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE POLICY cb_sucursales_accounting_select ON public.sucursales
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_productos_inventario_accounting_all ON public.productos_inventario
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_inventario_movimientos_accounting_select ON public.inventario_movimientos
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_inventario_movimientos_accounting_insert ON public.inventario_movimientos
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_inventario_movimientos_accounting_delete ON public.inventario_movimientos
  FOR DELETE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_recetas_accounting_all ON public.recetas
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_produccion_cocina_accounting_select ON public.produccion_cocina
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_produccion_cocina_accounting_insert ON public.produccion_cocina
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_platos_accounting_select ON public.platos
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_compras_accounting_write ON public.compras
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_compra_detalles_accounting_write ON public.compra_detalles
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_proveedores_accounting_write ON public.proveedores
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_compra_fiscal_accounting_write ON public.compra_fiscal
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_gastos_accounting_write ON public.gastos
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_gasto_categorias_accounting_write ON public.gasto_categorias
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_cuentas_pagar_accounting_write ON public.cuentas_pagar
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_cxp_pagos_accounting_select ON public.cxp_pagos
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_cxp_pagos_accounting_insert ON public.cxp_pagos
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_cuentas_cobrar_accounting_write ON public.cuentas_cobrar
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_cxc_pagos_accounting_select ON public.cxc_pagos
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_cxc_pagos_accounting_insert ON public.cxc_pagos
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_customers_accounting_select ON public.customers
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_facturas_accounting_select ON public.facturas
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_consumos_accounting_select ON public.consumos
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_cierres_operativos_accounting_select ON public.cierres_operativos
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_cierres_operativos_accounting_update ON public.cierres_operativos
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_ecf_documents_accounting_update ON public.ecf_documents
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_fiscal_outbox_accounting_select ON public.fiscal_outbox
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

CREATE POLICY cb_fiscal_outbox_accounting_insert ON public.fiscal_outbox
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));
