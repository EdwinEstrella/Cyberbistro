-- Foreign key constraints for table: cierres_operativos
ALTER TABLE cierres_operativos ADD CONSTRAINT cierres_operativos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cierres_operativos ADD CONSTRAINT cierres_operativos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: cocina_estado
ALTER TABLE cocina_estado ADD CONSTRAINT cocina_estado_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cocina_estado ADD CONSTRAINT cocina_estado_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- Foreign key constraints for table: comandas
ALTER TABLE comandas ADD CONSTRAINT comandas_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE comandas ADD CONSTRAINT comandas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- Foreign key constraints for table: compra_detalles
ALTER TABLE compra_detalles ADD CONSTRAINT compra_detalles_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES compras (id) ON DELETE CASCADE;
ALTER TABLE compra_detalles ADD CONSTRAINT compra_detalles_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos_inventario (id) ON DELETE CASCADE;
ALTER TABLE compra_detalles ADD CONSTRAINT compra_detalles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: compras
ALTER TABLE compras ADD CONSTRAINT compras_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores (id) ON DELETE SET NULL;
ALTER TABLE compras ADD CONSTRAINT compras_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE compras ADD CONSTRAINT compras_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE compras ADD CONSTRAINT compras_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES tenant_users (id) ON DELETE SET NULL;

-- Foreign key constraints for table: consumos
ALTER TABLE consumos ADD CONSTRAINT consumos_comanda_id_fkey FOREIGN KEY (comanda_id) REFERENCES comandas (id) ON DELETE SET NULL;
ALTER TABLE consumos ADD CONSTRAINT consumos_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE SET NULL;
ALTER TABLE consumos ADD CONSTRAINT consumos_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE RESTRICT;
ALTER TABLE consumos ADD CONSTRAINT consumos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE consumos ADD CONSTRAINT consumos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- Foreign key constraints for table: cuentas_cobrar
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE;
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE SET NULL;
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: cuentas_pagar
ALTER TABLE cuentas_pagar ADD CONSTRAINT cuentas_pagar_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES compras (id) ON DELETE SET NULL;
ALTER TABLE cuentas_pagar ADD CONSTRAINT cuentas_pagar_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES proveedores (id) ON DELETE CASCADE;
ALTER TABLE cuentas_pagar ADD CONSTRAINT cuentas_pagar_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cuentas_pagar ADD CONSTRAINT cuentas_pagar_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: customers
ALTER TABLE customers ADD CONSTRAINT customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: cxc_pagos
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_created_by_auth_user_id_fkey FOREIGN KEY (created_by_auth_user_id) REFERENCES tenant_users (id) ON DELETE SET NULL;
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_cuenta_cobrar_id_fkey FOREIGN KEY (cuenta_cobrar_id) REFERENCES cuentas_cobrar (id) ON DELETE CASCADE;
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cierres_operativos (id) ON DELETE SET NULL;
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cxc_pagos ADD CONSTRAINT cxc_pagos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: cxp_pagos
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_created_by_auth_user_id_fkey FOREIGN KEY (created_by_auth_user_id) REFERENCES tenant_users (id) ON DELETE SET NULL;
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_cuenta_pagar_id_fkey FOREIGN KEY (cuenta_pagar_id) REFERENCES cuentas_pagar (id) ON DELETE CASCADE;
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cierres_operativos (id) ON DELETE SET NULL;
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE cxp_pagos ADD CONSTRAINT cxp_pagos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: digital_menu_items
ALTER TABLE digital_menu_items ADD CONSTRAINT digital_menu_items_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE CASCADE;
ALTER TABLE digital_menu_items ADD CONSTRAINT digital_menu_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: digital_menu_settings
ALTER TABLE digital_menu_settings ADD CONSTRAINT digital_menu_settings_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE digital_menu_settings ADD CONSTRAINT digital_menu_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: digital_order_items
ALTER TABLE digital_order_items ADD CONSTRAINT digital_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES digital_orders (id) ON DELETE CASCADE;
ALTER TABLE digital_order_items ADD CONSTRAINT digital_order_items_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE SET NULL;
ALTER TABLE digital_order_items ADD CONSTRAINT digital_order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: digital_orders
ALTER TABLE digital_orders ADD CONSTRAINT digital_orders_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE digital_orders ADD CONSTRAINT digital_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: ecf_batches
ALTER TABLE ecf_batches ADD CONSTRAINT ecf_batches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: ecf_certificate_metadata
ALTER TABLE ecf_certificate_metadata ADD CONSTRAINT ecf_certificate_metadata_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: ecf_document_events
ALTER TABLE ecf_document_events ADD CONSTRAINT ecf_document_events_ecf_document_id_fkey FOREIGN KEY (ecf_document_id) REFERENCES ecf_documents (id) ON DELETE CASCADE;
ALTER TABLE ecf_document_events ADD CONSTRAINT ecf_document_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: ecf_documents
ALTER TABLE ecf_documents ADD CONSTRAINT ecf_documents_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES ecf_batches (id) ON DELETE SET NULL;
ALTER TABLE ecf_documents ADD CONSTRAINT ecf_documents_certificate_metadata_id_fkey FOREIGN KEY (certificate_metadata_id) REFERENCES ecf_certificate_metadata (id) ON DELETE SET NULL;
ALTER TABLE ecf_documents ADD CONSTRAINT ecf_documents_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE RESTRICT;
ALTER TABLE ecf_documents ADD CONSTRAINT ecf_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: ecf_e32_readiness_evidence
ALTER TABLE ecf_e32_readiness_evidence ADD CONSTRAINT ecf_e32_readiness_evidence_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: ecf_sequence_allocations
ALTER TABLE ecf_sequence_allocations ADD CONSTRAINT ecf_sequence_allocations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: facturas
ALTER TABLE facturas ADD CONSTRAINT facturas_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL;
ALTER TABLE facturas ADD CONSTRAINT facturas_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE facturas ADD CONSTRAINT facturas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- Foreign key constraints for table: fiscal_outbox
ALTER TABLE fiscal_outbox ADD CONSTRAINT fiscal_outbox_ecf_document_id_fkey FOREIGN KEY (ecf_document_id) REFERENCES ecf_documents (id) ON DELETE CASCADE;
ALTER TABLE fiscal_outbox ADD CONSTRAINT fiscal_outbox_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE RESTRICT;
ALTER TABLE fiscal_outbox ADD CONSTRAINT fiscal_outbox_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: gasto_categorias
ALTER TABLE gasto_categorias ADD CONSTRAINT gasto_categorias_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE gasto_categorias ADD CONSTRAINT gasto_categorias_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: gastos
ALTER TABLE gastos ADD CONSTRAINT gastos_category_id_fkey FOREIGN KEY (category_id) REFERENCES gasto_categorias (id) ON DELETE SET NULL;
ALTER TABLE gastos ADD CONSTRAINT gastos_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES cierres_operativos (id) ON DELETE SET NULL;
ALTER TABLE gastos ADD CONSTRAINT gastos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE gastos ADD CONSTRAINT gastos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: inventario_movimientos
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos_inventario (id) ON DELETE CASCADE;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES tenant_users (id) ON DELETE SET NULL;

-- Foreign key constraints for table: measurement_units
ALTER TABLE measurement_units ADD CONSTRAINT measurement_units_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: menu_categories
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: mesas_estado
ALTER TABLE mesas_estado ADD CONSTRAINT mesas_estado_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE mesas_estado ADD CONSTRAINT mesas_estado_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: payments
ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: platos
ALTER TABLE platos ADD CONSTRAINT platos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE platos ADD CONSTRAINT platos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;

-- Foreign key constraints for table: produccion_cocina
ALTER TABLE produccion_cocina ADD CONSTRAINT produccion_cocina_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES productos_inventario (id) ON DELETE CASCADE;
ALTER TABLE produccion_cocina ADD CONSTRAINT produccion_cocina_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE produccion_cocina ADD CONSTRAINT produccion_cocina_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: productos_inventario
ALTER TABLE productos_inventario ADD CONSTRAINT productos_inventario_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES sucursales (id) ON DELETE SET NULL;
ALTER TABLE productos_inventario ADD CONSTRAINT productos_inventario_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: proveedores
ALTER TABLE proveedores ADD CONSTRAINT proveedores_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: recetas
ALTER TABLE recetas ADD CONSTRAINT recetas_insumo_id_fkey FOREIGN KEY (insumo_id) REFERENCES productos_inventario (id) ON DELETE CASCADE;
ALTER TABLE recetas ADD CONSTRAINT recetas_plato_id_fkey FOREIGN KEY (plato_id) REFERENCES platos (id) ON DELETE CASCADE;
ALTER TABLE recetas ADD CONSTRAINT recetas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: sucursales
ALTER TABLE sucursales ADD CONSTRAINT sucursales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: tenant_order_counters
ALTER TABLE tenant_order_counters ADD CONSTRAINT tenant_order_counters_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- Foreign key constraints for table: tenant_users
ALTER TABLE tenant_users ADD CONSTRAINT fk_tenant_users_auth_user FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;