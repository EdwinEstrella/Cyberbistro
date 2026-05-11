-- Archivo autogenerado para pruebas en CI/CD con RLS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- FUNCIONES DE AUTENTICACIÓN SIMULADAS
-- (Mocked functions para poder testear RLS)
-- ==========================================
CREATE OR REPLACE FUNCTION cyberbistro_is_super_admin() RETURNS boolean AS $$ BEGIN RETURN current_setting('request.jwt.claims', true)::jsonb ->> 'is_super_admin' = 'true'; EXCEPTION WHEN OTHERS THEN RETURN false; END $$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION cyberbistro_auth_user_id() RETURNS uuid AS $$ BEGIN RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION cyberbistro_auth_email() RETURNS text AS $$ BEGIN RETURN current_setting('request.jwt.claims', true)::jsonb ->> 'email'; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION cyberbistro_current_admin_tenant_ids() RETURNS uuid[] AS $$ BEGIN RETURN ARRAY(SELECT jsonb_array_elements_text(current_setting('request.jwt.claims', true)::jsonb -> 'admin_tenant_ids')::uuid); EXCEPTION WHEN OTHERS THEN RETURN ARRAY[]::uuid[]; END $$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION cloudix_auth_user_id() RETURNS uuid AS $$ BEGIN RETURN cyberbistro_auth_user_id(); END $$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION cloudix_auth_email() RETURNS text AS $$ BEGIN RETURN cyberbistro_auth_email(); END $$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION cloudix_is_super_admin() RETURNS boolean AS $$ BEGIN RETURN cyberbistro_is_super_admin(); END $$ LANGUAGE plpgsql STABLE;

-- ==========================================
-- TABLAS
-- ==========================================
CREATE TABLE IF NOT EXISTS cierres_operativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  business_day date,
  cycle_number integer,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  printed_at timestamp with time zone,
  opened_by_auth_user_id uuid,
  closed_by_auth_user_id uuid,
  created_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS cloudix_super_admins (
  auth_user_id uuid,
  email text,
  created_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS cocina_estado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activa boolean,
  changed_at timestamp with time zone,
  changed_by character varying,
  tenant_id uuid
);

CREATE TABLE IF NOT EXISTS comandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_comanda integer,
  mesa_id uuid,
  mesa_numero integer,
  estado character varying,
  items jsonb,
  notas text,
  creado_por character varying,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  tenant_id uuid
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave character varying,
  valor text,
  updated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS consumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id uuid,
  plato_id integer,
  nombre text,
  cantidad integer,
  precio_unitario numeric,
  subtotal numeric,
  tipo character varying,
  estado character varying,
  factura_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  tenant_id uuid,
  mesa_numero integer,
  created_by_auth_user_id uuid
);

CREATE TABLE IF NOT EXISTS cyberbistro_super_admins (
  auth_user_id uuid,
  email text,
  created_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_factura integer,
  mesa_numero integer,
  comanda_ids ARRAY,
  cliente_nombre character varying,
  metodo_pago character varying,
  estado character varying,
  subtotal numeric,
  itbis numeric,
  propina numeric,
  total numeric,
  moneda character varying,
  items jsonb,
  notas text,
  creado_por character varying,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  pagada_at timestamp with time zone,
  tenant_id uuid,
  ncf text,
  ncf_tipo text,
  cliente_rnc text
);

CREATE TABLE IF NOT EXISTS gasto_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  nombre text,
  descripcion text,
  color text,
  activa boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  category_id uuid,
  cycle_id uuid,
  descripcion text,
  proveedor text,
  monto numeric,
  metodo_pago text,
  fecha_gasto timestamp with time zone,
  notas text,
  created_by_auth_user_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  nombre text,
  color text,
  sort_order integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS mesas_estado (
  id integer PRIMARY KEY,
  estado character varying,
  fusionada boolean,
  fusion_padre_id integer,
  fusion_hijos ARRAY,
  span_filas integer,
  span_columnas integer,
  tenant_id uuid,
  updated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS platos (
  id integer PRIMARY KEY,
  nombre text,
  precio numeric,
  categoria text,
  disponible boolean,
  created_at timestamp with time zone,
  va_a_cocina boolean,
  tenant_id uuid
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  email text,
  password_hash text,
  rol text,
  nombre text,
  activo boolean,
  created_at timestamp with time zone,
  last_login timestamp with time zone,
  auth_user_id uuid
);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio text,
  rnc text,
  direccion text,
  telefono text,
  email text,
  moneda text,
  idioma text,
  activa boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  logo_url text,
  ncf_fiscal_activo boolean,
  ncf_tipo_default text,
  ncf_secuencia_siguiente integer,
  ncf_secuencias_por_tipo jsonb,
  itbis_cobro_por_defecto boolean,
  ncf_b01_secuencia_siguiente integer,
  ncf_b02_secuencia_siguiente integer,
  ncf_b14_secuencia_siguiente integer,
  ncf_b15_secuencia_siguiente integer,
  ncf_b16_secuencia_siguiente integer,
  ncf_b17_secuencia_siguiente integer,
  cantidad_mesas integer,
  user_limit_enabled boolean,
  admin_user_limit integer,
  cajera_user_limit integer,
  cocina_user_limit integer,
  mesero_user_limit integer,
  logo_size_px integer,
  logo_offset_x integer,
  logo_offset_y integer
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE cocina_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_operativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platos ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesas_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasto_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cb_cocina_estado_tenant_isolation" ON cocina_estado
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON cocina_estado
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_comandas_tenant_isolation" ON comandas
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON comandas
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_cierres_operativos_tenant_isolation" ON cierres_operativos
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON cierres_operativos
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_tenant_users_admin_staff_delete" ON tenant_users
  AS PERMISSIVE
  FOR DELETE
  USING (((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())) AND (rol = ANY (ARRAY['cajera'::text, 'mesero'::text, 'cocina'::text, 'cocinero'::text]))))
;

CREATE POLICY "cb_tenant_users_admin_staff_insert" ON tenant_users
  AS PERMISSIVE
  FOR INSERT
  WITH CHECK (((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())) AND (rol = ANY (ARRAY['cajera'::text, 'mesero'::text, 'cocina'::text, 'cocinero'::text])) AND (activo IS TRUE)))
;

CREATE POLICY "cb_tenant_users_admin_staff_update" ON tenant_users
  AS PERMISSIVE
  FOR UPDATE
  USING (((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())) AND (rol = ANY (ARRAY['cajera'::text, 'mesero'::text, 'cocina'::text, 'cocinero'::text]))))
  WITH CHECK (((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())) AND (rol = ANY (ARRAY['cajera'::text, 'mesero'::text, 'cocina'::text, 'cocinero'::text]))))
;

CREATE POLICY "cb_tenant_users_admin_team_select" ON tenant_users
  AS PERMISSIVE
  FOR SELECT
  USING ((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())))
;

CREATE POLICY "cb_tenant_users_self_select" ON tenant_users
  AS PERMISSIVE
  FOR SELECT
  USING (((auth_user_id = cloudix_auth_user_id()) OR (lower(email) = lower(COALESCE(cloudix_auth_email(), ''::text)))))
;

CREATE POLICY "cb_tenant_users_super_admin_all" ON tenant_users
  AS PERMISSIVE
  FOR ALL
  USING (cloudix_is_super_admin())
  WITH CHECK (cloudix_is_super_admin())
;

CREATE POLICY "project_admin_policy" ON tenant_users
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_platos_tenant_isolation" ON platos
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON platos
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_facturas_tenant_isolation" ON facturas
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON facturas
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_mesas_estado_tenant_isolation" ON mesas_estado
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON mesas_estado
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_tenants_auth_insert" ON tenants
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (true)
;

CREATE POLICY "cb_tenants_isolation" ON tenants
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))
;

CREATE POLICY "cb_tenants_member_select" ON tenants
  AS PERMISSIVE
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR (lower(tu.email) = lower(COALESCE(cloudix_auth_email(), ''::text))))))))
;

CREATE POLICY "cb_tenants_super_admin_all" ON tenants
  AS PERMISSIVE
  FOR ALL
  USING (cloudix_is_super_admin())
  WITH CHECK (cloudix_is_super_admin())
;

CREATE POLICY "project_admin_policy" ON tenants
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_consumos_tenant_isolation" ON consumos
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = consumos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = consumos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON consumos
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_menu_categories_admin_all" ON menu_categories
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (tenant_id = ANY (cyberbistro_current_admin_tenant_ids()))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (tenant_id = ANY (cyberbistro_current_admin_tenant_ids()))))
;

CREATE POLICY "cb_menu_categories_tenant_select" ON menu_categories
  AS PERMISSIVE
  FOR SELECT
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = menu_categories.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON menu_categories
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_gasto_categorias_tenant_isolation" ON gasto_categorias
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gasto_categorias.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gasto_categorias.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON gasto_categorias
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

CREATE POLICY "cb_gastos_tenant_isolation" ON gastos
  AS PERMISSIVE
  FOR ALL
  USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
  WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))))
;

CREATE POLICY "project_admin_policy" ON gastos
  AS PERMISSIVE
  FOR ALL
  TO project_admin
  USING (true)
  WITH CHECK (true)
;

