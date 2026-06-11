-- Add DGII e-CF fiscal mode, document lifecycle, certificate metadata, and worker outbox infrastructure.

-- Tenant fiscal mode is additive and preserves legacy NCF behavior.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS fiscal_mode text;

UPDATE public.tenants
SET fiscal_mode = CASE
  WHEN ncf_fiscal_activo IS TRUE THEN 'ncf_legacy'
  ELSE 'internal_receipt'
END
WHERE fiscal_mode IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN fiscal_mode SET DEFAULT 'internal_receipt',
  ALTER COLUMN fiscal_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_fiscal_mode_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_fiscal_mode_check
      CHECK (fiscal_mode IN ('internal_receipt', 'ncf_legacy', 'dgii_ecf'));
  END IF;
END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS fiscal_mode_fallback text DEFAULT 'internal_receipt',
  ADD COLUMN IF NOT EXISTS ecf_environment text NOT NULL DEFAULT 'certification';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_fiscal_mode_fallback_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_fiscal_mode_fallback_check
      CHECK (fiscal_mode_fallback IS NULL OR fiscal_mode_fallback IN ('internal_receipt', 'ncf_legacy'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_ecf_environment_check'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_ecf_environment_check
      CHECK (ecf_environment IN ('test', 'certification', 'production'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ecf_certificate_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'certification',
  subject text,
  issuer text,
  serial_number text,
  valid_from timestamptz,
  valid_until timestamptz,
  is_ready boolean NOT NULL DEFAULT false,
  last_validation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecf_certificate_metadata_environment_check
    CHECK (environment IN ('test', 'certification', 'production'))
);

CREATE TABLE IF NOT EXISTS public.ecf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  factura_id uuid NOT NULL REFERENCES public.facturas(id) ON DELETE RESTRICT,
  certificate_metadata_id uuid REFERENCES public.ecf_certificate_metadata(id) ON DELETE SET NULL,
  ecf_type text,
  status text NOT NULL DEFAULT 'pending_sync',
  dgii_track_id text,
  dgii_status_code text,
  dgii_status_message text,
  xml_hash text,
  signed_xml_storage_key text,
  submitted_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecf_documents_status_check
    CHECK (status IN ('pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error')),
  CONSTRAINT ecf_documents_tenant_factura_unique UNIQUE (tenant_id, factura_id)
);

CREATE TABLE IF NOT EXISTS public.ecf_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ecf_document_id uuid NOT NULL REFERENCES public.ecf_documents(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecf_document_events_to_status_check
    CHECK (to_status IN ('pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error')),
  CONSTRAINT ecf_document_events_from_status_check
    CHECK (from_status IS NULL OR from_status IN ('pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error'))
);

CREATE TABLE IF NOT EXISTS public.fiscal_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ecf_document_id uuid NOT NULL REFERENCES public.ecf_documents(id) ON DELETE CASCADE,
  factura_id uuid NOT NULL REFERENCES public.facturas(id) ON DELETE RESTRICT,
  operation text NOT NULL DEFAULT 'submit',
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  idempotency_key text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_outbox_operation_check
    CHECK (operation IN ('submit', 'poll_status', 'resubmit')),
  CONSTRAINT fiscal_outbox_status_check
    CHECK (status IN ('queued', 'processing', 'retryable_error', 'terminal_error', 'done')),
  CONSTRAINT fiscal_outbox_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS ecf_certificate_metadata_tenant_idx
  ON public.ecf_certificate_metadata (tenant_id, environment, is_ready);
CREATE INDEX IF NOT EXISTS ecf_documents_tenant_status_idx
  ON public.ecf_documents (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ecf_documents_factura_idx
  ON public.ecf_documents (factura_id);
CREATE INDEX IF NOT EXISTS ecf_document_events_document_idx
  ON public.ecf_document_events (tenant_id, ecf_document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_outbox_tenant_status_idx
  ON public.fiscal_outbox (tenant_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS fiscal_outbox_document_idx
  ON public.fiscal_outbox (ecf_document_id);

ALTER TABLE public.ecf_certificate_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecf_document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_ecf_certificate_metadata_admin_select ON public.ecf_certificate_metadata;
CREATE POLICY cb_ecf_certificate_metadata_admin_select ON public.ecf_certificate_metadata
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_ecf_certificate_metadata_admin_insert ON public.ecf_certificate_metadata;
CREATE POLICY cb_ecf_certificate_metadata_admin_insert ON public.ecf_certificate_metadata
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_ecf_certificate_metadata_admin_update ON public.ecf_certificate_metadata;
CREATE POLICY cb_ecf_certificate_metadata_admin_update ON public.ecf_certificate_metadata
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_ecf_certificate_metadata_project_admin_all ON public.ecf_certificate_metadata;
CREATE POLICY cb_ecf_certificate_metadata_project_admin_all ON public.ecf_certificate_metadata
  FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cb_ecf_documents_tenant_select ON public.ecf_documents;
CREATE POLICY cb_ecf_documents_tenant_select ON public.ecf_documents
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_ecf_documents_tenant_insert ON public.ecf_documents;
CREATE POLICY cb_ecf_documents_tenant_insert ON public.ecf_documents
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_ecf_documents_tenant_update ON public.ecf_documents;
DROP POLICY IF EXISTS cb_ecf_documents_no_app_update ON public.ecf_documents;
CREATE POLICY cb_ecf_documents_no_app_update ON public.ecf_documents
  FOR UPDATE TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS cb_ecf_documents_project_admin_all ON public.ecf_documents;
CREATE POLICY cb_ecf_documents_project_admin_all ON public.ecf_documents
  FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cb_ecf_document_events_tenant_select ON public.ecf_document_events;
CREATE POLICY cb_ecf_document_events_tenant_select ON public.ecf_document_events
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_ecf_document_events_project_admin_all ON public.ecf_document_events;
CREATE POLICY cb_ecf_document_events_project_admin_all ON public.ecf_document_events
  FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cb_fiscal_outbox_tenant_select ON public.fiscal_outbox;
CREATE POLICY cb_fiscal_outbox_tenant_select ON public.fiscal_outbox
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_fiscal_outbox_tenant_insert ON public.fiscal_outbox;
CREATE POLICY cb_fiscal_outbox_tenant_insert ON public.fiscal_outbox
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_fiscal_outbox_no_app_update ON public.fiscal_outbox;
CREATE POLICY cb_fiscal_outbox_no_app_update ON public.fiscal_outbox
  FOR UPDATE TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS cb_fiscal_outbox_no_app_delete ON public.fiscal_outbox;
CREATE POLICY cb_fiscal_outbox_no_app_delete ON public.fiscal_outbox
  FOR DELETE TO public
  USING (false);

DROP POLICY IF EXISTS cb_fiscal_outbox_project_admin_all ON public.fiscal_outbox;
CREATE POLICY cb_fiscal_outbox_project_admin_all ON public.fiscal_outbox
  FOR ALL TO project_admin USING (true) WITH CHECK (true);
