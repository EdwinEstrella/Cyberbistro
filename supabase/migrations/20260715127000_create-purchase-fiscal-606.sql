CREATE TABLE IF NOT EXISTS public.compra_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  compra_id uuid NOT NULL UNIQUE REFERENCES public.compras(id) ON DELETE CASCADE,
  rnc_cedula text NOT NULL,
  tipo_identificacion text NOT NULL CHECK (tipo_identificacion IN ('1', '2', '3')),
  tipo_bien_servicio text NOT NULL CHECK (tipo_bien_servicio IN ('01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11')),
  ncf text NOT NULL,
  ncf_modificado text,
  fecha_comprobante date NOT NULL,
  fecha_pago date,
  monto_servicios numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_servicios >= 0),
  monto_bienes numeric(14,2) NOT NULL DEFAULT 0 CHECK (monto_bienes >= 0),
  total_facturado numeric(14,2) NOT NULL CHECK (total_facturado >= 0),
  itbis_facturado numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_facturado >= 0),
  itbis_retenido numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_retenido >= 0),
  itbis_proporcionalidad numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_proporcionalidad >= 0),
  itbis_costo numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_costo >= 0),
  itbis_adelantar numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_adelantar >= 0),
  itbis_percibido numeric(14,2) NOT NULL DEFAULT 0 CHECK (itbis_percibido >= 0),
  tipo_retencion_isr text,
  retencion_isr numeric(14,2) NOT NULL DEFAULT 0 CHECK (retencion_isr >= 0),
  isr_percibido numeric(14,2) NOT NULL DEFAULT 0 CHECK (isr_percibido >= 0),
  impuesto_selectivo numeric(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_selectivo >= 0),
  otros_impuestos numeric(14,2) NOT NULL DEFAULT 0 CHECK (otros_impuestos >= 0),
  propina_legal numeric(14,2) NOT NULL DEFAULT 0 CHECK (propina_legal >= 0),
  forma_pago text NOT NULL CHECK (forma_pago IN ('01', '02', '03', '04', '05', '06', '07')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_facturado = monto_servicios + monto_bienes)
);

CREATE INDEX IF NOT EXISTS idx_compra_fiscal_606_period
  ON public.compra_fiscal (tenant_id, fecha_comprobante);

ALTER TABLE public.compra_fiscal ENABLE ROW LEVEL SECURITY;

CREATE POLICY cb_compra_fiscal_select ON public.compra_fiscal
  FOR SELECT TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

CREATE POLICY cb_compra_fiscal_insert ON public.compra_fiscal
  FOR INSERT TO public
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

CREATE POLICY cb_compra_fiscal_update ON public.compra_fiscal
  FOR UPDATE TO public
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));
