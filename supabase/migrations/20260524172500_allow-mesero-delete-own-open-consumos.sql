-- Allow service roles to delete consumos, and allow mesero/camarera users to
-- remove only their own still-open mesa items from the app. This keeps sent
-- items removable when a product is unavailable without granting broad delete
-- access over other users' consumos or paid history.
DROP POLICY IF EXISTS cb_consumos_delete ON public.consumos;

CREATE POLICY cb_consumos_delete ON public.consumos
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_users tu
      WHERE tu.tenant_id = consumos.tenant_id
        AND tu.activo IS TRUE
        AND (
          tu.auth_user_id = public.cloudix_auth_user_id()
          OR (
            tu.auth_user_id IS NULL
            AND lower(tu.email) = lower(public.cloudix_auth_email())
          )
        )
        AND (
          tu.rol IN ('admin', 'cajera')
          OR (
            tu.rol IN ('mesero', 'camarera')
            AND consumos.estado <> 'pagado'
            AND consumos.created_by_auth_user_id = public.cloudix_auth_user_id()
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
