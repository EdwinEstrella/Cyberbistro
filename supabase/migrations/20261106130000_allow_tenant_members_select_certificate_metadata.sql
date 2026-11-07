-- Allow all active tenant members (e.g. admin, cajera, ventas) to select non-secret certificate metadata
-- so cashier terminals can verify certificate readiness and resolve dgii_ecf mode.

DROP POLICY IF EXISTS cb_ecf_certificate_metadata_admin_select ON public.ecf_certificate_metadata;
DROP POLICY IF EXISTS cb_ecf_certificate_metadata_member_select ON public.ecf_certificate_metadata;

CREATE POLICY cb_ecf_certificate_metadata_member_select ON public.ecf_certificate_metadata
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = ecf_certificate_metadata.tenant_id
        AND tu.activo IS TRUE
        AND (
          tu.auth_user_id = public.cloudix_auth_user_id()
          OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
        )
    )
  );
