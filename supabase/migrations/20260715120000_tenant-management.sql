-- Tenant lifecycle hard-delete and payment alert configuration.
-- The catalog-driven FK rewrite also covers tables introduced after the original RPC,
-- including public.payments, which is tenant-owned in the repository schema.
DO $do$
DECLARE
  tenant_table record;
  fk record;
  orphan_count bigint;
BEGIN
  -- Every repository table with a tenant_id column is tenant-owned. Validate
  -- orphan rows before changing constraints so a failed migration is safe and
  -- actionable instead of silently leaving a table outside the delete graph.
  FOR tenant_table IN
    SELECT c.relname AS table_name, a.attnum
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> 'tenants'
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I child WHERE child.tenant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenants parent WHERE parent.id = child.tenant_id)',
      tenant_table.table_name
    ) INTO orphan_count;
    IF orphan_count > 0 THEN
      RAISE EXCEPTION 'Cannot enforce tenant cascade on %.%: % orphan tenant_id rows found',
        'public', tenant_table.table_name, orphan_count;
    END IF;

    -- Replace any existing tenant_id FK (including an incorrect parent or
    -- RESTRICT action) with one canonical cascade constraint.
    FOR fk IN
      SELECT con.conname AS constraint_name
      FROM pg_constraint con
      WHERE con.conrelid = format('public.%I', tenant_table.table_name)::regclass
        AND con.contype = 'f'
        AND con.conkey = ARRAY[tenant_table.attnum]::smallint[]
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tenant_table.table_name, fk.constraint_name);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE',
      tenant_table.table_name, tenant_table.table_name || '_tenant_id_fkey'
    );
  END LOOP;
END
$do$;

DO $do$
DECLARE
  duplicate_auth_user record;
BEGIN
  -- The Auth identity is the tenant boundary. Fail before creating the unique
  -- index so operators can repair duplicates deterministically.
  SELECT auth_user_id, array_agg(id ORDER BY id) AS tenant_user_ids, count(*) AS duplicate_count
    INTO duplicate_auth_user
    FROM public.tenant_users
   WHERE auth_user_id IS NOT NULL
   GROUP BY auth_user_id
  HAVING count(*) > 1
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Duplicate auth_user_id % in tenant_users rows %; repair before migration',
      duplicate_auth_user.auth_user_id, duplicate_auth_user.tenant_user_ids;
  END IF;
END
$do$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_auth_user_id_unique
  ON public.tenant_users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS payment_day_of_month smallint;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_payment_day_of_month_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_payment_day_of_month_check
  CHECK (payment_day_of_month IS NULL OR payment_day_of_month BETWEEN 1 AND 31);

CREATE OR REPLACE FUNCTION public.cloudix_super_admin_delete_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  auth_ids uuid[];
  deleted_users integer := 0;
BEGIN
  IF NOT public.cloudix_is_super_admin() THEN
    RAISE EXCEPTION 'Solo super admin puede eliminar restaurantes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Restaurante no encontrado';
  END IF;

  SELECT COALESCE(array_agg(auth_user_id) FILTER (WHERE auth_user_id IS NOT NULL), ARRAY[]::uuid[])
    INTO auth_ids
    FROM public.tenant_users
   WHERE tenant_id = p_tenant_id;

  -- Auth IDs must be captured before the tenant cascade removes tenant_users.
  IF cardinality(auth_ids) > 0 THEN
    DELETE FROM auth.users WHERE id = ANY(auth_ids);
    GET DIAGNOSTICS deleted_users = ROW_COUNT;
  END IF;

  DELETE FROM public.tenants WHERE id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'tenant_id', p_tenant_id, 'deleted_users', deleted_users);
END;
$$;

NOTIFY pgrst, 'reload schema';
