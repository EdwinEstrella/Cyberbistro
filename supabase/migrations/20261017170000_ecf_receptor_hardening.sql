-- e-CF receptor hardening (follows 20261017160000_ecf_receptor.sql).
-- Written as a file only; apply to remote Supabase after review.
--   * Rejected receptions keep only a hash + reason (no full XML), so unauthenticated-ish traffic cannot
--     grow storage with payloads. Accepted documents keep the XML.
--   * One commercial approval per (tenant, emisor, eNCF, buyer); the latest one from the same buyer wins.
--   * Seeds are now stateless (HMAC); ecf_receptor_seeds only records CONSUMED seeds (single use).
--   * ecf_receptor_tokens.subject_rnc stores the comma separated RNC / cedula numbers asserted by the
--     certificate that authenticated; reception and approval check them against the document.
--   * Daily purge of expired seeds/tokens through pg_cron when that extension is installed.

-- 1. Received documents: hash for every submission, XML only when accepted.
ALTER TABLE public.ecf_received_documents ADD COLUMN IF NOT EXISTS xml_sha256 text;
UPDATE public.ecf_received_documents
SET xml_sha256 = encode(sha256(convert_to(xml, 'UTF8')), 'hex')
WHERE xml_sha256 IS NULL AND xml IS NOT NULL;
UPDATE public.ecf_received_documents SET xml_sha256 = repeat('0', 64) WHERE xml_sha256 IS NULL;
ALTER TABLE public.ecf_received_documents ALTER COLUMN xml_sha256 SET NOT NULL;
ALTER TABLE public.ecf_received_documents ALTER COLUMN xml DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ecf_received_documents_xml_sha256_check') THEN
    ALTER TABLE public.ecf_received_documents
      ADD CONSTRAINT ecf_received_documents_xml_sha256_check CHECK (xml_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ecf_received_documents_accepted_has_xml') THEN
    ALTER TABLE public.ecf_received_documents
      ADD CONSTRAINT ecf_received_documents_accepted_has_xml CHECK (estado = 1 OR xml IS NOT NULL);
  END IF;
END $$;

-- Repeated identical rejected submissions collapse into one audit row. Existing duplicates are removed first
-- (keeping the earliest) so the unique index can never abort the migration on real data.
DELETE FROM public.ecf_received_documents a
USING public.ecf_received_documents b
WHERE a.estado = 1
  AND b.estado = 1
  AND a.tenant_id = b.tenant_id
  AND a.xml_sha256 = b.xml_sha256
  AND a.motivo_no_recibido = b.motivo_no_recibido
  AND (a.received_at, a.id) > (b.received_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS ecf_received_documents_rejected_uidx
  ON public.ecf_received_documents (tenant_id, xml_sha256, motivo_no_recibido) WHERE estado = 1;

-- 2. Commercial approvals: keep only the latest per (tenant, emisor, eNCF, buyer). The buyer is part of the key,
--    so a different buyer can never replace an existing approval.
DELETE FROM public.ecf_received_approvals a
USING public.ecf_received_approvals b
WHERE a.tenant_id = b.tenant_id
  AND a.emisor_rnc = b.emisor_rnc
  AND a.encf = b.encf
  AND a.comprador_rnc = b.comprador_rnc
  AND (a.received_at, a.id) < (b.received_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS ecf_received_approvals_uidx
  ON public.ecf_received_approvals (tenant_id, emisor_rnc, encf, comprador_rnc);

COMMENT ON COLUMN public.ecf_receptor_tokens.subject_rnc IS
  'Comma separated RNC/cedula numbers asserted by the certificate that authenticated this token.';

-- 3. Signer identity evidence. The DGII/e-invoicing certificate profiles of the Dominican CAs are issued to a
--    PERSON (cedula/passport) and usually carry no company RNC, so a document is accepted on chain trust +
--    signature validity and flagged when its RNC could not be tied to the signer certificate.
ALTER TABLE public.ecf_received_documents
  ADD COLUMN IF NOT EXISTS signer_ids text,
  ADD COLUMN IF NOT EXISTS signer_serial text,
  ADD COLUMN IF NOT EXISTS signer_rnc_mismatch boolean NOT NULL DEFAULT false;
ALTER TABLE public.ecf_received_approvals
  ADD COLUMN IF NOT EXISTS signer_ids text,
  ADD COLUMN IF NOT EXISTS signer_serial text,
  ADD COLUMN IF NOT EXISTS signer_rnc_mismatch boolean NOT NULL DEFAULT false;
-- Tenants may see the flag (not the signer's personal document numbers).
GRANT SELECT (signer_rnc_mismatch) ON public.ecf_received_documents TO authenticated;
GRANT SELECT (signer_rnc_mismatch) ON public.ecf_received_approvals TO authenticated;

-- 4. Scheduled purge (only when pg_cron is installed; creating the extension needs superuser, so it is not done here).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ecf-receptor-purge-expired';
    PERFORM cron.schedule('ecf-receptor-purge-expired', '17 4 * * *', 'select public.ecf_receptor_purge_expired()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed: schedule select public.ecf_receptor_purge_expired() daily by other means.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule the ecf-receptor purge (%): schedule it manually.', SQLERRM;
END $$;
