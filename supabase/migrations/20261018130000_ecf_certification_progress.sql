-- DGII certification wizard progress and the audit trail of documents signed by ecf-sign-document.
-- Written as a file only; apply to remote Supabase after review.
-- Style mirrors 20261017160000_ecf_receptor.sql: RLS on, explicit grants, no anon access.

-- 1. Wizard progress: one row per tenant. Members read it; only tenant admins write it.
CREATE TABLE IF NOT EXISTS public.ecf_certification_progress (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'certification',
  current_step smallint NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 15),
  completed_steps smallint[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK (completed_steps <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]::smallint[])
);

ALTER TABLE public.ecf_certification_progress ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ecf_certification_progress FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ecf_certification_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_certification_progress TO service_role;

DROP POLICY IF EXISTS ecf_certification_progress_member_select ON public.ecf_certification_progress;
CREATE POLICY ecf_certification_progress_member_select ON public.ecf_certification_progress
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_certification_progress.tenant_id AND tu.auth_user_id = auth.uid() AND tu.activo = true
  ));

DROP POLICY IF EXISTS ecf_certification_progress_admin_insert ON public.ecf_certification_progress;
CREATE POLICY ecf_certification_progress_admin_insert ON public.ecf_certification_progress
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_certification_progress.tenant_id AND tu.auth_user_id = auth.uid() AND tu.activo = true
      AND tu.rol IN ('admin', 'super_admin')
  ));

DROP POLICY IF EXISTS ecf_certification_progress_admin_update ON public.ecf_certification_progress;
CREATE POLICY ecf_certification_progress_admin_update ON public.ecf_certification_progress
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_certification_progress.tenant_id AND tu.auth_user_id = auth.uid() AND tu.activo = true
      AND tu.rol IN ('admin', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_certification_progress.tenant_id AND tu.auth_user_id = auth.uid() AND tu.activo = true
      AND tu.rol IN ('admin', 'super_admin')
  ));

-- 2. Audit of signed documents. Hashes only: never the XML or any secret. Written by the edge function.
CREATE TABLE IF NOT EXISTS public.ecf_signed_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('postulacion', 'declaracion_jurada')),
  root_element text NOT NULL,
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  output_sha256 text NOT NULL CHECK (output_sha256 ~ '^[0-9a-f]{64}$'),
  signed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ecf_signed_documents_tenant_created_idx
  ON public.ecf_signed_documents (tenant_id, created_at DESC);

ALTER TABLE public.ecf_signed_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ecf_signed_documents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_signed_documents TO service_role;
GRANT SELECT (id, tenant_id, environment, document_type, root_element, input_sha256, output_sha256, signed_by, created_at)
  ON public.ecf_signed_documents TO authenticated;

DROP POLICY IF EXISTS ecf_signed_documents_admin_select ON public.ecf_signed_documents;
CREATE POLICY ecf_signed_documents_admin_select ON public.ecf_signed_documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_signed_documents.tenant_id AND tu.auth_user_id = auth.uid() AND tu.activo = true
      AND tu.rol IN ('admin', 'super_admin')
  ));
