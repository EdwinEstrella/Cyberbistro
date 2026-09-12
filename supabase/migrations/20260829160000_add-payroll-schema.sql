-- Migration for Payroll (Nomina)
-- This schema allows remote synchronization to PostgREST/InsForge.

CREATE TABLE IF NOT EXISTS public.nomina_empleados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL,
    nombre_completo TEXT NOT NULL,
    identificacion TEXT NOT NULL,
    telefono TEXT,
    cargo TEXT NOT NULL,
    salario_base_mensual BIGINT NOT NULL, -- en centavos
    frecuencia_pago TEXT NOT NULL CHECK (frecuencia_pago IN ('mensual', 'quincenal')),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.nomina_ajustes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID NOT NULL REFERENCES public.nomina_empleados(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('bono', 'descuento')),
    frecuencia TEXT NOT NULL CHECK (frecuencia IN ('unico', 'por_periodo', 'recurrente_fijo')),
    monto BIGINT NOT NULL, -- en centavos
    motivo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.nomina_pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID NOT NULL REFERENCES public.nomina_empleados(id) ON DELETE CASCADE,
    periodo TEXT NOT NULL,
    monto_base BIGINT NOT NULL,
    total_bonos BIGINT NOT NULL,
    total_descuentos BIGINT NOT NULL,
    monto_neto BIGINT NOT NULL,
    monto_pagado BIGINT NOT NULL,
    monto_pendiente BIGINT NOT NULL,
    gasto_id UUID, -- Reference to the gasto record created
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.gastos
    ADD COLUMN IF NOT EXISTS payroll_payment_id UUID,
    ADD COLUMN IF NOT EXISTS payroll_sync_status TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'gastos_payroll_payment_id_fkey'
    ) THEN
        ALTER TABLE public.gastos
            ADD CONSTRAINT gastos_payroll_payment_id_fkey
            FOREIGN KEY (payroll_payment_id) REFERENCES public.nomina_pagos(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'gastos_payroll_sync_status_valid'
    ) THEN
        ALTER TABLE public.gastos
            ADD CONSTRAINT gastos_payroll_sync_status_valid
            CHECK (payroll_sync_status IS NULL OR payroll_sync_status IN ('pending_sync', 'committed'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'gastos_payroll_columns_consistent'
    ) THEN
        ALTER TABLE public.gastos
            ADD CONSTRAINT gastos_payroll_columns_consistent
            CHECK (
                (payroll_payment_id IS NULL AND payroll_sync_status IS NULL)
                OR
                (payroll_payment_id IS NOT NULL AND payroll_sync_status IS NOT NULL)
            );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS gastos_payroll_payment_unique_idx
    ON public.gastos (payroll_payment_id)
    WHERE payroll_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gastos_tenant_payroll_payment_idx
    ON public.gastos (tenant_id, payroll_payment_id)
    WHERE payroll_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nomina_empleados_tenant_sucursal ON public.nomina_empleados(tenant_id, sucursal_id);
CREATE INDEX IF NOT EXISTS idx_nomina_pagos_empleado ON public.nomina_pagos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_nomina_ajustes_empleado ON public.nomina_ajustes(empleado_id);

-- RLS & Grants
GRANT ALL ON TABLE public.nomina_empleados TO anon, authenticated;
GRANT ALL ON TABLE public.nomina_ajustes TO anon, authenticated;
GRANT ALL ON TABLE public.nomina_pagos TO anon, authenticated;

ALTER TABLE public.nomina_empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_nomina_empleados_tenant_select ON public.nomina_empleados;
CREATE POLICY cb_nomina_empleados_tenant_select ON public.nomina_empleados
  FOR SELECT TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'contabilidad'])
  );

DROP POLICY IF EXISTS cb_nomina_empleados_tenant_insert ON public.nomina_empleados;
CREATE POLICY cb_nomina_empleados_tenant_insert ON public.nomina_empleados
  FOR INSERT TO public
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'contabilidad'])
  );

DROP POLICY IF EXISTS cb_nomina_empleados_tenant_update ON public.nomina_empleados;
CREATE POLICY cb_nomina_empleados_tenant_update ON public.nomina_empleados
  FOR UPDATE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'contabilidad'])
  )
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'contabilidad'])
  );

DROP POLICY IF EXISTS cb_nomina_empleados_admin_delete ON public.nomina_empleados;
CREATE POLICY cb_nomina_empleados_admin_delete ON public.nomina_empleados
  FOR DELETE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
  );

-- NOMINA AJUSTES
DROP POLICY IF EXISTS cb_nomina_ajustes_tenant_select ON public.nomina_ajustes;
CREATE POLICY cb_nomina_ajustes_tenant_select ON public.nomina_ajustes
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_ajustes.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin', 'contabilidad'])
    )
  );

DROP POLICY IF EXISTS cb_nomina_ajustes_tenant_insert ON public.nomina_ajustes;
CREATE POLICY cb_nomina_ajustes_tenant_insert ON public.nomina_ajustes
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_ajustes.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin', 'contabilidad'])
    )
  );

DROP POLICY IF EXISTS cb_nomina_ajustes_tenant_update ON public.nomina_ajustes;
CREATE POLICY cb_nomina_ajustes_tenant_update ON public.nomina_ajustes
  FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_ajustes.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin', 'contabilidad'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_ajustes.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin', 'contabilidad'])
    )
  );

DROP POLICY IF EXISTS cb_nomina_ajustes_admin_delete ON public.nomina_ajustes;
CREATE POLICY cb_nomina_ajustes_admin_delete ON public.nomina_ajustes
  FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_ajustes.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin'])
    )
  );

-- NOMINA PAGOS
DROP POLICY IF EXISTS cb_nomina_pagos_tenant_select ON public.nomina_pagos;
CREATE POLICY cb_nomina_pagos_tenant_select ON public.nomina_pagos
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_pagos.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin', 'contabilidad'])
    )
  );

DROP POLICY IF EXISTS cb_nomina_pagos_tenant_insert ON public.nomina_pagos;
CREATE POLICY cb_nomina_pagos_tenant_insert ON public.nomina_pagos
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_pagos.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin', 'contabilidad'])
    )
  );

DROP POLICY IF EXISTS cb_nomina_pagos_tenant_update ON public.nomina_pagos;
CREATE POLICY cb_nomina_pagos_tenant_update ON public.nomina_pagos
  FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_pagos.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin', 'contabilidad'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nomina_empleados e
      WHERE e.id = nomina_pagos.empleado_id
        AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin', 'contabilidad'])
    )
  );

NOTIFY pgrst, 'reload schema';
