-- Migración para implementar límites de usuarios según el plan del tenant

CREATE OR REPLACE FUNCTION public.check_tenant_user_limits()
RETURNS trigger AS $$
DECLARE
  v_limit_enabled boolean;
  v_admin_limit integer;
  v_cajera_limit integer;
  v_cocina_limit integer;
  v_mesero_limit integer;
  v_current_count integer;
  v_target_limit integer;
BEGIN
  -- Si el usuario no está siendo activado, no validamos el límite (pueden tener usuarios inactivos)
  IF NOT NEW.activo THEN
    RETURN NEW;
  END IF;

  -- Leer la configuración del plan del restaurante
  SELECT 
    user_limit_enabled, 
    coalesce(admin_user_limit, 9999), 
    coalesce(cajera_user_limit, 9999), 
    coalesce(cocina_user_limit, 9999), 
    coalesce(mesero_user_limit, 9999)
  INTO 
    v_limit_enabled, v_admin_limit, v_cajera_limit, v_cocina_limit, v_mesero_limit
  FROM public.tenants
  WHERE id = NEW.tenant_id;

  -- Si los límites no están habilitados para este tenant, permitir
  IF NOT coalesce(v_limit_enabled, false) THEN
    RETURN NEW;
  END IF;

  -- Determinar qué límite aplica basado en el rol del usuario
  CASE NEW.rol
    WHEN 'admin' THEN v_target_limit := v_admin_limit;
    WHEN 'cajera' THEN v_target_limit := v_cajera_limit;
    WHEN 'cocina' THEN v_target_limit := v_cocina_limit;
    WHEN 'mesero' THEN v_target_limit := v_mesero_limit;
    ELSE v_target_limit := 9999; -- Rol desconocido, no limitar
  END CASE;

  -- Contar cuántos usuarios activos ya existen para este rol y tenant (excluyendo el que se está actualizando)
  SELECT count(*) INTO v_current_count
  FROM public.tenant_users
  WHERE tenant_id = NEW.tenant_id
    AND rol = NEW.rol
    AND activo = true
    AND id != coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Validar si se excede el límite
  IF v_current_count >= v_target_limit THEN
    RAISE EXCEPTION 'Límite de usuarios activos alcanzado para el rol "%". Límite del plan: %.', NEW.rol, v_target_limit
      USING ERRCODE = 'P0001'; -- Código genérico de excepción plpgsql
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger en la tabla tenant_users
DROP TRIGGER IF EXISTS enforce_tenant_user_limits_trg ON public.tenant_users;

CREATE TRIGGER enforce_tenant_user_limits_trg
BEFORE INSERT OR UPDATE OF activo, rol ON public.tenant_users
FOR EACH ROW
EXECUTE FUNCTION public.check_tenant_user_limits();

NOTIFY pgrst, 'reload schema';