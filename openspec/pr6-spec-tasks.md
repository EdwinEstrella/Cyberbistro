# Spec + Tasks — PR 6: Servicio Compras → Inventario → Movimiento

**Change**: `compras-inventory-service`
**Estimated lines**: ~400-500 | **Budget risk**: High (Need to keep code tight and concise)

---

## Spec

### Invariantes

1. Cada compra insertada debe tener al menos un item asociado en `compra_detalles`.
2. Las cantidades de insumos ingresados a `productos_inventario` se multiplican por `ml_por_botella` si la unidad base es `ml` y este campo está presente y es mayor a cero.
3. El `costo_promedio` de cada insumo en el catálogo se recalcula mediante la fórmula de promedio ponderado, y el costo unitario de entrada se divide entre `ml_por_botella` si corresponde.
4. El registro de compras e items es de tipo **Append-Only** (RLS restringe updates y deletes). El catálogo de insumos se actualiza mediante trigger pero permite actualización de stock/costo a roles operativos.
5. El CRUD de proveedores admite crear (`insert`) y editar (`update`) campos de contacto y fiscales (RNC, nombre, teléfono, dirección).
6. El frontend debe pasar exitosamente `npm run typecheck`.

---

## Tasks

### Task 1: Crear el servicio de compras
**Archivo**: `src/features/compras/lib/purchaseService.ts`

- Implementar `registrarCompra` recibiendo `PurchaseInput`.
- Resolver cada `producto_id` consultando `readLocalMirror` para obtener `stock_actual`, `costo_promedio`, `unidad_base` y `ml_por_botella`.
- Calcular la `cantidad_base` y `costo_base` según si tiene presentación líquida.
- Aplicar fórmula ponderada para el nuevo `costo_promedio`.
- Generar e invocar `enqueueLocalWrite` para:
  - Inserción en `compras`.
  - Inserción de cada item en `compra_detalles`.
  - Actualización (`update`) de `stock_actual` y `costo_promedio` en `productos_inventario`.
  - Inserción en `inventario_movimientos` con tipo `'entrada'` y motivo `'Ingreso por compra'`.

### Task 2: Crear pruebas unitarias del servicio
**Archivo**: `src/features/compras/lib/purchaseService.test.ts`

- Escribir pruebas unitarias cubriendo:
  - Compra simple (unidad base simple).
  - Compra con presentación líquida (botellas de 750ml, costo por botella se divide).
  - Recálculo de costo promedio con stock previo positivo, cero o negativo.
  - Generación de payloads de escritura local correctos.
- Ejecutar: `npx vitest run purchaseService`

### Task 3: Desarrollar la Interfaz de Compras y Proveedores
**Archivo**: `src/features/compras/components/Compras.tsx`

- Diseñar vista con pestañas: `'compras'` (lista de compras y botón Nueva Compra) y `'proveedores'` (lista de proveedores y botón Nuevo Proveedor).
- **CRUD de Proveedores**:
  - Modal para agregar/editar proveedor (`nombre`, `rnc`, `telefono`, `direccion`, `activo`).
  - Escritura local con `enqueueLocalWrite` (tabla `"proveedores"`).
- **Formulario de Compra (Modal)**:
  - Selector de proveedor (con opción de crear rápido inline si es posible, o link a pestaña).
  - Selector de tipo de pago (`contado`, `credito`).
  - Input para número de factura de compra.
  - Tabla dinámica de items: botón agregar fila, selector de insumo, input cantidad, input costo de compra.
  - Calcular total general en tiempo real.
  - Al enviar, invocar `registrarCompra` y refrescar datos.

### Task 4: Ejecutar verificaciones locales
- Ejecutar `npm run typecheck`
- Ejecutar `npm run test`

---

## Commits

| Commit | Contenido |
|--------|-----------|
| `feat: implement registrarCompra service with weighted average cost` | Task 1 |
| `test: add unit tests for purchase registration service` | Task 2 |
| `feat: implement Compras and Proveedores UI dashboard tabs and modals` | Task 3 |
