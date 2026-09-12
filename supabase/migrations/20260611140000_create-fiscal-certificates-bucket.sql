-- No-op placeholder.
-- The fiscal_certificates bucket already exists in the remote backend.
-- This file remains so the local migration history stays aligned without
-- trying to mutate storage.objects in a way that the backend rejects.

DO $$
BEGIN
  NULL;
END;
$$;
