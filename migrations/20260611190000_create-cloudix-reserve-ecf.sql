-- Migración para crear la RPC de reserva de secuencias e-CF (comprobantes de la serie E) de forma atómica y aislada

CREATE OR REPLACE FUNCTION public.cloudix_reserve_ecf(
  p_tenant_id uuid,
  p_ncf_tipo text
)
RETURNS TABLE (
  ncf_fiscal_activo boolean,
  ncf_tipo_codigo text,
  seq_reserved integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fiscal_activo boolean;
  v_tipo_normalizado text;
  v_secuencias jsonb;
  v_seq_actual integer;
  v_seq_siguiente integer;
BEGIN
  -- Validar y normalizar el tipo de e-CF
  v_tipo_normalizado := upper(trim(p_ncf_tipo));
  IF v_tipo_normalizado NOT IN ('E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47') THEN
    RAISE EXCEPTION 'Tipo de e-CF no valido: %', p_ncf_tipo;
  END IF;

  -- Bloquear la fila del tenant para actualización consistente (prevenir colisiones)
  SELECT t.ncf_fiscal_activo, t.ncf_secuencias_por_tipo
  INTO v_fiscal_activo, v_secuencias
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  FOR UPDATE;

  IF v_fiscal_activo IS NOT TRUE THEN
    RAISE EXCEPTION 'NCF fiscal no esta activo para el tenant';
  END IF;

  -- Obtener la secuencia actual (inicializar en 1 si no está definida)
  v_seq_actual := coalesce((v_secuencias->>v_tipo_normalizado)::integer, 1);
  v_seq_siguiente := v_seq_actual + 1;

  -- Actualizar el mapa de secuencias de tipo E en tenants
  UPDATE public.tenants
  SET 
    ncf_secuencias_por_tipo = coalesce(ncf_secuencias_por_tipo, '{}'::jsonb) || jsonb_build_object(v_tipo_normalizado, v_seq_siguiente),
    updated_at = now()
  WHERE id = p_tenant_id;

  RETURN QUERY SELECT TRUE, v_tipo_normalizado, v_seq_actual;
END;
$$;

-- Conceder accesos condicionalmente a authenticated
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.cloudix_reserve_ecf(uuid, text) TO authenticated;
  END IF;
END $$;
