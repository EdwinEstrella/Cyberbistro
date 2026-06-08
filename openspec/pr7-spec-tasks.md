# Spec + Tasks — PR 7: Compras → Gastos + Cierre/Analíticas

**Change**: `compras-gastos-cierre-integration`
**Estimated lines**: ~100-150 | **Budget risk**: Very Low

---

## Spec

### Invariantes

1. Una compra con `tipoPago === "contado"` requiere obligatoriamente que exista un ciclo operativo activo (sin fecha de cierre, y correspondiente a la sucursal activa) en la tabla `cierres_operativos`.
2. Al registrar una compra con `tipoPago === "contado"`, se debe insertar automáticamente un gasto en la tabla `gastos` enlazado al ciclo operativo activo.
3. El gasto debe poseer como categoría la correspondiente a `"Compras"`. Si dicha categoría no existe en `gasto_categorias`, el sistema debe crearla automáticamente con color `#ff906d`.
4. El monto del gasto debe coincidir exactamente con el total de la compra.
5. Las compras con `tipoPago === "credito"` no deben generar registros de gasto ni requerir que exista un ciclo operativo abierto en esta fase (se procesarán mediante cuentas por pagar en el PR 8).
6. El frontend debe mostrar advertencias legibles al usuario y bloquear la acción de guardar una compra al contado si no hay un ciclo de caja abierto.

---

## Tasks

### Task 1: Actualizar el Servicio de Compras
**Archivo**: `src/features/compras/lib/purchaseService.ts`

- Modificar la firma de `registrarCompra`.
- Si `tipoPago === "contado"`:
  - Leer de `cierres_operativos` filtrando por `tenantId` y `sucursalId` para buscar el ciclo activo (`closed_at === null`).
  - Si no hay ciclo activo, lanzar un error: `new Error("No hay un ciclo operativo abierto para registrar una compra al contado.")`.
  - Cargar las categorías de `gasto_categorias`. Buscar la que tenga nombre `"Compras"`.
  - Si no existe, generar un UUID y registrarla usando `enqueueLocalWrite` en `gasto_categorias`.
  - Resolver el nombre comercial del proveedor si `proveedorId` está presente leyendo de `proveedores`.
  - Encolar una escritura en la tabla `gastos` con el monto total de la compra, el `cycle_id` del ciclo activo, el ID de la categoría y la fecha de compra.

### Task 2: Modificar y Ampliar las Pruebas Unitarias del Servicio
**Archivo**: `src/features/compras/lib/purchaseService.test.ts`

- Mockear el retorno de `readLocalMirror` para simular:
  - Ciclos operativos activos y cerrados.
  - Categorías de gastos (existentes y ausentes).
  - Proveedores.
- Escribir pruebas para:
  - Registro de compra al contado con ciclo activo exitoso (verifica que se inserte el gasto y la categoría si no existe).
  - Registro de compra al contado con ciclo activo y categoría ya existente (verifica que no se duplique la categoría).
  - Error al registrar compra al contado si no hay ciclos activos.
  - Compra a crédito sin ciclo activo (debe registrarse con éxito y no generar gastos).

### Task 3: Integrar Validación en la Interfaz de Compras
**Archivo**: `src/features/compras/components/Compras.tsx`

- Cargar en `cargarDatos` el ciclo operativo activo de `cierres_operativos` (`cicloAbierto`).
- Guardar dicho ciclo en el estado de React.
- En el modal de registro de compras:
  - Mostrar una advertencia en rojo si `compraForm.tipo_pago === "contado"` y `!cicloAbierto`.
  - Deshabilitar el botón de envío ("Guardar Compra") en dicho escenario para prevenir el submit erróneo.

### Task 4: Validaciones Locales
- Ejecutar `npm run typecheck`
- Ejecutar `npm run test`

---

## Commits

| Commit | Contenido |
|--------|-----------|
| `feat(compras): link cash purchases to operational cycle expenses` | Task 1 |
| `test(compras): add unit tests for purchase expenses and active cycle gating` | Task 2 |
| `feat(compras): add cycle check warnings and disable cash purchases in UI when closed` | Task 3 |
