-- Fixed non-production IDs make dormant-protocol assertions reproducible.
-- The protocol remains disabled and no operation or event is seeded.
INSERT INTO public.sync_tenants (tenant_id, enabled, activated_at)
VALUES ('11111111-1111-1111-1111-111111111111', false, NULL);

INSERT INTO public.sync_stream_heads (tenant_id, last_cursor)
VALUES ('11111111-1111-1111-1111-111111111111', 0);

INSERT INTO public.sync_devices (tenant_id, device_id, last_ack_cursor)
VALUES ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 0);
