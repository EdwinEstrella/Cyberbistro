-- Automatically resolve auth_user_id to tenant_users(id) or nullify if unmapped
-- so foreign key constraints on compras and inventario_movimientos never block sync.

CREATE OR REPLACE FUNCTION public.resolve_compras_tenant_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.usuario_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.tenant_users WHERE id = NEW.usuario_id) THEN
      RETURN NEW;
    END IF;
    SELECT id INTO NEW.usuario_id
    FROM public.tenant_users
    WHERE auth_user_id = NEW.usuario_id AND tenant_id = NEW.tenant_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_compras_tenant_user_id ON public.compras;
CREATE TRIGGER trg_resolve_compras_tenant_user_id
  BEFORE INSERT OR UPDATE ON public.compras
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_compras_tenant_user_id();

CREATE OR REPLACE FUNCTION public.resolve_inventario_movimientos_tenant_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.usuario_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.tenant_users WHERE id = NEW.usuario_id) THEN
      RETURN NEW;
    END IF;
    SELECT id INTO NEW.usuario_id
    FROM public.tenant_users
    WHERE auth_user_id = NEW.usuario_id AND tenant_id = NEW.tenant_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_inventario_movimientos_tenant_user_id ON public.inventario_movimientos;
CREATE TRIGGER trg_resolve_inventario_movimientos_tenant_user_id
  BEFORE INSERT OR UPDATE ON public.inventario_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_inventario_movimientos_tenant_user_id();
