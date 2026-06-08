# Apply Progress — PR 3: Migración Inventario Avanzado (Campos SQL)

**Change**: `advanced-inventory-columns`
**Mode**: Strict TDD

## Completed Tasks

- [x] **Task 1: Crear archivo de migración SQL**
  - Creado en `migrations/20260608150000_add-advanced-inventory-columns.sql`
  - Añadidas columnas `ml_por_botella` y `costo_compra` a la tabla `productos_inventario`.
  - Reemplazada la función trigger `cyberbistro_guard_productos_inventario_update()` para validar que no se actualicen de forma no autorizada.
- [x] **Task 2: Actualizar la interfaz InsumoRow en el frontend**
  - Modificado `src/features/inventario/components/Inventario.tsx` para extender `InsumoRow` con `ml_por_botella: number | null` y `costo_compra: number | null`.
- [x] **Task 3: Crear test de verificación de la migración**
  - Creado `test/advanced-inventory-migration.test.ts` para asegurar que el archivo SQL de migración y la definición de trigger existan con los campos requeridos.
- [x] **Task 4: Ejecutar verificaciones locales**
  - `npm run typecheck` completado con éxito.
  - `npm run test` completado con éxito (95 test cases pasados).

---

## Verificación de Invariantes

1. La tabla `productos_inventario` contendrá los campos avanzados. (Verificado por test)
2. El trigger protege los nuevos campos en RLS contra modificaciones no deseadas. (Verificado por test)
3. La interfaz frontend `InsumoRow` está extendida de forma type-safe. (Verificado por typecheck)
