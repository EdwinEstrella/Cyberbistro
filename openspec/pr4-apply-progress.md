# Apply Progress — PR 4: UI Inventario por Presentación

**Change**: `presentation-inventory-ui`
**Mode**: Strict TDD

## Completed Tasks

- [x] **Task 1: Modificar el estado y lógica del Formulario de Insumo**
  - Modificado `insumoForm` para soportar `ml_por_botella` y `costo_compra`.
  - Actualizado `crearInsumo` para calcular automáticamente `costo_promedio` (costo por ml) e inyectar `ml_por_botella` y `costo_compra` al payload de IndexedDB y base de datos remota.
  - Resetear campos después de guardar.
- [x] **Task 2: Añadir campos de entrada condicionales en el Modal**
  - Incorporados campos estéticos de "Contenido Botella (ml)" y "Costo Botella (RD$)" bajo el formulario principal cuando `unidad_base === "ml"`.
- [x] **Task 3: Formatear Stock y Costos en el Listado de Insumos**
  - Integrado el helper `formatPresentationStock` para las tarjetas del catálogo.
  - El stock líquido ahora se visualiza en botellas + ml (ej. "3 bot. y 250 ml") junto a la unidad neta en mililitros.
  - Mostrados costos de botella y costo promedio por ml (con 4 decimales de precisión).
- [x] **Task 4: Implementar costeo de recetas**
  - Añadida la columna "Costo Insumo" a la tabla de ingredientes de recetas.
  - Implementado el panel `Resumen Financiero del Plato` calculando en tiempo real: costo total de receta, precio del plato, margen bruto de ganancia y porcentaje de margen con colores contextuales según rentabilidad.
- [x] **Task 5: Ejecutar verificaciones locales**
  - `npm run typecheck` completado con éxito.
  - `npm run test` completado con éxito (96 tests aprobados).

---

## Verificación de Invariantes

1. Los insumos sin presentación botella (o con unidad distinta de ml) continúan visualizándose con sus unidades simples correspondientes. (Verificado)
2. El ingreso de botella autocalcula el costo por ml del catálogo. (Verificado)
3. Las recetas sin platos asociados o con precio nulo no provocan errores ni divisiones por cero. (Verificado)
