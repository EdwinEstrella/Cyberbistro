DO $$ 
DECLARE
  t_id UUID := '2a547d0e-4a0b-49e5-a7be-34071934c61d';
  s_id UUID := '2933e7b6-21df-4bbc-8fc7-fa6e39da4df5';
  c_id UUID := 'fd50a3df-d38a-4ecd-b9c7-c46d33f67f7c';
  p_burger_id INT := -1000000004;
  prov_1 UUID;
  prov_2 UUID;
  ins_carne UUID;
  ins_pan UUID;
  ins_queso UUID;
  ins_papas UUID;
  cxc_1 UUID;
  cxc_2 UUID;
  cxp_1 UUID;
  cxp_2 UUID;
BEGIN
  -- 1. Proveedores
  INSERT INTO public.proveedores (tenant_id, nombre, rnc, telefono, email, direccion, activo)
  VALUES 
    (t_id, 'Distribuidora Carnes del Sur', '131456789', '809-555-0001', 'ventas@carnesdelsur.com', 'Av. Independencia 45', true)
  RETURNING id INTO prov_1;

  INSERT INTO public.proveedores (tenant_id, nombre, rnc, telefono, email, direccion, activo)
  VALUES 
    (t_id, 'Panificadora El Buen Horno', '131456790', '809-555-0002', 'pedidos@elbuenhorno.com', 'Calle El Sol 12', true)
  RETURNING id INTO prov_2;

  -- 2. Insumos
  INSERT INTO public.productos_inventario (tenant_id, sucursal_id, nombre, categoria, unidad_base, stock_actual, stock_minimo, costo_promedio, costo_compra, activo)
  VALUES 
    (t_id, s_id, 'Carne de Res Premium', 'Carnes', 'libras', 50, 10, 150.00, 150.00, true)
  RETURNING id INTO ins_carne;

  INSERT INTO public.productos_inventario (tenant_id, sucursal_id, nombre, categoria, unidad_base, stock_actual, stock_minimo, costo_promedio, costo_compra, activo)
  VALUES 
    (t_id, s_id, 'Pan Brioche Hamburguesa', 'Panadería', 'unidades', 120, 30, 15.00, 15.00, true)
  RETURNING id INTO ins_pan;

  INSERT INTO public.productos_inventario (tenant_id, sucursal_id, nombre, categoria, unidad_base, stock_actual, stock_minimo, costo_promedio, costo_compra, activo)
  VALUES 
    (t_id, s_id, 'Queso Cheddar Lonjas', 'Lácteos', 'libras', 15, 5, 200.00, 200.00, true)
  RETURNING id INTO ins_queso;

  INSERT INTO public.productos_inventario (tenant_id, sucursal_id, nombre, categoria, unidad_base, stock_actual, stock_minimo, costo_promedio, costo_compra, activo)
  VALUES 
    (t_id, s_id, 'Papas Fritas Congeladas', 'Congelados', 'libras', 80, 20, 60.00, 60.00, true)
  RETURNING id INTO ins_papas;

  -- 3. Recetas
  -- Limpiar recetas anteriores de este plato si existen
  DELETE FROM public.recetas WHERE tenant_id = t_id AND plato_id = p_burger_id;
  
  INSERT INTO public.recetas (tenant_id, plato_id, insumo_id, cantidad, unidad)
  VALUES 
    (t_id, p_burger_id, ins_carne, 0.5, 'libras'),
    (t_id, p_burger_id, ins_pan, 1, 'unidades'),
    (t_id, p_burger_id, ins_queso, 0.1, 'libras'),
    (t_id, p_burger_id, ins_papas, 0.4, 'libras');

  -- 4. Cuentas por Cobrar
  INSERT INTO public.cuentas_cobrar (tenant_id, sucursal_id, customer_id, monto_total, monto_pagado, fecha_emision, fecha_vencimiento, estado, observacion)
  VALUES 
    (t_id, s_id, c_id, 3500.00, 1000.00, now() - interval '5 days', now() + interval '10 days', 'pendiente', 'Servicios de catering evento corporativo')
  RETURNING id INTO cxc_1;

  INSERT INTO public.cuentas_cobrar (tenant_id, sucursal_id, customer_id, monto_total, monto_pagado, fecha_emision, fecha_vencimiento, estado, observacion)
  VALUES 
    (t_id, s_id, c_id, 1200.00, 1200.00, now() - interval '15 days', now() - interval '2 days', 'pagado', 'Almuerzo equipo directivo')
  RETURNING id INTO cxc_2;

  -- 5. Cuentas por Pagar
  INSERT INTO public.cuentas_pagar (tenant_id, sucursal_id, proveedor_id, monto_total, monto_pagado, fecha_emision, fecha_vencimiento, estado, observacion)
  VALUES 
    (t_id, s_id, prov_1, 15000.00, 5000.00, now() - interval '3 days', now() + interval '27 days', 'pendiente', 'Pedido mensual de carnes premium')
  RETURNING id INTO cxp_1;

  INSERT INTO public.cuentas_pagar (tenant_id, sucursal_id, proveedor_id, monto_total, monto_pagado, fecha_emision, fecha_vencimiento, estado, observacion)
  VALUES 
    (t_id, s_id, prov_2, 3500.00, 0.00, now(), now() + interval '15 days', 'pendiente', 'Factura por panes brioche semanales')
  RETURNING id INTO cxp_2;

  -- 6. Insertar algunos detalles (pagos, si se quiere, opcional)
  INSERT INTO public.cxc_pagos (tenant_id, sucursal_id, cuenta_cobrar_id, monto, metodo_pago, fecha_pago, notas)
  VALUES
    (t_id, s_id, cxc_1, 1000.00, 'transferencia', now() - interval '2 days', 'Abono parcial'),
    (t_id, s_id, cxc_2, 1200.00, 'efectivo', now() - interval '2 days', 'Pago completo');

  INSERT INTO public.cxp_pagos (tenant_id, sucursal_id, cuenta_pagar_id, monto, metodo_pago, fecha_pago, notas)
  VALUES
    (t_id, s_id, cxp_1, 5000.00, 'cheque', now() - interval '1 day', 'Cheque #45211 para abono inicial');

END $$;