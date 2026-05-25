-- Enforce valid subscription plans and active branch limits at the database layer.

CREATE OR REPLACE FUNCTION public.cyberbistro_default_sucursal_limit(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_plan, 'basico')))
    WHEN 'basico' THEN 1
    WHEN 'profesional' THEN 3
    WHEN 'empresarial' THEN NULL::integer
    ELSE 1
  END;
$$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS sucursal_limit_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sucursal_limit integer NULL;

UPDATE public.tenants
SET plan = lower(trim(COALESCE(plan, 'basico')))
WHERE plan IS DISTINCT FROM lower(trim(COALESCE(plan, 'basico')));

UPDATE public.tenants
SET plan = 'basico'
WHERE plan IS NULL
   OR plan NOT IN ('basico', 'profesional', 'empresarial');

UPDATE public.tenants
SET sucursal_limit = COALESCE(sucursal_limit, public.cyberbistro_default_sucursal_limit(plan))
WHERE plan IN ('basico', 'profesional');

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_plan_allowed;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_plan_allowed
  CHECK (plan IN ('basico', 'profesional', 'empresarial'));

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_sucursal_limit_non_negative;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_sucursal_limit_non_negative
  CHECK (sucursal_limit IS NULL OR sucursal_limit >= 1);

CREATE OR REPLACE FUNCTION public.normalize_tenant_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_default integer;
BEGIN
  NEW.plan := lower(trim(COALESCE(NEW.plan, 'basico')));

  IF NEW.plan NOT IN ('basico', 'profesional', 'empresarial') THEN
    RAISE EXCEPTION 'plan inválido: %', NEW.plan;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sucursal_limit IS NULL THEN
      NEW.sucursal_limit := public.cyberbistro_default_sucursal_limit(NEW.plan);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    v_previous_default := public.cyberbistro_default_sucursal_limit(OLD.plan);

    IF NEW.sucursal_limit IS NULL OR NEW.sucursal_limit IS NOT DISTINCT FROM v_previous_default THEN
      NEW.sucursal_limit := public.cyberbistro_default_sucursal_limit(NEW.plan);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_tenant_plan_limits_trg ON public.tenants;

CREATE TRIGGER normalize_tenant_plan_limits_trg
  BEFORE INSERT OR UPDATE OF plan
  ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_tenant_plan_limits();

CREATE OR REPLACE FUNCTION public.check_sucursal_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_limit_enabled boolean;
  v_configured_limit integer;
  v_effective_limit integer;
  v_active_count integer;
BEGIN
  IF NEW.activa IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT
    lower(trim(COALESCE(t.plan, 'basico'))),
    COALESCE(t.sucursal_limit_enabled, true),
    t.sucursal_limit
  INTO v_plan, v_limit_enabled, v_configured_limit
  FROM public.tenants t
  WHERE t.id = NEW.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant no encontrado para validar límite de sucursales';
  END IF;

  IF v_limit_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_effective_limit := COALESCE(v_configured_limit, public.cyberbistro_default_sucursal_limit(v_plan));

  IF v_effective_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO v_active_count
  FROM public.sucursales s
  WHERE s.tenant_id = NEW.tenant_id
    AND s.activa IS TRUE
    AND (TG_OP = 'INSERT' OR s.id <> NEW.id);

  IF v_active_count >= v_effective_limit THEN
    RAISE EXCEPTION 'Límite de sucursales activas alcanzado para el plan % (%).', v_plan, v_effective_limit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sucursal_plan_limits_trg ON public.sucursales;

CREATE TRIGGER enforce_sucursal_plan_limits_trg
  BEFORE INSERT OR UPDATE OF tenant_id, activa
  ON public.sucursales
  FOR EACH ROW
  EXECUTE FUNCTION public.check_sucursal_plan_limits();

DROP FUNCTION IF EXISTS public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.cyberbistro_register_tenant(
  p_auth_user_id uuid,
  p_email text,
  p_nombre_negocio text,
  p_rnc text DEFAULT NULL,
  p_direccion text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_plan text DEFAULT 'basico'
)
RETURNS TABLE (
  tenant_id uuid,
  email text,
  rol text,
  nombre text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_auth_user_id uuid := public.cyberbistro_auth_user_id();
  v_claim_email text := public.cyberbistro_auth_email();
  v_tenant_id uuid;
  v_plan text := lower(trim(COALESCE(p_plan, 'basico')));
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_id requerido';
  END IF;

  IF NULLIF(trim(p_email), '') IS NULL THEN
    RAISE EXCEPTION 'email requerido';
  END IF;

  IF NULLIF(trim(p_nombre_negocio), '') IS NULL THEN
    RAISE EXCEPTION 'nombre del negocio requerido';
  END IF;

  IF v_plan NOT IN ('basico', 'profesional', 'empresarial') THEN
    RAISE EXCEPTION 'plan inválido: %', p_plan;
  END IF;

  IF v_claim_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'sesión autenticada requerida para registrar tenant';
  END IF;

  IF v_claim_auth_user_id <> p_auth_user_id THEN
    RAISE EXCEPTION 'el usuario autenticado no coincide con el registro solicitado';
  END IF;

  IF v_claim_email IS NOT NULL AND lower(v_claim_email) <> lower(trim(p_email)) THEN
    RAISE EXCEPTION 'el correo autenticado no coincide con el registro solicitado';
  END IF;

  INSERT INTO public.tenants (
    nombre_negocio,
    rnc,
    direccion,
    telefono,
    activa,
    plan,
    sucursal_limit_enabled,
    sucursal_limit
  )
  VALUES (
    trim(p_nombre_negocio),
    NULLIF(trim(COALESCE(p_rnc, '')), ''),
    NULLIF(trim(COALESCE(p_direccion, '')), ''),
    NULLIF(trim(COALESCE(p_telefono, '')), ''),
    true,
    v_plan,
    true,
    public.cyberbistro_default_sucursal_limit(v_plan)
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.sucursales (
    tenant_id,
    nombre,
    direccion,
    telefono,
    activa
  )
  VALUES (
    v_tenant_id,
    'Sucursal Central',
    NULLIF(trim(COALESCE(p_direccion, '')), ''),
    NULLIF(trim(COALESCE(p_telefono, '')), ''),
    true
  );

  INSERT INTO public.tenant_users (
    auth_user_id,
    tenant_id,
    email,
    password_hash,
    rol,
    nombre,
    activo
  )
  VALUES (
    p_auth_user_id,
    v_tenant_id,
    trim(p_email),
    'MANAGED_BY_AUTH',
    'admin',
    trim(p_nombre_negocio),
    true
  );

  RETURN QUERY
  SELECT
    v_tenant_id,
    trim(p_email),
    'admin'::text,
    trim(p_nombre_negocio);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text) TO PUBLIC;

NOTIFY pgrst, 'reload schema';
