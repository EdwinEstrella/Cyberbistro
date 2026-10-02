-- Keyset pagination of the desktop cloud->local pull (WHERE tenant_id = ? ORDER BY id LIMIT n)
-- took ~4.7s per page on facturas under RLS (statement_timeout is 8s). A composite
-- (tenant_id, id) index brings a page to ~0.4s.
-- Note: Supabase migrations run inside a transaction, so CREATE INDEX CONCURRENTLY
-- is not possible here; plain IF NOT EXISTS is used (these were already created
-- manually in production, so this is a no-op there).
create index if not exists idx_facturas_tenant_id_id on public.facturas (tenant_id, id);
create index if not exists idx_comandas_tenant_id_id on public.comandas (tenant_id, id);
create index if not exists idx_consumos_tenant_id_id on public.consumos (tenant_id, id);
