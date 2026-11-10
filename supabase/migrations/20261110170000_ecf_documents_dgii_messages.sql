-- Normalized DGII observations/messages (mensajes) returned from DGII reception and inquiry endpoints.
-- Preserved across polling cycles as jsonb: [{ "code": string|null, "text": string }].

ALTER TABLE public.ecf_documents
  ADD COLUMN IF NOT EXISTS dgii_messages jsonb;

COMMENT ON COLUMN public.ecf_documents.dgii_messages IS
  'Normalized DGII messages and observations array [{code, text}] returned from submit/poll responses (e.g. Aceptado Condicional); written by the fiscal worker.';
