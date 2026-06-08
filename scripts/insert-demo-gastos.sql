DO $$ 
DECLARE
  t_id UUID := '2a547d0e-4a0b-49e5-a7be-34071934c61d';
  s_id UUID := '2933e7b6-21df-4bbc-8fc7-fa6e39da4df5';
  c_id UUID := '869fc7b2-7bec-4b76-aa4c-1e1ec798828a'; -- Active cycle
  cat_insumos UUID;
  cat_prov UUID;
  prov_1 UUID;
  ins_papas UUID;
  compra_id UUID;
BEGIN
  -- 1. Create Expense Categories (if not exist)
  INSERT INTO public.gasto_categorias (tenant_id, sucursal_id, nombre, color)
  VALUES 
    (t_id, s_id, 'Compra de Insumos', '#ff906d')
  RETURNING id INTO cat_insumos;

  INSERT INTO public.gasto_categorias (tenant_id, sucursal_id, nombre, color)
  VALUES 
    (t_id, s_id, 'Pago a Proveedores', '#25d366')
  RETURNING id INTO cat_prov;

  -- 2. Get existing Proveedor and Insumo from previous demo data
  SELECT id INTO prov_1 FROM public.proveedores WHERE tenant_id = t_id LIMIT 1;
  SELECT id INTO ins_papas FROM public.productos_inventario WHERE tenant_id = t_id AND nombre = 'Papas Fritas Congeladas' LIMIT 1;

  -- 3. Register a direct Cash Purchase (Compra)
  INSERT INTO public.compras (tenant_id, sucursal_id, proveedor_id, numero_factura, tipo_pago, estado, observacion, total)
  VALUES 
    (t_id, s_id, prov_1, 'F-CASH-001', 'efectivo', 'completada', 'Compra directa en efectivo para reabastecimiento urgente', 1200.00)
  RETURNING id INTO compra_id;

  INSERT INTO public.compra_detalles (tenant_id, sucursal_id, compra_id, producto_id, cantidad, costo_unitario, total)
  VALUES 
    (t_id, s_id, compra_id, ins_papas, 20, 60.00, 1200.00);

  -- 4. Register the corresponding Expenses (Gastos) in the active Cycle

  -- Expense for the direct cash purchase
  INSERT INTO public.gastos (tenant_id, sucursal_id, category_id, cycle_id, descripcion, proveedor, monto, metodo_pago, notas)
  VALUES 
    (t_id, s_id, cat_insumos, c_id, 'Compra directa de Papas Fritas', 'Distribuidora Local', 1200.00, 'efectivo', 'Factura F-CASH-001');

  -- Expense for the CXP Payment (Cheque) that we inserted previously
  INSERT INTO public.gastos (tenant_id, sucursal_id, category_id, cycle_id, descripcion, proveedor, monto, metodo_pago, notas)
  VALUES 
    (t_id, s_id, cat_prov, c_id, 'Abono a Distribuidora Carnes del Sur', 'Distribuidora Carnes del Sur', 5000.00, 'cheque', 'Cheque #45211');

END $$;