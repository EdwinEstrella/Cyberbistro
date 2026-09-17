-- Tenant-scoped invoice numbering. Existing duplicate invoices are intentionally
-- left untouched; adding a unique constraint requires a separate audited data repair.
CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  next_number bigint NOT NULL CHECK (next_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_number_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cloudix_reserve_invoice_numbers(
  p_tenant_id uuid,
  p_count integer DEFAULT 1
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

  v_first := greatest(v_first, v_max_invoice + 1);
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

REVOKE EXECUTE ON FUNCTION public.cloudix_reserve_invoice_numbers(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_reserve_invoice_numbers(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
