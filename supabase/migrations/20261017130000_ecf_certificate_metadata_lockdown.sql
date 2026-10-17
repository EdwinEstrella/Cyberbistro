-- Lock down ecf_certificate_metadata for client roles.
-- Production had table-level INSERT/SELECT/UPDATE/DELETE grants for anon and authenticated, so the
-- custody columns (storage_ref, password_encrypted) were readable and is_ready was writable from the
-- browser, bypassing the validate-ecf-certificate edge function.
-- After this migration:
--   * anon: no access.
--   * authenticated: SELECT on non-secret columns only (RLS still scopes rows to the tenant).
--   * writes happen only through the edge function / fiscal worker (service_role).

REVOKE ALL ON TABLE public.ecf_certificate_metadata FROM anon, authenticated;

GRANT SELECT (
  id,
  tenant_id,
  environment,
  subject,
  issuer,
  serial_number,
  valid_from,
  valid_until,
  is_ready,
  last_validation_error,
  created_at,
  updated_at
) ON public.ecf_certificate_metadata TO authenticated;
