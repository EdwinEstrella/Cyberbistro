-- Create table for offline advanced sequence allocations
CREATE TABLE IF NOT EXISTS public.ecf_sequence_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  tipo_ecf text NOT NULL,
  range_start integer NOT NULL,
  range_end integer NOT NULL,
  next_sequence integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecf_sequence_allocations_tipo_check
    CHECK (tipo_ecf IN ('E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47')),
  CONSTRAINT ecf_sequence_allocations_status_check
    CHECK (status IN ('active', 'exhausted', 'revoked'))
);

CREATE INDEX IF NOT EXISTS ecf_sequence_allocations_tenant_idx
  ON public.ecf_sequence_allocations (tenant_id, device_id, tipo_ecf, status);

ALTER TABLE public.ecf_sequence_allocations ENABLE ROW LEVEL SECURITY;

-- RLS Policies

DROP POLICY IF EXISTS cb_ecf_sequence_allocations_tenant_select ON public.ecf_sequence_allocations;
CREATE POLICY cb_ecf_sequence_allocations_tenant_select ON public.ecf_sequence_allocations
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_ecf_sequence_allocations_tenant_insert ON public.ecf_sequence_allocations;
CREATE POLICY cb_ecf_sequence_allocations_tenant_insert ON public.ecf_sequence_allocations
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

DROP POLICY IF EXISTS cb_ecf_sequence_allocations_tenant_update ON public.ecf_sequence_allocations;
CREATE POLICY cb_ecf_sequence_allocations_tenant_update ON public.ecf_sequence_allocations
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor']));

DROP POLICY IF EXISTS cb_ecf_sequence_allocations_no_app_delete ON public.ecf_sequence_allocations;
CREATE POLICY cb_ecf_sequence_allocations_no_app_delete ON public.ecf_sequence_allocations
  FOR DELETE TO public
  USING (false);

DROP POLICY IF EXISTS cb_ecf_sequence_allocations_project_admin_all ON public.ecf_sequence_allocations;
CREATE POLICY cb_ecf_sequence_allocations_project_admin_all ON public.ecf_sequence_allocations
  FOR ALL TO project_admin USING (true) WITH CHECK (true);
