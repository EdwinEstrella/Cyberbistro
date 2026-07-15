-- A. Tenant registration closure
DROP POLICY IF EXISTS cb_tenants_auth_insert ON public.tenants;
REVOKE INSERT ON public.tenants FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text) TO authenticated;
ALTER FUNCTION public.cyberbistro_register_tenant(uuid, text, text, text, text, text, text) SET search_path TO pg_catalog, public, pg_temp;

-- B. Active fiscal RPC hardening

-- cloudix_reserve_ecf
CREATE OR REPLACE FUNCTION public.cloudix_reserve_ecf(p_tenant_id uuid, p_ncf_tipo text)
 RETURNS TABLE(ncf_fiscal_activo boolean, ncf_tipo_codigo text, seq_reserved integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_auth_user_id uuid := public.cloudix_auth_user_id();
  v_is_member boolean;
  v_fiscal_activo boolean;
  v_tipo_normalizado text;
  v_secuencias jsonb;
  v_seq_actual integer;
  v_seq_siguiente integer;
BEGIN
  -- Add authorization BEFORE any row lock/mutation
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE auth_user_id = v_auth_user_id
      AND tenant_id = p_tenant_id
      AND activo = true
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  -- Validar y normalizar el tipo de e-CF
  v_tipo_normalizado := upper(trim(p_ncf_tipo));
  IF v_tipo_normalizado NOT IN ('E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47') THEN
    RAISE EXCEPTION 'Tipo de e-CF no valido: %', p_ncf_tipo;
  END IF;

  -- Bloquear la fila del tenant para actualización consistente (prevenir colisiones)
  SELECT t.ncf_fiscal_activo, t.ncf_secuencias_por_tipo
  INTO v_fiscal_activo, v_secuencias
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  FOR UPDATE;

  IF v_fiscal_activo IS NOT TRUE THEN
    RAISE EXCEPTION 'NCF fiscal no esta activo para el tenant';
  END IF;

  -- Obtener la secuencia actual (inicializar en 1 si no está definida)
  v_seq_actual := coalesce((v_secuencias->>v_tipo_normalizado)::integer, 1);
  v_seq_siguiente := v_seq_actual + 1;

  -- Actualizar el mapa de secuencias de tipo E en tenants
  UPDATE public.tenants
  SET 
    ncf_secuencias_por_tipo = coalesce(ncf_secuencias_por_tipo, '{}'::jsonb) || jsonb_build_object(v_tipo_normalizado, v_seq_siguiente),
    updated_at = now()
  WHERE id = p_tenant_id;

  RETURN QUERY SELECT TRUE, v_tipo_normalizado, v_seq_actual;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cloudix_reserve_ecf(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_reserve_ecf(uuid, text) TO authenticated;

-- cloudix_reserve_ncf
CREATE OR REPLACE FUNCTION public.cloudix_reserve_ncf(p_tenant_id uuid, p_ncf_tipo text DEFAULT NULL::text)
 RETURNS TABLE(ncf_fiscal_activo boolean, ncf_tipo_codigo text, seq_reserved integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_auth_user_id uuid := public.cloudix_auth_user_id();
  v_is_member boolean;
BEGIN
  -- Add authorization BEFORE any row lock/mutation
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE auth_user_id = v_auth_user_id
      AND tenant_id = p_tenant_id
      AND activo = true
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH tenant_target AS (
    SELECT
      t.id,
      CASE
        WHEN upper(coalesce(t.ncf_tipo_default, 'B01')) IN ('B01', 'B02', 'B14', 'B15', 'B16', 'B17')
          THEN upper(coalesce(t.ncf_tipo_default, 'B01'))
        ELSE 'B01'
      END AS tipo_default_codigo,
      CASE
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) IN ('B01', 'B02', 'B14', 'B15', 'B16', 'B17')
          THEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01'))
        ELSE 'B01'
      END AS tipo_codigo,
      CASE
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B02'
          THEN greatest(coalesce(t.ncf_b02_secuencia_siguiente, 1), 1)
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B14'
          THEN greatest(coalesce(t.ncf_b14_secuencia_siguiente, 1), 1)
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B15'
          THEN greatest(coalesce(t.ncf_b15_secuencia_siguiente, 1), 1)
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B16'
          THEN greatest(coalesce(t.ncf_b16_secuencia_siguiente, 1), 1)
        WHEN upper(coalesce(nullif(trim(p_ncf_tipo), ''), t.ncf_tipo_default, 'B01')) = 'B17'
          THEN greatest(coalesce(t.ncf_b17_secuencia_siguiente, 1), 1)
        ELSE greatest(coalesce(t.ncf_b01_secuencia_siguiente, 1), 1)
      END AS seq_actual
    FROM public.tenants t
    WHERE
      t.id = p_tenant_id
      AND t.ncf_fiscal_activo IS TRUE
    FOR UPDATE
  )
  UPDATE public.tenants t
  SET
    ncf_b01_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B01' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b01_secuencia_siguiente
    END,
    ncf_b02_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B02' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b02_secuencia_siguiente
    END,
    ncf_b14_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B14' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b14_secuencia_siguiente
    END,
    ncf_b15_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B15' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b15_secuencia_siguiente
    END,
    ncf_b16_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B16' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b16_secuencia_siguiente
    END,
    ncf_b17_secuencia_siguiente = CASE
      WHEN tenant_target.tipo_codigo = 'B17' THEN tenant_target.seq_actual + 1
      ELSE t.ncf_b17_secuencia_siguiente
    END,
    ncf_secuencias_por_tipo = jsonb_build_object(
      'B01', CASE
        WHEN tenant_target.tipo_codigo = 'B01' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b01_secuencia_siguiente
      END,
      'B02', CASE
        WHEN tenant_target.tipo_codigo = 'B02' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b02_secuencia_siguiente
      END,
      'B14', CASE
        WHEN tenant_target.tipo_codigo = 'B14' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b14_secuencia_siguiente
      END,
      'B15', CASE
        WHEN tenant_target.tipo_codigo = 'B15' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b15_secuencia_siguiente
      END,
      'B16', CASE
        WHEN tenant_target.tipo_codigo = 'B16' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b16_secuencia_siguiente
      END,
      'B17', CASE
        WHEN tenant_target.tipo_codigo = 'B17' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b17_secuencia_siguiente
      END
    ),
    ncf_secuencia_siguiente = CASE tenant_target.tipo_default_codigo
      WHEN 'B01' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B01' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b01_secuencia_siguiente
      END
      WHEN 'B02' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B02' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b02_secuencia_siguiente
      END
      WHEN 'B14' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B14' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b14_secuencia_siguiente
      END
      WHEN 'B15' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B15' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b15_secuencia_siguiente
      END
      WHEN 'B16' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B16' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b16_secuencia_siguiente
      END
      WHEN 'B17' THEN CASE
        WHEN tenant_target.tipo_codigo = 'B17' THEN tenant_target.seq_actual + 1
        ELSE t.ncf_b17_secuencia_siguiente
      END
      ELSE greatest(coalesce(t.ncf_secuencia_siguiente, 1), 1)
    END,
    updated_at = now()
  FROM tenant_target
  WHERE t.id = tenant_target.id
  RETURNING
    TRUE,
    tenant_target.tipo_codigo,
    tenant_target.seq_actual;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cloudix_reserve_ncf(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_reserve_ncf(uuid, text) TO authenticated;

-- C. Obsolete fiscal functions
DO $do$
BEGIN
  IF to_regprocedure('public.cyberbistro_reserve_ncf(uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cyberbistro_reserve_ncf(uuid, text) FROM PUBLIC, anon, authenticated;';
  END IF;
END;
$do$;

DO $do$
BEGIN
  IF to_regprocedure('public.zyron_next_invoice_number(uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.zyron_next_invoice_number(uuid, text) FROM PUBLIC, anon, authenticated;';
  END IF;
END;
$do$;
