ALTER TABLE public.consumos
  ADD COLUMN IF NOT EXISTS created_by_auth_user_id uuid NULL;

CREATE INDEX IF NOT EXISTS consumos_tenant_created_by_auth_user_idx
ON public.consumos (tenant_id, created_by_auth_user_id)
WHERE created_by_auth_user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
