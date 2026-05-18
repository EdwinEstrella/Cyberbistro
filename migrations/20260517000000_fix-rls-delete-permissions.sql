-- Migración para arreglar la vulnerabilidad crítica de permisos RLS
-- Divide las políticas FOR ALL en políticas separadas por operación y restringe DELETE al rol admin.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['facturas','consumos','comandas','mesas_estado','cocina_estado','platos','cierres_operativos','gastos'] LOOP
    
    -- Eliminar la política insegura anterior
    EXECUTE format('DROP POLICY IF EXISTS cb_%I_tenant_isolation ON public.%I', t, t);
    
    -- Política de LECTURA (SELECT): Cualquier usuario activo del restaurante
    EXECUTE format(
      'CREATE POLICY cb_%I_select ON public.%I
       FOR SELECT
       USING (
         EXISTS (
           SELECT 1
           FROM public.tenant_users tu
           WHERE tu.tenant_id = %I.tenant_id
             AND tu.activo IS TRUE
             AND (
               tu.auth_user_id = public.cloudix_auth_user_id()
               OR (
                 tu.auth_user_id IS NULL
                 AND lower(tu.email) = lower(public.cloudix_auth_email())
               )
             )
         )
       )',
      t, t, t
    );

    -- Política de ESCRITURA (INSERT, UPDATE): Cualquier usuario activo del restaurante
    EXECUTE format(
      'CREATE POLICY cb_%I_insert_update ON public.%I
       FOR ALL
       USING (
         EXISTS (
           SELECT 1
           FROM public.tenant_users tu
           WHERE tu.tenant_id = %I.tenant_id
             AND tu.activo IS TRUE
             AND (
               tu.auth_user_id = public.cloudix_auth_user_id()
               OR (
                 tu.auth_user_id IS NULL
                 AND lower(tu.email) = lower(public.cloudix_auth_email())
               )
             )
         )
       )
       WITH CHECK (
         EXISTS (
           SELECT 1
           FROM public.tenant_users tu
           WHERE tu.tenant_id = %I.tenant_id
             AND tu.activo IS TRUE
             AND (
               tu.auth_user_id = public.cloudix_auth_user_id()
               OR (
                 tu.auth_user_id IS NULL
                 AND lower(tu.email) = lower(public.cloudix_auth_email())
               )
             )
         )
       )',
      t, t, t, t
    );
    
    -- Modificar la política anterior (FOR ALL) para que sea excluyente de DELETE, o bien crear una específica
    EXECUTE format('DROP POLICY IF EXISTS cb_%I_insert_update ON public.%I', t, t);
    
    -- Política INSERT
    EXECUTE format(
      'CREATE POLICY cb_%I_insert ON public.%I
       FOR INSERT
       WITH CHECK (
         EXISTS (
           SELECT 1 FROM public.tenant_users tu
           WHERE tu.tenant_id = %I.tenant_id AND tu.activo IS TRUE
             AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
         )
       )',
      t, t, t
    );

    -- Política UPDATE
    EXECUTE format(
      'CREATE POLICY cb_%I_update ON public.%I
       FOR UPDATE
       USING (
         EXISTS (
           SELECT 1 FROM public.tenant_users tu
           WHERE tu.tenant_id = %I.tenant_id AND tu.activo IS TRUE
             AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
         )
       )
       WITH CHECK (
         EXISTS (
           SELECT 1 FROM public.tenant_users tu
           WHERE tu.tenant_id = %I.tenant_id AND tu.activo IS TRUE
             AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
         )
       )',
      t, t, t, t
    );

    -- Política DELETE restrictiva (SOLO ADMIN)
    EXECUTE format(
      'CREATE POLICY cb_%I_delete ON public.%I
       FOR DELETE
       USING (
         EXISTS (
           SELECT 1 FROM public.tenant_users tu
           WHERE tu.tenant_id = %I.tenant_id 
             AND tu.activo IS TRUE 
             AND tu.rol = ''admin''
             AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
         )
       )',
      t, t, t
    );

  END LOOP;
END;
$$;
NOTIFY pgrst, 'reload schema';