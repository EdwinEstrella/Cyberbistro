-- Ejecutar en el SQL editor de InsForge (o vía MCP run-raw-sql) una vez por backend.
-- Expone RPC public.cyberbistro_reserve_ncf(p_tenant_id uuid) para PostgREST.

CREATE OR REPLACE FUNCTION public.cyberbistro_reserve_ncf(p_tenant_id uuid)
RETURNS TABLE (
  ncf_fiscal_activo boolean,
  ncf_tipo_default text,
  seq_reserved integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.tenants t
  SET
    ncf_secuencia_siguiente = t.ncf_secuencia_siguiente + 1,
    updated_at = now()
  WHERE
    t.id = p_tenant_id
    AND t.ncf_fiscal_activo IS TRUE
    AND t.ncf_secuencia_siguiente IS NOT NULL
    AND t.ncf_secuencia_siguiente >= 1
  RETURNING
    TRUE,
    t.ncf_tipo_default,
    (t.ncf_secuencia_siguiente - 1)::integer;
END;
$$;

-- Permite invocación vía PostgREST con rol autenticado (ajustar según políticas InsForge).
-- Ajustar roles según InsForge (suele bastar con usuarios autenticados).
GRANT EXECUTE ON FUNCTION public.cyberbistro_reserve_ncf(uuid) TO authenticated;
