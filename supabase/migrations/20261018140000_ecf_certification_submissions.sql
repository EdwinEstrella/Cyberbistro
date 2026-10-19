-- DGII certification test-set runs ("Set de Pruebas") and their ordered submissions, written by the
-- ecf-certification edge function. Written as a file only; apply to remote Supabase after review.
-- The XML stored here is DGII test data built from the DGII workbook (never real invoices); admins
-- need the signed consumo (< RD$250k) e-CF to upload them in the DGII portal.

-- 1. One run per uploaded test set.
CREATE TABLE IF NOT EXISTS public.ecf_certification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('test', 'certification')),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);
CREATE INDEX IF NOT EXISTS ecf_certification_runs_tenant_created_idx
  ON public.ecf_certification_runs (tenant_id, created_at DESC);

-- 2. Ordered submissions of a run.
CREATE TABLE IF NOT EXISTS public.ecf_certification_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ecf_certification_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('test', 'certification')),
  case_id text NOT NULL,
  encf text NOT NULL CHECK (encf ~ '^E[0-9]{12}$'),
  tipo_ecf text NOT NULL CHECK (tipo_ecf ~ '^[0-9]{2}$'),
  kind text NOT NULL CHECK (kind IN ('ecf', 'rfce', 'portal_upload')),
  sequence_order integer NOT NULL CHECK (sequence_order >= 0),
  -- case_id of a submission that must be accepted (or signed, for an RFCE) before this one is sent.
  depends_on_case_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'accepted', 'accepted_conditional', 'rejected', 'error', 'ready_for_portal')),
  track_id text,
  dgii_messages jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dgii_messages) = 'array'),
  unsigned_xml text NOT NULL,
  signed_xml text,
  signed_sha256 text CHECK (signed_sha256 IS NULL OR signed_sha256 ~ '^[0-9a-f]{64}$'),
  security_code text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, case_id, kind),
  UNIQUE (run_id, sequence_order)
);
CREATE INDEX IF NOT EXISTS ecf_certification_submissions_tenant_idx
  ON public.ecf_certification_submissions (tenant_id);

ALTER TABLE public.ecf_certification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecf_certification_submissions ENABLE ROW LEVEL SECURITY;

-- No client writes: the edge function (service_role) owns every insert and update.
REVOKE ALL ON TABLE public.ecf_certification_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.ecf_certification_submissions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_certification_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_certification_submissions TO service_role;
GRANT SELECT (id, tenant_id, environment, source_sha256, created_by, created_at, status)
  ON public.ecf_certification_runs TO authenticated;
GRANT SELECT (id, run_id, tenant_id, environment, case_id, encf, tipo_ecf, kind, sequence_order, depends_on_case_id, status,
              track_id, dgii_messages, signed_xml, signed_sha256, security_code, attempts, updated_at, created_at)
  ON public.ecf_certification_submissions TO authenticated;

DROP POLICY IF EXISTS ecf_certification_runs_admin_select ON public.ecf_certification_runs;
CREATE POLICY ecf_certification_runs_admin_select ON public.ecf_certification_runs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_certification_runs.tenant_id AND tu.auth_user_id = (SELECT auth.uid()) AND tu.activo = true
      AND tu.rol IN ('admin', 'super_admin')
  ));

DROP POLICY IF EXISTS ecf_certification_submissions_admin_select ON public.ecf_certification_submissions;
CREATE POLICY ecf_certification_submissions_admin_select ON public.ecf_certification_submissions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_certification_submissions.tenant_id AND tu.auth_user_id = (SELECT auth.uid()) AND tu.activo = true
      AND tu.rol IN ('admin', 'super_admin')
  ));
