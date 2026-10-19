-- DGII certification step 4 ("Pruebas de Simulacion e-CF"): run type 'simulation' and a guard so a
-- tenant-issued e-NCF is never stored twice across test-set and simulation runs.
-- Written as a file only; apply to remote Supabase after review, before redeploying ecf-certification.

-- 1. Run type 'simulation'.
ALTER TABLE public.ecf_certification_runs
  DROP CONSTRAINT IF EXISTS ecf_certification_runs_run_type_check;
ALTER TABLE public.ecf_certification_runs
  ADD CONSTRAINT ecf_certification_runs_run_type_check CHECK (run_type IN ('test_set', 'commercial_approval', 'simulation'));

-- 2. Denormalized run type on submissions (a partial index cannot look at the run row), kept in sync
--    by the insert trigger below, plus the source test case of a simulation document (traceability:
--    a simulation case id derives from its new e-NCF).
ALTER TABLE public.ecf_certification_submissions
  ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'test_set';
ALTER TABLE public.ecf_certification_submissions
  ADD COLUMN IF NOT EXISTS source_case_id text;

UPDATE public.ecf_certification_submissions s
SET run_type = r.run_type
FROM public.ecf_certification_runs r
WHERE r.id = s.run_id AND s.run_type IS DISTINCT FROM r.run_type;

ALTER TABLE public.ecf_certification_submissions
  DROP CONSTRAINT IF EXISTS ecf_certification_submissions_run_type_check;
ALTER TABLE public.ecf_certification_submissions
  ADD CONSTRAINT ecf_certification_submissions_run_type_check CHECK (run_type IN ('test_set', 'commercial_approval', 'simulation'));

GRANT SELECT (run_type, source_case_id) ON public.ecf_certification_submissions TO authenticated;

-- 3. Guard. A simulation e-NCF (signed e-CF: kinds ecf and portal_upload; an RFCE shares the e-NCF
--    of its E32 and is excluded) is unique per tenant and environment among simulation runs. Test-set
--    runs keep the DGII workbook numbers and may be re-run with the same workbook, so they are not
--    unique among themselves; the trigger rejects a simulation row that reuses a test-set e-NCF and a
--    test-set row that reuses a simulation e-NCF. Commercial approval runs hold the DGII emitter's
--    e-NCF and are ignored. Current data: no ecf/portal_upload e-NCF repeats across runs.
CREATE UNIQUE INDEX IF NOT EXISTS ecf_certification_submissions_simulation_encf_key
  ON public.ecf_certification_submissions (tenant_id, environment, encf)
  WHERE run_type = 'simulation' AND kind IN ('ecf', 'portal_upload');

CREATE INDEX IF NOT EXISTS ecf_certification_submissions_tenant_encf_idx
  ON public.ecf_certification_submissions (tenant_id, environment, encf);

CREATE OR REPLACE FUNCTION public.ecf_certification_submissions_issued_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  SELECT r.run_type INTO NEW.run_type FROM public.ecf_certification_runs r WHERE r.id = NEW.run_id;
  IF NEW.run_type IS NULL THEN
    RAISE EXCEPTION 'ecf_certification run % does not exist', NEW.run_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.run_type IN ('test_set', 'simulation') AND NEW.kind IN ('ecf', 'portal_upload') AND EXISTS (
    SELECT 1 FROM public.ecf_certification_submissions s
    WHERE s.tenant_id = NEW.tenant_id
      AND s.environment = NEW.environment
      AND s.encf = NEW.encf
      AND s.kind IN ('ecf', 'portal_upload')
      AND s.run_type IN ('test_set', 'simulation')
      AND s.run_type <> NEW.run_type
  ) THEN
    RAISE EXCEPTION 'e-NCF % was already issued by this tenant', NEW.encf USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ecf_certification_submissions_issued_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ecf_certification_submissions_issued_guard ON public.ecf_certification_submissions;
CREATE TRIGGER ecf_certification_submissions_issued_guard
  BEFORE INSERT ON public.ecf_certification_submissions
  FOR EACH ROW EXECUTE FUNCTION public.ecf_certification_submissions_issued_guard();
