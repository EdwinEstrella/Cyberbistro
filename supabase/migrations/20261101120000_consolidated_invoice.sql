-- Migration: 20261101120000_consolidated_invoice.sql
-- Consolidated e-CF (E31) invoice per company and date range (Corporativo plan only).

-- 1. Facturas columns for consolidated CxC audit & reversal tracking
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS consolidated_cxc_ids uuid[] NULL,
  ADD COLUMN IF NOT EXISTS consolidated_from date NULL,
  ADD COLUMN IF NOT EXISTS consolidated_to date NULL;

-- 2. Preview RPC: cloudix_preview_consolidated_invoice
CREATE OR REPLACE FUNCTION public.cloudix_preview_consolidated_invoice(
  p_customer_id uuid,
  p_from date,
  p_to date,
  p_sucursal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_itbis_rate numeric := 0.18;
  v_customer public.customers%ROWTYPE;
  v_plan text;
  v_itbis_incluido boolean;
  v_clean_rnc text;
  v_rnc_valid boolean;
  v_rows jsonb;
  v_count integer := 0;
  v_orders_total numeric := 0;
  v_subtotal numeric := 0;
  v_itbis numeric := NULL;
  v_total numeric := 0;
  v_blocked_reason text := NULL;
BEGIN
  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CUSTOMER_NOT_FOUND';
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(v_customer.tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHORIZED';
  END IF;

  SELECT plan, COALESCE(itbis_incluido_en_precio, false)
  INTO v_plan, v_itbis_incluido
  FROM public.tenants
  WHERE id = v_customer.tenant_id;

  v_clean_rnc := regexp_replace(COALESCE(v_customer.document_id, ''), '\D', '', 'g');
  v_rnc_valid := (length(v_clean_rnc) IN (9, 11) AND trim(COALESCE(v_customer.name, '')) <> '');

  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'cxc_id',        cxc.id,
        'date',          public.menu_business_date(ord.created_at),
        'numero_pedido', ord.numero_pedido,
        'employee_name', ord.employee_name,
        'amount',        cxc.monto_total
      )
      ORDER BY public.menu_business_date(ord.created_at) ASC, ord.numero_pedido ASC
    ), '[]'::jsonb),
    COALESCE(COUNT(*), 0),
    COALESCE(SUM(cxc.monto_total), 0)
  INTO v_rows, v_count, v_orders_total
  FROM public.cuentas_cobrar cxc
  JOIN public.digital_orders ord ON ord.id = cxc.digital_order_id
  WHERE cxc.tenant_id = v_customer.tenant_id
    AND cxc.customer_id = p_customer_id
    AND cxc.digital_order_id IS NOT NULL
    AND cxc.factura_id IS NULL
    AND cxc.estado <> 'anulada'
    AND COALESCE(cxc.monto_pagado, 0) = 0
    AND public.menu_business_date(ord.created_at) BETWEEN p_from AND p_to
    AND ord.sucursal_id IS NOT DISTINCT FROM p_sucursal_id;

  IF v_itbis_incluido THEN
    v_total := round(v_orders_total, 2);
    v_subtotal := round(v_total / (1 + v_itbis_rate), 2);
    v_itbis := round(v_total - v_subtotal, 2);
  ELSE
    v_total := round(v_orders_total, 2);
    v_subtotal := round(v_orders_total, 2);
    v_itbis := NULL;
  END IF;

  IF lower(trim(COALESCE(v_plan, ''))) <> 'corporativo' THEN
    v_blocked_reason := 'PLAN_REQUIRED';
  ELSIF NOT v_itbis_incluido THEN
    v_blocked_reason := 'ITBIS_NOT_INCLUDED_UNSUPPORTED';
  ELSIF NOT v_rnc_valid THEN
    v_blocked_reason := 'BUYER_RNC_INVALID';
  ELSIF v_count = 0 THEN
    v_blocked_reason := 'NOTHING_TO_INVOICE';
  END IF;

  RETURN jsonb_build_object(
    'customer', jsonb_build_object(
      'name', v_customer.name,
      'document_id', v_customer.document_id,
      'rnc_valid', v_rnc_valid
    ),
    'rows', v_rows,
    'subtotal', v_subtotal,
    'itbis', v_itbis,
    'total', v_total,
    'count', v_count,
    'blocked_reason', v_blocked_reason
  );
END;
$function$;

-- 3. Issue RPC: cloudix_issue_consolidated_invoice
CREATE OR REPLACE FUNCTION public.cloudix_issue_consolidated_invoice(
  p_customer_id uuid,
  p_from date,
  p_to date,
  p_sucursal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_itbis_rate numeric := 0.18;
  v_auth_user_id uuid := public.cloudix_auth_user_id();
  v_customer public.customers%ROWTYPE;
  v_plan text;
  v_itbis_incluido boolean;
  v_moneda text;
  v_clean_rnc text;
  v_cxc_ids uuid[];
  v_count integer := 0;
  v_orders_total numeric := 0;
  v_subtotal numeric := 0;
  v_itbis numeric := 0;
  v_total numeric := 0;
  v_items jsonb;
  v_seq integer;
  v_encf text;
  v_cert_id uuid;
  v_factura_id uuid := gen_random_uuid();
  v_ecf_id uuid := gen_random_uuid();
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CUSTOMER_NOT_FOUND';
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(v_customer.tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'contabilidad']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHORIZED';
  END IF;

  SELECT plan, COALESCE(itbis_incluido_en_precio, false), moneda
  INTO v_plan, v_itbis_incluido, v_moneda
  FROM public.tenants
  WHERE id = v_customer.tenant_id;

  IF lower(trim(COALESCE(v_plan, ''))) <> 'corporativo' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLAN_REQUIRED';
  END IF;

  IF NOT v_itbis_incluido THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ITBIS_NOT_INCLUDED_UNSUPPORTED';
  END IF;

  v_clean_rnc := regexp_replace(COALESCE(v_customer.document_id, ''), '\D', '', 'g');
  IF length(v_clean_rnc) NOT IN (9, 11) OR trim(COALESCE(v_customer.name, '')) = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BUYER_RNC_INVALID';
  END IF;

  -- Lock candidate CxC rows
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_cxc_ids
  FROM (
    SELECT cxc.id
    FROM public.cuentas_cobrar cxc
    JOIN public.digital_orders ord ON ord.id = cxc.digital_order_id
    WHERE cxc.tenant_id = v_customer.tenant_id
      AND cxc.customer_id = p_customer_id
      AND cxc.digital_order_id IS NOT NULL
      AND cxc.factura_id IS NULL
      AND cxc.estado <> 'anulada'
      AND COALESCE(cxc.monto_pagado, 0) = 0
      AND public.menu_business_date(ord.created_at) BETWEEN p_from AND p_to
      AND ord.sucursal_id IS NOT DISTINCT FROM p_sucursal_id
    ORDER BY public.menu_business_date(ord.created_at) ASC, ord.numero_pedido ASC
    FOR UPDATE OF cxc
  ) sub;

  IF v_cxc_ids IS NULL OR cardinality(v_cxc_ids) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOTHING_TO_INVOICE';
  END IF;

  SELECT
    COALESCE(SUM(cxc.monto_total), 0),
    COUNT(*),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'plato_id', NULL,
        'nombre', 'Pedido #' || ord.numero_pedido || ' - ' || ord.employee_name || ' (' || to_char(public.menu_business_date(ord.created_at), 'DD/MM/YYYY') || ')',
        'cantidad', 1,
        'precio_unitario', cxc.monto_total,
        'subtotal', cxc.monto_total
      )
      ORDER BY public.menu_business_date(ord.created_at) ASC, ord.numero_pedido ASC
    ), '[]'::jsonb)
  INTO v_orders_total, v_count, v_items
  FROM public.cuentas_cobrar cxc
  JOIN public.digital_orders ord ON ord.id = cxc.digital_order_id
  WHERE cxc.id = ANY(v_cxc_ids);

  IF v_itbis_incluido THEN
    v_total := round(v_orders_total, 2);
    v_subtotal := round(v_total / (1 + v_itbis_rate), 2);
    v_itbis := round(v_total - v_subtotal, 2);
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ITBIS_NOT_INCLUDED_UNSUPPORTED';
  END IF;

  SELECT r.seq_reserved INTO v_seq
  FROM public.cloudix_reserve_ecf(v_customer.tenant_id, 'E31') r;

  v_encf := 'E31' || lpad(v_seq::text, 10, '0');

  -- Optional active certificate metadata
  BEGIN
    SELECT cm.id INTO v_cert_id
    FROM public.ecf_certificate_metadata cm
    JOIN public.tenants t ON t.id = cm.tenant_id
    WHERE cm.tenant_id = v_customer.tenant_id
      AND cm.is_ready IS TRUE
      AND cm.environment = t.ecf_environment
    ORDER BY cm.valid_until DESC NULLS LAST, cm.created_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_cert_id := NULL;
  END;

  IF v_total <> round(v_orders_total, 2) THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH';
  END IF;

  INSERT INTO public.facturas (
    id, tenant_id, sucursal_id, customer_id, mesa_numero, comanda_ids, cliente_nombre, cliente_rnc,
    metodo_pago, estado, subtotal, itbis, propina, total, moneda, items, notas, creado_por,
    fiscal_mode, ncf, ncf_tipo, pagada_at,
    consolidated_cxc_ids, consolidated_from, consolidated_to
  ) VALUES (
    v_factura_id, v_customer.tenant_id, p_sucursal_id, p_customer_id, NULL, '[]'::jsonb,
    v_customer.name, v_clean_rnc,
    'fiado', 'pendiente', v_subtotal, v_itbis, 0, v_total, COALESCE(v_moneda, 'DOP'),
    v_items,
    'Factura consolidada del ' || to_char(p_from, 'DD/MM/YYYY') || ' al ' || to_char(p_to, 'DD/MM/YYYY'),
    v_auth_user_id::text,
    'dgii_ecf', v_encf, 'E31', NULL,
    v_cxc_ids, p_from, p_to
  );

  INSERT INTO public.ecf_documents (id, tenant_id, factura_id, certificate_metadata_id, ecf_type, status)
  VALUES (v_ecf_id, v_customer.tenant_id, v_factura_id, v_cert_id, '31', 'queued');

  INSERT INTO public.fiscal_outbox (
    tenant_id, ecf_document_id, factura_id, operation, status, idempotency_key, attempts, next_attempt_at
  ) VALUES (
    v_customer.tenant_id, v_ecf_id, v_factura_id, 'submit', 'queued',
    v_customer.tenant_id::text || ':' || v_factura_id::text || ':submit', 0, now()
  );

  UPDATE public.cuentas_cobrar
  SET factura_id = v_factura_id,
      updated_at = now()
  WHERE id = ANY(v_cxc_ids);

  RETURN jsonb_build_object(
    'factura_id', v_factura_id,
    'ncf', v_encf,
    'total', v_total,
    'count', v_count
  );
END;
$function$;

-- 4. Recreate revert_company_digital_order_accept with factura_id guard
CREATE OR REPLACE FUNCTION public.revert_company_digital_order_accept(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_order   public.digital_orders%ROWTYPE;
  v_cxc     public.cuentas_cobrar%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.digital_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(v_order.tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_order.status <> 'accepted' THEN
    RAISE EXCEPTION 'ORDER_NOT_ACCEPTED';
  END IF;

  SELECT * INTO v_cxc
  FROM public.cuentas_cobrar
  WHERE digital_order_id = p_order_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_cxc.factura_id IS NOT NULL THEN
      RAISE EXCEPTION 'ORDER_ALREADY_INVOICED';
    END IF;

    IF v_cxc.monto_pagado > 0 THEN
      RAISE EXCEPTION 'PAYMENTS_EXIST';
    END IF;

    IF EXISTS (SELECT 1 FROM public.cxc_pagos WHERE cuenta_cobrar_id = v_cxc.id) THEN
      RAISE EXCEPTION 'PAYMENTS_EXIST';
    END IF;

    DELETE FROM public.cuentas_cobrar WHERE id = v_cxc.id;
  END IF;

  UPDATE public.digital_orders
  SET status = 'pending',
      accepted_at = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status',   'pending'
  );
END;
$$;

-- 4. Recreate cancel_digital_order_item with factura_id guard
CREATE OR REPLACE FUNCTION public.cancel_digital_order_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_item          public.digital_order_items%ROWTYPE;
  v_order         public.digital_orders%ROWTYPE;
  v_cxc           public.cuentas_cobrar%ROWTYPE;
  v_new_total     numeric;
  v_active_count  integer;
  v_new_estado    varchar(20);
BEGIN
  -- 1. Lock item
  SELECT * INTO v_item
  FROM public.digital_order_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND';
  END IF;

  -- 2. Tenant check
  IF NOT public.cyberbistro_has_tenant_role(v_item.tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_item.status <> 'active' THEN
    RAISE EXCEPTION 'ITEM_NOT_ACTIVE';
  END IF;

  -- 3. Lock order
  SELECT * INTO v_order
  FROM public.digital_orders
  WHERE id = v_item.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'ORDER_NOT_EDITABLE';
  END IF;

  -- 4. Check CxC before making changes
  SELECT * INTO v_cxc
  FROM public.cuentas_cobrar
  WHERE digital_order_id = v_order.id
  FOR UPDATE;

  IF FOUND AND v_cxc.factura_id IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_ALREADY_INVOICED';
  END IF;

  -- 5. Mark item cancelled (and child extras if any)
  UPDATE public.digital_order_items
  SET status = 'cancelled'
  WHERE id = p_item_id;

  IF v_item.parent_item_id IS NULL THEN
    UPDATE public.digital_order_items
    SET status = 'cancelled'
    WHERE parent_item_id = p_item_id;
  END IF;

  -- 6. Recompute order total from active rows
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_new_total, v_active_count
  FROM public.digital_order_items
  WHERE order_id = v_order.id
    AND status = 'active';

  -- 7. If no active rows remain
  IF v_active_count = 0 THEN
    UPDATE public.digital_orders
    SET status = 'rejected',
        rejected_at = now(),
        total = 0,
        updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    IF v_cxc.id IS NOT NULL THEN
      IF v_cxc.monto_pagado > 0 THEN
        RAISE EXCEPTION 'PAYMENT_EXCEEDS_TOTAL';
      END IF;

      UPDATE public.cuentas_cobrar
      SET estado = 'anulada',
          monto_total = 0,
          updated_at = now()
      WHERE id = v_cxc.id;
    END IF;
  ELSE
    -- Active rows remain
    UPDATE public.digital_orders
    SET total = v_new_total,
        updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    IF v_cxc.id IS NOT NULL THEN
      IF v_new_total < v_cxc.monto_pagado THEN
        RAISE EXCEPTION 'PAYMENT_EXCEEDS_TOTAL';
      END IF;

      v_new_estado := CASE
        WHEN v_cxc.monto_pagado >= v_new_total AND v_new_total > 0 THEN 'pagada'
        WHEN v_cxc.monto_pagado > 0 THEN 'parcial'
        ELSE 'pendiente'
      END;

      UPDATE public.cuentas_cobrar
      SET monto_total = v_new_total,
          estado = v_new_estado,
          updated_at = now()
      WHERE id = v_cxc.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_id',            v_order.id,
    'item_id',             p_item_id,
    'new_total',           v_new_total,
    'active_items_count',  v_active_count,
    'order_status',        v_order.status
  );
END;
$$;

-- 5. Revoke anon & grant authenticated
REVOKE EXECUTE ON FUNCTION public.cloudix_preview_consolidated_invoice(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_preview_consolidated_invoice(uuid, date, date, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cloudix_issue_consolidated_invoice(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_issue_consolidated_invoice(uuid, date, date, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revert_company_digital_order_accept(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_company_digital_order_accept(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_digital_order_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_digital_order_item(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
