-- Reviewed source only. This migration is not executed by the application.
-- Suspension changes tenants.activa only; staff activation is an independent state.

CREATE OR REPLACE FUNCTION public.cloudix_super_admin_block_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.cloudix_is_super_admin() THEN
    RAISE EXCEPTION 'Solo super admin puede bloquear restaurantes';
  END IF;
  UPDATE public.tenants SET activa = false WHERE id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  RETURN jsonb_build_object('ok', true, 'tenant_id', p_tenant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cloudix_super_admin_unblock_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.cloudix_is_super_admin() THEN
    RAISE EXCEPTION 'Solo super admin puede desbloquear restaurantes';
  END IF;
  UPDATE public.tenants SET activa = true WHERE id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurante no encontrado'; END IF;
  RETURN jsonb_build_object('ok', true, 'tenant_id', p_tenant_id);
END;
$$;

-- Never let an email claim override a different Auth binding.
DROP POLICY IF EXISTS cb_tenant_users_self_select ON public.tenant_users;
CREATE POLICY cb_tenant_users_self_select
ON public.tenant_users FOR SELECT TO public
USING (
  auth_user_id = public.cloudix_auth_user_id()
  OR (auth_user_id IS NULL AND lower(email) = lower(COALESCE(public.cloudix_auth_email(), '')))
);

DROP POLICY IF EXISTS cb_tenants_member_select ON public.tenants;
CREATE POLICY cb_tenants_member_select
ON public.tenants FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenants.id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
      )
  )
);

DROP POLICY IF EXISTS cb_tenants_isolation ON public.tenants;
CREATE POLICY cb_tenants_isolation
ON public.tenants FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenants.id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenants.id
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
      )
  )
);

CREATE OR REPLACE FUNCTION public.cloudix_resolve_tenant_user()
RETURNS TABLE (tenant_id uuid, email text, rol text, nombre text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT tu.tenant_id, tu.email, tu.rol, tu.nombre
  FROM public.tenant_users tu
  WHERE tu.auth_user_id = public.cloudix_auth_user_id()
     OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
  ORDER BY (tu.auth_user_id = public.cloudix_auth_user_id()) DESC
  LIMIT 1;
$$;

-- Restaurant owners may create or permanently delete staff, but may not toggle
-- tenant_users.activo (nor silently reactivate a deliberately disabled user).
DROP POLICY IF EXISTS cb_tenant_users_admin_staff_update ON public.tenant_users;

CREATE OR REPLACE FUNCTION public.cloudix_publish_tenant_user_access_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, realtime
AS $$
DECLARE
  target_auth_id uuid := COALESCE(NEW.auth_user_id, OLD.auth_user_id);
  target_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_active boolean := CASE WHEN TG_OP = 'DELETE' THEN false ELSE COALESCE(NEW.activo, false) END;
BEGIN
  IF target_auth_id IS NOT NULL THEN
    PERFORM realtime.publish(
      'tenant-access-user:' || target_auth_id::text,
      'tenant_user_access_changed',
      jsonb_build_object(
        'user_id', target_auth_id,
        'tenant_id', target_tenant_id,
        'activo', target_active,
        'revoked', NOT target_active,
        'reason', CASE WHEN TG_OP = 'DELETE' THEN 'deleted' ELSE 'inactive' END
      )
    );
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_user_access_realtime_update ON public.tenant_users;
CREATE TRIGGER tenant_user_access_realtime_update
AFTER UPDATE OF activo ON public.tenant_users
FOR EACH ROW WHEN (OLD.activo IS DISTINCT FROM NEW.activo)
EXECUTE FUNCTION public.cloudix_publish_tenant_user_access_change();

DROP TRIGGER IF EXISTS tenant_user_access_realtime_delete ON public.tenant_users;
CREATE TRIGGER tenant_user_access_realtime_delete
AFTER DELETE ON public.tenant_users
FOR EACH ROW EXECUTE FUNCTION public.cloudix_publish_tenant_user_access_change();

DROP POLICY IF EXISTS cloudix_tenant_access_channel_select ON realtime.channels;
CREATE POLICY cloudix_tenant_access_channel_select ON realtime.channels
FOR SELECT TO authenticated
USING (
  (pattern = 'tenant-access:%' AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = NULLIF(split_part(realtime.channel_name(), ':', 2), '')::uuid
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id()
        OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), ''))))
  ))
  OR (pattern = 'tenant-access-user:%' AND split_part(realtime.channel_name(), ':', 2) = public.cloudix_auth_user_id()::text)
  OR pattern NOT IN ('tenant-access:%', 'tenant-access-user:%')
);

DROP POLICY IF EXISTS cloudix_tenant_access_channel_insert ON realtime.channels;
CREATE POLICY cloudix_tenant_access_channel_insert ON realtime.channels
FOR INSERT TO authenticated
WITH CHECK (
  (pattern = 'tenant-access:%' AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = NULLIF(split_part(realtime.channel_name(), ':', 2), '')::uuid
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id()
        OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), ''))))
  ))
  OR (pattern = 'tenant-access-user:%' AND split_part(realtime.channel_name(), ':', 2) = public.cloudix_auth_user_id()::text)
);

INSERT INTO realtime.channels (pattern, description, enabled)
SELECT 'tenant-access-user:%', 'Per-user access revocation events', true
WHERE NOT EXISTS (SELECT 1 FROM realtime.channels WHERE pattern = 'tenant-access-user:%');
