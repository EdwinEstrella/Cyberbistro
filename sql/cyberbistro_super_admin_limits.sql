-- Cuotas de usuarios por restaurante para el panel de Super Admin.
-- Ejecutar una vez en el SQL editor del backend real de CyberBistro.

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

CREATE TABLE IF NOT EXISTS public.cyberbistro_super_admins (
  auth_user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- IMPORTANTE:
-- Reemplaza el UUID por el auth_user_id que muestra la pantalla Super Admin.
-- El correo solo no siempre llega en los claims RLS; el sub/auth_user_id es el dato estable.
-- INSERT INTO public.cyberbistro_super_admins (auth_user_id, email)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'admin@gmail.com')
-- ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email;

CREATE OR REPLACE FUNCTION public.cyberbistro_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cyberbistro_super_admins sa
    WHERE sa.auth_user_id = public.cyberbistro_auth_user_id()
      AND lower(sa.email) = 'admin@gmail.com'
  )
  OR lower(COALESCE(public.cyberbistro_auth_email(), '')) = 'admin@gmail.com';
$$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS user_limit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_user_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cajera_user_limit integer NULL,
  ADD COLUMN IF NOT EXISTS cocina_user_limit integer NULL,
  ADD COLUMN IF NOT EXISTS mesero_user_limit integer NULL;

UPDATE public.tenants
SET admin_user_limit = 1
WHERE admin_user_limit IS DISTINCT FROM 1;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_admin_user_limit_check,
  DROP CONSTRAINT IF EXISTS tenants_cajera_user_limit_check,
  DROP CONSTRAINT IF EXISTS tenants_cocina_user_limit_check,
  DROP CONSTRAINT IF EXISTS tenants_mesero_user_limit_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_admin_user_limit_check CHECK (admin_user_limit IS NULL OR admin_user_limit >= 0),
  ADD CONSTRAINT tenants_cajera_user_limit_check CHECK (cajera_user_limit IS NULL OR cajera_user_limit >= 0),
  ADD CONSTRAINT tenants_cocina_user_limit_check CHECK (cocina_user_limit IS NULL OR cocina_user_limit >= 0),
  ADD CONSTRAINT tenants_mesero_user_limit_check CHECK (mesero_user_limit IS NULL OR mesero_user_limit >= 0);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_tenants_super_admin_all ON public.tenants;
DROP POLICY IF EXISTS cb_tenant_users_super_admin_all ON public.tenant_users;
DROP POLICY IF EXISTS cb_tenant_users_self_select ON public.tenant_users;
DROP POLICY IF EXISTS cb_tenants_member_select ON public.tenants;

CREATE POLICY cb_tenants_super_admin_all
ON public.tenants
FOR ALL
USING (public.cyberbistro_is_super_admin())
WITH CHECK (public.cyberbistro_is_super_admin());

CREATE POLICY cb_tenant_users_super_admin_all
ON public.tenant_users
FOR ALL
USING (public.cyberbistro_is_super_admin())
WITH CHECK (public.cyberbistro_is_super_admin());

-- Usuarios normales: necesario para que login pueda resolver su restaurante.
-- Sin esta policy, activar RLS aqui rompe cuentas existentes que no sean super admin.
CREATE POLICY cb_tenant_users_self_select
ON public.tenant_users
FOR SELECT
USING (
  auth_user_id = public.cyberbistro_auth_user_id()
  OR lower(email) = lower(COALESCE(public.cyberbistro_auth_email(), ''))
);

CREATE POLICY cb_tenants_member_select
ON public.tenants
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = tenants.id
      AND (
        tu.auth_user_id = public.cyberbistro_auth_user_id()
        OR lower(tu.email) = lower(COALESCE(public.cyberbistro_auth_email(), ''))
      )
  )
);

CREATE OR REPLACE FUNCTION public.cyberbistro_resolve_tenant_user()
RETURNS TABLE (
  tenant_id uuid,
  email text,
  rol text,
  nombre text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tu.tenant_id, tu.email, tu.rol, tu.nombre
  FROM public.tenant_users tu
  WHERE tu.auth_user_id = public.cyberbistro_auth_user_id()
     OR lower(tu.email) = lower(COALESCE(public.cyberbistro_auth_email(), ''))
  ORDER BY (tu.auth_user_id = public.cyberbistro_auth_user_id()) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cyberbistro_super_admin_delete_tenant_user(p_tenant_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_row public.tenant_users%ROWTYPE;
BEGIN
  IF NOT public.cyberbistro_is_super_admin() THEN
    RAISE EXCEPTION 'Solo super admin puede eliminar usuarios';
  END IF;

  SELECT *
  INTO target_row
  FROM public.tenant_users
  WHERE id = p_tenant_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF target_row.rol = 'admin' THEN
    RAISE EXCEPTION 'El admin dueño no se elimina individualmente; bloquea el restaurante completo';
  END IF;

  IF target_row.auth_user_id IS NOT NULL THEN
    UPDATE public.cierres_operativos
    SET
      opened_by_auth_user_id = CASE
        WHEN opened_by_auth_user_id = target_row.auth_user_id THEN NULL
        ELSE opened_by_auth_user_id
      END,
      closed_by_auth_user_id = CASE
        WHEN closed_by_auth_user_id = target_row.auth_user_id THEN NULL
        ELSE closed_by_auth_user_id
      END
    WHERE tenant_id = target_row.tenant_id
      AND (
        opened_by_auth_user_id = target_row.auth_user_id
        OR closed_by_auth_user_id = target_row.auth_user_id
      );

    UPDATE public.comandas
    SET creado_por = NULL
    WHERE tenant_id = target_row.tenant_id
      AND creado_por = target_row.auth_user_id::text;
  END IF;

  DELETE FROM public.tenant_users
  WHERE id = target_row.id;

  IF target_row.auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users
    WHERE id = target_row.auth_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_tenant_user_id', target_row.id,
    'deleted_auth_user_id', target_row.auth_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cyberbistro_super_admin_block_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_users integer := 0;
BEGIN
  IF NOT public.cyberbistro_is_super_admin() THEN
    RAISE EXCEPTION 'Solo super admin puede bloquear restaurantes';
  END IF;

  UPDATE public.tenants
  SET activa = false
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurante no encontrado';
  END IF;

  UPDATE public.tenant_users
  SET activo = false
  WHERE tenant_id = p_tenant_id;

  GET DIAGNOSTICS affected_users = ROW_COUNT;

  UPDATE public.cocina_estado
  SET activa = false, changed_at = now()
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'blocked_users', affected_users
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cyberbistro_super_admin_delete_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  auth_ids uuid[];
  deleted_users integer := 0;
BEGIN
  IF NOT public.cyberbistro_is_super_admin() THEN
    RAISE EXCEPTION 'Solo super admin puede eliminar restaurantes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Restaurante no encontrado';
  END IF;

  SELECT COALESCE(array_agg(auth_user_id) FILTER (WHERE auth_user_id IS NOT NULL), ARRAY[]::uuid[])
  INTO auth_ids
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id;

  DELETE FROM public.consumos WHERE tenant_id = p_tenant_id;
  DELETE FROM public.facturas WHERE tenant_id = p_tenant_id;
  DELETE FROM public.comandas WHERE tenant_id = p_tenant_id;
  DELETE FROM public.mesas_estado WHERE tenant_id = p_tenant_id;
  DELETE FROM public.cocina_estado WHERE tenant_id = p_tenant_id;
  DELETE FROM public.platos WHERE tenant_id = p_tenant_id;
  DELETE FROM public.cierres_operativos WHERE tenant_id = p_tenant_id;
  DELETE FROM public.tenant_users WHERE tenant_id = p_tenant_id;

  GET DIAGNOSTICS deleted_users = ROW_COUNT;

  DELETE FROM public.tenants WHERE id = p_tenant_id;

  IF array_length(auth_ids, 1) IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(auth_ids);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id,
    'deleted_users', deleted_users
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cyberbistro_super_admin_delete_tenant_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cyberbistro_super_admin_block_tenant(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cyberbistro_super_admin_delete_tenant(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cyberbistro_resolve_tenant_user() TO PUBLIC;
