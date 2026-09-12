-- RPC para que el dueño/usuario pueda actualizar su propia contraseña
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.cloudix_update_my_password(p_new_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE auth.users
  SET password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;
