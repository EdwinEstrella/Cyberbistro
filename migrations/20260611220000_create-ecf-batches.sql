-- Migration: Create public.ecf_batches and add batch fields to public.ecf_documents
-- Date: 2026-06-11 22:00:00

CREATE TABLE IF NOT EXISTS public.ecf_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  dgii_track_id text,
  dgii_status_code text,
  dgii_status_message text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecf_batches_status_check
    CHECK (status IN ('pending', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error'))
);

CREATE INDEX IF NOT EXISTS ecf_batches_tenant_status_idx
  ON public.ecf_batches (tenant_id, status, created_at DESC);

ALTER TABLE public.ecf_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_ecf_batches_tenant_select ON public.ecf_batches;
CREATE POLICY cb_ecf_batches_tenant_select ON public.ecf_batches
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_ecf_batches_tenant_insert ON public.ecf_batches;
CREATE POLICY cb_ecf_batches_tenant_insert ON public.ecf_batches
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_ecf_batches_no_app_update ON public.ecf_batches;
CREATE POLICY cb_ecf_batches_no_app_update ON public.ecf_batches
  FOR UPDATE TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS cb_ecf_batches_project_admin_all ON public.ecf_batches;
CREATE POLICY cb_ecf_batches_project_admin_all ON public.ecf_batches
  FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Update public.ecf_documents table
ALTER TABLE public.ecf_documents
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.ecf_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_scope text,
  ADD COLUMN IF NOT EXISTS rfce_threshold_used numeric;

-- Drop and recreate status check constraint on ecf_documents to include pending_configuration
ALTER TABLE public.ecf_documents
  DROP CONSTRAINT IF EXISTS ecf_documents_status_check;

ALTER TABLE public.ecf_documents
  ADD CONSTRAINT ecf_documents_status_check
  CHECK (status IN ('pending_offline', 'pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error', 'pending_configuration'));

-- Drop and recreate rejection_scope check constraint on ecf_documents
ALTER TABLE public.ecf_documents
  DROP CONSTRAINT IF EXISTS ecf_documents_rejection_scope_check;

ALTER TABLE public.ecf_documents
  ADD CONSTRAINT ecf_documents_rejection_scope_check
  CHECK (rejection_scope IS NULL OR rejection_scope IN ('individual', 'batch'));

-- Drop and recreate check constraints on ecf_document_events
ALTER TABLE public.ecf_document_events
  DROP CONSTRAINT IF EXISTS ecf_document_events_to_status_check,
  DROP CONSTRAINT IF EXISTS ecf_document_events_from_status_check;

ALTER TABLE public.ecf_document_events
  ADD CONSTRAINT ecf_document_events_to_status_check
    CHECK (to_status IN ('pending_offline', 'pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error', 'pending_configuration')),
  ADD CONSTRAINT ecf_document_events_from_status_check
    CHECK (from_status IS NULL OR from_status IN ('pending_offline', 'pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error', 'pending_configuration'));

-- Drop and recreate check constraint on fiscal_outbox to include blocked_configuration
ALTER TABLE public.fiscal_outbox
  DROP CONSTRAINT IF EXISTS fiscal_outbox_status_check;

ALTER TABLE public.fiscal_outbox
  ADD CONSTRAINT fiscal_outbox_status_check
    CHECK (status IN ('queued', 'processing', 'retryable_error', 'terminal_error', 'done', 'blocked_configuration'));
