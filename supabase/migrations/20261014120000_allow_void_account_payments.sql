-- Allow administrators and accounting users to void (delete) a single payment of an
-- account payable or receivable. The recompute triggers on cxp_pagos / cxc_pagos
-- (AFTER INSERT/UPDATE/DELETE) restore monto_pagado and estado on the parent account.
-- The restrictive cloudix_branch_grant_required policies are intentionally untouched.

DROP POLICY IF EXISTS cb_cxp_pagos_no_app_delete ON public.cxp_pagos;
DROP POLICY IF EXISTS cb_cxp_pagos_admin_accounting_delete ON public.cxp_pagos;
CREATE POLICY cb_cxp_pagos_admin_accounting_delete ON public.cxp_pagos
  FOR DELETE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'contabilidad'])
  );

DROP POLICY IF EXISTS cb_cxc_pagos_no_app_delete ON public.cxc_pagos;
DROP POLICY IF EXISTS cb_cxc_pagos_admin_accounting_delete ON public.cxc_pagos;
CREATE POLICY cb_cxc_pagos_admin_accounting_delete ON public.cxc_pagos
  FOR DELETE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'contabilidad'])
  );
