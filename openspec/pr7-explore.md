# Exploración — PR 7: Compras → Gastos + Cierre/Analíticas

**Change**: `compras-gastos-cierre-integration`
**Branch**: `feature/compras-gastos-cierre-integration`

---

## Objetivos del Cambio

1. **Vincular Compras al Contado con Gastos**:
   - Modificar el servicio `registrarCompra` en `src/features/compras/lib/purchaseService.ts` para que, cuando el `tipoPago` sea `'contado'`, registre automáticamente un egreso en la tabla `gastos`.
2. **Ciclo Operativo e Invariantes Financieras**:
   - Las compras al contado requieren que exista un ciclo operativo abierto en `cierres_operativos`. Si no existe, el servicio debe lanzar un error descriptivo.
   - Buscar o inicializar automáticamente la categoría de gasto `"Compras"` en `gasto_categorias` para evitar fallos de integridad referencial.
   - Guardar el gasto asociado al `cycle_id` del ciclo operativo actual, restando el total de la compra del flujo de efectivo operativo.
3. **Validación en el Frontend**:
   - Cargar el ciclo operativo activo en la pantalla de Compras (`Compras.tsx`).
   - Mostrar un mensaje preventivo en el formulario si se selecciona tipo de pago `"contado"` y no hay un ciclo operativo abierto.
4. **Impacto en Analíticas y Reporte de Cierre**:
   - Dado que el cierre de caja (`Cierre.tsx`) y el panel de analíticas (`Billing.tsx`) leen dinámicamente de la tabla `gastos` agrupando por categoría y ciclo, los gastos de compras se reflejarán automáticamente en el neto operativo y en el ticket de cierre Z.

---

## Análisis de Modelos de Datos

### Relación de Gastos (`gastos`)

Para registrar el egreso, crearemos un payload de inserción para `gastos` con la siguiente estructura:
- `id`: UUID autogenerado
- `tenant_id`: `tenantId`
- `category_id`: ID de la categoría `"Compras"` (buscada o creada en `gasto_categorias`)
- `cycle_id`: ID del ciclo activo en `cierres_operativos`
- `descripcion`: `"Compra - Factura " + numeroFactura`
- `proveedor`: Nombre del proveedor resuelto
- `monto`: Monto total de la factura
- `metodo_pago`: `"efectivo"` (valor predeterminado para egreso de caja)
- `fecha_gasto`: Fecha de la compra
- `notas`: `"Registrado automáticamente desde Módulo de Compras (ID: " + compraId + ")"`
- `created_by_auth_user_id`: ID del usuario actual

### Resolución de Categoría `"Compras"`

El servicio buscará en `gasto_categorias` una fila con `nombre` igual a `"Compras"` (no distingue mayúsculas/minúsculas).
Si no existe, el servicio creará la categoría con un `enqueueLocalWrite` previo antes de registrar el gasto.

---

## Pruebas de Integración

- Modificar `purchaseService.test.ts` para agregar casos de prueba donde se registre una compra de tipo `"contado"`:
  - Verificar que se lance un error si no hay ciclos abiertos.
  - Verificar que se encole la escritura de la categoría si no existe.
  - Verificar que se encole la escritura del gasto con el total de la compra y el `cycle_id` correcto.
  - Verificar que las compras de tipo `"credito"` no generen registros de gasto.
