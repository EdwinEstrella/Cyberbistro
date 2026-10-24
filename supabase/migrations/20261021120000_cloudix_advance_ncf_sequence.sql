-- Forward-only catch-up of a tenant's NCF B counter after offline issuance.
--
-- The desktop POS reserves NCF B numbers from a local SQLite sequence while the
-- cloud is unreachable (one sales caja per business). Once the cloud is back the
-- cloud counter must end >= the highest number issued offline, or a later cloud
-- reservation (web/admin) would hand out a duplicate. Direct UPDATEs on tenants
-- are admin-only under RLS (cb_tenants_admin_update), so a cajera cannot do it;
-- this SECURITY DEFINER RPC lets any active member advance the counter, never
-- backwards, keeping the per-type column, ncf_secuencias_por_tipo and the legacy
-- ncf_secuencia_siguiente consistent with cloudix_reserve_ncf.
--
-- p_next is the NEXT number to hand out (last issued + 1), so 100000000 is valid
-- and means the 8-digit range was used up to 99999999.

CREATE OR REPLACE FUNCTION public.cloudix_advance_ncf_sequence(p_tenant_id uuid, p_ncf_tipo text, p_next integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_user_id uuid := public.cloudix_auth_user_id();
  v_tipo text := upper(btrim(coalesce(p_ncf_tipo, '')));
  v_default text;
  v_b01 integer; v_b02 integer; v_b14 integer; v_b15 integer; v_b16 integer; v_b17 integer;
  v_legacy integer;
  v_current integer;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenant_users WHERE auth_user_id = v_auth_user_id AND tenant_id = p_tenant_id AND activo = true) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  IF v_tipo NOT IN ('B01','B02','B14','B15','B16','B17') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'NCF_TIPO_INVALID';
  END IF;

  IF p_next IS NULL OR p_next < 1 OR p_next > 100000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'NCF_SEQUENCE_OUT_OF_RANGE';
  END IF;

  SELECT
    CASE WHEN upper(coalesce(t.ncf_tipo_default, 'B01')) IN ('B01','B02','B14','B15','B16','B17')
      THEN upper(coalesce(t.ncf_tipo_default, 'B01')) ELSE 'B01' END,
    greatest(coalesce(t.ncf_b01_secuencia_siguiente, 1), 1),
    greatest(coalesce(t.ncf_b02_secuencia_siguiente, 1), 1),
    greatest(coalesce(t.ncf_b14_secuencia_siguiente, 1), 1),
    greatest(coalesce(t.ncf_b15_secuencia_siguiente, 1), 1),
    greatest(coalesce(t.ncf_b16_secuencia_siguiente, 1), 1),
    greatest(coalesce(t.ncf_b17_secuencia_siguiente, 1), 1),
    greatest(coalesce(t.ncf_secuencia_siguiente, 1), 1)
  INTO v_default, v_b01, v_b02, v_b14, v_b15, v_b16, v_b17, v_legacy
  FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_current := CASE v_tipo
    WHEN 'B01' THEN v_b01 WHEN 'B02' THEN v_b02 WHEN 'B14' THEN v_b14
    WHEN 'B15' THEN v_b15 WHEN 'B16' THEN v_b16 ELSE v_b17 END;

  -- Forward only: a stale or lower value never moves the counter back.
  IF p_next <= v_current THEN
    RETURN v_current;
  END IF;

  CASE v_tipo
    WHEN 'B01' THEN v_b01 := greatest(v_b01, p_next);
    WHEN 'B02' THEN v_b02 := greatest(v_b02, p_next);
    WHEN 'B14' THEN v_b14 := greatest(v_b14, p_next);
    WHEN 'B15' THEN v_b15 := greatest(v_b15, p_next);
    WHEN 'B16' THEN v_b16 := greatest(v_b16, p_next);
    ELSE v_b17 := greatest(v_b17, p_next);
  END CASE;

  UPDATE public.tenants SET
    ncf_b01_secuencia_siguiente = v_b01,
    ncf_b02_secuencia_siguiente = v_b02,
    ncf_b14_secuencia_siguiente = v_b14,
    ncf_b15_secuencia_siguiente = v_b15,
    ncf_b16_secuencia_siguiente = v_b16,
    ncf_b17_secuencia_siguiente = v_b17,
    ncf_secuencias_por_tipo = jsonb_build_object(
      'B01', v_b01, 'B02', v_b02, 'B14', v_b14, 'B15', v_b15, 'B16', v_b16, 'B17', v_b17
    ),
    ncf_secuencia_siguiente = greatest(v_legacy, CASE v_default
      WHEN 'B01' THEN v_b01 WHEN 'B02' THEN v_b02 WHEN 'B14' THEN v_b14
      WHEN 'B15' THEN v_b15 WHEN 'B16' THEN v_b16 ELSE v_b17 END),
    updated_at = now()
  WHERE id = p_tenant_id;

  RETURN p_next;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cloudix_advance_ncf_sequence(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_advance_ncf_sequence(uuid, text, integer) TO authenticated;
