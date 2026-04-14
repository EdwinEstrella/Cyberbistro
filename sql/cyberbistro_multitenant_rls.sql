-- Políticas RLS multitenant para tablas de negocio.
-- Ejecutar una vez por backend (idempotente) desde InsForge SQL editor o MCP run-raw-sql.

CREATE OR REPLACE FUNCTION public.cyberbistro_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
    NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.cyberbistro_auth_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.email', true), ''),
    NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '')
  );
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['facturas','consumos','comandas','mesas_estado','cocina_estado','platos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS cb_%I_tenant_isolation ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY cb_%I_tenant_isolation ON public.%I
       FOR ALL
       USING (
         EXISTS (
           SELECT 1
           FROM public.tenant_users tu
           WHERE tu.tenant_id = %I.tenant_id
             AND tu.activo IS TRUE
             AND (
               tu.auth_user_id = public.cyberbistro_auth_user_id()
               OR (
                 tu.auth_user_id IS NULL
                 AND lower(tu.email) = lower(public.cyberbistro_auth_email())
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
               tu.auth_user_id = public.cyberbistro_auth_user_id()
               OR (
                 tu.auth_user_id IS NULL
                 AND lower(tu.email) = lower(public.cyberbistro_auth_email())
               )
             )
         )
       )',
      t, t, t, t
    );
  END LOOP;
END;
$$;
