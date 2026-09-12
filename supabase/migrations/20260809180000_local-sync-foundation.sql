-- InsForge applies each migration atomically. This is a dormant protocol-only
-- foundation: it creates no activation rows and never touches business tables.

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

REVOKE ALL ON FUNCTION public.cloudix_sync_push(p_operation jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_sync_pull(p_tenant_id uuid, p_device_id uuid, p_after_cursor bigint, p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_sync_ack(p_tenant_id uuid, p_device_id uuid, p_cursor bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_sync_capabilities(p_tenant_id uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cloudix_sync_push(p_operation jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_sync_pull(p_tenant_id uuid, p_device_id uuid, p_after_cursor bigint, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_sync_ack(p_tenant_id uuid, p_device_id uuid, p_cursor bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_sync_capabilities(p_tenant_id uuid) TO authenticated;
