-- Migration: Add pending_rfce_batch to ecf_documents

ALTER TABLE public.ecf_documents
  DROP CONSTRAINT IF EXISTS ecf_documents_status_check;

ALTER TABLE public.ecf_documents
  ADD CONSTRAINT ecf_documents_status_check
  CHECK (status IN ('pending_offline', 'pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error', 'pending_configuration', 'pending_rfce_batch'));

ALTER TABLE public.ecf_document_events
  DROP CONSTRAINT IF EXISTS ecf_document_events_to_status_check,
  DROP CONSTRAINT IF EXISTS ecf_document_events_from_status_check;

ALTER TABLE public.ecf_document_events
  ADD CONSTRAINT ecf_document_events_to_status_check
    CHECK (to_status IN ('pending_offline', 'pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error', 'pending_configuration', 'pending_rfce_batch')),
  ADD CONSTRAINT ecf_document_events_from_status_check
    CHECK (from_status IS NULL OR from_status IN ('pending_offline', 'pending_sync', 'queued', 'signed', 'submitted', 'accepted', 'rejected', 'retryable_error', 'terminal_error', 'pending_configuration', 'pending_rfce_batch'));
