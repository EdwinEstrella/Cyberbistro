-- Invoice issuers (admin + cashier/sales roles) need to check certificate readiness
-- to stamp e-CF checkouts; secret columns stay protected by column-level grants.

BEGIN;

DROP POLICY IF EXISTS cb_ecf_certificate_metadata_admin_select ON public.ecf_certificate_metadata;
DROP POLICY IF EXISTS cb_ecf_certificate_metadata_issuer_select ON public.ecf_certificate_metadata;
DROP POLICY IF EXISTS cb_ecf_certificate_metadata_member_select ON public.ecf_certificate_metadata;

CREATE POLICY cb_ecf_certificate_metadata_issuer_select ON public.ecf_certificate_metadata
  FOR SELECT TO authenticated
  USING (
    public.cyberbistro_has_tenant_role(
      tenant_id,
      ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']
    )
  );

COMMIT;
