-- e-CF credit notes (E34): data model + atomic issue RPC.
--
-- The credit note is its OWN facturas row (estado 'nota_credito', positive amounts copied from the
-- original), so the existing fiscal pipeline works unchanged: one ecf_documents row per factura,
-- the trigger that syncs facturas.fiscal_status, and the worker payload (to_jsonb(factura)).
-- The e-NCF of the note lives in facturas.ncf; the original is referenced by credit_note_of / ref_*.
--
-- Total reversal only (CodigoModificacion 1). Sales sums must exclude estado 'nota_credito'.

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS credit_note_of uuid REFERENCES public.facturas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS ref_ncf text,
  ADD COLUMN IF NOT EXISTS ref_fecha_emision date,
  ADD COLUMN IF NOT EXISTS ref_codigo_modificacion smallint,
  ADD COLUMN IF NOT EXISTS ref_razon_modificacion text;

-- One credit note per original invoice.
CREATE UNIQUE INDEX IF NOT EXISTS facturas_credit_note_of_unique_idx
  ON public.facturas (credit_note_of)
  WHERE credit_note_of IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cloudix_issue_credit_note(
  p_tenant_id uuid,
  p_factura_id uuid,
  p_razon text,
  p_sucursal_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_user_id uuid := public.cloudix_auth_user_id();
  v_tz constant text := 'America/Santo_Domingo';
  v_razon text := trim(coalesce(p_razon, ''));
  v_orig public.facturas%ROWTYPE;
  v_ecf public.ecf_documents%ROWTYPE;
  v_cycle_id uuid;
  v_seq integer;
  v_encf text;
  v_note_id uuid := gen_random_uuid();
  v_ecf_id uuid := gen_random_uuid();
  v_category_id uuid;
  v_gasto_id uuid := gen_random_uuid();
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  -- Admin only: an active member of the tenant whose role is admin.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.auth_user_id = v_auth_user_id AND tu.tenant_id = p_tenant_id
      AND tu.activo = true AND lower(trim(tu.rol)) = 'admin'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CREDIT_NOTE_FORBIDDEN';
  END IF;

  IF v_razon = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDIT_NOTE_REASON_REQUIRED';
  END IF;

  -- Lock the original so two concurrent requests cannot both pass the checks below.
  SELECT * INTO v_orig FROM public.facturas WHERE id = p_factura_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CREDIT_NOTE_ORIGINAL_NOT_FOUND';
  END IF;

  IF v_orig.credit_note_of IS NOT NULL OR v_orig.estado = 'nota_credito' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDIT_NOTE_ORIGINAL_IS_CREDIT_NOTE';
  END IF;

  IF v_orig.ncf IS NULL OR left(v_orig.ncf, 3) NOT IN ('E31', 'E32') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDIT_NOTE_TYPE_NOT_ALLOWED';
  END IF;

  SELECT * INTO v_ecf FROM public.ecf_documents WHERE factura_id = v_orig.id AND tenant_id = p_tenant_id;
  IF NOT FOUND OR v_ecf.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDIT_NOTE_ORIGINAL_NOT_ACCEPTED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.facturas WHERE credit_note_of = v_orig.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDIT_NOTE_ALREADY_EXISTS';
  END IF;

  -- Credit sales (fiado) must reverse the receivable instead of paying cash out: not supported yet.
  IF lower(coalesce(v_orig.metodo_pago, '')) = 'fiado'
     OR EXISTS (SELECT 1 FROM public.cuentas_cobrar cc WHERE cc.factura_id = v_orig.id AND cc.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDIT_NOTE_CREDIT_SALE_UNSUPPORTED';
  END IF;

  -- IndicadorNotaCredito 0: within 30 days of the original emission (factura created_at, the date the
  -- fiscal worker sends as FechaEmision), counted in Santo Domingo calendar days.
  IF ((now() AT TIME ZONE v_tz)::date - (v_orig.created_at AT TIME ZONE v_tz)::date) > 30 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDIT_NOTE_WINDOW_EXPIRED';
  END IF;

  -- The refund leaves the drawer of the currently open cash cycle.
  SELECT c.id INTO v_cycle_id
  FROM public.cierres_operativos c
  WHERE c.tenant_id = p_tenant_id AND c.closed_at IS NULL AND c.sucursal_id IS NOT DISTINCT FROM p_sucursal_id
  ORDER BY c.opened_at DESC
  LIMIT 1;
  IF v_cycle_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREDIT_NOTE_NO_OPEN_CYCLE';
  END IF;

  -- Reserve the E34 (membership, fiscal-active and authorized range are enforced there).
  SELECT r.seq_reserved INTO v_seq FROM public.cloudix_reserve_ecf(p_tenant_id, 'E34') r;
  v_encf := 'E34' || lpad(v_seq::text, 8, '0');

  INSERT INTO public.facturas (
    id, tenant_id, sucursal_id, customer_id, mesa_numero, comanda_ids, cliente_nombre, cliente_rnc,
    metodo_pago, estado, subtotal, itbis, propina, total, moneda, items, notas, creado_por,
    fiscal_mode, ncf, ncf_tipo, pagada_at,
    credit_note_of, ref_ncf, ref_fecha_emision, ref_codigo_modificacion, ref_razon_modificacion
  ) VALUES (
    v_note_id, p_tenant_id, v_orig.sucursal_id, v_orig.customer_id, v_orig.mesa_numero, v_orig.comanda_ids,
    v_orig.cliente_nombre, v_orig.cliente_rnc,
    v_orig.metodo_pago, 'nota_credito', v_orig.subtotal, v_orig.itbis, v_orig.propina, v_orig.total, v_orig.moneda,
    v_orig.items, v_razon, v_auth_user_id::text,
    'dgii_ecf', v_encf, 'E34 - Nota de credito electronica', now(),
    v_orig.id, v_orig.ncf, (v_orig.created_at AT TIME ZONE v_tz)::date, 1, v_razon
  );

  -- ecf_type is stored without the E prefix ('31', '32'), like the checkout writes it.
  INSERT INTO public.ecf_documents (id, tenant_id, factura_id, certificate_metadata_id, ecf_type, status)
  VALUES (v_ecf_id, p_tenant_id, v_note_id, v_ecf.certificate_metadata_id, '34', 'queued');

  INSERT INTO public.fiscal_outbox (
    tenant_id, ecf_document_id, factura_id, operation, status, idempotency_key, attempts, next_attempt_at
  ) VALUES (
    p_tenant_id, v_ecf_id, v_note_id, 'submit', 'queued',
    p_tenant_id::text || ':' || v_note_id::text || ':submit', 0, now()
  );

  -- Refund record: an operational expense in the open cycle, with the original payment method
  -- (only cash reduces the drawer; the cierre ignores the other methods).
  SELECT id INTO v_category_id
  FROM public.gasto_categorias
  WHERE tenant_id = p_tenant_id AND lower(trim(nombre)) = lower('Devolución / Nota de crédito')
  LIMIT 1;
  IF v_category_id IS NULL THEN
    INSERT INTO public.gasto_categorias (tenant_id, nombre, descripcion, sucursal_id)
    VALUES (p_tenant_id, 'Devolución / Nota de crédito', 'Reembolsos por notas de crédito electrónicas', NULL)
    RETURNING id INTO v_category_id;
  END IF;

  INSERT INTO public.gastos (
    id, tenant_id, category_id, cycle_id, sucursal_id, descripcion, monto, metodo_pago,
    fecha_gasto, notas, created_by_auth_user_id
  ) VALUES (
    v_gasto_id, p_tenant_id, v_category_id, v_cycle_id, p_sucursal_id,
    'Nota de crédito ' || v_encf || ' (ref. ' || v_orig.ncf || ')', v_orig.total, v_orig.metodo_pago,
    now(), v_razon, v_auth_user_id
  );

  RETURN jsonb_build_object(
    'credit_note_factura_id', v_note_id,
    'encf', v_encf,
    'ecf_document_id', v_ecf_id,
    'gasto_id', v_gasto_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cloudix_issue_credit_note(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_issue_credit_note(uuid, uuid, text, uuid) TO authenticated;
