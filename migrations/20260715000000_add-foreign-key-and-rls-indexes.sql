CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_sucursal_id ON public.cuentas_cobrar (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_factura_id ON public.cuentas_cobrar (factura_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_customer_id ON public.cuentas_cobrar (customer_id);

CREATE INDEX IF NOT EXISTS idx_cxp_pagos_sucursal_id ON public.cxp_pagos (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_cxp_pagos_cycle_id ON public.cxp_pagos (cycle_id);
CREATE INDEX IF NOT EXISTS idx_cxp_pagos_auth_user_id ON public.cxp_pagos (created_by_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_cxp_pagos_cuenta_pagar_id ON public.cxp_pagos (cuenta_pagar_id);

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_auth_user_id ON public.cxc_pagos (created_by_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_cxc_pagos_cycle_id ON public.cxc_pagos (cycle_id);
CREATE INDEX IF NOT EXISTS idx_cxc_pagos_sucursal_id ON public.cxc_pagos (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_cxc_pagos_cuenta_cobrar_id ON public.cxc_pagos (cuenta_cobrar_id);

CREATE INDEX IF NOT EXISTS idx_compra_detalles_tenant_id ON public.compra_detalles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalles_compra_id ON public.compra_detalles (compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalles_producto_id ON public.compra_detalles (producto_id);

CREATE INDEX IF NOT EXISTS idx_digital_order_items_plato_id ON public.digital_order_items (plato_id);
CREATE INDEX IF NOT EXISTS idx_digital_order_items_order_id ON public.digital_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_recetas_tenant_id ON public.recetas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_recetas_insumo_id ON public.recetas (insumo_id);

CREATE INDEX IF NOT EXISTS idx_compras_usuario_id ON public.compras (usuario_id);
CREATE INDEX IF NOT EXISTS idx_compras_tenant_id ON public.compras (tenant_id);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor_id ON public.compras (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_sucursal_id ON public.compras (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_digital_menu_items_plato_id ON public.digital_menu_items (plato_id);

CREATE INDEX IF NOT EXISTS idx_gastos_category_id ON public.gastos (category_id);
CREATE INDEX IF NOT EXISTS idx_gastos_sucursal_id ON public.gastos (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_gastos_cycle_id ON public.gastos (cycle_id);

CREATE INDEX IF NOT EXISTS idx_sucursales_tenant_id ON public.sucursales (tenant_id);

CREATE INDEX IF NOT EXISTS idx_ecf_document_events_ecf_document_id ON public.ecf_document_events (ecf_document_id);

CREATE INDEX IF NOT EXISTS idx_digital_menu_settings_sucursal_id ON public.digital_menu_settings (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_produccion_cocina_producto_id ON public.produccion_cocina (producto_id);
CREATE INDEX IF NOT EXISTS idx_produccion_cocina_sucursal_id ON public.produccion_cocina (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_produccion_cocina_tenant_id ON public.produccion_cocina (tenant_id);

CREATE INDEX IF NOT EXISTS idx_productos_inventario_sucursal_id ON public.productos_inventario (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_productos_inventario_tenant_id ON public.productos_inventario (tenant_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_outbox_factura_id ON public.fiscal_outbox (factura_id);

CREATE INDEX IF NOT EXISTS idx_facturas_customer_id ON public.facturas (customer_id);
CREATE INDEX IF NOT EXISTS idx_facturas_sucursal_id ON public.facturas (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_sucursal_id ON public.inventario_movimientos (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_tenant_id ON public.inventario_movimientos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_producto_id ON public.inventario_movimientos (producto_id);
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_usuario_id ON public.inventario_movimientos (usuario_id);

CREATE INDEX IF NOT EXISTS idx_ecf_documents_batch_id ON public.ecf_documents (batch_id);
CREATE INDEX IF NOT EXISTS idx_ecf_documents_certificate_metadata_id ON public.ecf_documents (certificate_metadata_id);

CREATE INDEX IF NOT EXISTS idx_consumos_plato_id ON public.consumos (plato_id);
CREATE INDEX IF NOT EXISTS idx_consumos_sucursal_id ON public.consumos (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_platos_sucursal_id ON public.platos (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_mesas_estado_sucursal_id ON public.mesas_estado (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_gasto_categorias_sucursal_id ON public.gasto_categorias (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_cocina_estado_sucursal_id ON public.cocina_estado (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_proveedores_tenant_id ON public.proveedores (tenant_id);

CREATE INDEX IF NOT EXISTS idx_menu_categories_sucursal_id ON public.menu_categories (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_cierres_operativos_sucursal_id ON public.cierres_operativos (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_comandas_sucursal_id ON public.comandas (sucursal_id);

CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_sucursal_id ON public.cuentas_pagar (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_proveedor_id ON public.cuentas_pagar (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_compra_id ON public.cuentas_pagar (compra_id);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON public.payments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_digital_orders_sucursal_id ON public.digital_orders (sucursal_id);
