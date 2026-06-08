# Exploración — PR 3: Migración Inventario Avanzado (Campos SQL)

**Change**: `advanced-inventory-columns`
**Branch**: `feature/advanced-inventory-columns`

---

## Objetivos del Cambio

1. Añadir columnas a `public.productos_inventario` para soportar unidades de presentación y costos:
   - `ml_por_botella` (numeric, NULL): Capacidad en ml de cada botella/presentación.
   - `costo_compra` (numeric, NULL, default 0.00): Costo de compra de la presentación completa.
2. Actualizar la función trigger `cyberbistro_guard_productos_inventario_update()` para asegurar que los roles operativos no puedan modificar estas columnas del catálogo, manteniendo la consistencia de seguridad y RLS de la aplicación.
3. Actualizar la interfaz TypeScript `InsumoRow` en el frontend para reflejar la existencia de estos nuevos campos y asegurar la compatibilidad de tipos.

---

## Análisis de la Base de Datos

El catálogo de inventario está definido en la tabla `productos_inventario`. Actualmente cuenta con las siguientes columnas:
- `id` (uuid)
- `tenant_id` (uuid)
- `sucursal_id` (uuid)
- `nombre` (text)
- `categoria` (text)
- `unidad_base` (varchar(20))
- `stock_actual` (numeric)
- `stock_minimo` (numeric)
- `costo_promedio` (numeric)
- `activo` (boolean)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

Para dar soporte al inventario avanzado (PR 3 y PR 4), necesitamos:
1. `ml_por_botella` (`numeric`): Permitirá conversiones usando la librería `presentationUnits`.
2. `costo_compra` (`numeric`): Permitirá costeo de recetas e insumos con base en la presentación adquirida.

### Trigger de Protección de Catálogo

El trigger `trg_guard_productos_inventario_update` ejecuta la función `cyberbistro_guard_productos_inventario_update()`. Esta función lanza una excepción si un rol operativo intenta alterar cualquier columna que no sea `stock_actual` y `updated_at` (las cuales se actualizan automáticamente durante las ventas o el despacho de cocina).
Debemos modificar la función para incluir las nuevas columnas en la verificación de `IS DISTINCT FROM`, previniendo modificaciones no autorizadas por personal que no sea administrador:

```sql
OR NEW.ml_por_botella IS DISTINCT FROM OLD.ml_por_botella
OR NEW.costo_compra IS DISTINCT FROM OLD.costo_compra
```

---

## Análisis de Impacto en el Código Existente

- **TypeScript**: La interfaz `InsumoRow` en `src/features/inventario/components/Inventario.tsx` debe extenderse con:
  ```typescript
  ml_por_botella: number | null;
  costo_compra: number | null;
  ```
- **IndexedDB / Local-First**: Al ser IndexedDB libre de esquema estructurado, no requiere cambios adicionales. Sin embargo, al guardar registros locales debemos asegurar que se incluyan estos campos (serán NULL por defecto para los registros existentes).

---

## Estrategia de Pruebas

1. **Prueba de Migración**: Crear un test en `test/advanced-inventory-migration.test.ts` que valide que el archivo de migración SQL contenga las sentencias necesarias (`ALTER TABLE`, `ADD COLUMN`, `OR NEW.ml_por_botella IS DISTINCT FROM OLD.ml_por_botella`, etc.).
2. **Prueba de TypeScript**: Ejecutar `npm run typecheck` para verificar que la inclusión de los nuevos campos no introduzca errores de tipo.
