CREATE OR REPLACE FUNCTION public.cloudix_super_admin_unblock_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
BEGIN
  IF NOT public.cloudix_is_super_admin() THEN
    RAISE EXCEPTION 'Solo super admin puede desbloquear restaurantes';
  END IF;

  UPDATE public.tenants
  SET activa = true
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurante no encontrado';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', p_tenant_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cloudix_super_admin_unblock_tenant(uuid) TO PUBLIC;

NOTIFY pgrst, 'reload schema';
