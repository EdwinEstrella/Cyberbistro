-- Local test fixture only. This is intentionally limited to the dormant sync
-- protocol and has no Cyberbistro business tables, production data, or users.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO authenticated;

CREATE TABLE public.sync_tenants (
  tenant_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((enabled AND activated_at IS NOT NULL) OR (NOT enabled AND activated_at IS NULL))
);

CREATE TABLE public.sync_operations (
  tenant_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  device_id uuid NOT NULL,
  device_sequence bigint NOT NULL CHECK (device_sequence >= 0),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  table_name text NOT NULL,
  row_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  status text NOT NULL CHECK (status IN ('accepted', 'rejected', 'conflicted')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, operation_id),
  UNIQUE (tenant_id, device_id, device_sequence)
);

CREATE TABLE public.sync_stream_heads (
  tenant_id uuid PRIMARY KEY,
  last_cursor bigint NOT NULL DEFAULT 0 CHECK (last_cursor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sync_events (
  tenant_id uuid NOT NULL,
  cursor bigint NOT NULL CHECK (cursor > 0),
  table_name text NOT NULL,
  row_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('upsert', 'delete')),
  payload jsonb,
  operation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cursor),
  CHECK ((kind = 'upsert' AND payload IS NOT NULL) OR (kind = 'delete' AND payload IS NULL))
);

CREATE INDEX sync_events_tenant_cursor_idx ON public.sync_events (tenant_id, cursor);

CREATE TABLE public.sync_devices (
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  last_ack_cursor bigint NOT NULL DEFAULT 0 CHECK (last_ack_cursor >= 0),
  last_seen_at timestamptz,
  disabled_at timestamptz,
  PRIMARY KEY (tenant_id, device_id)
);

ALTER TABLE public.sync_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_stream_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sync_tenants FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_operations FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_stream_heads FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.sync_devices FROM anon, authenticated;

CREATE FUNCTION public.cloudix_sync_push(p_operation jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := (p_operation ->> 'tenant_id')::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sync_tenants
    WHERE tenant_id = v_tenant_id AND enabled
  ) THEN
    RETURN jsonb_build_object('status', 'sync_disabled');
  END IF;

  RETURN jsonb_build_object('status', 'activation_required');
END;
$$;

CREATE FUNCTION public.cloudix_sync_pull(p_tenant_id uuid, p_device_id uuid, p_after_cursor bigint, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sync_tenants
    WHERE tenant_id = p_tenant_id AND enabled
  ) THEN
    RETURN jsonb_build_object('status', 'sync_disabled');
  END IF;

  RETURN jsonb_build_object('status', 'activation_required');
END;
$$;

CREATE FUNCTION public.cloudix_sync_ack(p_tenant_id uuid, p_device_id uuid, p_cursor bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sync_tenants
    WHERE tenant_id = p_tenant_id AND enabled
  ) THEN
    RETURN jsonb_build_object('status', 'sync_disabled');
  END IF;

  RETURN jsonb_build_object('status', 'activation_required');
END;
$$;

CREATE FUNCTION public.cloudix_sync_capabilities(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sync_tenants
    WHERE tenant_id = p_tenant_id AND enabled
  ) THEN
    RETURN jsonb_build_object('status', 'sync_disabled', 'enabled', false);
  END IF;

  RETURN jsonb_build_object('status', 'activation_required', 'enabled', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cloudix_sync_push(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_sync_pull(uuid, uuid, bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_sync_ack(uuid, uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_sync_capabilities(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cloudix_sync_push(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_sync_pull(uuid, uuid, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_sync_ack(uuid, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_sync_capabilities(uuid) TO authenticated;

-- Synthetic fixture handlers only. They deliberately do not activate the
-- dormant production-shaped RPCs and accept only fixed fixture identities.
CREATE TABLE public.fixture_sync_applies (
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  cursor bigint NOT NULL,
  PRIMARY KEY (tenant_id, device_id)
);

CREATE FUNCTION public.fixture_sync_reset()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  TRUNCATE public.fixture_sync_applies, public.sync_events, public.sync_operations;
  UPDATE public.sync_stream_heads SET last_cursor = 0, updated_at = now();
  UPDATE public.sync_devices SET last_ack_cursor = 0, last_seen_at = NULL;
END;
$$;

CREATE FUNCTION public.fixture_sync_push(p_operation jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := (p_operation ->> 'tenant_id')::uuid;
  v_device uuid := (p_operation ->> 'device_id')::uuid;
  v_operation uuid := (p_operation ->> 'operation_id')::uuid;
  v_sequence bigint := (p_operation ->> 'device_sequence')::bigint;
  v_hash text := p_operation ->> 'request_hash';
  v_cursor bigint;
  v_existing public.sync_operations%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM set_config('lock_timeout', '100ms', true);
  PERFORM set_config('statement_timeout', '1000ms', true);
  IF NULLIF(p_operation ->> 'actor_id', '') IS NULL THEN RETURN '{"status":"rejected","reason":"identity"}'::jsonb; END IF;
  IF v_tenant <> '11111111-1111-1111-1111-111111111111'::uuid THEN RETURN '{"status":"rejected","reason":"tenant"}'::jsonb; END IF;
  IF v_device <> '22222222-2222-2222-2222-222222222222'::uuid THEN RETURN '{"status":"rejected","reason":"device"}'::jsonb; END IF;
  IF p_operation ->> 'table_name' <> 'fixture_rows' OR p_operation ->> 'operation' NOT IN ('insert', 'update', 'delete') THEN RETURN '{"status":"rejected","reason":"table"}'::jsonb; END IF;
  IF length(v_hash) <> 64 OR octet_length(p_operation::text) > 4096 OR (p_operation -> 'payload' ->> 'tenant_id')::uuid <> v_tenant THEN RETURN '{"status":"rejected","reason":"payload"}'::jsonb; END IF;

  SELECT * INTO v_existing FROM public.sync_operations WHERE tenant_id = v_tenant AND operation_id = v_operation FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash = v_hash THEN RETURN v_existing.result; END IF;
    RETURN '{"status":"idempotency_mismatch"}'::jsonb;
  END IF;
  SELECT * INTO v_existing FROM public.sync_operations WHERE tenant_id = v_tenant AND device_id = v_device AND device_sequence = v_sequence FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash = v_hash THEN RETURN v_existing.result; END IF;
    RETURN '{"status":"idempotency_mismatch"}'::jsonb;
  END IF;

  UPDATE public.sync_stream_heads SET last_cursor = last_cursor + 1, updated_at = now() WHERE tenant_id = v_tenant RETURNING last_cursor INTO v_cursor;
  v_result := jsonb_build_object('status', 'accepted', 'cursor', v_cursor);
  INSERT INTO public.sync_operations (tenant_id, operation_id, device_id, device_sequence, request_hash, table_name, row_id, operation, status, result, actor_user_id)
  VALUES (v_tenant, v_operation, v_device, v_sequence, v_hash, 'fixture_rows', coalesce(p_operation ->> 'row_id', ''), p_operation ->> 'operation', 'accepted', v_result, (p_operation ->> 'actor_id')::uuid);
  INSERT INTO public.sync_events (tenant_id, cursor, table_name, row_id, kind, payload, operation_id)
  VALUES (v_tenant, v_cursor, 'fixture_rows', coalesce(p_operation ->> 'row_id', ''), CASE WHEN p_operation ->> 'operation' = 'delete' THEN 'delete' ELSE 'upsert' END, CASE WHEN p_operation ->> 'operation' = 'delete' THEN NULL ELSE p_operation -> 'payload' END, v_operation);
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.fixture_sync_pull(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_tenant uuid := (p_request ->> 'tenant_id')::uuid; v_device uuid := (p_request ->> 'device_id')::uuid; v_after bigint := coalesce((p_request ->> 'after_cursor')::bigint, 0); v_limit integer := least(greatest(coalesce((p_request ->> 'limit')::integer, 1), 1), 500); v_changes jsonb; v_head bigint;
BEGIN
  IF NULLIF(p_request ->> 'actor_id', '') IS NULL OR v_tenant <> '11111111-1111-1111-1111-111111111111'::uuid OR v_device <> '22222222-2222-2222-2222-222222222222'::uuid THEN RETURN '{"status":"rejected"}'::jsonb; END IF;
  SELECT last_cursor INTO v_head FROM public.sync_stream_heads WHERE tenant_id = v_tenant;
  SELECT coalesce(jsonb_agg(jsonb_build_object('cursor', cursor, 'kind', kind, 'payload', payload) ORDER BY cursor), '[]'::jsonb) INTO v_changes FROM (SELECT * FROM public.sync_events WHERE tenant_id = v_tenant AND cursor > v_after ORDER BY cursor LIMIT v_limit) changes;
  RETURN jsonb_build_object('status', 'ok', 'changes', v_changes, 'next_cursor', coalesce((SELECT max((item ->> 'cursor')::bigint) FROM jsonb_array_elements(v_changes) item), v_after), 'head', v_head, 'has_more', v_head > coalesce((SELECT max((item ->> 'cursor')::bigint) FROM jsonb_array_elements(v_changes) item), v_after));
END; $$;

CREATE FUNCTION public.fixture_sync_record_local_apply(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_tenant uuid := (p_request ->> 'tenant_id')::uuid; v_device uuid := (p_request ->> 'device_id')::uuid; v_cursor bigint := (p_request ->> 'cursor')::bigint;
BEGIN
  INSERT INTO public.fixture_sync_applies (tenant_id, device_id, cursor) VALUES (v_tenant, v_device, v_cursor) ON CONFLICT (tenant_id, device_id) DO UPDATE SET cursor = greatest(fixture_sync_applies.cursor, excluded.cursor);
  RETURN jsonb_build_object('status', 'applied', 'cursor', v_cursor);
END; $$;

CREATE FUNCTION public.fixture_sync_ack(p_request jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_tenant uuid := (p_request ->> 'tenant_id')::uuid; v_device uuid := (p_request ->> 'device_id')::uuid; v_cursor bigint := (p_request ->> 'cursor')::bigint; v_applied bigint := 0; v_head bigint;
BEGIN
  IF NULLIF(p_request ->> 'actor_id', '') IS NULL OR v_tenant <> '11111111-1111-1111-1111-111111111111'::uuid OR v_device <> '22222222-2222-2222-2222-222222222222'::uuid THEN RETURN '{"status":"rejected"}'::jsonb; END IF;
  SELECT last_cursor INTO v_head FROM public.sync_stream_heads WHERE tenant_id = v_tenant;
  SELECT cursor INTO v_applied FROM public.fixture_sync_applies WHERE tenant_id = v_tenant AND device_id = v_device;
  IF v_cursor > v_head THEN RETURN '{"status":"cursor_out_of_range"}'::jsonb; END IF;
  IF coalesce(v_applied, 0) < v_cursor THEN RETURN '{"status":"local_apply_required"}'::jsonb; END IF;
  UPDATE public.sync_devices SET last_ack_cursor = greatest(last_ack_cursor, v_cursor), last_seen_at = now() WHERE tenant_id = v_tenant AND device_id = v_device;
  RETURN jsonb_build_object('status', 'acknowledged', 'cursor', v_cursor);
END; $$;
