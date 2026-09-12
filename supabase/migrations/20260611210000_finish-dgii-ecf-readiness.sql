-- Foundation for DGII/e-CF production readiness.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ecf_issuer_sucursal text,
  ADD COLUMN IF NOT EXISTS ecf_issuer_municipio text,
  ADD COLUMN IF NOT EXISTS ecf_issuer_provincia text,
  ADD COLUMN IF NOT EXISTS ecf_issuer_actividad_economica text,
  ADD COLUMN IF NOT EXISTS ecf_issuer_correo_emisor text;

CREATE TABLE IF NOT EXISTS public.ecf_e32_readiness_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  e32_validated boolean NOT NULL DEFAULT false,
  rfce_validated boolean NOT NULL DEFAULT false,
  resumen_validated boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamptz,
  evidence_notes text,
  evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecf_e32_readiness_requires_full_approval
    CHECK (
      approved_at IS NULL
      OR (e32_validated IS TRUE AND rfce_validated IS TRUE AND resumen_validated IS TRUE)
    )
);

CREATE INDEX IF NOT EXISTS ecf_e32_readiness_evidence_tenant_idx
  ON public.ecf_e32_readiness_evidence (tenant_id, approved_at DESC);

ALTER TABLE public.ecf_e32_readiness_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_ecf_e32_evidence_tenant_select ON public.ecf_e32_readiness_evidence;
CREATE POLICY cb_ecf_e32_evidence_tenant_select ON public.ecf_e32_readiness_evidence
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_ecf_e32_evidence_admin_write ON public.ecf_e32_readiness_evidence;
CREATE POLICY cb_ecf_e32_evidence_admin_write ON public.ecf_e32_readiness_evidence
  FOR ALL TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_ecf_e32_evidence_project_admin_all ON public.ecf_e32_readiness_evidence;
CREATE POLICY cb_ecf_e32_evidence_project_admin_all ON public.ecf_e32_readiness_evidence
  FOR ALL TO project_admin USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cloudix_reenqueue_ecf_document(
  p_tenant_id uuid,
  p_ecf_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document public.ecf_documents%ROWTYPE;
  v_outbox public.fiscal_outbox%ROWTYPE;
  v_idempotency_key text;
BEGIN
  IF NOT public.cyberbistro_has_tenant_role(p_tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']) THEN
    RAISE EXCEPTION 'Not authorized to reenqueue e-CF document for tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_document
  FROM public.ecf_documents
  WHERE id = p_ecf_document_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'e-CF document % was not found for tenant %', p_ecf_document_id, p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_outbox
  FROM public.fiscal_outbox
  WHERE tenant_id = p_tenant_id
    AND ecf_document_id = p_ecf_document_id
    AND operation = 'resubmit'
    AND status IN ('queued', 'processing', 'retryable_error')
    AND (
      status <> 'processing'
      OR locked_at IS NULL
      OR locked_at >= now() - interval '15 minutes'
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_document.status NOT IN ('pending_sync', 'rejected', 'retryable_error', 'terminal_error') THEN
      RAISE EXCEPTION 'e-CF document % is not eligible for reenqueue from status %', p_ecf_document_id, v_document.status
        USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'outbox_id', v_outbox.id,
      'ecf_document_id', v_document.id,
      'status', v_document.status
    );
  END IF;

  IF v_document.status NOT IN ('rejected', 'retryable_error', 'terminal_error') THEN
    RAISE EXCEPTION 'e-CF document % is not eligible for reenqueue from status %', p_ecf_document_id, v_document.status
      USING ERRCODE = 'P0001';
  END IF;

  v_idempotency_key := format('manual_reenqueue:%s:%s:%s', p_tenant_id, p_ecf_document_id, txid_current());

  INSERT INTO public.fiscal_outbox (
    tenant_id,
    ecf_document_id,
    factura_id,
    operation,
    status,
    attempts,
    next_attempt_at,
    idempotency_key
  )
  VALUES (
    p_tenant_id,
    p_ecf_document_id,
    v_document.factura_id,
    'resubmit',
    'queued',
    0,
    now(),
    v_idempotency_key
  )
  RETURNING * INTO v_outbox;

  UPDATE public.ecf_documents
  SET
    status = 'pending_sync',
    dgii_status_message = 'Reencolado manualmente',
    last_error = NULL,
    updated_at = now()
  WHERE id = p_ecf_document_id
    AND tenant_id = p_tenant_id;

  INSERT INTO public.ecf_document_events (
    tenant_id, ecf_document_id, from_status, to_status, reason, metadata, created_by
  )
  VALUES (
    p_tenant_id,
    p_ecf_document_id,
    v_document.status,
    'pending_sync',
    'manual_reenqueue',
    jsonb_build_object(
      'outbox_id', v_outbox.id,
      'operation', 'resubmit',
      'idempotency_key', v_idempotency_key
    ),
    'trusted_rpc'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'outbox_id', v_outbox.id,
    'ecf_document_id', v_document.id,
    'status', 'pending_sync'
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.cloudix_reenqueue_ecf_document(uuid, uuid) TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_admin') THEN
    GRANT EXECUTE ON FUNCTION public.cloudix_reenqueue_ecf_document(uuid, uuid) TO project_admin;
  END IF;
END $$;
