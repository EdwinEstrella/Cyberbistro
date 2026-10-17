-- Enforce the DGII-authorized e-NCF range inside the atomic reservation.
-- Based on the LIVE production definition of public.cloudix_reserve_ecf (read 2026-10-17).
-- Same signature, return type, SECURITY DEFINER and search_path. Added behaviour:
--   * no {start,end} integer range for the type  -> ECF_RANGE_NOT_CONFIGURED
--   * current < start                            -> current := start
--   * current > end                              -> ECF_RANGE_EXHAUSTED (counter NOT updated)

CREATE OR REPLACE FUNCTION public.cloudix_reserve_ecf(p_tenant_id uuid, p_ncf_tipo text)
 RETURNS TABLE(ncf_fiscal_activo boolean, ncf_tipo_codigo text, seq_reserved integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_user_id uuid := public.cloudix_auth_user_id();
  v_is_member boolean; v_fiscal_activo boolean; v_tipo_normalizado text;
  v_secuencias jsonb; v_rangos jsonb; v_rango jsonb;
  v_range_start integer; v_range_end integer;
  v_seq_actual integer; v_seq_siguiente integer;
BEGIN
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.tenant_users WHERE auth_user_id = v_auth_user_id AND tenant_id = p_tenant_id AND activo = true) INTO v_is_member;
  IF NOT v_is_member THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege'; END IF;
  v_tipo_normalizado := upper(trim(p_ncf_tipo));
  IF v_tipo_normalizado NOT IN ('E31','E32','E33','E34','E41','E43','E44','E45','E46','E47') THEN RAISE EXCEPTION 'Tipo de e-CF no valido: %', p_ncf_tipo; END IF;
  SELECT t.ncf_fiscal_activo, t.ncf_secuencias_por_tipo, t.ecf_secuencias_rangos INTO v_fiscal_activo, v_secuencias, v_rangos FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE;
  IF v_fiscal_activo IS NOT TRUE THEN RAISE EXCEPTION 'NCF fiscal no esta activo para el tenant'; END IF;

  -- Authorized range for the type: both bounds must be integers and end >= start.
  v_rango := v_rangos -> v_tipo_normalizado;
  IF v_rango IS NULL
     OR jsonb_typeof(v_rango) <> 'object'
     OR jsonb_typeof(v_rango -> 'start') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_rango -> 'end') IS DISTINCT FROM 'number'
     OR (v_rango ->> 'start') !~ '^[0-9]+$'
     OR (v_rango ->> 'end') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ECF_RANGE_NOT_CONFIGURED', DETAIL = v_tipo_normalizado;
  END IF;
  v_range_start := (v_rango ->> 'start')::integer;
  v_range_end := (v_rango ->> 'end')::integer;
  IF v_range_start < 1 OR v_range_end < v_range_start THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ECF_RANGE_NOT_CONFIGURED', DETAIL = v_tipo_normalizado;
  END IF;

  v_seq_actual := coalesce((v_secuencias->>v_tipo_normalizado)::integer, 1);
  IF v_seq_actual < v_range_start THEN v_seq_actual := v_range_start; END IF;
  IF v_seq_actual > v_range_end THEN
    -- Raised before any UPDATE: an exhausted range never advances the counter.
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ECF_RANGE_EXHAUSTED', DETAIL = v_tipo_normalizado || ':' || v_range_end::text;
  END IF;
  v_seq_siguiente := v_seq_actual + 1;
  UPDATE public.tenants SET ncf_secuencias_por_tipo = coalesce(ncf_secuencias_por_tipo, '{}'::jsonb) || jsonb_build_object(v_tipo_normalizado, v_seq_siguiente), updated_at = now() WHERE id = p_tenant_id;
  RETURN QUERY SELECT TRUE, v_tipo_normalizado, v_seq_actual;
END;
$function$;

-- Re-state grants idempotently (CREATE OR REPLACE keeps them; this documents the intent).
REVOKE EXECUTE ON FUNCTION public.cloudix_reserve_ecf(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_reserve_ecf(uuid, text) TO authenticated;
