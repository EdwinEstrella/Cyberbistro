-- Registro inicial de tenant + usuario dueño sin pelearse con RLS.
-- Ejecutar una vez en el backend desde InsForge SQL editor o MCP run-raw-sql.

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

CREATE OR REPLACE FUNCTION public.cyberbistro_register_tenant(
  p_auth_user_id uuid,
  p_email text,
  p_nombre_negocio text,
  p_rnc text DEFAULT NULL,
  p_direccion text DEFAULT NULL,
  p_telefono text DEFAULT NULL
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
    activa
  )
  VALUES (
    trim(p_nombre_negocio),
    NULLIF(trim(COALESCE(p_rnc, '')), ''),
    NULLIF(trim(COALESCE(p_direccion, '')), ''),
    NULLIF(trim(COALESCE(p_telefono, '')), ''),
    true
  )
  RETURNING id INTO v_tenant_id;

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

GRANT EXECUTE ON FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text) TO PUBLIC;

-- Fuerza a PostgREST/InsForge a refrescar el schema cache para exponer la RPC inmediatamente.
NOTIFY pgrst, 'reload schema';
