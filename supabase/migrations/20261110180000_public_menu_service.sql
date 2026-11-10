-- ==============================================================================
-- Migration: Public Digital Menu Mobile Services, Requests & Suggestions
-- Part of Feature: menu-publico-movil (Task T1)
-- ==============================================================================

-- 1. Add public_contact to digital_menu_settings
ALTER TABLE public.digital_menu_settings
  ADD COLUMN IF NOT EXISTS public_contact jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Add party_size to digital_orders
ALTER TABLE public.digital_orders
  ADD COLUMN IF NOT EXISTS party_size integer NULL CHECK (party_size BETWEEN 1 AND 99);

-- 3. Service Requests table (Call waiter / Ask for bill)
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  mesa_numero integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('waiter', 'bill')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'attended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  attended_at timestamptz,
  attended_by uuid
);

-- Partial unique index: at most one pending request per (tenant, branch, table, kind)
CREATE UNIQUE INDEX IF NOT EXISTS service_requests_unique_pending_idx
  ON public.service_requests (
    tenant_id,
    COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid),
    mesa_numero,
    kind
  )
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS service_requests_tenant_status_idx
  ON public.service_requests (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS service_requests_sucursal_status_idx
  ON public.service_requests (tenant_id, sucursal_id, status);

-- Enable RLS
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

-- Permissions: anon has NO direct access. Authenticated tenant staff can SELECT and UPDATE (attend).
REVOKE ALL ON public.service_requests FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.service_requests TO authenticated;

DROP POLICY IF EXISTS cb_service_requests_tenant_select ON public.service_requests;
CREATE POLICY cb_service_requests_tenant_select ON public.service_requests
  FOR SELECT TO authenticated
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera']));

DROP POLICY IF EXISTS cb_service_requests_tenant_update ON public.service_requests;
CREATE POLICY cb_service_requests_tenant_update ON public.service_requests
  FOR UPDATE TO authenticated
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera']))
  WITH CHECK (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera']));

-- Restrictive branch policy if installed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cloudix_branch_grant_required') THEN
    DROP POLICY IF EXISTS cloudix_branch_grant_required ON public.service_requests;
    CREATE POLICY cloudix_branch_grant_required ON public.service_requests
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id))
      WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
  END IF;
END $$;

-- Realtime notification trigger & publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'service_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.realtime_notify_service_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  tid uuid;
BEGIN
  tid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF TG_OP = 'DELETE' THEN
    BEGIN
      PERFORM realtime.publish(
        'service_requests:' || tid::text,
        'DELETE_service_request',
        jsonb_build_object('id', OLD.id::text, 'tenant_id', tid::text)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN OLD;
  END IF;

  BEGIN
    PERFORM realtime.publish(
      'service_requests:' || tid::text,
      TG_OP || '_service_request',
      jsonb_build_object(
        'id', NEW.id::text,
        'tenant_id', tid::text,
        'sucursal_id', NEW.sucursal_id,
        'mesa_numero', NEW.mesa_numero,
        'kind', NEW.kind,
        'status', NEW.status,
        'created_at', NEW.created_at,
        'attended_at', NEW.attended_at,
        'attended_by', NEW.attended_by
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_requests_realtime ON public.service_requests;
CREATE TRIGGER trg_service_requests_realtime
  AFTER INSERT OR UPDATE OR DELETE ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.realtime_notify_service_requests();

-- 4. Menu Suggestions table
CREATE TABLE IF NOT EXISTS public.menu_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  mesa_numero integer NULL,
  message text NOT NULL CHECK (length(trim(message)) >= 1 AND length(message) <= 1000),
  contact text NULL CHECK (contact IS NULL OR length(contact) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_error text NULL
);

CREATE INDEX IF NOT EXISTS menu_suggestions_tenant_created_idx
  ON public.menu_suggestions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS menu_suggestions_email_status_idx
  ON public.menu_suggestions (email_status)
  WHERE email_status = 'pending';

ALTER TABLE public.menu_suggestions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.menu_suggestions FROM PUBLIC, anon;
GRANT SELECT ON public.menu_suggestions TO authenticated;

DROP POLICY IF EXISTS cb_menu_suggestions_tenant_select ON public.menu_suggestions;
CREATE POLICY cb_menu_suggestions_tenant_select ON public.menu_suggestions
  FOR SELECT TO authenticated
  USING (public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera']));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cloudix_branch_grant_required') THEN
    DROP POLICY IF EXISTS cloudix_branch_grant_required ON public.menu_suggestions;
    CREATE POLICY cloudix_branch_grant_required ON public.menu_suggestions
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.cloudix_branch_grant_required(tenant_id, sucursal_id))
      WITH CHECK (public.cloudix_branch_grant_required(tenant_id, sucursal_id));
  END IF;
END $$;

-- 5. RPC: create_public_service_request
CREATE OR REPLACE FUNCTION public.create_public_service_request(
  p_public_slug text,
  p_mesa_numero integer,
  p_mesa_codigo text,
  p_kind        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings      public.digital_menu_settings%ROWTYPE;
  v_tenant_activa boolean;
  v_tenant_mesas  integer;
  v_stored_code   text;
  v_kind          text;
  v_existing_id   uuid;
  v_request_id    uuid;
BEGIN
  v_kind := lower(trim(COALESCE(p_kind, '')));
  IF v_kind NOT IN ('waiter', 'bill') THEN
    RAISE EXCEPTION 'Tipo de solicitud inválido';
  END IF;

  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE public_slug = lower(trim(p_public_slug))
    AND enabled IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  SELECT COALESCE(t.activa, true), COALESCE(t.cantidad_mesas, 0)
  INTO v_tenant_activa, v_tenant_mesas
  FROM public.tenants t
  WHERE t.id = v_settings.tenant_id
  LIMIT 1;

  IF COALESCE(v_tenant_activa, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  -- Operational cycle check (reuses restaurant_cycle_open)
  IF NOT public.restaurant_cycle_open(v_settings.tenant_id, v_settings.sucursal_id) THEN
    RAISE EXCEPTION 'El restaurante se encuentra cerrado en este momento';
  END IF;

  -- Validate table number against branch table count (fallback: tenant count)
  IF v_settings.sucursal_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF((SELECT cantidad_mesas FROM public.sucursales
       WHERE id = v_settings.sucursal_id AND tenant_id = v_settings.tenant_id LIMIT 1), 0),
      COALESCE(v_tenant_mesas, 0)
    ) INTO v_tenant_mesas;
  END IF;

  IF p_mesa_numero IS NULL OR p_mesa_numero < 1 THEN
    RAISE EXCEPTION 'Debes seleccionar una mesa';
  END IF;

  IF p_mesa_numero > v_tenant_mesas THEN
    RAISE EXCEPTION 'Mesa inválida';
  END IF;

  -- Validate table security code
  IF length(trim(COALESCE(p_mesa_codigo, ''))) = 0 THEN
    RAISE EXCEPTION 'El código de mesa es obligatorio';
  END IF;

  SELECT me.codigo_seguridad INTO v_stored_code
  FROM public.mesas_estado me
  WHERE me.tenant_id   = v_settings.tenant_id
    AND me.sucursal_id IS NOT DISTINCT FROM v_settings.sucursal_id
    AND me.id          = p_mesa_numero
  LIMIT 1;

  IF v_stored_code IS NULL THEN
    RAISE EXCEPTION 'El código de mesa no ha sido configurado. Pide asistencia al personal.';
  END IF;

  IF trim(p_mesa_codigo) <> v_stored_code THEN
    RAISE EXCEPTION 'Código de mesa incorrecto';
  END IF;

  -- Check if already pending for this table and kind
  SELECT id INTO v_existing_id
  FROM public.service_requests
  WHERE tenant_id = v_settings.tenant_id
    AND COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_settings.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND mesa_numero = p_mesa_numero
    AND kind        = v_kind
    AND status      = 'pending'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing_id, 'already_pending', true);
  END IF;

  BEGIN
    INSERT INTO public.service_requests (
      tenant_id, sucursal_id, mesa_numero, kind, status
    )
    VALUES (
      v_settings.tenant_id, v_settings.sucursal_id, p_mesa_numero, v_kind, 'pending'
    )
    RETURNING id INTO v_request_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_existing_id
      FROM public.service_requests
      WHERE tenant_id = v_settings.tenant_id
        AND COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_settings.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND mesa_numero = p_mesa_numero
        AND kind        = v_kind
        AND status      = 'pending'
      LIMIT 1;

      RETURN jsonb_build_object('id', v_existing_id, 'already_pending', true);
  END;

  RETURN jsonb_build_object('id', v_request_id, 'already_pending', false);
END;
$$;

-- 6. RPC: create_public_suggestion
CREATE OR REPLACE FUNCTION public.create_public_suggestion(
  p_public_slug text,
  p_message     text,
  p_mesa_numero integer DEFAULT NULL,
  p_contact     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings           public.digital_menu_settings%ROWTYPE;
  v_tenant_activa      boolean;
  v_tenant_mesas       integer;
  v_message            text;
  v_contact            text;
  v_recent_suggestions integer;
  v_suggestion_id      uuid;
BEGIN
  v_message := trim(COALESCE(p_message, ''));
  IF length(v_message) < 1 OR length(v_message) > 1000 THEN
    RAISE EXCEPTION 'El mensaje de sugerencia debe tener entre 1 y 1000 caracteres';
  END IF;

  v_contact := NULLIF(trim(COALESCE(p_contact, '')), '');
  IF v_contact IS NOT NULL AND length(v_contact) > 120 THEN
    RAISE EXCEPTION 'El contacto es demasiado largo (máximo 120 caracteres)';
  END IF;

  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE public_slug = lower(trim(p_public_slug))
    AND enabled IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  SELECT COALESCE(t.activa, true), COALESCE(t.cantidad_mesas, 0)
  INTO v_tenant_activa, v_tenant_mesas
  FROM public.tenants t
  WHERE t.id = v_settings.tenant_id
  LIMIT 1;

  IF COALESCE(v_tenant_activa, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  IF p_mesa_numero IS NOT NULL THEN
    IF v_settings.sucursal_id IS NOT NULL THEN
      SELECT COALESCE(
        NULLIF((SELECT cantidad_mesas FROM public.sucursales
         WHERE id = v_settings.sucursal_id AND tenant_id = v_settings.tenant_id LIMIT 1), 0),
        COALESCE(v_tenant_mesas, 0)
      ) INTO v_tenant_mesas;
    END IF;

    IF p_mesa_numero < 1 OR p_mesa_numero > v_tenant_mesas THEN
      RAISE EXCEPTION 'Mesa inválida';
    END IF;
  END IF;

  -- Rate limit: max 10 suggestions per tenant per rolling hour
  SELECT COUNT(*) INTO v_recent_suggestions
  FROM public.menu_suggestions
  WHERE tenant_id = v_settings.tenant_id
    AND created_at >= (now() - interval '1 hour');

  IF v_recent_suggestions >= 10 THEN
    RAISE EXCEPTION 'Has alcanzado el límite de sugerencias permitidas por el momento. Intenta de nuevo más tarde.';
  END IF;

  INSERT INTO public.menu_suggestions (
    tenant_id, sucursal_id, mesa_numero, message, contact, email_status
  )
  VALUES (
    v_settings.tenant_id,
    v_settings.sucursal_id,
    p_mesa_numero,
    v_message,
    v_contact,
    'pending'
  )
  RETURNING id INTO v_suggestion_id;

  RETURN jsonb_build_object('id', v_suggestion_id);
END;
$$;

-- 7. Redefine get_public_digital_menu (returns public_contact without suggestion_email)
CREATE OR REPLACE FUNCTION public.get_public_digital_menu(p_public_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings       public.digital_menu_settings%ROWTYPE;
  v_tenant         public.tenants%ROWTYPE;
  v_items          jsonb;
  v_cantidad_mesas integer;
  v_use_calendar   boolean;
  v_today          date;
  v_isodow         smallint;
  v_public_contact jsonb;
BEGIN
  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE public_slug = lower(trim(p_public_slug))
    AND enabled IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('settings', NULL, 'items', '[]'::jsonb, 'cantidad_mesas', 0, 'contact', '{}'::jsonb);
  END IF;

  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = v_settings.tenant_id
    AND COALESCE(activa, true) IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('settings', NULL, 'items', '[]'::jsonb, 'cantidad_mesas', 0, 'contact', '{}'::jsonb);
  END IF;

  -- Sanitize public contact info: never expose suggestion_email to anon clients
  v_public_contact := COALESCE(v_settings.public_contact, '{}'::jsonb) - 'suggestion_email';

  v_use_calendar := (
    v_settings.menu_id IS NOT NULL
    AND lower(trim(COALESCE(v_tenant.plan, ''))) IN ('profesional', 'empresarial', 'corporativo')
  );

  IF v_use_calendar THEN
    v_today  := public.menu_business_today(v_settings.tenant_id);
    v_isodow := public.menu_business_isodow(v_settings.tenant_id, v_today);

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',          mi.id,
        'plato_id',    p.id,
        'name',        COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre),
        'description', NULLIF(trim(COALESCE(dmi.description, '')), ''),
        'image_url',   NULLIF(trim(COALESCE(dmi.image_url, '')), ''),
        'price',       p.precio,
        'category',    COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
        'sort_order',  COALESCE(mi.sort_order, 0)
      )
      ORDER BY
        COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
        COALESCE(mi.sort_order, 0),
        COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre)
    ), '[]'::jsonb)
    INTO v_items
    FROM public.menu_items mi
    JOIN public.platos p ON p.id = mi.plato_id AND p.tenant_id = mi.tenant_id
    LEFT JOIN LATERAL (
      SELECT description, image_url
      FROM public.digital_menu_items d
      WHERE d.plato_id = p.id AND d.tenant_id = p.tenant_id
      ORDER BY d.updated_at DESC
      LIMIT 1
    ) dmi ON true
    WHERE mi.menu_id = v_settings.menu_id
      AND v_isodow = ANY(mi.weekdays)
      AND p.id IN (
        SELECT plato_id
        FROM public.get_menu_today_plato_ids(v_settings.menu_id, v_settings.tenant_id, v_settings.sucursal_id)
      );
  ELSE
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',          COALESCE(dmi.id, gen_random_uuid()),
        'plato_id',    p.id,
        'name',        COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre),
        'description', NULLIF(trim(COALESCE(dmi.description, '')), ''),
        'image_url',   NULLIF(trim(COALESCE(dmi.image_url, '')), ''),
        'price',       p.precio,
        'category',    COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
        'sort_order',  COALESCE(dmi.sort_order, 0)
      )
      ORDER BY
        COALESCE(NULLIF(trim(p.categoria), ''), 'General'),
        COALESCE(dmi.sort_order, 0),
        COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre)
    ), '[]'::jsonb)
    INTO v_items
    FROM public.platos p
    LEFT JOIN public.digital_menu_items dmi
      ON p.id = dmi.plato_id AND p.tenant_id = dmi.tenant_id
    WHERE p.tenant_id = v_settings.tenant_id
      AND p.disponible IS TRUE
      AND COALESCE(dmi.visible, true) IS TRUE
      AND (v_settings.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_settings.sucursal_id);
  END IF;

  -- Resolve table count: prefer sucursal-level when the menu is sucursal-scoped
  IF v_settings.sucursal_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF((SELECT cantidad_mesas FROM public.sucursales
       WHERE id = v_settings.sucursal_id AND tenant_id = v_settings.tenant_id LIMIT 1), 0),
      COALESCE(v_tenant.cantidad_mesas, 0)
    ) INTO v_cantidad_mesas;
  ELSE
    v_cantidad_mesas := COALESCE(v_tenant.cantidad_mesas, 0);
  END IF;

  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'id',            v_settings.id,
      'tenant_id',     v_settings.tenant_id,
      'sucursal_id',   v_settings.sucursal_id,
      'public_slug',   v_settings.public_slug,
      'menu_id',       v_settings.menu_id,
      'title',         COALESCE(NULLIF(trim(v_settings.title), ''), v_tenant.nombre_negocio),
      'description',   NULLIF(trim(COALESCE(v_settings.description, '')), ''),
      'logo_url',      COALESCE(NULLIF(trim(v_settings.logo_url), ''), NULLIF(trim(COALESCE(v_tenant.logo_url, '')), '')),
      'banner_url',    NULLIF(trim(COALESCE(v_settings.banner_url, '')), ''),
      'business_name', v_tenant.nombre_negocio,
      'phone',         v_tenant.telefono,
      'address',       v_tenant.direccion,
      'currency',      COALESCE(v_tenant.moneda, 'DOP')
    ),
    'items',           v_items,
    'cantidad_mesas',  v_cantidad_mesas,
    'contact',         v_public_contact
  );
END;
$$;

-- 8. Redefine create_public_digital_order with optional p_party_size parameter
-- NOTE ON BACKWARD COMPATIBILITY:
-- In PostgreSQL, adding a defaulted parameter via CREATE OR REPLACE FUNCTION with 10 arguments creates
-- a new overload rather than replacing the existing 9-parameter function. If both exist simultaneously,
-- callers using positional arguments with 9 parameters face "ERROR: function ... is not unique" ambiguity.
-- By defining the 10-parameter signature with `p_party_size integer DEFAULT NULL` and explicitly dropping
-- the old 9-argument signature, existing callers providing 9 arguments continue working seamlessly
-- via the default value, while postgrest/RPC clients can optionally provide `p_party_size`.
CREATE OR REPLACE FUNCTION public.create_public_digital_order(
  p_public_slug       text,
  p_customer_name     text,
  p_customer_phone    text,
  p_notes             text,
  p_items             jsonb,
  p_order_type        text    DEFAULT 'takeout',   -- 'takeout' | 'in_store'
  p_mesa_numero       integer DEFAULT NULL,
  p_mesa_codigo       text    DEFAULT NULL,         -- 4-digit code for in_store
  p_client_session_id text    DEFAULT NULL,         -- browser session token
  p_party_size        integer DEFAULT NULL          -- number of diners (1..99)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_settings         public.digital_menu_settings%ROWTYPE;
  v_tenant_active    boolean;
  v_tenant_mesas     integer;
  v_tenant_plan      text;
  v_use_calendar     boolean;
  v_order_id         uuid;
  v_total            numeric := 0;
  v_item             jsonb;
  v_plato_id         integer;
  v_quantity         integer;
  v_item_notes       text;
  v_row              record;
  v_subtotal         numeric;
  v_stored_code      text;
  v_active_orders    integer;
  v_numero_pedido    integer;
  v_today            date;
  v_isodow           smallint;
BEGIN
  -- ── Basic input validation ──────────────────────────────────────────────────
  IF length(trim(COALESCE(p_customer_name, ''))) < 2
     OR length(trim(COALESCE(p_customer_name, ''))) > 120 THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;

  IF length(trim(COALESCE(p_customer_phone, ''))) > 40 THEN
    RAISE EXCEPTION 'El teléfono es demasiado largo';
  END IF;

  IF length(trim(COALESCE(p_notes, ''))) > 500 THEN
    RAISE EXCEPTION 'La nota es demasiado larga';
  END IF;

  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'El pedido debe incluir al menos un producto';
  END IF;

  IF COALESCE(p_order_type, 'takeout') NOT IN ('takeout', 'in_store') THEN
    RAISE EXCEPTION 'Tipo de pedido inválido';
  END IF;

  IF p_party_size IS NOT NULL THEN
    IF p_party_size < 1 OR p_party_size > 99 THEN
      RAISE EXCEPTION 'Cantidad de personas inválida';
    END IF;
  END IF;

  -- ── Resolve menu settings ───────────────────────────────────────────────────
  SELECT * INTO v_settings
  FROM public.digital_menu_settings
  WHERE public_slug = lower(trim(p_public_slug))
    AND enabled IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  SELECT COALESCE(t.activa, true), COALESCE(t.cantidad_mesas, 0), t.plan
  INTO v_tenant_active, v_tenant_mesas, v_tenant_plan
  FROM public.tenants t
  WHERE t.id = v_settings.tenant_id
  LIMIT 1;

  IF COALESCE(v_tenant_active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El menú no está disponible';
  END IF;

  v_use_calendar := (
    v_settings.menu_id IS NOT NULL
    AND lower(trim(COALESCE(v_tenant_plan, ''))) IN ('profesional', 'empresarial', 'corporativo')
  );

  IF v_use_calendar THEN
    v_today  := public.menu_business_today(v_settings.tenant_id);
    v_isodow := public.menu_business_isodow(v_settings.tenant_id, v_today);
  END IF;

  -- ── In-store: validate table number and code ─────────────────────────────
  IF p_order_type = 'in_store' THEN
    IF v_settings.sucursal_id IS NOT NULL THEN
      SELECT COALESCE(
        NULLIF((SELECT cantidad_mesas FROM public.sucursales
         WHERE id = v_settings.sucursal_id AND tenant_id = v_settings.tenant_id LIMIT 1), 0),
        COALESCE(v_tenant_mesas, 0)
      ) INTO v_tenant_mesas;
    END IF;

    IF p_mesa_numero IS NULL OR p_mesa_numero < 1 THEN
      RAISE EXCEPTION 'Debes seleccionar una mesa';
    END IF;

    IF p_mesa_numero > v_tenant_mesas THEN
      RAISE EXCEPTION 'Mesa inválida';
    END IF;

    IF length(trim(COALESCE(p_mesa_codigo, ''))) = 0 THEN
      RAISE EXCEPTION 'El código de mesa es obligatorio';
    END IF;

    SELECT me.codigo_seguridad INTO v_stored_code
    FROM public.mesas_estado me
    WHERE me.tenant_id   = v_settings.tenant_id
      AND me.sucursal_id IS NOT DISTINCT FROM v_settings.sucursal_id
      AND me.id          = p_mesa_numero
    LIMIT 1;

    IF v_stored_code IS NULL THEN
      RAISE EXCEPTION 'El código de mesa no ha sido configurado. Pide asistencia al personal.';
    END IF;

    IF trim(p_mesa_codigo) <> v_stored_code THEN
      RAISE EXCEPTION 'Código de mesa incorrecto';
    END IF;

    IF p_client_session_id IS NOT NULL AND length(trim(p_client_session_id)) > 0 THEN
      SELECT COUNT(*) INTO v_active_orders
      FROM public.digital_orders
      WHERE tenant_id         = v_settings.tenant_id
        AND sucursal_id       IS NOT DISTINCT FROM v_settings.sucursal_id
        AND client_session_id = trim(p_client_session_id)
        AND status = 'pending';

      IF v_active_orders > 0 THEN
        RAISE EXCEPTION 'Ya tenés un pedido activo. Pedí asistencia al personal para más pedidos.';
      END IF;
    END IF;
  END IF;

  -- ── Assign sequential order number (per tenant) ─────────────────────────
  INSERT INTO public.tenant_order_counters (tenant_id, next_numero)
  VALUES (v_settings.tenant_id, 2)
  ON CONFLICT (tenant_id) DO UPDATE
    SET next_numero = tenant_order_counters.next_numero + 1
  RETURNING next_numero - 1 INTO v_numero_pedido;

  -- ── Insert order ─────────────────────────────────────────────────────────
  INSERT INTO public.digital_orders (
    tenant_id, sucursal_id, customer_name, customer_phone, notes,
    status, total, order_type, mesa_numero, client_session_id, numero_pedido,
    party_size
  )
  VALUES (
    v_settings.tenant_id,
    v_settings.sucursal_id,
    trim(p_customer_name),
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    'pending',
    0,
    COALESCE(p_order_type, 'takeout'),
    CASE WHEN p_order_type = 'in_store' THEN p_mesa_numero ELSE NULL END,
    NULLIF(trim(COALESCE(p_client_session_id, '')), ''),
    v_numero_pedido,
    p_party_size
  )
  RETURNING id INTO v_order_id;

  -- ── Insert items ──────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_plato_id   := NULLIF(v_item->>'plato_id', '')::integer;
    v_quantity   := GREATEST(1, LEAST(99, COALESCE(NULLIF(v_item->>'quantity', '')::integer, 1)));
    v_item_notes := NULLIF(left(trim(COALESCE(v_item->>'notes', '')), 300), '');

    IF v_use_calendar THEN
      IF v_plato_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.get_menu_today_plato_ids(v_settings.menu_id, v_settings.tenant_id, v_settings.sucursal_id)
        WHERE plato_id = v_plato_id
      ) THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible';
      END IF;

      SELECT
        p.id,
        COALESCE(NULLIF(trim(mi.display_name), ''), p.nombre) AS item_name,
        p.precio
      INTO v_row
      FROM public.platos p
      LEFT JOIN public.menu_items mi
        ON mi.plato_id = p.id AND mi.menu_id = v_settings.menu_id AND v_isodow = ANY(mi.weekdays)
      WHERE p.tenant_id = v_settings.tenant_id
        AND p.id = v_plato_id
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible';
      END IF;
    ELSE
      SELECT
        p.id,
        COALESCE(NULLIF(trim(dmi.display_name), ''), p.nombre) AS item_name,
        p.precio
      INTO v_row
      FROM public.platos p
      LEFT JOIN public.digital_menu_items dmi
        ON dmi.plato_id = p.id AND dmi.tenant_id = p.tenant_id
      WHERE p.tenant_id   = v_settings.tenant_id
        AND p.id          = v_plato_id
        AND p.disponible IS TRUE
        AND (dmi.id IS NULL OR dmi.visible IS TRUE)
        AND (v_settings.sucursal_id IS NULL OR p.sucursal_id IS NULL OR p.sucursal_id = v_settings.sucursal_id)
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible';
      END IF;
    END IF;

    v_subtotal := v_row.precio * v_quantity;
    v_total    := v_total + v_subtotal;

    INSERT INTO public.digital_order_items (
      tenant_id, order_id, plato_id, name_snapshot, price_snapshot,
      quantity, notes, subtotal
    )
    VALUES (
      v_settings.tenant_id, v_order_id, v_row.id, v_row.item_name,
      v_row.precio, v_quantity, v_item_notes, v_subtotal
    );
  END LOOP;

  UPDATE public.digital_orders SET total = v_total WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id',      v_order_id,
    'total',         v_total,
    'status',        'pending',
    'numero_pedido', v_numero_pedido
  );
END;
$$;

-- Drop obsolete 9-argument signature to eliminate overload ambiguity for callers providing 9 arguments
DROP FUNCTION IF EXISTS public.create_public_digital_order(text, text, text, text, jsonb, text, integer, text, text);

-- 9. Grants for public RPCs
GRANT EXECUTE ON FUNCTION public.get_public_digital_menu(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_digital_order(text, text, text, text, jsonb, text, integer, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_service_request(text, integer, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_suggestion(text, text, integer, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
