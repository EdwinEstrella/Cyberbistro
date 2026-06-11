ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS fiscal_mode text DEFAULT 'ncf_legacy' NOT NULL,
  ADD COLUMN IF NOT EXISTS fiscal_status text,
  ADD COLUMN IF NOT EXISTS fiscal_document_id uuid;

ALTER TABLE public.facturas
  DROP CONSTRAINT IF EXISTS facturas_fiscal_mode_check;

ALTER TABLE public.facturas
  ADD CONSTRAINT facturas_fiscal_mode_check
  CHECK (fiscal_mode IN ('internal_receipt', 'ncf_legacy', 'dgii_ecf'));
