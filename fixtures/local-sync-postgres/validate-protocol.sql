\set ON_ERROR_STOP on
SELECT public.fixture_sync_reset();
DO $$
DECLARE t uuid := '11111111-1111-1111-1111-111111111111'; d uuid := '22222222-2222-2222-2222-222222222222'; a uuid := '33333333-3333-3333-3333-333333333333';
  first jsonb; page_one jsonb; page_two jsonb; rls_denied boolean := false;
BEGIN
  IF public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','66666666-6666-6666-6666-666666666666','device_sequence',1,'request_hash',repeat('a',64),'table_name','fixture_rows','operation','insert','payload',jsonb_build_object('tenant_id',t))) ->> 'reason' <> 'identity' THEN RAISE EXCEPTION 'identity rejection failed'; END IF;
  IF public.fixture_sync_push(jsonb_build_object('tenant_id','44444444-4444-4444-4444-444444444444','device_id',d,'operation_id','77777777-7777-7777-7777-777777777777','device_sequence',2,'request_hash',repeat('a',64),'table_name','fixture_rows','operation','insert','payload',jsonb_build_object('tenant_id',t),'actor_id',a)) ->> 'reason' <> 'tenant' THEN RAISE EXCEPTION 'tenant rejection failed'; END IF;
  IF public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id','55555555-5555-5555-5555-555555555555','operation_id','88888888-8888-8888-8888-888888888888','device_sequence',3,'request_hash',repeat('a',64),'table_name','fixture_rows','operation','insert','payload',jsonb_build_object('tenant_id',t),'actor_id',a)) ->> 'reason' <> 'device' THEN RAISE EXCEPTION 'device rejection failed'; END IF;
  IF public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','99999999-9999-9999-9999-999999999999','device_sequence',4,'request_hash',repeat('a',64),'table_name','forged','operation','insert','payload',jsonb_build_object('tenant_id',t),'actor_id',a)) ->> 'reason' <> 'table' THEN RAISE EXCEPTION 'table rejection failed'; END IF;
  IF public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','device_sequence',5,'request_hash',repeat('a',64),'table_name','fixture_rows','operation','insert','payload',jsonb_build_object('tenant_id','44444444-4444-4444-4444-444444444444'),'actor_id',a)) ->> 'reason' <> 'payload' THEN RAISE EXCEPTION 'payload rejection failed'; END IF;
  first := public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','device_sequence',10,'request_hash',repeat('b',64),'table_name','fixture_rows','operation','insert','row_id','one','payload',jsonb_build_object('tenant_id',t),'actor_id',a));
  IF first <> public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','device_sequence',10,'request_hash',repeat('b',64),'table_name','fixture_rows','operation','insert','row_id','one','payload',jsonb_build_object('tenant_id',t),'actor_id',a)) OR (SELECT count(*) FROM public.sync_operations) <> 1 THEN RAISE EXCEPTION 'same-hash reuse failed'; END IF;
  IF public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','device_sequence',10,'request_hash',repeat('c',64),'table_name','fixture_rows','operation','insert','row_id','one','payload',jsonb_build_object('tenant_id',t),'actor_id',a)) ->> 'status' <> 'idempotency_mismatch' OR (SELECT count(*) FROM public.sync_events) <> 1 THEN RAISE EXCEPTION 'mismatch zero-DML failed'; END IF;
  PERFORM public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','cccccccc-cccc-cccc-cccc-cccccccccccc','device_sequence',11,'request_hash',repeat('c',64),'table_name','fixture_rows','operation','update','row_id','one','payload',jsonb_build_object('tenant_id',t),'actor_id',a));
  PERFORM public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','dddddddd-dddd-dddd-dddd-dddddddddddd','device_sequence',12,'request_hash',repeat('d',64),'table_name','fixture_rows','operation','delete','row_id','one','payload',jsonb_build_object('tenant_id',t),'actor_id',a));
  page_one := public.fixture_sync_pull(jsonb_build_object('tenant_id',t,'device_id',d,'actor_id',a,'after_cursor',0,'limit',2)); page_two := public.fixture_sync_pull(jsonb_build_object('tenant_id',t,'device_id',d,'actor_id',a,'after_cursor',2,'limit',2));
  IF page_one ->> 'next_cursor' <> '2' OR page_one ->> 'has_more' <> 'true' OR page_two -> 'changes' -> 0 ->> 'kind' <> 'delete' THEN RAISE EXCEPTION 'pagination or tombstone failed'; END IF;
  IF public.fixture_sync_ack(jsonb_build_object('tenant_id',t,'device_id',d,'actor_id',a,'cursor',3)) ->> 'status' <> 'local_apply_required' THEN RAISE EXCEPTION 'ack before local apply failed'; END IF;
  IF public.fixture_sync_record_local_apply(jsonb_build_object('tenant_id',t,'device_id',d,'actor_id',a,'cursor',3)) ->> 'status' <> 'applied' OR public.fixture_sync_ack(jsonb_build_object('tenant_id',t,'device_id',d,'actor_id',a,'cursor',3)) ->> 'status' <> 'acknowledged' THEN RAISE EXCEPTION 'ack after local apply failed'; END IF;
  BEGIN
    PERFORM public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','device_sequence',20,'request_hash',repeat('e',64),'table_name','fixture_rows','operation','insert','row_id','rolled-back','payload',jsonb_build_object('tenant_id',t),'actor_id',a));
    RAISE EXCEPTION 'force synthetic rollback';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  IF public.fixture_sync_push(jsonb_build_object('tenant_id',t,'device_id',d,'operation_id','ffffffff-ffff-ffff-ffff-ffffffffffff','device_sequence',21,'request_hash',repeat('f',64),'table_name','fixture_rows','operation','insert','row_id','after-rollback','payload',jsonb_build_object('tenant_id',t),'actor_id',a)) ->> 'cursor' <> '4' THEN RAISE EXCEPTION 'rollback left a cursor gap'; END IF;
  BEGIN
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM * FROM public.sync_operations;
    EXCEPTION WHEN insufficient_privilege THEN rls_denied := true;
    END;
    RESET ROLE;
  END;
  IF NOT rls_denied OR has_table_privilege('authenticated','public.sync_operations','select') OR public.cloudix_sync_capabilities(t) ->> 'status' <> 'sync_disabled' THEN RAISE EXCEPTION 'RLS or disabled contract failed'; END IF;
  IF current_setting('lock_timeout') <> '100ms' OR current_setting('statement_timeout') <> '1s' THEN RAISE EXCEPTION 'timeout bounds failed'; END IF;
END $$;
SELECT public.fixture_sync_reset();
SELECT 'local synthetic sync protocol validation passed' AS result;
