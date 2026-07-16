-- Reviewed source only: secure, bidirectional tenant block/unblock observation.
-- Do not apply remotely from this workspace.

INSERT INTO realtime.channels (pattern, description, enabled)
SELECT 'tenant-access:%', 'Per-tenant active/blocked access events', true
WHERE NOT EXISTS (
  SELECT 1 FROM realtime.channels WHERE pattern = 'tenant-access:%'
);

ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Preserve existing application channels while restricting the new access channel.
DROP POLICY IF EXISTS cloudix_tenant_access_channel_select ON realtime.channels;
CREATE POLICY cloudix_tenant_access_channel_select
ON realtime.channels
FOR SELECT
TO authenticated
USING (
  pattern <> 'tenant-access:%'
  OR EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = NULLIF(split_part(realtime.channel_name(), ':', 2), '')::uuid
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
      )
  )
);

-- The current backend also checks INSERT on realtime.channels during subscribe.
-- Keep this separate so a blocked member can remain an observer without gaining
-- any client publish or tenant mutation capability.
DROP POLICY IF EXISTS cloudix_tenant_access_channel_insert ON realtime.channels;
CREATE POLICY cloudix_tenant_access_channel_insert
ON realtime.channels
FOR INSERT
TO authenticated
WITH CHECK (
  pattern = 'tenant-access:%'
  AND EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = NULLIF(split_part(realtime.channel_name(), ':', 2), '')::uuid
      AND tu.activo IS TRUE
      AND (
        tu.auth_user_id = public.cloudix_auth_user_id()
        OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), '')))
      )
  )
);

-- Clients cannot publish or mutate access state. Existing application broadcasts
-- retain their previous behavior; database triggers publish the access event.
DROP POLICY IF EXISTS cloudix_tenant_access_message_insert ON realtime.messages;
CREATE POLICY cloudix_tenant_access_message_insert
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (channel_name NOT LIKE 'tenant-access:%');

CREATE OR REPLACE FUNCTION public.cloudix_publish_tenant_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
BEGIN
  PERFORM realtime.publish(
    'tenant-access:' || NEW.id::text,
    'tenant_access_changed',
    jsonb_build_object(
      'tenant_id', NEW.id,
      'activa', NEW.activa,
      'changed_at', COALESCE(NEW.updated_at, now())
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_access_realtime ON public.tenants;
CREATE TRIGGER tenants_access_realtime
AFTER UPDATE OF activa ON public.tenants
FOR EACH ROW
WHEN (OLD.activa IS DISTINCT FROM NEW.activa)
EXECUTE FUNCTION public.cloudix_publish_tenant_access_change();
