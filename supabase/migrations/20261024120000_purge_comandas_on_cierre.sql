-- Bulk purge of queued comandas when a cash register cycle is closed.
--
-- Comandas pile up (one per kitchen order) and are never needed once the cycle
-- is closed. A per-row delete from the client would be one HTTP call per
-- comanda, so the cierre flow calls this single RPC instead. Consumos are never
-- deleted: they are only unlinked (consumos.comanda_id is ON DELETE SET NULL
-- anyway; the explicit UPDATE keeps the intent obvious). produccion_cocina in
-- the cloud has no comanda_id, so nothing to clear there.
--
-- p_sucursal_id NULL means tenant-wide. A branch purge also removes comandas
-- with a NULL branch (orphans of deleted branches).

CREATE OR REPLACE FUNCTION public.cloudix_purge_comandas(p_tenant_id uuid, p_sucursal_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_user_id uuid := public.cloudix_auth_user_id();
  v_deleted integer;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenant_users WHERE auth_user_id = v_auth_user_id AND tenant_id = p_tenant_id AND activo = true) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'insufficient_privilege';
  END IF;

  UPDATE public.consumos SET comanda_id = NULL
  WHERE tenant_id = p_tenant_id
    AND comanda_id IN (
      SELECT id FROM public.comandas
      WHERE tenant_id = p_tenant_id AND (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id OR sucursal_id IS NULL)
    );

  DELETE FROM public.comandas
  WHERE tenant_id = p_tenant_id AND (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id OR sucursal_id IS NULL);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.cloudix_purge_comandas(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloudix_purge_comandas(uuid, uuid) TO authenticated;
