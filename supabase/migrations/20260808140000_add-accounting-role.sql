-- The accounting role is limited to financial routes and financial records.
DROP POLICY IF EXISTS cb_tenant_users_admin_staff_insert ON public.tenant_users;
CREATE POLICY cb_tenant_users_admin_staff_insert ON public.tenant_users
  FOR INSERT TO public
  WITH CHECK (
    tenant_id = ANY (public.cyberbistro_current_admin_tenant_ids())
    AND rol IN ('cajera', 'mesero', 'cocina', 'cocinero', 'contabilidad')
    AND activo IS TRUE
  );

DROP POLICY IF EXISTS cb_tenant_users_admin_staff_update ON public.tenant_users;
CREATE POLICY cb_tenant_users_admin_staff_update ON public.tenant_users
  FOR UPDATE TO public
  USING (
    tenant_id = ANY (public.cyberbistro_current_admin_tenant_ids())
    AND rol IN ('cajera', 'mesero', 'cocina', 'cocinero', 'contabilidad')
  )
  WITH CHECK (
    tenant_id = ANY (public.cyberbistro_current_admin_tenant_ids())
    AND rol IN ('cajera', 'mesero', 'cocina', 'cocinero', 'contabilidad')
  );

DROP POLICY IF EXISTS cb_tenant_users_admin_staff_delete ON public.tenant_users;
CREATE POLICY cb_tenant_users_admin_staff_delete ON public.tenant_users
  FOR DELETE TO public
  USING (
    tenant_id = ANY (public.cyberbistro_current_admin_tenant_ids())
    AND rol IN ('cajera', 'mesero', 'cocina', 'cocinero', 'contabilidad')
  );

DROP POLICY IF EXISTS cb_compras_accounting_select ON public.compras;
CREATE POLICY cb_compras_accounting_select ON public.compras
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

DROP POLICY IF EXISTS cb_compra_fiscal_accounting_select ON public.compra_fiscal;
CREATE POLICY cb_compra_fiscal_accounting_select ON public.compra_fiscal
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

DROP POLICY IF EXISTS cb_proveedores_accounting_select ON public.proveedores;
CREATE POLICY cb_proveedores_accounting_select ON public.proveedores
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

DROP POLICY IF EXISTS cb_cuentas_pagar_accounting_select ON public.cuentas_pagar;
CREATE POLICY cb_cuentas_pagar_accounting_select ON public.cuentas_pagar
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

DROP POLICY IF EXISTS cb_cuentas_cobrar_accounting_select ON public.cuentas_cobrar;
CREATE POLICY cb_cuentas_cobrar_accounting_select ON public.cuentas_cobrar
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));

DROP POLICY IF EXISTS cb_ecf_documents_accounting_select ON public.ecf_documents;
CREATE POLICY cb_ecf_documents_accounting_select ON public.ecf_documents
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['contabilidad']));
