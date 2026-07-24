-- Database Export
-- Generated on: 2026-07-24T03:34:17.197Z
-- Format: SQL
-- Include Data: false
-- Row Limit: 1000 rows per table

-- Table: cierres_operativos
CREATE TABLE IF NOT EXISTS cierres_operativos (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, business_day date NOT NULL, cycle_number integer NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, printed_at timestamptz, opened_by_auth_user_id uuid, closed_by_auth_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), sucursal_id uuid, efectivo_inicial numeric NOT NULL DEFAULT 0);

-- Indexes for table: cierres_operativos
CREATE INDEX cierres_operativos_open_idx ON public.cierres_operativos USING btree (tenant_id, business_day) WHERE (closed_at IS NULL);
CREATE INDEX cierres_operativos_tenant_cycle_idx ON public.cierres_operativos USING btree (tenant_id, cycle_number DESC);
CREATE INDEX cierres_operativos_tenant_day_idx ON public.cierres_operativos USING btree (tenant_id, business_day, cycle_number DESC);
CREATE UNIQUE INDEX cierres_operativos_unique_cycle ON public.cierres_operativos USING btree (tenant_id, cycle_number);
CREATE INDEX idx_cierres_operativos_sucursal_id ON public.cierres_operativos USING btree (sucursal_id);

-- Foreign key constraints for table: cierres_operativos
ALTER TABLE cierres_operativos ADD CONSTRAINT cierres_operativos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cierres_operativos ADD CONSTRAINT cierres_operativos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: cierres_operativos
ALTER TABLE cierres_operativos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: cierres_operativos
CREATE POLICY cb_cierres_operativos_delete ON cierres_operativos FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND (tu.rol = 'admin'::text) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_cierres_operativos_insert ON cierres_operativos FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_cierres_operativos_select ON cierres_operativos FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_cierres_operativos_update ON cierres_operativos FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cierres_operativos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));

-- Table: cloudix_super_admins
CREATE TABLE IF NOT EXISTS cloudix_super_admins (auth_user_id uuid NOT NULL, email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: cloudix_super_admins
CREATE UNIQUE INDEX cloudix_super_admins_email_key ON public.cloudix_super_admins USING btree (email);

-- RLS enabled for table: cloudix_super_admins
ALTER TABLE cloudix_super_admins ENABLE ROW LEVEL SECURITY;

-- Table: cocina_estado
CREATE TABLE IF NOT EXISTS cocina_estado (id uuid NOT NULL DEFAULT gen_random_uuid(), activa boolean DEFAULT true, changed_at timestamptz DEFAULT now(), changed_by varchar(255), tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid, sucursal_id uuid);

-- Indexes for table: cocina_estado
CREATE INDEX idx_cocina_estado_sucursal_id ON public.cocina_estado USING btree (sucursal_id);
CREATE INDEX idx_cocina_estado_tenant ON public.cocina_estado USING btree (tenant_id);

-- Foreign key constraints for table: cocina_estado
ALTER TABLE cocina_estado ADD CONSTRAINT cocina_estado_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cocina_estado ADD CONSTRAINT cocina_estado_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: cocina_estado
ALTER TABLE cocina_estado ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: cocina_estado
CREATE POLICY cb_cocina_estado_delete ON cocina_estado FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND (tu.rol = 'admin'::text) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_cocina_estado_insert ON cocina_estado FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_cocina_estado_select ON cocina_estado FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_cocina_estado_update ON cocina_estado FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = cocina_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));

-- Triggers for table: cocina_estado
CREATE TRIGGER cocina_estado_realtime AFTER INSERT ON cocina_estado FOR EACH ROW EXECUTE FUNCTION realtime_notify_cocina_estado();
CREATE TRIGGER cocina_estado_realtime AFTER UPDATE ON cocina_estado FOR EACH ROW EXECUTE FUNCTION realtime_notify_cocina_estado();

-- Table: comandas
CREATE TABLE IF NOT EXISTS comandas (id uuid NOT NULL DEFAULT gen_random_uuid(), numero_comanda integer NOT NULL DEFAULT nextval('comandas_numero_comanda_seq'::regclass), mesa_id uuid, mesa_numero integer, estado varchar(20) DEFAULT 'pendiente'::character varying, items jsonb NOT NULL DEFAULT '[]'::jsonb, notas text, creado_por varchar(255), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid, sucursal_id uuid);

-- Indexes for table: comandas
CREATE INDEX idx_comandas_sucursal_id ON public.comandas USING btree (sucursal_id);
CREATE INDEX idx_comandas_tenant ON public.comandas USING btree (tenant_id);

-- Foreign key constraints for table: comandas
ALTER TABLE comandas ADD CONSTRAINT comandas_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE comandas ADD CONSTRAINT comandas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: comandas
ALTER TABLE comandas ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: comandas
CREATE POLICY cb_comandas_delete ON comandas FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND (tu.rol = 'admin'::text) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_comandas_insert ON comandas FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_comandas_select ON comandas FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_comandas_update ON comandas FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = comandas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));

-- Triggers for table: comandas
CREATE TRIGGER comandas_realtime AFTER INSERT ON comandas FOR EACH ROW EXECUTE FUNCTION realtime_notify_comandas();
CREATE TRIGGER comandas_realtime AFTER DELETE ON comandas FOR EACH ROW EXECUTE FUNCTION realtime_notify_comandas();
CREATE TRIGGER comandas_realtime AFTER UPDATE ON comandas FOR EACH ROW EXECUTE FUNCTION realtime_notify_comandas();

-- Table: compra_detalles
CREATE TABLE IF NOT EXISTS compra_detalles (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, compra_id uuid NOT NULL, producto_id uuid NOT NULL, cantidad numeric NOT NULL, costo_unitario numeric NOT NULL, total numeric NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()));

-- Indexes for table: compra_detalles
CREATE INDEX idx_compra_detalles_compra_id ON public.compra_detalles USING btree (compra_id);
CREATE INDEX idx_compra_detalles_producto_id ON public.compra_detalles USING btree (producto_id);
CREATE INDEX idx_compra_detalles_tenant_id ON public.compra_detalles USING btree (tenant_id);

-- Foreign key constraints for table: compra_detalles
ALTER TABLE compra_detalles ADD CONSTRAINT compra_detalles_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES compras (id) ON DELETE CASCADE;
ALTER TABLE compra_detalles ADD CONSTRAINT compra_detalles_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos_inventario (id) ON DELETE CASCADE;
ALTER TABLE compra_detalles ADD CONSTRAINT compra_detalles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: compra_detalles
ALTER TABLE compra_detalles ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: compra_detalles
CREATE POLICY cb_compra_detalles_no_app_delete ON compra_detalles FOR DELETE TO public USING (false);
CREATE POLICY cb_compra_detalles_no_app_update ON compra_detalles FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY cb_compra_detalles_tenant_insert ON compra_detalles FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_compra_detalles_tenant_select ON compra_detalles FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: compra_detalles
CREATE TRIGGER set_public_compra_detalles_updated_at BEFORE UPDATE ON compra_detalles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Table: compras
CREATE TABLE IF NOT EXISTS compras (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, proveedor_id uuid, numero_factura varchar(50), tipo_pago varchar(20) NOT NULL, fecha_compra timestamptz NOT NULL DEFAULT now(), total numeric NOT NULL DEFAULT 0.00, estado varchar(20) NOT NULL DEFAULT 'completada'::character varying, observacion text, usuario_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()), metodo_pago varchar(20), monto_pagado numeric DEFAULT 0.00);

-- Indexes for table: compras
CREATE INDEX idx_compras_proveedor_id ON public.compras USING btree (proveedor_id);
CREATE INDEX idx_compras_sucursal_id ON public.compras USING btree (sucursal_id);
CREATE INDEX idx_compras_tenant_id ON public.compras USING btree (tenant_id);
CREATE INDEX idx_compras_usuario_id ON public.compras USING btree (usuario_id);

-- Foreign key constraints for table: compras
ALTER TABLE compras ADD CONSTRAINT compras_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores (id) ON DELETE SET NULL;
ALTER TABLE compras ADD CONSTRAINT compras_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE compras ADD CONSTRAINT compras_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE compras ADD CONSTRAINT compras_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES tenant_users (id) ON DELETE SET NULL;

-- RLS enabled for table: compras
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: compras
CREATE POLICY cb_compras_no_app_delete ON compras FOR DELETE TO public USING (false);
CREATE POLICY cb_compras_no_app_update ON compras FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY cb_compras_tenant_insert ON compras FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_compras_tenant_select ON compras FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: compras
CREATE TRIGGER set_public_compras_updated_at BEFORE UPDATE ON compras FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Table: consumos
CREATE TABLE IF NOT EXISTS consumos (id uuid NOT NULL DEFAULT gen_random_uuid(), comanda_id uuid, plato_id integer NOT NULL, nombre text NOT NULL, cantidad integer NOT NULL DEFAULT 1, precio_unitario numeric NOT NULL, subtotal numeric NOT NULL, tipo varchar(20) NOT NULL DEFAULT 'directo'::character varying, estado varchar(20) NOT NULL DEFAULT 'pedido'::character varying, factura_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid, mesa_numero integer, created_by_auth_user_id uuid, sucursal_id uuid);

-- Indexes for table: consumos
CREATE INDEX consumos_tenant_created_by_auth_user_idx ON public.consumos USING btree (tenant_id, created_by_auth_user_id) WHERE (created_by_auth_user_id IS NOT NULL);
CREATE INDEX idx_consumos_comanda_id ON public.consumos USING btree (comanda_id);
CREATE INDEX idx_consumos_estado ON public.consumos USING btree (estado);
CREATE INDEX idx_consumos_factura_id ON public.consumos USING btree (factura_id);
CREATE INDEX idx_consumos_mesa_numero ON public.consumos USING btree (mesa_numero);
CREATE INDEX idx_consumos_plato_id ON public.consumos USING btree (plato_id);
CREATE INDEX idx_consumos_sucursal_id ON public.consumos USING btree (sucursal_id);
CREATE INDEX idx_consumos_tenant ON public.consumos USING btree (tenant_id);

-- Foreign key constraints for table: consumos
ALTER TABLE consumos ADD CONSTRAINT consumos_comanda_id_fkey FOREIGN KEY (comanda_id) REFERENCES comandas (id) ON DELETE SET NULL;
ALTER TABLE consumos ADD CONSTRAINT consumos_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE SET NULL;
ALTER TABLE consumos ADD CONSTRAINT consumos_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE RESTRICT;
ALTER TABLE consumos ADD CONSTRAINT consumos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE consumos ADD CONSTRAINT consumos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: consumos
ALTER TABLE consumos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: consumos
CREATE POLICY cb_consumos_insert ON consumos FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = consumos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_consumos_select ON consumos FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = consumos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_consumos_staff_delete_open ON consumos FOR DELETE TO public USING (((cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]) OR (cyberbistro_has_tenant_role(tenant_id, ARRAY['cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text]) AND (created_by_auth_user_id = cyberbistro_auth_user_id()))) AND (factura_id IS NULL) AND ((estado)::text <> 'pagado'::text)));
CREATE POLICY cb_consumos_tenant_insert ON consumos FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));
CREATE POLICY cb_consumos_tenant_select ON consumos FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));
CREATE POLICY cb_consumos_tenant_update ON consumos FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));
CREATE POLICY cb_consumos_update ON consumos FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = consumos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = consumos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));

-- Table: cuentas_cobrar
CREATE TABLE IF NOT EXISTS cuentas_cobrar (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, factura_id uuid, customer_id uuid NOT NULL, monto_total numeric NOT NULL, monto_pagado numeric NOT NULL DEFAULT 0.00, fecha_emision timestamptz NOT NULL DEFAULT now(), fecha_vencimiento timestamptz NOT NULL, estado varchar(20) NOT NULL DEFAULT 'pendiente'::character varying, observacion text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: cuentas_cobrar
CREATE INDEX cuentas_cobrar_estado_idx ON public.cuentas_cobrar USING btree (tenant_id, estado);
CREATE INDEX cuentas_cobrar_tenant_cust_idx ON public.cuentas_cobrar USING btree (tenant_id, customer_id);
CREATE INDEX idx_cuentas_cobrar_customer_id ON public.cuentas_cobrar USING btree (customer_id);
CREATE INDEX idx_cuentas_cobrar_factura_id ON public.cuentas_cobrar USING btree (factura_id);
CREATE INDEX idx_cuentas_cobrar_sucursal_id ON public.cuentas_cobrar USING btree (sucursal_id);

-- Foreign key constraints for table: cuentas_cobrar
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE;
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE SET NULL;
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: cuentas_cobrar
ALTER TABLE cuentas_cobrar ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: cuentas_cobrar
CREATE POLICY cb_cuentas_cobrar_admin_delete ON cuentas_cobrar FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_cuentas_cobrar_tenant_insert ON cuentas_cobrar FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_cuentas_cobrar_tenant_select ON cuentas_cobrar FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_cuentas_cobrar_tenant_update ON cuentas_cobrar FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: cuentas_cobrar
CREATE TRIGGER set_public_cuentas_cobrar_updated_at BEFORE UPDATE ON cuentas_cobrar FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Table: cuentas_pagar
CREATE TABLE IF NOT EXISTS cuentas_pagar (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, compra_id uuid, proveedor_id uuid NOT NULL, monto_total numeric NOT NULL, monto_pagado numeric NOT NULL DEFAULT 0.00, fecha_emision timestamptz NOT NULL DEFAULT now(), fecha_vencimiento timestamptz NOT NULL, estado varchar(20) NOT NULL DEFAULT 'pendiente'::character varying, observacion text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: cuentas_pagar
CREATE INDEX cuentas_pagar_estado_idx ON public.cuentas_pagar USING btree (tenant_id, estado);
CREATE INDEX cuentas_pagar_tenant_prov_idx ON public.cuentas_pagar USING btree (tenant_id, proveedor_id);
CREATE INDEX idx_cuentas_pagar_compra_id ON public.cuentas_pagar USING btree (compra_id);
CREATE INDEX idx_cuentas_pagar_proveedor_id ON public.cuentas_pagar USING btree (proveedor_id);
CREATE INDEX idx_cuentas_pagar_sucursal_id ON public.cuentas_pagar USING btree (sucursal_id);

-- Foreign key constraints for table: cuentas_pagar
ALTER TABLE cuentas_pagar ADD CONSTRAINT cuentas_pagar_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES compras (id) ON DELETE SET NULL;
ALTER TABLE cuentas_pagar ADD CONSTRAINT cuentas_pagar_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores (id) ON DELETE CASCADE;
ALTER TABLE cuentas_pagar ADD CONSTRAINT cuentas_pagar_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cuentas_pagar ADD CONSTRAINT cuentas_pagar_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: cuentas_pagar
ALTER TABLE cuentas_pagar ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: cuentas_pagar
CREATE POLICY cb_cuentas_pagar_admin_delete ON cuentas_pagar FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_cuentas_pagar_tenant_insert ON cuentas_pagar FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_cuentas_pagar_tenant_select ON cuentas_pagar FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_cuentas_pagar_tenant_update ON cuentas_pagar FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: cuentas_pagar
CREATE TRIGGER set_public_cuentas_pagar_updated_at BEFORE UPDATE ON cuentas_pagar FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Table: customers
CREATE TABLE IF NOT EXISTS customers (id uuid NOT NULL, tenant_id uuid NOT NULL, name text NOT NULL, phone text, email text, document_id text, address text, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);

-- Indexes for table: customers
CREATE INDEX customers_tenant_active_name_idx ON public.customers USING btree (tenant_id, lower(name)) WHERE (deleted_at IS NULL);
CREATE INDEX customers_tenant_document_idx ON public.customers USING btree (tenant_id, document_id) WHERE ((document_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX customers_tenant_phone_idx ON public.customers USING btree (tenant_id, phone) WHERE ((phone IS NOT NULL) AND (deleted_at IS NULL));

-- Foreign key constraints for table: customers
ALTER TABLE customers ADD CONSTRAINT customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: customers
CREATE POLICY cb_customers_tenant_delete ON customers FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_customers_tenant_insert ON customers FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_customers_tenant_select ON customers FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_customers_tenant_update ON customers FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Table: cxc_pagos
CREATE TABLE IF NOT EXISTS cxc_pagos (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, cuenta_cobrar_id uuid NOT NULL, monto numeric NOT NULL, fecha_pago timestamptz NOT NULL DEFAULT now(), metodo_pago varchar(20) NOT NULL, notas text, cycle_id uuid, created_by_auth_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()));

-- Indexes for table: cxc_pagos
CREATE INDEX cxc_pagos_cuenta_cobrar_idx ON public.cxc_pagos USING btree (tenant_id, cuenta_cobrar_id);
CREATE INDEX idx_cxc_pagos_auth_user_id ON public.cxc_pagos USING btree (created_by_auth_user_id);
CREATE INDEX idx_cxc_pagos_cuenta_cobrar_id ON public.cxc_pagos USING btree (cuenta_cobrar_id);
CREATE INDEX idx_cxc_pagos_cycle_id ON public.cxc_pagos USING btree (cycle_id);
CREATE INDEX idx_cxc_pagos_sucursal_id ON public.cxc_pagos USING btree (sucursal_id);

-- Foreign key constraints for table: cxc_pagos
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_created_by_auth_user_id_fkey FOREIGN KEY (created_by_auth_user_id) REFERENCES tenant_users (id) ON DELETE SET NULL;
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_cuenta_cobrar_id_fkey FOREIGN KEY (cuenta_cobrar_id) REFERENCES cuentas_cobrar (id) ON DELETE CASCADE;
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cierres_operativos (id) ON DELETE SET NULL;
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: cxc_pagos
ALTER TABLE cxc_pagos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: cxc_pagos
CREATE POLICY cb_cxc_pagos_no_app_delete ON cxc_pagos FOR DELETE TO public USING (false);
CREATE POLICY cb_cxc_pagos_no_app_update ON cxc_pagos FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY cb_cxc_pagos_tenant_insert ON cxc_pagos FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_cxc_pagos_tenant_select ON cxc_pagos FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: cxc_pagos
CREATE TRIGGER set_public_cxc_pagos_updated_at BEFORE UPDATE ON cxc_pagos FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Table: cxp_pagos
CREATE TABLE IF NOT EXISTS cxp_pagos (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, cuenta_pagar_id uuid NOT NULL, monto numeric NOT NULL, fecha_pago timestamptz NOT NULL DEFAULT now(), metodo_pago varchar(20) NOT NULL, notas text, cycle_id uuid, created_by_auth_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()));

-- Indexes for table: cxp_pagos
CREATE INDEX cxp_pagos_cuenta_pagar_idx ON public.cxp_pagos USING btree (tenant_id, cuenta_pagar_id);
CREATE INDEX idx_cxp_pagos_auth_user_id ON public.cxp_pagos USING btree (created_by_auth_user_id);
CREATE INDEX idx_cxp_pagos_cuenta_pagar_id ON public.cxp_pagos USING btree (cuenta_pagar_id);
CREATE INDEX idx_cxp_pagos_cycle_id ON public.cxp_pagos USING btree (cycle_id);
CREATE INDEX idx_cxp_pagos_sucursal_id ON public.cxp_pagos USING btree (sucursal_id);

-- Foreign key constraints for table: cxp_pagos
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_created_by_auth_user_id_fkey FOREIGN KEY (created_by_auth_user_id) REFERENCES tenant_users (id) ON DELETE SET NULL;
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_cuenta_pagar_id_fkey FOREIGN KEY (cuenta_pagar_id) REFERENCES cuentas_pagar (id) ON DELETE CASCADE;
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cierres_operativos (id) ON DELETE SET NULL;
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: cxp_pagos
ALTER TABLE cxp_pagos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: cxp_pagos
CREATE POLICY cb_cxp_pagos_no_app_delete ON cxp_pagos FOR DELETE TO public USING (false);
CREATE POLICY cb_cxp_pagos_no_app_update ON cxp_pagos FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY cb_cxp_pagos_tenant_insert ON cxp_pagos FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_cxp_pagos_tenant_select ON cxp_pagos FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: cxp_pagos
CREATE TRIGGER set_public_cxp_pagos_updated_at BEFORE UPDATE ON cxp_pagos FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Table: cyberbistro_super_admins
CREATE TABLE IF NOT EXISTS cyberbistro_super_admins (auth_user_id uuid NOT NULL, email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: cyberbistro_super_admins
CREATE UNIQUE INDEX cyberbistro_super_admins_email_key ON public.cyberbistro_super_admins USING btree (email);

-- RLS enabled for table: cyberbistro_super_admins
ALTER TABLE cyberbistro_super_admins ENABLE ROW LEVEL SECURITY;

-- Table: digital_menu_items
CREATE TABLE IF NOT EXISTS digital_menu_items (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, plato_id integer NOT NULL, display_name text, description text, image_url text, visible boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: digital_menu_items
CREATE INDEX digital_menu_items_plato_idx ON public.digital_menu_items USING btree (tenant_id, plato_id);
CREATE INDEX digital_menu_items_visible_idx ON public.digital_menu_items USING btree (tenant_id, visible, sort_order);
CREATE INDEX idx_digital_menu_items_plato_id ON public.digital_menu_items USING btree (plato_id);

-- Foreign key constraints for table: digital_menu_items
ALTER TABLE digital_menu_items ADD CONSTRAINT digital_menu_items_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE CASCADE;
ALTER TABLE digital_menu_items ADD CONSTRAINT digital_menu_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: digital_menu_items
ALTER TABLE digital_menu_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: digital_menu_items
CREATE POLICY cb_digital_menu_items_admin_delete ON digital_menu_items FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_digital_menu_items_admin_insert ON digital_menu_items FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_digital_menu_items_admin_update ON digital_menu_items FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_digital_menu_items_tenant_select ON digital_menu_items FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: digital_menu_items
CREATE TRIGGER trg_notify_digital_menu_items AFTER INSERT ON digital_menu_items FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();
CREATE TRIGGER trg_notify_digital_menu_items AFTER DELETE ON digital_menu_items FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();
CREATE TRIGGER trg_notify_digital_menu_items AFTER UPDATE ON digital_menu_items FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();

-- Table: digital_menu_settings
CREATE TABLE IF NOT EXISTS digital_menu_settings (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, enabled boolean NOT NULL DEFAULT false, public_slug text NOT NULL, title text, description text, logo_url text, banner_url text, theme jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: digital_menu_settings
CREATE UNIQUE INDEX digital_menu_settings_public_slug_key ON public.digital_menu_settings USING btree (public_slug);
CREATE INDEX digital_menu_settings_slug_idx ON public.digital_menu_settings USING btree (public_slug);
CREATE INDEX digital_menu_settings_tenant_idx ON public.digital_menu_settings USING btree (tenant_id);
CREATE INDEX idx_digital_menu_settings_sucursal_id ON public.digital_menu_settings USING btree (sucursal_id);

-- Foreign key constraints for table: digital_menu_settings
ALTER TABLE digital_menu_settings ADD CONSTRAINT digital_menu_settings_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE digital_menu_settings ADD CONSTRAINT digital_menu_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: digital_menu_settings
ALTER TABLE digital_menu_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: digital_menu_settings
CREATE POLICY cb_digital_menu_settings_admin_delete ON digital_menu_settings FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_digital_menu_settings_admin_insert ON digital_menu_settings FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_digital_menu_settings_admin_update ON digital_menu_settings FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_digital_menu_settings_tenant_select ON digital_menu_settings FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: digital_menu_settings
CREATE TRIGGER trg_notify_digital_menu_settings AFTER INSERT ON digital_menu_settings FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();
CREATE TRIGGER trg_notify_digital_menu_settings AFTER DELETE ON digital_menu_settings FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();
CREATE TRIGGER trg_notify_digital_menu_settings AFTER UPDATE ON digital_menu_settings FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();

-- Table: digital_order_items
CREATE TABLE IF NOT EXISTS digital_order_items (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, order_id uuid NOT NULL, plato_id integer, name_snapshot text NOT NULL, price_snapshot numeric NOT NULL, quantity integer NOT NULL, notes text, subtotal numeric NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()));

-- Indexes for table: digital_order_items
CREATE INDEX digital_order_items_order_idx ON public.digital_order_items USING btree (tenant_id, order_id);
CREATE INDEX idx_digital_order_items_order_id ON public.digital_order_items USING btree (order_id);
CREATE INDEX idx_digital_order_items_plato_id ON public.digital_order_items USING btree (plato_id);

-- Foreign key constraints for table: digital_order_items
ALTER TABLE digital_order_items ADD CONSTRAINT digital_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES digital_orders (id) ON DELETE CASCADE;
ALTER TABLE digital_order_items ADD CONSTRAINT digital_order_items_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE SET NULL;
ALTER TABLE digital_order_items ADD CONSTRAINT digital_order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: digital_order_items
ALTER TABLE digital_order_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: digital_order_items
CREATE POLICY cb_digital_order_items_tenant_select ON digital_order_items FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: digital_order_items
CREATE TRIGGER set_public_digital_order_items_updated_at BEFORE UPDATE ON digital_order_items FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Table: digital_orders
CREATE TABLE IF NOT EXISTS digital_orders (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, customer_name text NOT NULL, customer_phone text, status text NOT NULL DEFAULT 'pending'::text, total numeric NOT NULL DEFAULT 0.00, notes text, rejection_reason text, accepted_at timestamptz, rejected_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), order_type text NOT NULL DEFAULT 'takeout'::text, mesa_numero integer, numero_pedido integer, client_session_id text);

-- Indexes for table: digital_orders
CREATE INDEX digital_orders_created_idx ON public.digital_orders USING btree (tenant_id, created_at DESC);
CREATE INDEX digital_orders_mesa_status_idx ON public.digital_orders USING btree (tenant_id, mesa_numero, status) WHERE (mesa_numero IS NOT NULL);
CREATE INDEX digital_orders_session_status_idx ON public.digital_orders USING btree (tenant_id, client_session_id, status) WHERE (client_session_id IS NOT NULL);
CREATE INDEX digital_orders_sucursal_status_idx ON public.digital_orders USING btree (tenant_id, sucursal_id, status, created_at DESC);
CREATE INDEX digital_orders_tenant_status_idx ON public.digital_orders USING btree (tenant_id, status);
CREATE INDEX idx_digital_orders_sucursal_id ON public.digital_orders USING btree (sucursal_id);

-- Foreign key constraints for table: digital_orders
ALTER TABLE digital_orders ADD CONSTRAINT digital_orders_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE digital_orders ADD CONSTRAINT digital_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: digital_orders
ALTER TABLE digital_orders ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: digital_orders
CREATE POLICY cb_digital_orders_admin_delete ON digital_orders FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_digital_orders_tenant_select ON digital_orders FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_digital_orders_tenant_update ON digital_orders FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: digital_orders
CREATE TRIGGER set_public_digital_orders_updated_at BEFORE UPDATE ON digital_orders FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_digital_orders_realtime AFTER INSERT ON digital_orders FOR EACH ROW EXECUTE FUNCTION realtime_notify_digital_orders();
CREATE TRIGGER trg_digital_orders_realtime AFTER DELETE ON digital_orders FOR EACH ROW EXECUTE FUNCTION realtime_notify_digital_orders();
CREATE TRIGGER trg_digital_orders_realtime AFTER UPDATE ON digital_orders FOR EACH ROW EXECUTE FUNCTION realtime_notify_digital_orders();

-- Table: ecf_batches
CREATE TABLE IF NOT EXISTS ecf_batches (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending'::text, dgii_track_id text, dgii_status_code text, dgii_status_message text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: ecf_batches
CREATE INDEX ecf_batches_tenant_status_idx ON public.ecf_batches USING btree (tenant_id, status, created_at DESC);

-- Foreign key constraints for table: ecf_batches
ALTER TABLE ecf_batches ADD CONSTRAINT ecf_batches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: ecf_batches
ALTER TABLE ecf_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: ecf_batches
CREATE POLICY cb_ecf_batches_no_app_update ON ecf_batches FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY cb_ecf_batches_project_admin_all ON ecf_batches FOR ALL TO project_admin USING (true) WITH CHECK (true);
CREATE POLICY cb_ecf_batches_tenant_insert ON ecf_batches FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_ecf_batches_tenant_select ON ecf_batches FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Table: ecf_certificate_metadata
CREATE TABLE IF NOT EXISTS ecf_certificate_metadata (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, environment text NOT NULL DEFAULT 'certification'::text, subject text, issuer text, serial_number text, valid_from timestamptz, valid_until timestamptz, is_ready boolean NOT NULL DEFAULT false, last_validation_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: ecf_certificate_metadata
CREATE INDEX ecf_certificate_metadata_tenant_idx ON public.ecf_certificate_metadata USING btree (tenant_id, environment, is_ready);

-- Foreign key constraints for table: ecf_certificate_metadata
ALTER TABLE ecf_certificate_metadata ADD CONSTRAINT ecf_certificate_metadata_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: ecf_certificate_metadata
ALTER TABLE ecf_certificate_metadata ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: ecf_certificate_metadata
CREATE POLICY cb_ecf_certificate_metadata_admin_insert ON ecf_certificate_metadata FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_ecf_certificate_metadata_admin_select ON ecf_certificate_metadata FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_ecf_certificate_metadata_admin_update ON ecf_certificate_metadata FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_ecf_certificate_metadata_project_admin_all ON ecf_certificate_metadata FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Table: ecf_document_events
CREATE TABLE IF NOT EXISTS ecf_document_events (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, ecf_document_id uuid NOT NULL, from_status text, to_status text NOT NULL, reason text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_by text NOT NULL DEFAULT 'system'::text, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: ecf_document_events
CREATE INDEX ecf_document_events_document_idx ON public.ecf_document_events USING btree (tenant_id, ecf_document_id, created_at DESC);
CREATE INDEX idx_ecf_document_events_ecf_document_id ON public.ecf_document_events USING btree (ecf_document_id);

-- Foreign key constraints for table: ecf_document_events
ALTER TABLE ecf_document_events ADD CONSTRAINT ecf_document_events_ecf_document_id_fkey FOREIGN KEY (ecf_document_id) REFERENCES ecf_documents (id) ON DELETE CASCADE;
ALTER TABLE ecf_document_events ADD CONSTRAINT ecf_document_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: ecf_document_events
ALTER TABLE ecf_document_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: ecf_document_events
CREATE POLICY cb_ecf_document_events_project_admin_all ON ecf_document_events FOR ALL TO project_admin USING (true) WITH CHECK (true);
CREATE POLICY cb_ecf_document_events_tenant_select ON ecf_document_events FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Table: ecf_documents
CREATE TABLE IF NOT EXISTS ecf_documents (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, factura_id uuid NOT NULL, certificate_metadata_id uuid, ecf_type text, status text NOT NULL DEFAULT 'pending_sync'::text, dgii_track_id text, dgii_status_code text, dgii_status_message text, xml_hash text, signed_xml_storage_key text, submitted_at timestamptz, accepted_at timestamptz, rejected_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), batch_id uuid, rejection_scope text, rfce_threshold_used numeric);

-- Indexes for table: ecf_documents
CREATE INDEX ecf_documents_factura_idx ON public.ecf_documents USING btree (factura_id);
CREATE UNIQUE INDEX ecf_documents_tenant_factura_unique ON public.ecf_documents USING btree (tenant_id, factura_id);
CREATE INDEX ecf_documents_tenant_status_idx ON public.ecf_documents USING btree (tenant_id, status, created_at DESC);
CREATE INDEX idx_ecf_documents_batch_id ON public.ecf_documents USING btree (batch_id);
CREATE INDEX idx_ecf_documents_certificate_metadata_id ON public.ecf_documents USING btree (certificate_metadata_id);

-- Foreign key constraints for table: ecf_documents
ALTER TABLE ecf_documents ADD CONSTRAINT ecf_documents_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES ecf_batches (id) ON DELETE SET NULL;
ALTER TABLE ecf_documents ADD CONSTRAINT ecf_documents_certificate_metadata_id_fkey FOREIGN KEY (certificate_metadata_id) REFERENCES ecf_certificate_metadata (id) ON DELETE SET NULL;
ALTER TABLE ecf_documents ADD CONSTRAINT ecf_documents_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE RESTRICT;
ALTER TABLE ecf_documents ADD CONSTRAINT ecf_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: ecf_documents
ALTER TABLE ecf_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: ecf_documents
CREATE POLICY cb_ecf_documents_no_app_update ON ecf_documents FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY cb_ecf_documents_project_admin_all ON ecf_documents FOR ALL TO project_admin USING (true) WITH CHECK (true);
CREATE POLICY cb_ecf_documents_tenant_insert ON ecf_documents FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_ecf_documents_tenant_select ON ecf_documents FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: ecf_documents
CREATE TRIGGER trg_sync_factura_fiscal_status AFTER INSERT ON ecf_documents FOR EACH ROW EXECUTE FUNCTION sync_factura_fiscal_status();
CREATE TRIGGER trg_sync_factura_fiscal_status AFTER UPDATE ON ecf_documents FOR EACH ROW EXECUTE FUNCTION sync_factura_fiscal_status();

-- Table: ecf_e32_readiness_evidence
CREATE TABLE IF NOT EXISTS ecf_e32_readiness_evidence (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, e32_validated boolean NOT NULL DEFAULT false, rfce_validated boolean NOT NULL DEFAULT false, resumen_validated boolean NOT NULL DEFAULT false, approved_by uuid, approved_at timestamptz, evidence_notes text, evidence_ref text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: ecf_e32_readiness_evidence
CREATE INDEX ecf_e32_readiness_evidence_tenant_idx ON public.ecf_e32_readiness_evidence USING btree (tenant_id, approved_at DESC);

-- Foreign key constraints for table: ecf_e32_readiness_evidence
ALTER TABLE ecf_e32_readiness_evidence ADD CONSTRAINT ecf_e32_readiness_evidence_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: ecf_e32_readiness_evidence
ALTER TABLE ecf_e32_readiness_evidence ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: ecf_e32_readiness_evidence
CREATE POLICY cb_ecf_e32_evidence_admin_write ON ecf_e32_readiness_evidence FOR ALL TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_ecf_e32_evidence_project_admin_all ON ecf_e32_readiness_evidence FOR ALL TO project_admin USING (true) WITH CHECK (true);
CREATE POLICY cb_ecf_e32_evidence_tenant_select ON ecf_e32_readiness_evidence FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Table: ecf_sequence_allocations
CREATE TABLE IF NOT EXISTS ecf_sequence_allocations (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, device_id text NOT NULL, tipo_ecf text NOT NULL, range_start integer NOT NULL, range_end integer NOT NULL, next_sequence integer NOT NULL, status text NOT NULL DEFAULT 'active'::text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: ecf_sequence_allocations
CREATE INDEX ecf_sequence_allocations_tenant_idx ON public.ecf_sequence_allocations USING btree (tenant_id, device_id, tipo_ecf, status);

-- Foreign key constraints for table: ecf_sequence_allocations
ALTER TABLE ecf_sequence_allocations ADD CONSTRAINT ecf_sequence_allocations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: ecf_sequence_allocations
ALTER TABLE ecf_sequence_allocations ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: ecf_sequence_allocations
CREATE POLICY cb_ecf_sequence_allocations_no_app_delete ON ecf_sequence_allocations FOR DELETE TO public USING (false);
CREATE POLICY cb_ecf_sequence_allocations_project_admin_all ON ecf_sequence_allocations FOR ALL TO project_admin USING (true) WITH CHECK (true);
CREATE POLICY cb_ecf_sequence_allocations_tenant_insert ON ecf_sequence_allocations FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_ecf_sequence_allocations_tenant_select ON ecf_sequence_allocations FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_ecf_sequence_allocations_tenant_update ON ecf_sequence_allocations FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Table: facturas
CREATE TABLE IF NOT EXISTS facturas (id uuid NOT NULL DEFAULT gen_random_uuid(), numero_factura integer NOT NULL DEFAULT nextval('facturas_numero_factura_seq'::regclass), mesa_numero integer NOT NULL, comanda_ids ARRAY NOT NULL DEFAULT '{}'::uuid[], cliente_nombre varchar(255), metodo_pago varchar(50) NOT NULL DEFAULT 'efectivo'::character varying, estado varchar(20) NOT NULL DEFAULT 'pendiente'::character varying, subtotal numeric NOT NULL DEFAULT 0, itbis numeric NOT NULL DEFAULT 0, propina numeric NOT NULL DEFAULT 0, total numeric NOT NULL DEFAULT 0, moneda varchar(10) NOT NULL DEFAULT 'DOP'::character varying, items jsonb NOT NULL DEFAULT '[]'::jsonb, notas text, creado_por varchar(255), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), pagada_at timestamptz, tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid, ncf text, ncf_tipo text, cliente_rnc text, monto_recibido numeric, cambio_devuelto numeric, sucursal_id uuid, customer_id uuid, fiscal_mode text NOT NULL DEFAULT 'ncf_legacy'::text, fiscal_status text, fiscal_document_id uuid);

-- Indexes for table: facturas
CREATE INDEX facturas_tenant_customer_idx ON public.facturas USING btree (tenant_id, customer_id, created_at DESC) WHERE (customer_id IS NOT NULL);
CREATE INDEX idx_facturas_customer_id ON public.facturas USING btree (customer_id);
CREATE INDEX idx_facturas_estado ON public.facturas USING btree (estado);
CREATE INDEX idx_facturas_fecha ON public.facturas USING btree (created_at DESC);
CREATE INDEX idx_facturas_sucursal_id ON public.facturas USING btree (sucursal_id);
CREATE INDEX idx_facturas_tenant ON public.facturas USING btree (tenant_id);

-- Foreign key constraints for table: facturas
ALTER TABLE facturas ADD CONSTRAINT facturas_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL;
ALTER TABLE facturas ADD CONSTRAINT facturas_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE facturas ADD CONSTRAINT facturas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: facturas
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: facturas
CREATE POLICY cb_facturas_delete ON facturas FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND (tu.rol = 'admin'::text) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_facturas_insert ON facturas FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_facturas_no_app_delete ON facturas FOR DELETE TO public USING (false);
CREATE POLICY cb_facturas_select ON facturas FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_facturas_tenant_insert ON facturas FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_facturas_tenant_select ON facturas FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));
CREATE POLICY cb_facturas_tenant_update ON facturas FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_facturas_update ON facturas FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = facturas.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));

-- Table: fiscal_outbox
CREATE TABLE IF NOT EXISTS fiscal_outbox (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, ecf_document_id uuid NOT NULL, factura_id uuid NOT NULL, operation text NOT NULL DEFAULT 'submit'::text, status text NOT NULL DEFAULT 'queued'::text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, locked_by text, idempotency_key text NOT NULL, error_message text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: fiscal_outbox
CREATE INDEX fiscal_outbox_document_idx ON public.fiscal_outbox USING btree (ecf_document_id);
CREATE UNIQUE INDEX fiscal_outbox_idempotency_key_unique ON public.fiscal_outbox USING btree (idempotency_key);
CREATE INDEX fiscal_outbox_tenant_status_idx ON public.fiscal_outbox USING btree (tenant_id, status, next_attempt_at);
CREATE INDEX idx_fiscal_outbox_factura_id ON public.fiscal_outbox USING btree (factura_id);

-- Foreign key constraints for table: fiscal_outbox
ALTER TABLE fiscal_outbox ADD CONSTRAINT fiscal_outbox_ecf_document_id_fkey FOREIGN KEY (ecf_document_id) REFERENCES ecf_documents (id) ON DELETE CASCADE;
ALTER TABLE fiscal_outbox ADD CONSTRAINT fiscal_outbox_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE RESTRICT;
ALTER TABLE fiscal_outbox ADD CONSTRAINT fiscal_outbox_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: fiscal_outbox
ALTER TABLE fiscal_outbox ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: fiscal_outbox
CREATE POLICY cb_fiscal_outbox_no_app_delete ON fiscal_outbox FOR DELETE TO public USING (false);
CREATE POLICY cb_fiscal_outbox_no_app_update ON fiscal_outbox FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY cb_fiscal_outbox_project_admin_all ON fiscal_outbox FOR ALL TO project_admin USING (true) WITH CHECK (true);
CREATE POLICY cb_fiscal_outbox_tenant_insert ON fiscal_outbox FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_fiscal_outbox_tenant_select ON fiscal_outbox FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Table: gasto_categorias
CREATE TABLE IF NOT EXISTS gasto_categorias (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, nombre text NOT NULL, descripcion text, color text NOT NULL DEFAULT '#ff906d'::text, activa boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), sucursal_id uuid);

-- Indexes for table: gasto_categorias
CREATE INDEX gasto_categorias_tenant_idx ON public.gasto_categorias USING btree (tenant_id, activa, nombre);
CREATE UNIQUE INDEX gasto_categorias_tenant_nombre_unique ON public.gasto_categorias USING btree (tenant_id, lower(TRIM(BOTH FROM nombre)));
CREATE INDEX idx_gasto_categorias_sucursal_id ON public.gasto_categorias USING btree (sucursal_id);

-- Foreign key constraints for table: gasto_categorias
ALTER TABLE gasto_categorias ADD CONSTRAINT gasto_categorias_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE gasto_categorias ADD CONSTRAINT gasto_categorias_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: gasto_categorias
ALTER TABLE gasto_categorias ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: gasto_categorias
CREATE POLICY cb_gasto_categorias_tenant_isolation ON gasto_categorias FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gasto_categorias.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))))) WITH CHECK ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gasto_categorias.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));

-- Table: gastos
CREATE TABLE IF NOT EXISTS gastos (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, category_id uuid, cycle_id uuid, descripcion text NOT NULL, proveedor text, monto numeric NOT NULL, metodo_pago text, fecha_gasto timestamptz NOT NULL DEFAULT now(), notas text, created_by_auth_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), sucursal_id uuid);

-- Indexes for table: gastos
CREATE INDEX gastos_tenant_category_idx ON public.gastos USING btree (tenant_id, category_id);
CREATE INDEX gastos_tenant_cycle_idx ON public.gastos USING btree (tenant_id, cycle_id);
CREATE INDEX gastos_tenant_fecha_idx ON public.gastos USING btree (tenant_id, fecha_gasto DESC);
CREATE INDEX idx_gastos_category_id ON public.gastos USING btree (category_id);
CREATE INDEX idx_gastos_cycle_id ON public.gastos USING btree (cycle_id);
CREATE INDEX idx_gastos_sucursal_id ON public.gastos USING btree (sucursal_id);

-- Foreign key constraints for table: gastos
ALTER TABLE gastos ADD CONSTRAINT gastos_category_id_fkey FOREIGN KEY (category_id) REFERENCES gasto_categorias (id) ON DELETE SET NULL;
ALTER TABLE gastos ADD CONSTRAINT gastos_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cierres_operativos (id) ON DELETE SET NULL;
ALTER TABLE gastos ADD CONSTRAINT gastos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE gastos ADD CONSTRAINT gastos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: gastos
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: gastos
CREATE POLICY cb_gastos_delete ON gastos FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND (tu.rol = 'admin'::text) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_gastos_insert ON gastos FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_gastos_select ON gastos FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_gastos_update ON gastos FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = gastos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));

-- Table: inventario_movimientos
CREATE TABLE IF NOT EXISTS inventario_movimientos (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, producto_id uuid NOT NULL, tipo varchar(20) NOT NULL, cantidad numeric NOT NULL, stock_antes numeric NOT NULL, stock_despues numeric NOT NULL, costo_unitario numeric NOT NULL DEFAULT 0, motivo text, referencia text, fecha timestamptz NOT NULL DEFAULT now(), usuario_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: inventario_movimientos
CREATE INDEX idx_inventario_movimientos_producto_id ON public.inventario_movimientos USING btree (producto_id);
CREATE INDEX idx_inventario_movimientos_sucursal_id ON public.inventario_movimientos USING btree (sucursal_id);
CREATE INDEX idx_inventario_movimientos_tenant_id ON public.inventario_movimientos USING btree (tenant_id);
CREATE INDEX idx_inventario_movimientos_usuario_id ON public.inventario_movimientos USING btree (usuario_id);

-- Foreign key constraints for table: inventario_movimientos
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos_inventario (id) ON DELETE CASCADE;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES tenant_users (id) ON DELETE SET NULL;

-- RLS enabled for table: inventario_movimientos
ALTER TABLE inventario_movimientos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: inventario_movimientos
CREATE POLICY cb_inventario_movimientos_no_app_delete ON inventario_movimientos FOR DELETE TO public USING (false);
CREATE POLICY cb_inventario_movimientos_no_app_update ON inventario_movimientos FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY cb_inventario_movimientos_operational_insert ON inventario_movimientos FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));
CREATE POLICY cb_inventario_movimientos_tenant_select ON inventario_movimientos FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'cocina'::text, 'cocinero'::text]));

-- Table: measurement_units
CREATE TABLE IF NOT EXISTS measurement_units (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, code text NOT NULL, label text NOT NULL, symbol text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: measurement_units
CREATE UNIQUE INDEX measurement_units_tenant_id_code_key ON public.measurement_units USING btree (tenant_id, code);
CREATE INDEX measurement_units_tenant_idx ON public.measurement_units USING btree (tenant_id);

-- Foreign key constraints for table: measurement_units
ALTER TABLE measurement_units ADD CONSTRAINT measurement_units_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: measurement_units
ALTER TABLE measurement_units ENABLE ROW LEVEL SECURITY;

-- Table: menu_categories
CREATE TABLE IF NOT EXISTS menu_categories (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, nombre text NOT NULL, color text NOT NULL DEFAULT '#a1a1aa'::text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), sucursal_id uuid);

-- Indexes for table: menu_categories
CREATE INDEX idx_menu_categories_sucursal_id ON public.menu_categories USING btree (sucursal_id);
CREATE UNIQUE INDEX menu_categories_tenant_nombre_idx ON public.menu_categories USING btree (tenant_id, lower(nombre));
CREATE INDEX menu_categories_tenant_sort_idx ON public.menu_categories USING btree (tenant_id, sort_order, nombre);

-- Foreign key constraints for table: menu_categories
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: menu_categories
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: menu_categories
CREATE POLICY cb_menu_categories_admin_all ON menu_categories FOR ALL TO public USING ((cyberbistro_is_super_admin() OR (tenant_id = ANY (cyberbistro_current_admin_tenant_ids())))) WITH CHECK ((cyberbistro_is_super_admin() OR (tenant_id = ANY (cyberbistro_current_admin_tenant_ids()))));
CREATE POLICY cb_menu_categories_tenant_select ON menu_categories FOR SELECT TO public USING ((cyberbistro_is_super_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = menu_categories.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))));

-- Table: mesas_estado
CREATE TABLE IF NOT EXISTS mesas_estado (id integer NOT NULL, estado varchar(20) DEFAULT 'libre'::character varying, fusionada boolean DEFAULT false, fusion_padre_id integer, fusion_hijos ARRAY DEFAULT '{}'::integer[], span_filas integer DEFAULT 1, span_columnas integer DEFAULT 1, tenant_id uuid NOT NULL, updated_at timestamptz DEFAULT now(), sucursal_id uuid, codigo_seguridad text);

-- Indexes for table: mesas_estado
CREATE INDEX idx_mesas_estado_sucursal_id ON public.mesas_estado USING btree (sucursal_id);
CREATE INDEX idx_mesas_estado_tenant ON public.mesas_estado USING btree (tenant_id);
CREATE INDEX mesas_estado_tenant_sucursal_id_idx ON public.mesas_estado USING btree (tenant_id, sucursal_id, id);

-- Foreign key constraints for table: mesas_estado
ALTER TABLE mesas_estado ADD CONSTRAINT mesas_estado_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE mesas_estado ADD CONSTRAINT mesas_estado_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: mesas_estado
ALTER TABLE mesas_estado ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: mesas_estado
CREATE POLICY cb_mesas_estado_delete ON mesas_estado FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND (tu.rol = 'admin'::text) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_mesas_estado_insert ON mesas_estado FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_mesas_estado_select ON mesas_estado FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_mesas_estado_update ON mesas_estado FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = mesas_estado.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));

-- Table: payments
CREATE TABLE IF NOT EXISTS payments (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, customer_id uuid, amount numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'DOP'::text, status text NOT NULL DEFAULT 'completed'::text, payment_date date NOT NULL DEFAULT CURRENT_DATE, method text, notes text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: payments
CREATE INDEX idx_payments_tenant_id ON public.payments USING btree (tenant_id);

-- Foreign key constraints for table: payments
ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Table: permission_catalog
CREATE TABLE IF NOT EXISTS permission_catalog (id uuid NOT NULL DEFAULT gen_random_uuid(), permission_key text NOT NULL, label text NOT NULL, description text, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: permission_catalog
CREATE UNIQUE INDEX permission_catalog_permission_key_key ON public.permission_catalog USING btree (permission_key);

-- RLS enabled for table: permission_catalog
ALTER TABLE permission_catalog ENABLE ROW LEVEL SECURITY;

-- Table: platos
CREATE TABLE IF NOT EXISTS platos (id integer NOT NULL, nombre text NOT NULL, precio numeric NOT NULL DEFAULT 0, categoria text NOT NULL DEFAULT 'General'::text, disponible boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), va_a_cocina boolean NOT NULL DEFAULT true, tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid, sucursal_id uuid);

-- Indexes for table: platos
CREATE INDEX idx_platos_sucursal_id ON public.platos USING btree (sucursal_id);
CREATE INDEX idx_platos_tenant ON public.platos USING btree (tenant_id);

-- Foreign key constraints for table: platos
ALTER TABLE platos ADD CONSTRAINT platos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE platos ADD CONSTRAINT platos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- RLS enabled for table: platos
ALTER TABLE platos ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: platos
CREATE POLICY cb_platos_delete ON platos FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND (tu.rol = 'admin'::text) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_platos_insert ON platos FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_platos_select ON platos FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));
CREATE POLICY cb_platos_update ON platos FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = platos.tenant_id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cloudix_auth_email()))))))));

-- Triggers for table: platos
CREATE TRIGGER trg_notify_platos_digital_menu AFTER INSERT ON platos FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();
CREATE TRIGGER trg_notify_platos_digital_menu AFTER DELETE ON platos FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();
CREATE TRIGGER trg_notify_platos_digital_menu AFTER UPDATE ON platos FOR EACH ROW EXECUTE FUNCTION notify_digital_menu_update();

-- Table: produccion_cocina
CREATE TABLE IF NOT EXISTS produccion_cocina (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, fecha timestamptz NOT NULL DEFAULT now(), area text NOT NULL, producto_id uuid NOT NULL, cantidad_usada numeric NOT NULL, responsable text, observacion text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: produccion_cocina
CREATE INDEX idx_produccion_cocina_producto_id ON public.produccion_cocina USING btree (producto_id);
CREATE INDEX idx_produccion_cocina_sucursal_id ON public.produccion_cocina USING btree (sucursal_id);
CREATE INDEX idx_produccion_cocina_tenant_id ON public.produccion_cocina USING btree (tenant_id);

-- Foreign key constraints for table: produccion_cocina
ALTER TABLE produccion_cocina ADD CONSTRAINT produccion_cocina_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos_inventario (id) ON DELETE CASCADE;
ALTER TABLE produccion_cocina ADD CONSTRAINT produccion_cocina_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE produccion_cocina ADD CONSTRAINT produccion_cocina_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: produccion_cocina
ALTER TABLE produccion_cocina ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: produccion_cocina
CREATE POLICY cb_produccion_cocina_admin_delete ON produccion_cocina FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_produccion_cocina_admin_update ON produccion_cocina FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_produccion_cocina_operational_insert ON produccion_cocina FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cocina'::text, 'cocinero'::text]));
CREATE POLICY cb_produccion_cocina_tenant_select ON produccion_cocina FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cocina'::text, 'cocinero'::text]));

-- Table: productos_inventario
CREATE TABLE IF NOT EXISTS productos_inventario (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sucursal_id uuid, nombre text NOT NULL, categoria text NOT NULL, unidad_base varchar(20) NOT NULL, stock_actual numeric NOT NULL DEFAULT 0, stock_minimo numeric NOT NULL DEFAULT 0, costo_promedio numeric NOT NULL DEFAULT 0, activo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), contenido_por_unidad_compra numeric, costo_unidad_compra numeric DEFAULT 0.00, unidad_compra text, mostrar_en_fracciones boolean DEFAULT false);

-- Indexes for table: productos_inventario
CREATE INDEX idx_productos_inventario_sucursal_id ON public.productos_inventario USING btree (sucursal_id);
CREATE INDEX idx_productos_inventario_tenant_id ON public.productos_inventario USING btree (tenant_id);

-- Foreign key constraints for table: productos_inventario
ALTER TABLE productos_inventario ADD CONSTRAINT productos_inventario_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE productos_inventario ADD CONSTRAINT productos_inventario_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: productos_inventario
ALTER TABLE productos_inventario ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: productos_inventario
CREATE POLICY cb_productos_inventario_admin_delete ON productos_inventario FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_productos_inventario_admin_insert ON productos_inventario FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_productos_inventario_stock_update ON productos_inventario FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));
CREATE POLICY cb_productos_inventario_tenant_select ON productos_inventario FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));

-- Triggers for table: productos_inventario
CREATE TRIGGER trg_guard_productos_inventario_update BEFORE UPDATE ON productos_inventario FOR EACH ROW EXECUTE FUNCTION cyberbistro_guard_productos_inventario_update();

-- Table: proveedores
CREATE TABLE IF NOT EXISTS proveedores (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, nombre text NOT NULL, rnc varchar(20), telefono varchar(20), email text, direccion text, activo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: proveedores
CREATE INDEX idx_proveedores_tenant_id ON public.proveedores USING btree (tenant_id);

-- Foreign key constraints for table: proveedores
ALTER TABLE proveedores ADD CONSTRAINT proveedores_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: proveedores
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: proveedores
CREATE POLICY cb_proveedores_admin_delete ON proveedores FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_proveedores_tenant_select ON proveedores FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));
CREATE POLICY cb_proveedores_tenant_update ON proveedores FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));
CREATE POLICY cb_proveedores_tenant_write ON proveedores FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Triggers for table: proveedores
CREATE TRIGGER set_public_proveedores_updated_at BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Table: recetas
CREATE TABLE IF NOT EXISTS recetas (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, plato_id integer NOT NULL, insumo_id uuid NOT NULL, cantidad numeric NOT NULL, unidad varchar(20) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Indexes for table: recetas
CREATE INDEX idx_recetas_insumo_id ON public.recetas USING btree (insumo_id);
CREATE INDEX idx_recetas_tenant_id ON public.recetas USING btree (tenant_id);
CREATE UNIQUE INDEX recetas_plato_id_insumo_id_key ON public.recetas USING btree (plato_id, insumo_id);

-- Foreign key constraints for table: recetas
ALTER TABLE recetas ADD CONSTRAINT recetas_insumo_id_fkey FOREIGN KEY (insumo_id) REFERENCES productos_inventario (id) ON DELETE CASCADE;
ALTER TABLE recetas ADD CONSTRAINT recetas_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE CASCADE;
ALTER TABLE recetas ADD CONSTRAINT recetas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: recetas
ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: recetas
CREATE POLICY cb_recetas_admin_delete ON recetas FOR DELETE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_recetas_admin_insert ON recetas FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_recetas_admin_update ON recetas FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_recetas_tenant_select ON recetas FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]));

-- Table: sucursales
CREATE TABLE IF NOT EXISTS sucursales (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, nombre text NOT NULL, direccion text, telefono text, activa boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), cantidad_mesas integer DEFAULT 0);

-- Indexes for table: sucursales
CREATE INDEX idx_sucursales_tenant_id ON public.sucursales USING btree (tenant_id);

-- Foreign key constraints for table: sucursales
ALTER TABLE sucursales ADD CONSTRAINT sucursales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: sucursales
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: sucursales
CREATE POLICY cb_sucursales_admin_insert ON sucursales FOR INSERT TO public WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_sucursales_admin_update ON sucursales FOR UPDATE TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text])) WITH CHECK (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]));
CREATE POLICY cb_sucursales_no_app_delete ON sucursales FOR DELETE TO public USING (false);
CREATE POLICY cb_sucursales_tenant_select ON sucursales FOR SELECT TO public USING ((cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text]) OR ((activa IS TRUE) AND cyberbistro_has_tenant_role(tenant_id, ARRAY['cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text, 'mesero'::text, 'mesera'::text, 'cocina'::text, 'cocinero'::text]))));

-- Triggers for table: sucursales
CREATE TRIGGER enforce_sucursal_plan_limits_trg BEFORE INSERT ON sucursales FOR EACH ROW EXECUTE FUNCTION check_sucursal_plan_limits();
CREATE TRIGGER enforce_sucursal_plan_limits_trg BEFORE UPDATE ON sucursales FOR EACH ROW EXECUTE FUNCTION check_sucursal_plan_limits();

-- Table: tenant_order_counters
CREATE TABLE IF NOT EXISTS tenant_order_counters (tenant_id uuid NOT NULL, next_numero integer NOT NULL DEFAULT 1);

-- Foreign key constraints for table: tenant_order_counters
ALTER TABLE tenant_order_counters ADD CONSTRAINT tenant_order_counters_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- RLS enabled for table: tenant_order_counters
ALTER TABLE tenant_order_counters ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: tenant_order_counters
CREATE POLICY cb_order_counters_tenant_select ON tenant_order_counters FOR SELECT TO public USING (cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'::text, 'cajera'::text, 'cajero'::text, 'ventas'::text, 'vender'::text, 'vendedor'::text]));

-- Table: tenant_users
CREATE TABLE IF NOT EXISTS tenant_users (id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, email text NOT NULL, password_hash text NOT NULL, rol text NOT NULL, nombre text, activo boolean DEFAULT true, created_at timestamptz DEFAULT now(), last_login timestamptz, auth_user_id uuid);

-- Indexes for table: tenant_users
CREATE INDEX idx_tenant_users_auth_user_id ON public.tenant_users USING btree (auth_user_id);
CREATE INDEX idx_tenant_users_email ON public.tenant_users USING btree (email);
CREATE INDEX idx_tenant_users_rol ON public.tenant_users USING btree (rol);
CREATE INDEX idx_tenant_users_tenant ON public.tenant_users USING btree (tenant_id);
CREATE UNIQUE INDEX tenant_users_tenant_id_email_key ON public.tenant_users USING btree (tenant_id, email);

-- Foreign key constraints for table: tenant_users
ALTER TABLE tenant_users ADD CONSTRAINT fk_tenant_users_auth_user FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
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

-- Triggers for table: tenant_users
CREATE TRIGGER enforce_tenant_user_limits_trg BEFORE INSERT ON tenant_users FOR EACH ROW EXECUTE FUNCTION check_tenant_user_limits();
CREATE TRIGGER enforce_tenant_user_limits_trg BEFORE UPDATE ON tenant_users FOR EACH ROW EXECUTE FUNCTION check_tenant_user_limits();

-- Table: tenants
CREATE TABLE IF NOT EXISTS tenants (id uuid NOT NULL DEFAULT gen_random_uuid(), nombre_negocio text NOT NULL, rnc text, direccion text, telefono text, email text, moneda text DEFAULT 'DOP'::text, idioma text DEFAULT 'es'::text, activa boolean DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), logo_url text, ncf_fiscal_activo boolean DEFAULT false, ncf_tipo_default text, ncf_secuencia_siguiente integer, ncf_secuencias_por_tipo jsonb DEFAULT '{}'::jsonb, itbis_cobro_por_defecto boolean NOT NULL DEFAULT false, ncf_b01_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b02_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b14_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b15_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b16_secuencia_siguiente integer NOT NULL DEFAULT 1, ncf_b17_secuencia_siguiente integer NOT NULL DEFAULT 1, cantidad_mesas integer DEFAULT 20, user_limit_enabled boolean NOT NULL DEFAULT false, admin_user_limit integer, cajera_user_limit integer, cocina_user_limit integer, mesero_user_limit integer, logo_size_px integer NOT NULL DEFAULT 52, logo_offset_x integer NOT NULL DEFAULT 0, logo_offset_y integer NOT NULL DEFAULT 0, plan varchar(20) NOT NULL DEFAULT 'basico'::character varying, sucursal_limit_enabled boolean NOT NULL DEFAULT true, sucursal_limit integer, fiscal_mode text NOT NULL DEFAULT 'internal_receipt'::text, fiscal_mode_fallback text DEFAULT 'internal_receipt'::text, ecf_environment text NOT NULL DEFAULT 'certification'::text, menu_url text, ecf_issuer_sucursal text, ecf_issuer_municipio text, ecf_issuer_provincia text, ecf_issuer_actividad_economica text, ecf_issuer_correo_emisor text, propina_cobro_por_defecto boolean DEFAULT false, payment_day_of_month smallint);

-- RLS enabled for table: tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- RLS policies for table: tenants
CREATE POLICY cb_tenants_isolation ON tenants FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND (tu.activo IS TRUE) AND ((tu.auth_user_id = cyberbistro_auth_user_id()) OR ((tu.auth_user_id IS NULL) AND (lower(tu.email) = lower(cyberbistro_auth_email()))))))));
CREATE POLICY cb_tenants_member_select ON tenants FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND ((tu.auth_user_id = cloudix_auth_user_id()) OR (lower(tu.email) = lower(COALESCE(cloudix_auth_email(), ''::text))))))));
CREATE POLICY cb_tenants_super_admin_all ON tenants FOR ALL TO public USING (cloudix_is_super_admin()) WITH CHECK (cloudix_is_super_admin());

-- Triggers for table: tenants
CREATE TRIGGER normalize_tenant_plan_limits_trg BEFORE INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION normalize_tenant_plan_limits();
CREATE TRIGGER normalize_tenant_plan_limits_trg BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION normalize_tenant_plan_limits();
CREATE TRIGGER tenants_access_realtime AFTER UPDATE ON tenants FOR EACH ROW WHEN ((old.activa IS DISTINCT FROM new.activa)) EXECUTE FUNCTION cloudix_publish_tenant_access_change();

