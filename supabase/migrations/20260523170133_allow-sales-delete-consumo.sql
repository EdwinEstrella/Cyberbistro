-- Drop old cb_consumos_delete policy
DROP POLICY IF EXISTS cb_consumos_delete ON public.consumos;

-- Create new cb_consumos_delete policy that allows both admin and cajera roles to delete
CREATE POLICY cb_consumos_delete ON public.consumos
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_users tu
      WHERE tu.tenant_id = consumos.tenant_id
        AND tu.activo IS TRUE
        AND tu.rol IN ('admin', 'cajera')
        AND (
          tu.auth_user_id = public.cloudix_auth_user_id()
          OR (
            tu.auth_user_id IS NULL
            AND lower(tu.email) = lower(public.cloudix_auth_email())
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
