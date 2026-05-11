-- ==========================================
-- ROLES Y FUNCIONES MOCK DE INSFORGE/SUPABASE
-- ==========================================
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'project_admin') THEN CREATE ROLE project_admin NOLOGIN; END IF; END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO project_admin;

CREATE OR REPLACE FUNCTION cyberbistro_is_super_admin() RETURNS boolean AS $$ 
BEGIN RETURN COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_super_admin') = 'true', false); 
EXCEPTION WHEN OTHERS THEN RETURN false; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cyberbistro_auth_user_id() RETURNS uuid AS $$ 
BEGIN RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid; 
EXCEPTION WHEN OTHERS THEN RETURN NULL; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cyberbistro_auth_email() RETURNS text AS $$ 
BEGIN RETURN current_setting('request.jwt.claims', true)::jsonb ->> 'email'; 
EXCEPTION WHEN OTHERS THEN RETURN NULL; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cyberbistro_current_admin_tenant_ids() RETURNS uuid[] AS $$ 
BEGIN RETURN ARRAY(SELECT jsonb_array_elements_text(current_setting('request.jwt.claims', true)::jsonb -> 'admin_tenant_ids')::uuid); 
EXCEPTION WHEN OTHERS THEN RETURN ARRAY[]::uuid[]; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cloudix_auth_user_id() RETURNS uuid AS $$ 
BEGIN RETURN (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid; 
EXCEPTION WHEN OTHERS THEN RETURN NULL; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cloudix_auth_email() RETURNS text AS $$ 
BEGIN RETURN current_setting('request.jwt.claims', true)::jsonb ->> 'email'; 
EXCEPTION WHEN OTHERS THEN RETURN NULL; 
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION cloudix_is_super_admin() RETURNS boolean AS $$ 
BEGIN RETURN COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_super_admin') = 'true', false); 
EXCEPTION WHEN OTHERS THEN RETURN false; 
END $$ LANGUAGE plpgsql STABLE;

-- Trigger functions required by schema
CREATE OR REPLACE FUNCTION realtime_notify_cocina_estado() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION realtime_notify_comandas() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;


-- Database Export
-- Generated on: 2026-05-11T16:06:56.928Z
-- Format: SQL
-- Include Data: false
-- Row Limit: 1000 rows per table

-- Table: cierres_operativos
CREATE TABLE IF NOT EXISTS cierres_operativos (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, business_day date NOT NULL, cycle_number integer NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, printed_at timestamptz, opened_by_auth_user_id uuid, closed_by_auth_user_id uuid, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: cierres_operativos
CREATE INDEX cierres_operativos_open_idx ON public.cierres_operativos USING btree (tenant_id, business_day) WHERE (closed_at IS NULL);
CREATE INDEX cierres_operativos_tenant_cycle_idx ON public.cierres_operativos USING btree (tenant_id, cycle_number DESC);
CREATE INDEX cierres_operativos_tenant_day_idx ON public.cierres_operativos USING btree (tenant_id, business_day, cycle_number DESC);
CREATE UNIQUE INDEX cierres_operativos_unique_cycle ON public.cierres_operativos USING btree (tenant_id, cycle_number);

-- Foreign key constraints for table: cierres_operativos
ALTER TABLE cierres_operativos ADD CONSTRAINT cierres_operativos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: cierres_operativos
ALTER TABLE cierres_operativos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: cierres_operativos
CREATE POLICY cb_cierres_operativos_tenant_isolation ON cierres_operativos FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON cierres_operativos FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: cloudix_super_admins
CREATE TABLE IF NOT EXISTS cloudix_super_admins (auth_user_id uuid NOT NULL, email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: cloudix_super_admins
CREATE UNIQUE INDEX cloudix_super_admins_email_key ON public.cloudix_super_admins USING btree (email);

-- Table: cocina_estado
CREATE TABLE IF NOT EXISTS cocina_estado (id uuid NOT NULL DEFAULT gen_random_uuid(), activa boolean DEFAULT true, changed_at timestamptz DEFAULT now(), changed_by varchar(255), tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid);

-- Indexes for table: cocina_estado
CREATE INDEX idx_cocina_estado_tenant ON public.cocina_estado USING btree (tenant_id);

-- Foreign key constraints for table: cocina_estado
ALTER TABLE cocina_estado ADD CONSTRAINT cocina_estado_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: cocina_estado
ALTER TABLE cocina_estado ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: cocina_estado
CREATE POLICY cb_cocina_estado_tenant_isolation ON cocina_estado FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON cocina_estado FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Triggers for table: cocina_estado
CREATE TRIGGER cocina_estado_realtime AFTER INSERT ON cocina_estado FOR EACH ROW EXECUTE FUNCTION realtime_notify_cocina_estado();
CREATE TRIGGER cocina_estado_realtime AFTER UPDATE ON cocina_estado FOR EACH ROW EXECUTE FUNCTION realtime_notify_cocina_estado();

-- Table: comandas
CREATE TABLE IF NOT EXISTS comandas (id uuid NOT NULL DEFAULT gen_random_uuid(), numero_comanda integer NOT NULL DEFAULT nextval('comandas_numero_comanda_seq'::regclass), mesa_id uuid, mesa_numero integer, estado varchar(20) DEFAULT 'pendiente'::character varying, items jsonb NOT NULL DEFAULT '[]'::jsonb, notas text, creado_por varchar(255), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid);

-- Indexes for table: comandas
CREATE INDEX idx_comandas_tenant ON public.comandas USING btree (tenant_id);

-- Foreign key constraints for table: comandas
ALTER TABLE comandas ADD CONSTRAINT comandas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: comandas
ALTER TABLE comandas ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: comandas
CREATE POLICY cb_comandas_tenant_isolation ON comandas FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON comandas FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Triggers for table: comandas
CREATE TRIGGER comandas_realtime AFTER INSERT ON comandas FOR EACH ROW EXECUTE FUNCTION realtime_notify_comandas();
CREATE TRIGGER comandas_realtime AFTER DELETE ON comandas FOR EACH ROW EXECUTE FUNCTION realtime_notify_comandas();
CREATE TRIGGER comandas_realtime AFTER UPDATE ON comandas FOR EACH ROW EXECUTE FUNCTION realtime_notify_comandas();

-- Table: configuracion
CREATE TABLE IF NOT EXISTS configuracion (clave varchar(100) NOT NULL, valor text, updated_at timestamptz DEFAULT now());

-- Table: consumos
CREATE TABLE IF NOT EXISTS consumos (id uuid NOT NULL DEFAULT gen_random_uuid(), comanda_id uuid, plato_id integer NOT NULL, nombre text NOT NULL, cantidad integer NOT NULL DEFAULT 1, precio_unitario numeric NOT NULL, subtotal numeric NOT NULL, tipo varchar(20) NOT NULL DEFAULT 'directo'::character varying, estado varchar(20) NOT NULL DEFAULT 'pedido'::character varying, factura_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid, mesa_numero integer, created_by_auth_user_id uuid);

-- Indexes for table: consumos
CREATE INDEX consumos_tenant_created_by_auth_user_idx ON public.consumos USING btree (tenant_id, created_by_auth_user_id) WHERE (created_by_auth_user_id IS NOT NULL);
CREATE INDEX idx_consumos_comanda_id ON public.consumos USING btree (comanda_id);
CREATE INDEX idx_consumos_estado ON public.consumos USING btree (estado);
CREATE INDEX idx_consumos_factura_id ON public.consumos USING btree (factura_id);
CREATE INDEX idx_consumos_mesa_numero ON public.consumos USING btree (mesa_numero);
CREATE INDEX idx_consumos_tenant ON public.consumos USING btree (tenant_id);

-- Foreign key constraints for table: consumos
ALTER TABLE consumos ADD CONSTRAINT consumos_comanda_id_fkey FOREIGN KEY (comanda_id) REFERENCES comandas (id) ON DELETE SET NULL;
ALTER TABLE consumos ADD CONSTRAINT consumos_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE SET NULL;
ALTER TABLE consumos ADD CONSTRAINT consumos_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE RESTRICT;
ALTER TABLE consumos ADD CONSTRAINT consumos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: consumos
ALTER TABLE consumos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: consumos
CREATE POLICY cb_consumos_tenant_isolation ON consumos FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = consumos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = consumos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON consumos FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: cyberbistro_super_admins
CREATE TABLE IF NOT EXISTS cyberbistro_super_admins (auth_user_id uuid NOT NULL, email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: cyberbistro_super_admins
CREATE UNIQUE INDEX cyberbistro_super_admins_email_key ON public.cyberbistro_super_admins USING btree (email);

-- Table: facturas
CREATE TABLE IF NOT EXISTS facturas (id uuid NOT NULL DEFAULT gen_random_uuid(), numero_factura integer NOT NULL DEFAULT nextval('facturas_numero_factura_seq'::regclass), mesa_numero integer NOT NULL, comanda_ids ARRAY NOT NULL DEFAULT '{}'::uuid[], cliente_nombre varchar(255), metodo_pago varchar(50) NOT NULL DEFAULT 'efectivo'::character varying, estado varchar(20) NOT NULL DEFAULT 'pendiente'::character varying, subtotal numeric NOT NULL DEFAULT 0, itbis numeric NOT NULL DEFAULT 0, propina numeric NOT NULL DEFAULT 0, total numeric NOT NULL DEFAULT 0, moneda varchar(10) NOT NULL DEFAULT 'DOP'::character varying, items jsonb NOT NULL DEFAULT '[]'::jsonb, notas text, creado_por varchar(255), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), pagada_at timestamptz, tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid, ncf text, ncf_tipo text, cliente_rnc text);

-- Indexes for table: facturas
CREATE INDEX idx_facturas_estado ON public.facturas USING btree (estado);
CREATE INDEX idx_facturas_fecha ON public.facturas USING btree (created_at DESC);
CREATE INDEX idx_facturas_tenant ON public.facturas USING btree (tenant_id);

-- Foreign key constraints for table: facturas
ALTER TABLE facturas ADD CONSTRAINT facturas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: facturas
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: facturas
CREATE POLICY cb_facturas_tenant_isolation ON facturas FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON facturas FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: gasto_categorias
CREATE TABLE IF NOT EXISTS gasto_categorias (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, nombre text NOT NULL, descripcion text, color text NOT NULL DEFAULT '#ff906d'::text, activa boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: gasto_categorias
CREATE INDEX gasto_categorias_tenant_idx ON public.gasto_categorias USING btree (tenant_id, activa, nombre);
CREATE UNIQUE INDEX gasto_categorias_tenant_nombre_unique ON public.gasto_categorias USING btree (tenant_id, lower(TRIM(BOTH FROM nombre)));

-- Foreign key constraints for table: gasto_categorias
ALTER TABLE gasto_categorias ADD CONSTRAINT gasto_categorias_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: gasto_categorias
ALTER TABLE gasto_categorias ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: gasto_categorias
CREATE POLICY cb_gasto_categorias_tenant_isolation ON gasto_categorias FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gasto_categorias.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gasto_categorias.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON gasto_categorias FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: gastos
CREATE TABLE IF NOT EXISTS gastos (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, category_id uuid, cycle_id uuid, descripcion text NOT NULL, proveedor text, monto numeric NOT NULL, metodo_pago text, fecha_gasto timestamptz NOT NULL DEFAULT now(), notas text, created_by_auth_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: gastos
CREATE INDEX gastos_tenant_category_idx ON public.gastos USING btree (tenant_id, category_id);
CREATE INDEX gastos_tenant_cycle_idx ON public.gastos USING btree (tenant_id, cycle_id);
CREATE INDEX gastos_tenant_fecha_idx ON public.gastos USING btree (tenant_id, fecha_gasto DESC);

-- Foreign key constraints for table: gastos
ALTER TABLE gastos ADD CONSTRAINT gastos_category_id_fkey FOREIGN KEY (category_id) REFERENCES gasto_categorias (id) ON DELETE SET NULL;
ALTER TABLE gastos ADD CONSTRAINT gastos_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cierres_operativos (id) ON DELETE SET NULL;
ALTER TABLE gastos ADD CONSTRAINT gastos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: gastos
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: gastos
CREATE POLICY cb_gastos_tenant_isolation ON gastos FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON gastos FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: menu_categories
CREATE TABLE IF NOT EXISTS menu_categories (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, nombre text NOT NULL, color text NOT NULL DEFAULT '#a1a1aa'::text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: menu_categories
CREATE UNIQUE INDEX menu_categories_tenant_nombre_idx ON public.menu_categories USING btree (tenant_id, lower(nombre));
CREATE INDEX menu_categories_tenant_sort_idx ON public.menu_categories USING btree (tenant_id, sort_order, nombre);

-- Foreign key constraints for table: menu_categories
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: menu_categories
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: menu_categories
CREATE POLICY cb_menu_categories_admin_all ON menu_categories FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (tenant_id = ANY (cyberbistro_current_admin_tenant_ids())))) WITH CHECK ((cyberbistro_is_super_admin() OR (tenant_id = ANY (cyberbistro_current_admin_tenant_ids()))));
CREATE POLICY cb_menu_categories_tenant_select ON menu_categories FOR SELECT TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = menu_categories.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON menu_categories FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: mesas_estado
CREATE TABLE IF NOT EXISTS mesas_estado (id integer NOT NULL, estado varchar(20) DEFAULT 'libre'::character varying, fusionada boolean DEFAULT false, fusion_padre_id integer, fusion_hijos ARRAY DEFAULT '{}'::integer[], span_filas integer DEFAULT 1, span_columnas integer DEFAULT 1, tenant_id uuid NOT NULL, updated_at timestamptz DEFAULT now());

-- Indexes for table: mesas_estado
CREATE INDEX idx_mesas_estado_tenant ON public.mesas_estado USING btree (tenant_id);

-- Foreign key constraints for table: mesas_estado
ALTER TABLE mesas_estado ADD CONSTRAINT mesas_estado_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: mesas_estado
ALTER TABLE mesas_estado ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: mesas_estado
CREATE POLICY cb_mesas_estado_tenant_isolation ON mesas_estado FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON mesas_estado FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: platos
CREATE TABLE IF NOT EXISTS platos (id integer NOT NULL, nombre text NOT NULL, precio numeric NOT NULL DEFAULT 0, categoria text NOT NULL DEFAULT 'General'::text, disponible boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), va_a_cocina boolean NOT NULL DEFAULT true, tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid);

-- Indexes for table: platos
CREATE INDEX idx_platos_tenant ON public.platos USING btree (tenant_id);

-- Foreign key constraints for table: platos
ALTER TABLE platos ADD CONSTRAINT platos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: platos
ALTER TABLE platos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: platos
CREATE POLICY cb_platos_tenant_isolation ON platos FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));
CREATE POLICY project_admin_policy ON platos FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: tenant_users
CREATE TABLE IF NOT EXISTS tenant_users (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, email text NOT NULL, password_hash text NOT NULL, rol text NOT NULL, nombre text, activo boolean DEFAULT true, created_at timestamptz DEFAULT now(), last_login timestamptz, auth_user_id uuid);

-- Indexes for table: tenant_users
CREATE INDEX idx_tenant_users_auth_user_id ON public.tenant_users USING btree (auth_user_id);
CREATE INDEX idx_tenant_users_email ON public.tenant_users USING btree (email);
CREATE INDEX idx_tenant_users_rol ON public.tenant_users USING btree (rol);
CREATE INDEX idx_tenant_users_tenant ON public.tenant_users USING btree (tenant_id);
CREATE UNIQUE INDEX tenant_users_tenant_id_email_key ON public.tenant_users USING btree (tenant_id, email);

-- Foreign key constraints for table: tenant_users
ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: tenant_users
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: tenant_users
CREATE POLICY cb_tenant_users_admin_staff_delete ON tenant_users FOR DELETE TO public USING (((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())) AND (rol = ANY (ARRAY['cajera'::text, 'mesero'::text, 'cocina'::text, 'cocinero'::text]))));
CREATE POLICY cb_tenant_users_admin_staff_insert ON tenant_users FOR INSERT TO public WITH CHECK (((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())) AND (rol = ANY (ARRAY['cajera'::text, 'mesero'::text, 'cocina'::text, 'cocinero'::text])) AND (activo IS TRUE)));
CREATE POLICY cb_tenant_users_admin_staff_update ON tenant_users FOR UPDATE TO public USING (((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())) AND (rol = ANY (ARRAY['cajera'::text, 'mesero'::text, 'cocina'::text, 'cocinero'::text])))) WITH CHECK (((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())) AND (rol = ANY (ARRAY['cajera'::text, 'mesero'::text, 'cocina'::text, 'cocinero'::text]))));
CREATE POLICY cb_tenant_users_admin_team_select ON tenant_users FOR SELECT TO public USING ((tenant_id = ANY (cyberbistro_current_admin_tenant_ids())));
CREATE POLICY cb_tenant_users_self_select ON tenant_users FOR SELECT TO public USING (((auth_user_id = cloudix_auth_user_id()) OR (lower(email) = lower(COALESCE(cloudix_auth_email(), ''::text)))));
CREATE POLICY cb_tenant_users_super_admin_all ON tenant_users FOR ALL TO public USING (cloudix_is_super_admin()) WITH CHECK (cloudix_is_super_admin());
CREATE POLICY project_admin_policy ON tenant_users FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: tenants
CREATE TABLE IF NOT EXISTS tenants (id uuid NOT NULL DEFAULT gen_random_uuid(), nombre_negocio text NOT NULL, rnc text, direccion text, telefono text, email text, moneda text DEFAULT 'DOP'::text, idioma text DEFAULT 'es'::text, activa boolean DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), logo_url text, ncf_fiscal_activo boolean DEFAULT false, ncf_tipo_default text, ncf_secuencia_siguiente integer, ncf_secuencias_por_tipo jsonb DEFAULT '{}'::jsonb, itbis_cobro_por_defecto boolean NOT NULL DEFAULT false, ncf_b01_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b02_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b14_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b15_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b16_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b17_secuencia_siguiente integer NOT NULL DEFAULT 1, cantidad_mesas integer DEFAULT 20, user_limit_enabled boolean NOT NULL DEFAULT false, admin_user_limit integer, cajera_user_limit integer, cocina_user_limit integer, mesero_user_limit integer, logo_size_px integer NOT NULL DEFAULT 52, logo_offset_x integer NOT NULL DEFAULT 0, logo_offset_y integer NOT NULL DEFAULT 0);

-- RLS enabled for table: tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: tenants
CREATE POLICY cb_tenants_auth_insert ON tenants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cb_tenants_isolation ON tenants FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))));
CREATE POLICY cb_tenants_member_select ON tenants FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR (lower(tu.email) = lower(COALESCE(cloudix_auth_email(), ''::text))))))));
CREATE POLICY cb_tenants_super_admin_all ON tenants FOR ALL TO public USING (cloudix_is_super_admin()) WITH CHECK (cloudix_is_super_admin());
CREATE POLICY project_admin_policy ON tenants FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Sequences
CREATE SEQUENCE IF NOT EXISTS comandas_numero_comanda_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS facturas_numero_factura_seq START WITH 1000 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS platos_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS platos_tenant_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;

