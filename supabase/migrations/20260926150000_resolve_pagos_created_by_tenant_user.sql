-- cxc_pagos/cxp_pagos.created_by_auth_user_id references tenant_users(id), but
-- clients send the auth user id (auth.users.id). Every such payment was rejected
-- with cxc_pagos_created_by_auth_user_id_fkey and stuck in the desktop outbox.
-- Resolve the auth user id to the tenant_users row of the same tenant, or null
-- when unmapped, so the audit column never blocks sync.

CREATE OR REPLACE FUNCTION public.resolve_pagos_created_by_tenant_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  resolved uuid;
BEGIN
  IF NEW.created_by_auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Already a tenant_users id of this tenant.
  IF EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE id = NEW.created_by_auth_user_id AND tenant_id = NEW.tenant_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO resolved
  FROM public.tenant_users
  WHERE auth_user_id = NEW.created_by_auth_user_id AND tenant_id = NEW.tenant_id
  LIMIT 1;

  NEW.created_by_auth_user_id := resolved;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_pagos_created_by_tenant_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_resolve_cxc_pagos_created_by ON public.cxc_pagos;
CREATE TRIGGER trg_resolve_cxc_pagos_created_by
  BEFORE INSERT OR UPDATE OF created_by_auth_user_id, tenant_id ON public.cxc_pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_pagos_created_by_tenant_user();

DROP TRIGGER IF EXISTS trg_resolve_cxp_pagos_created_by ON public.cxp_pagos;
CREATE TRIGGER trg_resolve_cxp_pagos_created_by
  BEFORE INSERT OR UPDATE OF created_by_auth_user_id, tenant_id ON public.cxp_pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_pagos_created_by_tenant_user();
