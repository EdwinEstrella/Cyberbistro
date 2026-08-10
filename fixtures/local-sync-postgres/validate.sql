\set ON_ERROR_STOP on

DO $$
DECLARE
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';
  v_device uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  IF (SELECT count(*) FROM public.sync_tenants) <> 1
    OR EXISTS (SELECT 1 FROM public.sync_tenants WHERE enabled) THEN
    RAISE EXCEPTION 'fixture must contain exactly one disabled synthetic tenant';
  END IF;

  IF (SELECT count(*) FROM public.sync_operations) <> 0
    OR (SELECT count(*) FROM public.sync_events) <> 0 THEN
    RAISE EXCEPTION 'fixture must not seed operations or events';
  END IF;

  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'sync_%' AND rowsecurity) <> 5 THEN
    RAISE EXCEPTION 'all protocol tables must have RLS enabled';
  END IF;

  IF has_table_privilege('authenticated', 'public.sync_tenants', 'select')
    OR has_table_privilege('authenticated', 'public.sync_operations', 'select')
    OR has_table_privilege('authenticated', 'public.sync_stream_heads', 'select')
    OR has_table_privilege('authenticated', 'public.sync_events', 'select')
    OR has_table_privilege('authenticated', 'public.sync_devices', 'select') THEN
    RAISE EXCEPTION 'authenticated must not have direct protocol-table access';
  END IF;

  IF public.cloudix_sync_push(jsonb_build_object('tenant_id', v_tenant)) <> '{"status":"sync_disabled"}'::jsonb
    OR public.cloudix_sync_pull(v_tenant, v_device, 0, 10) <> '{"status":"sync_disabled"}'::jsonb
    OR public.cloudix_sync_ack(v_tenant, v_device, 0) <> '{"status":"sync_disabled"}'::jsonb
    OR public.cloudix_sync_capabilities(v_tenant) <> '{"enabled":false,"status":"sync_disabled"}'::jsonb THEN
    RAISE EXCEPTION 'dormant RPC contract changed';
  END IF;
END;
$$;

SELECT 'local sync PostgreSQL fixture validation passed' AS result;
