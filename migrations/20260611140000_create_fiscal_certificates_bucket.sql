-- Create fiscal_certificates bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fiscal_certificates', 
  'fiscal_certificates', 
  false, 
  5242880, 
  ARRAY['application/x-pkcs12', 'application/pkcs12', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- RLS para objetos en fiscal_certificates
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can upload certificates to their tenant folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'fiscal_certificates' AND
    (storage.foldername(name))[1] IS NOT NULL AND
    public.cyberbistro_has_tenant_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
);

CREATE POLICY "Admins can update their certificates"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'fiscal_certificates' AND
    (storage.foldername(name))[1] IS NOT NULL AND
    public.cyberbistro_has_tenant_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
)
WITH CHECK (
    bucket_id = 'fiscal_certificates' AND
    (storage.foldername(name))[1] IS NOT NULL AND
    public.cyberbistro_has_tenant_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
);

CREATE POLICY "Admins can read their certificates"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'fiscal_certificates' AND
    (storage.foldername(name))[1] IS NOT NULL AND
    public.cyberbistro_has_tenant_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
);

CREATE POLICY "Admins can delete their certificates"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'fiscal_certificates' AND
    (storage.foldername(name))[1] IS NOT NULL AND
    public.cyberbistro_has_tenant_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
);
