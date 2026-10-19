-- e-CF receptor (DGII inbound services): seeds, access tokens, received e-CF and commercial approvals.
-- Written as a file only; apply to remote Supabase after review.
-- All tables are server-side only: RLS on, no anon/authenticated grants (mirrors
-- 20261017130000_ecf_certificate_metadata_lockdown.sql). The ecf-receptor edge function uses service_role.

-- 1. Single-use authentication seeds. Only the SHA-256 of the seed value is stored.
CREATE TABLE IF NOT EXISTS public.ecf_receptor_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seed_hash text NOT NULL CHECK (seed_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seed_hash)
);
CREATE INDEX IF NOT EXISTS ecf_receptor_seeds_expires_idx ON public.ecf_receptor_seeds (expires_at);

-- 2. Short-lived bearer tokens issued after a signed seed is validated. Only the hash is stored.
CREATE TABLE IF NOT EXISTS public.ecf_receptor_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  subject_rnc text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS ecf_receptor_tokens_expires_idx ON public.ecf_receptor_tokens (expires_at);

-- 3. Received e-CF (signed XML as received) and the ARECF returned to the sender.
CREATE TABLE IF NOT EXISTS public.ecf_received_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  emisor_rnc text NOT NULL,
  comprador_rnc text NOT NULL,
  encf text NOT NULL,
  tipo_ecf text,
  estado smallint NOT NULL CHECK (estado IN (0, 1)),
  motivo_no_recibido smallint CHECK (motivo_no_recibido IN (1, 2, 3, 4)),
  xml text NOT NULL,
  arecf_xml text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((estado = 1) = (motivo_no_recibido IS NOT NULL))
);
-- One accepted document per (tenant, emisor, eNCF): the basis of the "duplicate" (code 3) rule.
CREATE UNIQUE INDEX IF NOT EXISTS ecf_received_documents_accepted_uidx
  ON public.ecf_received_documents (tenant_id, emisor_rnc, encf) WHERE estado = 0;
CREATE INDEX IF NOT EXISTS ecf_received_documents_tenant_received_idx
  ON public.ecf_received_documents (tenant_id, received_at DESC);

-- 4. Received commercial approvals (ACECF).
CREATE TABLE IF NOT EXISTS public.ecf_received_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  emisor_rnc text NOT NULL,
  comprador_rnc text NOT NULL,
  encf text NOT NULL,
  estado smallint NOT NULL,
  detalle_motivo_rechazo text,
  xml text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ecf_received_approvals_tenant_received_idx
  ON public.ecf_received_approvals (tenant_id, received_at DESC);

-- 5. Lockdown: server-side only.
ALTER TABLE public.ecf_receptor_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecf_receptor_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecf_received_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecf_received_approvals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ecf_receptor_seeds FROM anon, authenticated;
REVOKE ALL ON TABLE public.ecf_receptor_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.ecf_received_documents FROM anon, authenticated;
REVOKE ALL ON TABLE public.ecf_received_approvals FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_receptor_seeds TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_receptor_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_received_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecf_received_approvals TO service_role;

-- Tenants read their own received documents (no secrets in these tables except the XML payload).
GRANT SELECT (id, tenant_id, emisor_rnc, comprador_rnc, encf, tipo_ecf, estado, motivo_no_recibido, received_at)
  ON public.ecf_received_documents TO authenticated;
GRANT SELECT (id, tenant_id, emisor_rnc, comprador_rnc, encf, estado, detalle_motivo_rechazo, received_at)
  ON public.ecf_received_approvals TO authenticated;

DROP POLICY IF EXISTS ecf_received_documents_tenant_select ON public.ecf_received_documents;
CREATE POLICY ecf_received_documents_tenant_select ON public.ecf_received_documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_received_documents.tenant_id AND tu.auth_user_id = auth.uid() AND tu.activo = true
  ));

DROP POLICY IF EXISTS ecf_received_approvals_tenant_select ON public.ecf_received_approvals;
CREATE POLICY ecf_received_approvals_tenant_select ON public.ecf_received_approvals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = ecf_received_approvals.tenant_id AND tu.auth_user_id = auth.uid() AND tu.activo = true
  ));

-- 6. Tenant resolution by RNC. Digits-only comparison (stored RNCs may contain dashes/spaces).
--    Returns no row when the RNC is unknown OR shared by several tenants (never guess).
CREATE OR REPLACE FUNCTION public.ecf_receptor_resolve_tenant(p_rnc text)
RETURNS TABLE (tenant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
  FROM public.tenants t
  WHERE regexp_replace(COALESCE(t.rnc, ''), '\D', '', 'g') = regexp_replace(COALESCE(p_rnc, ''), '\D', '', 'g')
    AND regexp_replace(COALESCE(p_rnc, ''), '\D', '', 'g') <> ''
    AND (
      SELECT count(*) FROM public.tenants t2
      WHERE regexp_replace(COALESCE(t2.rnc, ''), '\D', '', 'g') = regexp_replace(COALESCE(p_rnc, ''), '\D', '', 'g')
    ) = 1;
$$;

REVOKE ALL ON FUNCTION public.ecf_receptor_resolve_tenant(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ecf_receptor_resolve_tenant(text) TO service_role;

-- 7. Housekeeping for expired seeds/tokens (callable by the function; no schedule is created here).
CREATE OR REPLACE FUNCTION public.ecf_receptor_purge_expired()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (DELETE FROM public.ecf_receptor_seeds WHERE expires_at < now() - interval '1 day' RETURNING 1),
       k AS (DELETE FROM public.ecf_receptor_tokens WHERE expires_at < now() - interval '1 day' RETURNING 1)
  SELECT (SELECT count(*) FROM s)::integer + (SELECT count(*) FROM k)::integer;
$$;
REVOKE ALL ON FUNCTION public.ecf_receptor_purge_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ecf_receptor_purge_expired() TO service_role;
