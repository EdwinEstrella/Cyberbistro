-- Cedula (11 digits) of the company representative registered with the DGII. The e-CF signer
-- certificate may be issued to this natural person (e.g. Viafirma "NATURAL PERSON - TAX PROCEDURES"),
-- so the app compares it with the person identifier (IDCDO-...) of the certificate subject.
-- Optional and additive: invoices and the e-CF XML do not use it.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ecf_representative_id text;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_ecf_representative_id_digits_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_ecf_representative_id_digits_check
  CHECK (ecf_representative_id IS NULL OR ecf_representative_id ~ '^[0-9]{11}$');

COMMENT ON COLUMN public.tenants.ecf_representative_id IS
  'Cedula (11 digits, no dashes) of the representative registered with the DGII; owner of the personal e-CF signer certificate when applicable.';
