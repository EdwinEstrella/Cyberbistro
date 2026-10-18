-- DGII certification: a run is either the test set (step 2) or the commercial approval set (step 3).
-- Written as a file only; apply to remote Supabase after review, before redeploying ecf-certification.

-- 1. Run type. Existing runs are test sets.
ALTER TABLE public.ecf_certification_runs
  ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'test_set';

ALTER TABLE public.ecf_certification_runs
  DROP CONSTRAINT IF EXISTS ecf_certification_runs_run_type_check;
ALTER TABLE public.ecf_certification_runs
  ADD CONSTRAINT ecf_certification_runs_run_type_check CHECK (run_type IN ('test_set', 'commercial_approval'));

GRANT SELECT (run_type) ON public.ecf_certification_runs TO authenticated;

-- 2. Submission kind 'acecf'. The CHECK was created inline (generated name), so find it by definition.
DO $$
DECLARE
  existing record;
BEGIN
  FOR existing IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.ecf_certification_submissions'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%kind%'
      AND pg_get_constraintdef(con.oid) LIKE '%portal_upload%'
  LOOP
    EXECUTE format('ALTER TABLE public.ecf_certification_submissions DROP CONSTRAINT %I', existing.conname);
  END LOOP;
END
$$;

ALTER TABLE public.ecf_certification_submissions
  ADD CONSTRAINT ecf_certification_submissions_kind_check CHECK (kind IN ('ecf', 'rfce', 'portal_upload', 'acecf'));

-- 3. Latest-run lookups filter by type.
CREATE INDEX IF NOT EXISTS ecf_certification_runs_tenant_type_created_idx
  ON public.ecf_certification_runs (tenant_id, run_type, created_at DESC);
