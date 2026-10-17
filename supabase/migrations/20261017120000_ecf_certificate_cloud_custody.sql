-- e-CF certificate cloud custody.
-- Written as a file only; apply to remote Supabase after review.

-- 1. Columns written by the validate-ecf-certificate edge function and read by the fiscal worker.
--    They are intentionally NOT granted to anon/authenticated (see 20260611180000).
DO $$
BEGIN
  IF to_regclass('public.ecf_certificate_metadata') IS NOT NULL THEN
    ALTER TABLE public.ecf_certificate_metadata ADD COLUMN IF NOT EXISTS storage_ref text;
    ALTER TABLE public.ecf_certificate_metadata ADD COLUMN IF NOT EXISTS password_encrypted text;
    -- The edge function upserts with onConflict "tenant_id,environment".
    CREATE UNIQUE INDEX IF NOT EXISTS ecf_certificate_metadata_tenant_environment_uidx
      ON public.ecf_certificate_metadata (tenant_id, environment);
  END IF;
END $$;

-- 2. Private bucket (the earlier migration was a no-op placeholder; the bucket exists remotely).
INSERT INTO storage.buckets (id, name, public)
VALUES ('fiscal_certificates', 'fiscal_certificates', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Tenant admins may upload new objects under their own tenant folder. No SELECT/UPDATE/DELETE
--    policy for clients: the edge function and the fiscal worker read with the service role.
DO $$
BEGIN
  DROP POLICY IF EXISTS fiscal_certificates_tenant_admin_insert ON storage.objects;
  CREATE POLICY fiscal_certificates_tenant_admin_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fiscal_certificates'
    AND lower(name) LIKE '%.p12'
    AND EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id::text = (storage.foldername(name))[1]
        AND tu.auth_user_id = auth.uid()
        AND tu.activo = true
        AND tu.rol IN ('admin', 'super_admin')
    )
  );
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping storage.objects policy: insufficient privilege. Create it from the dashboard.';
END $$;
