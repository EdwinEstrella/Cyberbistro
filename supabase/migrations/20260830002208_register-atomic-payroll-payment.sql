-- Web payroll writes must go through this transaction so a stale browser balance
-- cannot create an overpayment. Desktop keeps its SQLite/outbox write path.
CREATE OR REPLACE FUNCTION public.register_nomina_pago(
  p_empleado_id uuid,
  p_periodo text,
  p_monto_pagado bigint,
  p_total_bonos bigint DEFAULT 0,
  p_total_descuentos bigint DEFAULT 0
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
  v_period_salary_cents bigint;
  v_prior_bonus_cents bigint;
  v_prior_discount_cents bigint;
  v_prior_paid_cents bigint;
  v_due_cents bigint;
  v_pending_cents bigint;
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

  -- The employee row is the per-employee serialization point for every period.
  SELECT *
    INTO v_employee
    FROM public.nomina_empleados
   WHERE id = p_empleado_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll employee not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.cyberbistro_has_tenant_role(v_employee.tenant_id, ARRAY['admin', 'contabilidad']) THEN
    RAISE EXCEPTION 'Not authorized to register payroll payments' USING ERRCODE = '42501';
  END IF;

  IF v_employee.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'Payroll employee is inactive' USING ERRCODE = 'P0001';
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
    empleado_id, periodo, monto_base, total_bonos, total_descuentos,
    monto_neto, monto_pagado, monto_pendiente, gasto_id
  ) VALUES (
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

REVOKE ALL ON FUNCTION public.register_nomina_pago(uuid, text, bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_nomina_pago(uuid, text, bigint, bigint, bigint) TO authenticated;
