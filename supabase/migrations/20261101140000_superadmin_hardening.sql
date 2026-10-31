-- Migration: Super admin hardening (identity by user id, not by email)
-- Removes hardcoded email bypass and secures super admin identity via auth_user_id.
-- Introduces cyberbistro_am_i_super_admin() RPC and superadmin_audit_log with triggers.

-- 1. Recreate BOTH functions without email checks
CREATE OR REPLACE FUNCTION public.cyberbistro_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cyberbistro_super_admins sa
    WHERE sa.auth_user_id = public.cyberbistro_auth_user_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.cloudix_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cyberbistro_super_admins sa
    WHERE sa.auth_user_id = public.cloudix_auth_user_id()
  );
$$;

-- 2. Client wrapper RPC for checking super admin status
CREATE OR REPLACE FUNCTION public.cyberbistro_am_i_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.cyberbistro_is_super_admin();
$$;

REVOKE ALL ON FUNCTION public.cyberbistro_am_i_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cyberbistro_am_i_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.cyberbistro_am_i_super_admin() TO authenticated;

-- 3. Super admin audit log table
CREATE TABLE IF NOT EXISTS public.superadmin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_user_id uuid,
  action text NOT NULL,
  tenant_id uuid NULL,
  target_id text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_superadmin_audit_log_created_at
  ON public.superadmin_audit_log (created_at DESC);

ALTER TABLE public.superadmin_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.superadmin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.superadmin_audit_log TO authenticated;

DROP POLICY IF EXISTS superadmin_audit_log_select_policy ON public.superadmin_audit_log;
CREATE POLICY superadmin_audit_log_select_policy
  ON public.superadmin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.cyberbistro_is_super_admin());

-- 4. Triggers to audit sensitive tenant and tenant_user changes
CREATE OR REPLACE FUNCTION public.cyberbistro_audit_tenant_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_details jsonb := '{}'::jsonb;
  v_actor uuid := COALESCE(public.cyberbistro_auth_user_id(), public.cloudix_auth_user_id());
BEGIN
  -- Insert a row ONLY when cyberbistro_is_super_admin() is true
  IF NOT public.cyberbistro_is_super_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.superadmin_audit_log (
      actor_auth_user_id,
      action,
      tenant_id,
      target_id,
      details,
      created_at
    ) VALUES (
      v_actor,
      'tenant.delete',
      OLD.id,
      OLD.id::text,
      jsonb_build_object(
        'nombre_negocio', OLD.nombre_negocio,
        'rnc', OLD.rnc,
        'plan', OLD.plan,
        'activa', OLD.activa
      ),
      now()
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.plan IS DISTINCT FROM NEW.plan THEN
      v_details := v_details || jsonb_build_object('plan', jsonb_build_object('old', OLD.plan, 'new', NEW.plan));
    END IF;
    IF OLD.activa IS DISTINCT FROM NEW.activa THEN
      v_details := v_details || jsonb_build_object('activa', jsonb_build_object('old', OLD.activa, 'new', NEW.activa));
    END IF;
    IF OLD.sucursal_limit IS DISTINCT FROM NEW.sucursal_limit THEN
      v_details := v_details || jsonb_build_object('sucursal_limit', jsonb_build_object('old', OLD.sucursal_limit, 'new', NEW.sucursal_limit));
    END IF;
    IF OLD.sucursal_limit_enabled IS DISTINCT FROM NEW.sucursal_limit_enabled THEN
      v_details := v_details || jsonb_build_object('sucursal_limit_enabled', jsonb_build_object('old', OLD.sucursal_limit_enabled, 'new', NEW.sucursal_limit_enabled));
    END IF;
    IF OLD.user_limit_enabled IS DISTINCT FROM NEW.user_limit_enabled THEN
      v_details := v_details || jsonb_build_object('user_limit_enabled', jsonb_build_object('old', OLD.user_limit_enabled, 'new', NEW.user_limit_enabled));
    END IF;
    IF OLD.admin_user_limit IS DISTINCT FROM NEW.admin_user_limit THEN
      v_details := v_details || jsonb_build_object('admin_user_limit', jsonb_build_object('old', OLD.admin_user_limit, 'new', NEW.admin_user_limit));
    END IF;
    IF OLD.cajera_user_limit IS DISTINCT FROM NEW.cajera_user_limit THEN
      v_details := v_details || jsonb_build_object('cajera_user_limit', jsonb_build_object('old', OLD.cajera_user_limit, 'new', NEW.cajera_user_limit));
    END IF;
    IF OLD.cocina_user_limit IS DISTINCT FROM NEW.cocina_user_limit THEN
      v_details := v_details || jsonb_build_object('cocina_user_limit', jsonb_build_object('old', OLD.cocina_user_limit, 'new', NEW.cocina_user_limit));
    END IF;
    IF OLD.mesero_user_limit IS DISTINCT FROM NEW.mesero_user_limit THEN
      v_details := v_details || jsonb_build_object('mesero_user_limit', jsonb_build_object('old', OLD.mesero_user_limit, 'new', NEW.mesero_user_limit));
    END IF;
    IF OLD.payment_day_of_month IS DISTINCT FROM NEW.payment_day_of_month THEN
      v_details := v_details || jsonb_build_object('payment_day_of_month', jsonb_build_object('old', OLD.payment_day_of_month, 'new', NEW.payment_day_of_month));
    END IF;

    IF v_details <> '{}'::jsonb THEN
      INSERT INTO public.superadmin_audit_log (
        actor_auth_user_id,
        action,
        tenant_id,
        target_id,
        details,
        created_at
      ) VALUES (
        v_actor,
        'tenant.update',
        NEW.id,
        NEW.id::text,
        v_details,
        now()
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.cyberbistro_audit_tenant_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_tenants_superadmin ON public.tenants;
CREATE TRIGGER trg_audit_tenants_superadmin
  AFTER UPDATE OR DELETE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.cyberbistro_audit_tenant_changes();

CREATE OR REPLACE FUNCTION public.cyberbistro_audit_tenant_user_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_details jsonb := '{}'::jsonb;
  v_actor uuid := COALESCE(public.cyberbistro_auth_user_id(), public.cloudix_auth_user_id());
BEGIN
  -- Insert a row ONLY when cyberbistro_is_super_admin() is true
  IF NOT public.cyberbistro_is_super_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.superadmin_audit_log (
      actor_auth_user_id,
      action,
      tenant_id,
      target_id,
      details,
      created_at
    ) VALUES (
      v_actor,
      'tenant_user.delete',
      OLD.tenant_id,
      OLD.id::text,
      jsonb_build_object(
        'email', OLD.email,
        'rol', OLD.rol,
        'activo', OLD.activo,
        'nombre', OLD.nombre,
        'auth_user_id', OLD.auth_user_id
      ),
      now()
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.activo IS DISTINCT FROM NEW.activo THEN
      v_details := v_details || jsonb_build_object('activo', jsonb_build_object('old', OLD.activo, 'new', NEW.activo));
    END IF;
    IF OLD.rol IS DISTINCT FROM NEW.rol THEN
      v_details := v_details || jsonb_build_object('rol', jsonb_build_object('old', OLD.rol, 'new', NEW.rol));
    END IF;

    IF v_details <> '{}'::jsonb THEN
      v_details := v_details || jsonb_build_object('email', NEW.email);
      INSERT INTO public.superadmin_audit_log (
        actor_auth_user_id,
        action,
        tenant_id,
        target_id,
        details,
        created_at
      ) VALUES (
        v_actor,
        'tenant_user.update',
        NEW.tenant_id,
        NEW.id::text,
        v_details,
        now()
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.cyberbistro_audit_tenant_user_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_tenant_users_superadmin ON public.tenant_users;
CREATE TRIGGER trg_audit_tenant_users_superadmin
  AFTER UPDATE OR DELETE ON public.tenant_users
  FOR EACH ROW
  EXECUTE FUNCTION public.cyberbistro_audit_tenant_user_changes();
