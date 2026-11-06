-- 6-character DGII security code (CodigoSeguridad) derived from the signed XML hash.
-- Printed on the representación impresa and used in the verification QR URL;
-- written by the fiscal worker right after signing.

ALTER TABLE public.ecf_documents
  ADD COLUMN IF NOT EXISTS dgii_security_code text;

COMMENT ON COLUMN public.ecf_documents.dgii_security_code IS
  '6-character DGII security code (CodigoSeguridad) derived from the signed XML hash, printed on the representación impresa and used in the QR URL; written by the fiscal worker.';
