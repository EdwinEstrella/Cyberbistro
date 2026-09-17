CREATE OR REPLACE FUNCTION public.cloudix_reserve_invoice_numbers_v2(
  p_tenant_id uuid,
  p_count integer DEFAULT 1,
  p_minimum_number bigint DEFAULT 1
)
RETURNS TABLE(first_number bigint, last_number bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_auth_user_id uuid := public.cloudix_auth_user_id();
  v_first bigint;
  v_max_invoice bigint;
  v_min bigint := coalesce(p_minimum_number, 1);
BEGIN
  IF v_auth_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    JOIN public.tenants t ON t.id = tu.tenant_id
    WHERE tu.auth_user_id = v_auth_user_id
      AND tu.tenant_id = p_tenant_id
      AND tu.activo IS TRUE
      AND t.activa IS TRUE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  IF p_count IS NULL OR p_count < 1 OR p_count > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_invoice_reservation_count';
  END IF;

  INSERT INTO public.invoice_number_counters (tenant_id, next_number)
  VALUES (p_tenant_id, 1)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT c.next_number
  INTO v_first
  FROM public.invoice_number_counters c
  WHERE c.tenant_id = p_tenant_id
  FOR UPDATE;

  SELECT coalesce(max(f.numero_factura), 0)
  INTO v_max_invoice
  FROM public.facturas f
  WHERE f.tenant_id = p_tenant_id;

  v_first := greatest(v_first, v_max_invoice + 1, v_min);
  IF v_first > 2147483647 OR v_first + p_count - 1 > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'invoice_number_range_exhausted';
  END IF;

  UPDATE public.invoice_number_counters
  SET next_number = v_first + p_count,
      updated_at = now()
  WHERE tenant_id = p_tenant_id;

  RETURN QUERY SELECT v_first, v_first + p_count - 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cloudix_reserve_invoice_numbers_v2(uuid, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_reserve_invoice_numbers_v2(uuid, integer, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
