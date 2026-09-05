-- Branch grants are the authorization source for non-owner users. Device account
-- ciphertext lives only in Electron SQLite; this migration contains no credentials.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_tenant_id_id_key
  ON public.tenant_users (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS sucursales_tenant_id_id_key
  ON public.sucursales (tenant_id, id);

CREATE TABLE IF NOT EXISTS public.tenant_user_sucursales (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_user_id uuid NOT NULL,
  sucursal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_user_id, sucursal_id),
  CONSTRAINT tenant_user_sucursales_tenant_user_tenant_fkey
    FOREIGN KEY (tenant_id, tenant_user_id)
    REFERENCES public.tenant_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tenant_user_sucursales_sucursal_tenant_fkey
    FOREIGN KEY (tenant_id, sucursal_id)
    REFERENCES public.sucursales (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_user_sucursales_tenant_branch_idx
  ON public.tenant_user_sucursales (tenant_id, sucursal_id, tenant_user_id);

CREATE OR REPLACE FUNCTION public.cyberbistro_can_access_branch(p_tenant_id uuid, p_sucursal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.cyberbistro_is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = p_tenant_id
        AND tu.activo IS TRUE
        AND (tu.auth_user_id = public.cyberbistro_auth_user_id()
          OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cyberbistro_auth_email(), ''))))
        AND (tu.rol = 'admin' OR EXISTS (
          SELECT 1 FROM public.tenant_user_sucursales tus
          WHERE tus.tenant_id = tu.tenant_id
            AND tus.tenant_user_id = tu.id
            AND tus.sucursal_id = p_sucursal_id
        ))
    );
$$;
GRANT EXECUTE ON FUNCTION public.cyberbistro_can_access_branch(uuid, uuid) TO authenticated;

ALTER TABLE public.tenant_user_sucursales ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.tenant_user_sucursales TO authenticated;
CREATE POLICY tenant_user_sucursales_owner_manage ON public.tenant_user_sucursales
  FOR ALL TO authenticated
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin']));

-- Branch-scoped resources are deliberately listed. Directly scoped tables use
-- their own tenant_id and sucursal_id; derived resources below resolve those
-- values through their current parent relationship. This migration covers only
-- the listed tables.
CREATE OR REPLACE FUNCTION public.cloudix_branch_grant_required(p_tenant_id uuid, p_sucursal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT public.cyberbistro_can_access_branch(p_tenant_id, p_sucursal_id); $$;

CREATE POLICY cloudix_branch_grant_required ON public.productos_inventario AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.inventario_movimientos AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.produccion_cocina AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.platos AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.menu_categories AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.mesas_estado AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.comandas AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.consumos AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.facturas AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.cierres_operativos AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.gastos AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.gasto_categorias AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.cocina_estado AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.compras AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.cuentas_pagar AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.cxp_pagos AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.cuentas_cobrar AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.cxc_pagos AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.digital_menu_settings AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.digital_orders AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
CREATE POLICY cloudix_branch_grant_required ON public.nomina_empleados AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id)) WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));

-- Child tables do not carry sucursal_id. These helpers resolve the authoritative
-- branch through their foreign-key parent without re-entering parent-table RLS.
CREATE OR REPLACE FUNCTION public.cloudix_can_access_nomina_employee_branch(p_empleado_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.cyberbistro_can_access_branch(e.tenant_id, e.sucursal_id)
  FROM public.nomina_empleados e
  WHERE e.id = p_empleado_id;
$$;

CREATE OR REPLACE FUNCTION public.cloudix_can_access_compra_detalle_branch(p_tenant_id uuid, p_compra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.cyberbistro_can_access_branch(c.tenant_id, c.sucursal_id)
  FROM public.compras c
  WHERE c.id = p_compra_id
    AND c.tenant_id = p_tenant_id;
$$;

CREATE OR REPLACE FUNCTION public.cloudix_can_access_plato_branch(p_tenant_id uuid, p_plato_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.cyberbistro_can_access_branch(p.tenant_id, p.sucursal_id)
  FROM public.platos p
  WHERE p.id = p_plato_id
    AND p.tenant_id = p_tenant_id;
$$;

CREATE OR REPLACE FUNCTION public.cloudix_can_access_digital_order_branch(p_tenant_id uuid, p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.cyberbistro_can_access_branch(o.tenant_id, o.sucursal_id)
  FROM public.digital_orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = p_tenant_id;
$$;

REVOKE ALL ON FUNCTION public.cloudix_can_access_nomina_employee_branch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_can_access_compra_detalle_branch(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_can_access_plato_branch(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cloudix_can_access_digital_order_branch(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cloudix_can_access_nomina_employee_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_can_access_compra_detalle_branch(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_can_access_plato_branch(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cloudix_can_access_digital_order_branch(uuid, uuid) TO authenticated;

CREATE POLICY cloudix_branch_grant_required ON public.nomina_pagos AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_can_access_nomina_employee_branch(empleado_id)) WITH CHECK (public.cloudix_can_access_nomina_employee_branch(empleado_id));
CREATE POLICY cloudix_branch_grant_required ON public.nomina_ajustes AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_can_access_nomina_employee_branch(empleado_id)) WITH CHECK (public.cloudix_can_access_nomina_employee_branch(empleado_id));
CREATE POLICY cloudix_branch_grant_required ON public.compra_detalles AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_can_access_compra_detalle_branch(tenant_id, compra_id)) WITH CHECK (public.cloudix_can_access_compra_detalle_branch(tenant_id, compra_id));
CREATE POLICY cloudix_branch_grant_required ON public.digital_menu_items AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_can_access_plato_branch(tenant_id, plato_id)) WITH CHECK (public.cloudix_can_access_plato_branch(tenant_id, plato_id));
CREATE POLICY cloudix_branch_grant_required ON public.digital_order_items AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_can_access_digital_order_branch(tenant_id, order_id)) WITH CHECK (public.cloudix_can_access_digital_order_branch(tenant_id, order_id));
CREATE POLICY cloudix_branch_grant_required ON public.recetas AS RESTRICTIVE FOR ALL TO authenticated USING (public.cloudix_can_access_plato_branch(tenant_id, plato_id)) WITH CHECK (public.cloudix_can_access_plato_branch(tenant_id, plato_id));

-- Payments are written through this SECURITY DEFINER RPC, which bypasses table
-- RLS. Reassert the same branch grant before it can read or insert payroll data.
CREATE OR REPLACE FUNCTION public.register_nomina_pago(
  p_empleado_id uuid,
  p_periodo text,
  p_monto_pagado bigint,
  p_total_bonos bigint DEFAULT 0,
  p_total_descuentos bigint DEFAULT 0,
  p_pago_id uuid DEFAULT NULL
)
RETURNS TABLE (
  payment_id uuid,
  period_salary_cents bigint,
  due_cents bigint,
  amount_paid_cents bigint,
  pending_cents bigint,
  paid_total_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_employee public.nomina_empleados%ROWTYPE;
  v_existing public.nomina_pagos%ROWTYPE;
  v_period_salary_cents bigint;
  v_prior_bonus_cents bigint;
  v_prior_discount_cents bigint;
  v_prior_paid_cents bigint;
  v_due_cents bigint;
  v_pending_cents bigint;
  v_paid_total_cents bigint;
  v_payment_id uuid;
BEGIN
  IF p_periodo IS NULL OR btrim(p_periodo) = '' THEN
    RAISE EXCEPTION 'Payroll period is required' USING ERRCODE = '22023';
  END IF;

  IF p_monto_pagado IS NULL OR p_monto_pagado <= 0
    OR p_total_bonos IS NULL OR p_total_bonos < 0
    OR p_total_descuentos IS NULL OR p_total_descuentos < 0 THEN
    RAISE EXCEPTION 'Payroll amounts must be non-negative and the payment must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_employee
    FROM public.nomina_empleados
   WHERE id = p_empleado_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll employee not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(v_employee.tenant_id, ARRAY['admin', 'contabilidad'])
    OR NOT public.cyberbistro_can_access_branch(v_employee.tenant_id, v_employee.sucursal_id) THEN
    RAISE EXCEPTION 'Not authorized to register payroll payments' USING ERRCODE = '42501';
  END IF;

  IF v_employee.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'Payroll employee is inactive' USING ERRCODE = 'P0001';
  END IF;

  IF p_pago_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.nomina_pagos WHERE id = p_pago_id;
    IF FOUND THEN
      IF v_existing.empleado_id <> v_employee.id
        OR v_existing.periodo <> p_periodo
        OR v_existing.monto_pagado <> p_monto_pagado
        OR v_existing.total_bonos <> p_total_bonos
        OR v_existing.total_descuentos <> p_total_descuentos THEN
        RAISE EXCEPTION 'Payroll payment id conflicts with an existing payment' USING ERRCODE = 'P0001';
      END IF;

      SELECT COALESCE(SUM(monto_pagado), 0)
        INTO v_paid_total_cents
        FROM public.nomina_pagos
       WHERE empleado_id = v_employee.id AND periodo = p_periodo;

      RETURN QUERY SELECT
        v_existing.id,
        v_existing.monto_base,
        v_existing.monto_neto,
        v_existing.monto_pagado,
        v_existing.monto_pendiente,
        v_paid_total_cents;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(first_payment.monto_base, CASE v_employee.frecuencia_pago
      WHEN 'quincenal' THEN round(v_employee.salario_base_mensual::numeric / 2)::bigint
      ELSE v_employee.salario_base_mensual
    END),
    COALESCE(SUM(pago.total_bonos), 0),
    COALESCE(SUM(pago.total_descuentos), 0),
    COALESCE(SUM(pago.monto_pagado), 0)
    INTO v_period_salary_cents, v_prior_bonus_cents, v_prior_discount_cents, v_prior_paid_cents
    FROM public.nomina_pagos AS pago
    LEFT JOIN LATERAL (
      SELECT monto_base
      FROM public.nomina_pagos
      WHERE empleado_id = v_employee.id AND periodo = p_periodo
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    ) AS first_payment ON true
    WHERE pago.empleado_id = v_employee.id
      AND pago.periodo = p_periodo
    GROUP BY first_payment.monto_base;

  v_period_salary_cents := COALESCE(
    v_period_salary_cents,
    CASE v_employee.frecuencia_pago
      WHEN 'quincenal' THEN round(v_employee.salario_base_mensual::numeric / 2)::bigint
      ELSE v_employee.salario_base_mensual
    END
  );
  v_prior_bonus_cents := COALESCE(v_prior_bonus_cents, 0);
  v_prior_discount_cents := COALESCE(v_prior_discount_cents, 0);
  v_prior_paid_cents := COALESCE(v_prior_paid_cents, 0);
  v_due_cents := GREATEST(v_period_salary_cents + v_prior_bonus_cents - v_prior_discount_cents + p_total_bonos - p_total_descuentos, 0);
  v_pending_cents := GREATEST(v_due_cents - v_prior_paid_cents, 0);

  IF p_monto_pagado > v_pending_cents THEN
    RAISE EXCEPTION 'Overpayment not allowed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.nomina_pagos (
    id, empleado_id, periodo, monto_base, total_bonos, total_descuentos,
    monto_neto, monto_pagado, monto_pendiente, gasto_id
  ) VALUES (
    COALESCE(p_pago_id, gen_random_uuid()),
    v_employee.id, p_periodo, v_period_salary_cents, p_total_bonos, p_total_descuentos,
    v_due_cents, p_monto_pagado, v_pending_cents - p_monto_pagado, NULL
  )
  RETURNING id INTO v_payment_id;

  RETURN QUERY SELECT
    v_payment_id,
    v_period_salary_cents,
    v_due_cents,
    p_monto_pagado,
    v_pending_cents - p_monto_pagado,
    v_prior_paid_cents + p_monto_pagado;
END;
$$;

DROP POLICY IF EXISTS cloudix_branch_grant_required ON public.sucursales;
CREATE POLICY cloudix_branch_grant_required ON public.sucursales AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.cyberbistro_can_access_branch(tenant_id, id))
  WITH CHECK (public.cyberbistro_can_access_branch(tenant_id, id));

CREATE OR REPLACE FUNCTION public.cloudix_resolve_tenant_memberships()
RETURNS TABLE (tenant_id uuid, email text, rol text, nombre text, plan text, allowed_branch_ids uuid[], default_branch_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT tu.tenant_id, tu.email, tu.rol, tu.nombre, COALESCE(t.plan, 'basico'),
    CASE WHEN tu.rol = 'admin' THEN ARRAY(
      SELECT s.id FROM public.sucursales s WHERE s.tenant_id = tu.tenant_id AND s.activa IS TRUE ORDER BY s.id
    ) ELSE ARRAY(
      SELECT tus.sucursal_id FROM public.tenant_user_sucursales tus
      JOIN public.sucursales s ON s.id = tus.sucursal_id AND s.tenant_id = tus.tenant_id
      WHERE tus.tenant_user_id = tu.id AND tus.tenant_id = tu.tenant_id AND s.activa IS TRUE ORDER BY tus.sucursal_id
    ) END,
    CASE WHEN tu.rol = 'admin' THEN (
      SELECT s.id FROM public.sucursales s WHERE s.tenant_id = tu.tenant_id AND s.activa IS TRUE ORDER BY s.id LIMIT 1
    ) ELSE (
      SELECT tus.sucursal_id FROM public.tenant_user_sucursales tus
      JOIN public.sucursales s ON s.id = tus.sucursal_id AND s.tenant_id = tus.tenant_id
      WHERE tus.tenant_user_id = tu.id AND tus.tenant_id = tu.tenant_id AND s.activa IS TRUE ORDER BY tus.sucursal_id LIMIT 1
    ) END
  FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id
  WHERE tu.activo IS TRUE AND t.activa IS TRUE
    AND (tu.auth_user_id = public.cloudix_auth_user_id()
      OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(COALESCE(public.cloudix_auth_email(), ''))));
$$;
GRANT EXECUTE ON FUNCTION public.cloudix_resolve_tenant_memberships() TO authenticated;

CREATE OR REPLACE FUNCTION public.cloudix_owner_create_staff_membership(
  p_auth_user_id uuid, p_email text, p_nombre text, p_rol text, p_sucursal_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_tenant_id uuid; v_tenant_user_id uuid; v_branch_id uuid;
  v_normalized_email text; v_auth_email text;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.tenant_users
  WHERE activo IS TRUE AND rol = 'admin' AND auth_user_id = public.cloudix_auth_user_id()
  LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Owner membership is required';
  END IF;
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Auth user is required' USING ERRCODE = '22023';
  END IF;
  v_normalized_email := lower(btrim(COALESCE(p_email, '')));
  IF v_normalized_email = '' THEN
    RAISE EXCEPTION 'Staff email is required' USING ERRCODE = '22023';
  END IF;
  SELECT lower(btrim(u.email)) INTO v_auth_email
  FROM auth.users AS u
  WHERE u.id = p_auth_user_id;
  IF v_auth_email IS NULL OR v_auth_email <> v_normalized_email THEN
    RAISE EXCEPTION 'Auth user email does not match staff email' USING ERRCODE = '22023';
  END IF;
  IF p_rol NOT IN ('cajera', 'contabilidad', 'mesero', 'cocina') THEN
    RAISE EXCEPTION 'Invalid staff role';
  END IF;
  IF cardinality(p_sucursal_ids) IS NULL OR cardinality(p_sucursal_ids) = 0 THEN
    RAISE EXCEPTION 'Staff branch assignments are required';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_sucursal_ids) branch_id WHERE NOT EXISTS (
    SELECT 1 FROM public.sucursales s WHERE s.id = branch_id AND s.tenant_id = v_tenant_id AND s.activa IS TRUE
  )) THEN RAISE EXCEPTION 'Invalid branch assignment'; END IF;
  INSERT INTO public.tenant_users (tenant_id, auth_user_id, email, password_hash, rol, nombre, activo)
  VALUES (v_tenant_id, p_auth_user_id, v_normalized_email, 'MANAGED_BY_AUTH', p_rol, NULLIF(btrim(p_nombre), ''), true)
  RETURNING id INTO v_tenant_user_id;
  FOREACH v_branch_id IN ARRAY p_sucursal_ids LOOP
    INSERT INTO public.tenant_user_sucursales (tenant_id, tenant_user_id, sucursal_id)
    VALUES (v_tenant_id, v_tenant_user_id, v_branch_id);
  END LOOP;
  RETURN v_tenant_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cloudix_owner_create_staff_membership(uuid, text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cloudix_owner_create_staff_membership(uuid, text, text, text, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
