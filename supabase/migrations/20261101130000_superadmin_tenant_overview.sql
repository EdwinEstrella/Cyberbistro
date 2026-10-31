-- Migration: SuperAdmin "Ficha 360" aggregate overview per tenant
-- Read-only consolidated metrics for support, diagnostics and governance.

CREATE OR REPLACE FUNCTION public.superadmin_tenant_overview(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant record;
  v_sucursales jsonb := '[]'::jsonb;
  v_user_stats jsonb;
  v_user_list jsonb := '[]'::jsonb;
  v_latest_factura_at timestamptz;
  v_latest_comanda_at timestamptz;
  v_latest_sync_at timestamptz;
  v_latest_activity_at timestamptz;
  v_devices jsonb := '[]'::jsonb;
  v_sync_metrics jsonb;
  v_ecf_counts_30d jsonb := '{}'::jsonb;
  v_fiscal_outbox_metrics jsonb;
  v_latest_fiscal_error text;
  v_cxc_totals jsonb;
  v_menu_links_plan_limit integer := 0;
  v_menu_links_total integer := 0;
  v_menu_links_enabled integer := 0;
  v_corporate_companies jsonb := '[]'::jsonb;
  v_digital_orders_count_7d bigint := 0;
  v_digital_orders_total_7d numeric := 0.00;
  v_has_auth_users boolean := false;
  v_auth_col_exists boolean := false;
BEGIN
  -- 1. Authorization check: enforce super admin role
  IF NOT public.cyberbistro_is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  -- 2. Tenant basics
  SELECT
    id,
    nombre_negocio,
    rnc,
    plan,
    activa,
    created_at,
    payment_day_of_month,
    fiscal_mode,
    ecf_environment,
    user_limit_enabled,
    admin_user_limit,
    cajera_user_limit,
    cocina_user_limit,
    mesero_user_limit,
    sucursal_limit_enabled,
    sucursal_limit
  INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Sucursales
  IF to_regclass('public.sucursales') IS NOT NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'nombre', s.nombre,
          'activa', s.activa
        ) ORDER BY s.nombre
      ),
      '[]'::jsonb
    )
    INTO v_sucursales
    FROM public.sucursales s
    WHERE s.tenant_id = p_tenant_id;
  END IF;

  -- 4. Users aggregation & safe last sign-in
  IF to_regclass('public.tenant_users') IS NOT NULL THEN
    -- Check if auth.users exists and has last_sign_in_at
    IF to_regclass('auth.users') IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'auth'
          AND table_name = 'users'
          AND column_name = 'last_sign_in_at'
      ) INTO v_auth_col_exists;
    END IF;

    IF v_auth_col_exists THEN
      EXECUTE $dyn$
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', tu.id,
              'email', tu.email,
              'nombre', tu.nombre,
              'rol', tu.rol,
              'activo', tu.activo,
              'auth_user_id', tu.auth_user_id,
              'last_sign_in_at', au.last_sign_in_at
            ) ORDER BY tu.email
          ),
          '[]'::jsonb
        )
        FROM public.tenant_users tu
        LEFT JOIN auth.users au ON au.id = tu.auth_user_id
        WHERE tu.tenant_id = $1
      $dyn$ INTO v_user_list USING p_tenant_id;
    ELSE
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', tu.id,
            'email', tu.email,
            'nombre', tu.nombre,
            'rol', tu.rol,
            'activo', tu.activo,
            'auth_user_id', tu.auth_user_id,
            'last_sign_in_at', NULL
          ) ORDER BY tu.email
        ),
        '[]'::jsonb
      )
      INTO v_user_list
      FROM public.tenant_users tu
      WHERE tu.tenant_id = p_tenant_id;
    END IF;

    SELECT jsonb_build_object(
      'total', count(*),
      'active', count(*) FILTER (WHERE tu.activo IS TRUE),
      'inactive', count(*) FILTER (WHERE tu.activo IS FALSE),
      'by_role', COALESCE(
        (SELECT jsonb_object_agg(rol, cnt) FROM (
          SELECT tu2.rol, count(*) as cnt
          FROM public.tenant_users tu2
          WHERE tu2.tenant_id = p_tenant_id
          GROUP BY tu2.rol
        ) r),
        '{}'::jsonb
      )
    )
    INTO v_user_stats
    FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id;
  ELSE
    v_user_stats := jsonb_build_object('total', 0, 'active', 0, 'inactive', 0, 'by_role', '{}'::jsonb);
  END IF;

  -- 5. Activity metrics (bounded, indexed)
  IF to_regclass('public.facturas') IS NOT NULL THEN
    SELECT f.created_at INTO v_latest_factura_at
    FROM public.facturas f
    WHERE f.tenant_id = p_tenant_id
    ORDER BY f.created_at DESC
    LIMIT 1;
  END IF;

  IF to_regclass('public.comandas') IS NOT NULL THEN
    SELECT c.created_at INTO v_latest_comanda_at
    FROM public.comandas c
    WHERE c.tenant_id = p_tenant_id
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  -- Latest sync timestamp from sync stream heads, sync devices, or sync operations
  IF to_regclass('public.sync_stream_heads') IS NOT NULL THEN
    SELECT ssh.updated_at INTO v_latest_sync_at
    FROM public.sync_stream_heads ssh
    WHERE ssh.tenant_id = p_tenant_id;
  END IF;

  IF v_latest_sync_at IS NULL AND to_regclass('public.sync_devices') IS NOT NULL THEN
    SELECT max(sd.last_seen_at) INTO v_latest_sync_at
    FROM public.sync_devices sd
    WHERE sd.tenant_id = p_tenant_id;
  END IF;

  IF v_latest_sync_at IS NULL AND to_regclass('public.sync_events') IS NOT NULL THEN
    SELECT se.created_at INTO v_latest_sync_at
    FROM public.sync_events se
    WHERE se.tenant_id = p_tenant_id
    ORDER BY se.cursor DESC
    LIMIT 1;
  END IF;

  -- Overall latest activity timestamp
  v_latest_activity_at := GREATEST(v_latest_factura_at, v_latest_comanda_at, v_latest_sync_at);

  -- 6. Devices and App Versions (from sync_devices)
  -- Note: app_version is not tracked in the current cloud schema; returned as null ("Sin datos")
  IF to_regclass('public.sync_devices') IS NOT NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'device_id', sd.device_id,
          'last_seen_at', sd.last_seen_at,
          'disabled_at', sd.disabled_at,
          'last_ack_cursor', sd.last_ack_cursor,
          'app_version', NULL
        ) ORDER BY sd.last_seen_at DESC NULLS LAST
      ),
      '[]'::jsonb
    )
    INTO v_devices
    FROM public.sync_devices sd
    WHERE sd.tenant_id = p_tenant_id;
  END IF;

  -- Sync status
  IF to_regclass('public.sync_operations') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'pending_count', count(*) FILTER (WHERE status = 'pending'),
      'conflicted_count', count(*) FILTER (WHERE status = 'conflicted'),
      'rejected_count', count(*) FILTER (WHERE status = 'rejected')
    )
    INTO v_sync_metrics
    FROM public.sync_operations
    WHERE tenant_id = p_tenant_id;
  ELSE
    v_sync_metrics := jsonb_build_object(
      'pending_count', 0,
      'conflicted_count', 0,
      'rejected_count', 0
    );
  END IF;

  -- 7. Electronic Billing (e-CF)
  IF to_regclass('public.ecf_documents') IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
    INTO v_ecf_counts_30d
    FROM (
      SELECT ed.status, count(*) AS cnt
      FROM public.ecf_documents ed
      WHERE ed.tenant_id = p_tenant_id
        AND ed.created_at >= (now() - interval '30 days')
      GROUP BY ed.status
    ) s;

    -- Latest error message from ecf_documents
    SELECT COALESCE(ed.last_error, ed.dgii_status_message)
    INTO v_latest_fiscal_error
    FROM public.ecf_documents ed
    WHERE ed.tenant_id = p_tenant_id
      AND (ed.last_error IS NOT NULL OR ed.status IN ('rejected', 'error'))
    ORDER BY ed.created_at DESC
    LIMIT 1;
  END IF;

  IF to_regclass('public.fiscal_outbox') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'retryable_count', count(*) FILTER (WHERE fo.status = 'retryable_error'),
      'error_count', count(*) FILTER (WHERE fo.status IN ('terminal_error', 'retryable_error', 'blocked_configuration')),
      'queued_count', count(*) FILTER (WHERE fo.status = 'queued'),
      'processing_count', count(*) FILTER (WHERE fo.status = 'processing')
    )
    INTO v_fiscal_outbox_metrics
    FROM public.fiscal_outbox fo
    WHERE fo.tenant_id = p_tenant_id;
  ELSE
    v_fiscal_outbox_metrics := jsonb_build_object(
      'retryable_count', 0,
      'error_count', 0,
      'queued_count', 0,
      'processing_count', 0
    );
  END IF;

  -- 8. Cuentas por Cobrar (CxC) Totals
  IF to_regclass('public.cuentas_cobrar') IS NOT NULL THEN
    SELECT jsonb_build_object(
      'count_total', COALESCE(count(*), 0),
      'count_pending', COALESCE(count(*) FILTER (WHERE cc.estado IN ('pendiente', 'parcial')), 0),
      'count_overdue', COALESCE(count(*) FILTER (WHERE cc.estado IN ('pendiente', 'parcial') AND cc.fecha_vencimiento < now()), 0),
      'total_receivable', COALESCE(sum(cc.monto_total), 0.00),
      'total_paid', COALESCE(sum(cc.monto_pagado), 0.00),
      'total_pending', COALESCE(sum(cc.monto_total - cc.monto_pagado) FILTER (WHERE cc.estado IN ('pendiente', 'parcial')), 0.00),
      'total_overdue', COALESCE(sum(cc.monto_total - cc.monto_pagado) FILTER (WHERE cc.estado IN ('pendiente', 'parcial') AND cc.fecha_vencimiento < now()), 0.00)
    )
    INTO v_cxc_totals
    FROM public.cuentas_cobrar cc
    WHERE cc.tenant_id = p_tenant_id;
  ELSE
    v_cxc_totals := jsonb_build_object(
      'count_total', 0,
      'count_pending', 0,
      'count_overdue', 0,
      'total_receivable', 0.00,
      'total_paid', 0.00,
      'total_pending', 0.00,
      'total_overdue', 0.00
    );
  END IF;

  -- 9. Corporate usage
  -- 9.1 Menu Links & plan limit
  IF to_regproc('public.menu_links_plan_limit') IS NOT NULL THEN
    v_menu_links_plan_limit := public.menu_links_plan_limit(v_tenant.plan);
  END IF;

  IF to_regclass('public.menu_links') IS NOT NULL THEN
    SELECT
      count(*),
      count(*) FILTER (WHERE ml.enabled IS TRUE)
    INTO v_menu_links_total, v_menu_links_enabled
    FROM public.menu_links ml
    WHERE ml.tenant_id = p_tenant_id;
  END IF;

  -- 9.2 Company credit usage
  IF to_regclass('public.customers') IS NOT NULL THEN
    IF to_regproc('public.company_credit_used_internal') IS NOT NULL THEN
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'customer_id', c.id,
            'name', c.name,
            'credit_limit', c.credit_limit,
            'credit_used', public.company_credit_used_internal(p_tenant_id, c.id)
          ) ORDER BY c.name
        ),
        '[]'::jsonb
      )
      INTO v_corporate_companies
      FROM public.customers c
      WHERE c.tenant_id = p_tenant_id
        AND c.deleted_at IS NULL
        AND c.credit_limit IS NOT NULL;
    ELSE
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'customer_id', c.id,
            'name', c.name,
            'credit_limit', c.credit_limit,
            'credit_used', NULL
          ) ORDER BY c.name
        ),
        '[]'::jsonb
      )
      INTO v_corporate_companies
      FROM public.customers c
      WHERE c.tenant_id = p_tenant_id
        AND c.deleted_at IS NULL
        AND c.credit_limit IS NOT NULL;
    END IF;
  END IF;

  -- 9.3 Digital orders last 7 days
  IF to_regclass('public.digital_orders') IS NOT NULL THEN
    SELECT
      count(*),
      COALESCE(sum(dord.total), 0.00)
    INTO v_digital_orders_count_7d, v_digital_orders_total_7d
    FROM public.digital_orders dord
    WHERE dord.tenant_id = p_tenant_id
      AND dord.created_at >= (now() - interval '7 days');
  END IF;

  -- 10. Construct final JSON response
  RETURN jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', v_tenant.id,
      'nombre_negocio', v_tenant.nombre_negocio,
      'rnc', v_tenant.rnc,
      'plan', v_tenant.plan,
      'activa', v_tenant.activa,
      'created_at', v_tenant.created_at,
      'payment_day_of_month', v_tenant.payment_day_of_month,
      'fiscal_mode', v_tenant.fiscal_mode,
      'ecf_environment', v_tenant.ecf_environment,
      'limits', jsonb_build_object(
        'user_limit_enabled', v_tenant.user_limit_enabled,
        'admin_user_limit', v_tenant.admin_user_limit,
        'cajera_user_limit', v_tenant.cajera_user_limit,
        'cocina_user_limit', v_tenant.cocina_user_limit,
        'mesero_user_limit', v_tenant.mesero_user_limit,
        'sucursal_limit_enabled', v_tenant.sucursal_limit_enabled,
        'sucursal_limit', v_tenant.sucursal_limit
      )
    ),
    'sucursales', v_sucursales,
    'users', jsonb_build_object(
      'stats', v_user_stats,
      'list', v_user_list
    ),
    'activity', jsonb_build_object(
      'latest_factura_at', v_latest_factura_at,
      'latest_comanda_at', v_latest_comanda_at,
      'latest_sync_at', v_latest_sync_at,
      'latest_activity_at', v_latest_activity_at
    ),
    'devices', v_devices,
    'sync', v_sync_metrics,
    'fiscal', jsonb_build_object(
      'ecf_counts_30d', v_ecf_counts_30d,
      'outbox', v_fiscal_outbox_metrics,
      'latest_error_message', v_latest_fiscal_error
    ),
    'cxc', v_cxc_totals,
    'corporate', jsonb_build_object(
      'menu_links', jsonb_build_object(
        'total', v_menu_links_total,
        'enabled', v_menu_links_enabled,
        'plan_limit', v_menu_links_plan_limit
      ),
      'companies', v_corporate_companies,
      'digital_orders_7d', jsonb_build_object(
        'count', v_digital_orders_count_7d,
        'total', v_digital_orders_total_7d
      )
    )
  );
END;
$$;

-- Security permissions
REVOKE ALL ON FUNCTION public.superadmin_tenant_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_tenant_overview(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
