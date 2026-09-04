GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nomina_pagos TO anon, authenticated;

DROP POLICY IF EXISTS cb_nomina_pagos_tenant_insert ON public.nomina_pagos;
DROP POLICY IF EXISTS cb_nomina_pagos_tenant_update ON public.nomina_pagos;
DROP POLICY IF EXISTS cb_nomina_pagos_admin_delete ON public.nomina_pagos;

CREATE POLICY cb_nomina_pagos_tenant_insert ON public.nomina_pagos
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nomina_empleados e
    WHERE e.id = nomina_pagos.empleado_id
      AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin'::text, 'contabilidad'::text])
  )
);

CREATE POLICY cb_nomina_pagos_tenant_update ON public.nomina_pagos
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.nomina_empleados e
    WHERE e.id = nomina_pagos.empleado_id
      AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin'::text, 'contabilidad'::text])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nomina_empleados e
    WHERE e.id = nomina_pagos.empleado_id
      AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin'::text, 'contabilidad'::text])
  )
);

CREATE POLICY cb_nomina_pagos_admin_delete ON public.nomina_pagos
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.nomina_empleados e
    WHERE e.id = nomina_pagos.empleado_id
      AND public.cyberbistro_has_tenant_role(e.tenant_id, ARRAY['admin'::text])
  )
);

NOTIFY pgrst, 'reload schema';
