# Spec + Tasks — PR 3: Migración Inventario Avanzado (Campos SQL)

**Change**: `advanced-inventory-columns`
**Estimated lines**: ~100 | **Budget risk**: Low

---

## Spec

### Invariantes

1. La tabla `productos_inventario` debe poseer las columnas `ml_por_botella` (numeric) y `costo_compra` (numeric) después de la migración.
2. Los valores por defecto de los registros existentes serán `NULL` para `ml_por_botella` y `0.00` para `costo_compra`.
3. Cualquier intento de actualizar `ml_por_botella` o `costo_compra` por roles que no sean `admin` (como `mesero`, `cajera`, `cocina`) debe ser abortado con el error: `'Solo admin puede cambiar datos de catálogo de inventario.'`.
4. El frontend debe compilar sin errores de tipos en TypeScript (`npm run typecheck` pasa exitosamente).

---

## Tasks

### Task 1: Crear archivo de migración SQL
**Archivo**: `migrations/20260608150000_add-advanced-inventory-columns.sql`

- Crear el archivo de migración con las sentencias `ALTER TABLE public.productos_inventario ADD COLUMN ...`
- Reemplazar la función trigger `public.cyberbistro_guard_productos_inventario_update()` para validar los campos `ml_por_botella` y `costo_compra` mediante `NEW.column IS DISTINCT FROM OLD.column`.

### Task 2: Actualizar la interfaz InsumoRow en el frontend
**Archivo**: `src/features/inventario/components/Inventario.tsx`

- Modificar la interfaz `InsumoRow` añadiendo:
  ```typescript
  ml_por_botella: number | null;
  costo_compra: number | null;
  ```

### Task 3: Crear test de verificación de la migración
**Archivo**: `test/advanced-inventory-migration.test.ts`

- Escribir pruebas unitarias con Vitest que lean el archivo de migración y verifiquen:
  - Que se añadan las columnas `ml_por_botella` y `costo_compra`.
  - Que se redefina la función `cyberbistro_guard_productos_inventario_update`.
  - Que la función verifique `ml_por_botella IS DISTINCT FROM` y `costo_compra IS DISTINCT FROM`.

### Task 4: Ejecutar verificaciones locales
- Ejecutar `npm run typecheck` para asegurar compatibilidad de tipos.
- Ejecutar `npm run test` para asegurar que todas las pruebas pasen (incluyendo el nuevo archivo de test).

---

## Commits

| Commit | Contenido |
|--------|-----------|
| `migration: add advanced inventory columns and update catalog guard` | Task 1 |
| `types: extend InsumoRow interface for advanced inventory` | Task 2 |
| `test: add unit tests for advanced inventory migration` | Task 3 |
