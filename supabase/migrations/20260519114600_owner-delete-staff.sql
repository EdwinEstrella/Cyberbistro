-- RPC para que el dueño (admin) de un restaurante pueda eliminar un usuario de staff y desenlazarlo
-- de cierres y comandas, ademas de eliminar su cuenta en auth.users.

CREATE OR REPLACE FUNCTION public.cloudix_owner_delete_staff_user(p_tenant_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_row public.tenant_users%ROWTYPE;
BEGIN
  -- Validar que exista el usuario a eliminar
  SELECT *
  INTO target_row
  FROM public.tenant_users
  WHERE id = p_tenant_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- Validar que el usuario actual tenga permisos sobre este tenant
  IF NOT (target_row.tenant_id = ANY(public.cyberbistro_current_admin_tenant_ids())) THEN
    RAISE EXCEPTION 'No tienes permisos de administrador en este negocio para eliminar usuarios';
  END IF;

  IF target_row.rol = 'admin' THEN
    RAISE EXCEPTION 'No puedes eliminar a un administrador del negocio directamente.';
  END IF;

  -- Desenlazar referencias
  IF target_row.auth_user_id IS NOT NULL THEN
    UPDATE public.cierres_operativos
    SET
      opened_by_auth_user_id = CASE
        WHEN opened_by_auth_user_id = target_row.auth_user_id THEN NULL
        ELSE opened_by_auth_user_id
      END,
      closed_by_auth_user_id = CASE
        WHEN closed_by_auth_user_id = target_row.auth_user_id THEN NULL
        ELSE closed_by_auth_user_id
      END
    WHERE tenant_id = target_row.tenant_id
      AND (
        opened_by_auth_user_id = target_row.auth_user_id
        OR closed_by_auth_user_id = target_row.auth_user_id
      );

    UPDATE public.comandas
    SET creado_por = NULL
    WHERE tenant_id = target_row.tenant_id
      AND creado_por = target_row.auth_user_id::text;
  END IF;

  -- Eliminar de tenant_users
  DELETE FROM public.tenant_users
  WHERE id = target_row.id;

  -- Eliminar de auth.users
  IF target_row.auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users
    WHERE id = target_row.auth_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_tenant_user_id', target_row.id,
    'deleted_auth_user_id', target_row.auth_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cloudix_owner_delete_staff_user(uuid) TO PUBLIC;
NOTIFY pgrst, 'reload schema';
