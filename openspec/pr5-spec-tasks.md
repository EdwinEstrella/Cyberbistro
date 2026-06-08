# Spec + Tasks — PR 5: Modelo Compras + Proveedores (Tablas + CRUD)

**Change**: `compras-proveedores-model`
**Estimated lines**: ~250 | **Budget risk**: Low

---

## Spec

### Invariantes

1. Las tablas `proveedores`, `compras` y `compra_detalles` deben existir con sus llaves primarias y foráneas asociadas tras la migración.
2. Los roles operativos (`cajero`, `ventas`) tienen permisos de lectura e inserción para registrar compras y proveedores, pero no de eliminación (delete) ni modificación (update) de compras/detalles.
3. El frontend de la aplicación web y local-first debe sincronizar estas nuevas tres tablas de manera automática al inicializarse el cliente local-first.
4. La ruta `/compras` debe cargar de forma lazy y renderizar el componente base `Compras` sin generar fallos de importación.
5. El sidebar debe mostrar el elemento "Compras" con su respectivo icono únicamente para planes `profesional` o superior (`inventory_purchases`).

---

## Tasks

### Task 1: Crear archivo de migración SQL
**Archivo**: `migrations/20260608160000_add-compras-and-proveedores-tables.sql`

- Definir las tablas `proveedores`, `compras`, `compra_detalles` y sus restricciones de tenant.
- Habilitar RLS en cada tabla.
- Escribir las políticas de seguridad para aislamiento multi-tenant y perfiles (admin operativo, append-only para compras).

### Task 2: Crear test de verificación de la migración SQL
**Archivo**: `test/compras-proveedores-migration.test.ts`

- Escribir pruebas unitarias que verifiquen que el archivo SQL de la migración:
  - Crea las tres tablas (`CREATE TABLE IF NOT EXISTS`).
  - Habilita RLS en las tres tablas (`ENABLE ROW LEVEL SECURITY`).
  - Crea las políticas de aislamiento para proveedores y compras (`CREATE POLICY`).
  - Bloquea UPDATE y DELETE para compras (`USING (false)`).

### Task 3: Registrar tablas en la configuración de Local-First
**Archivo**: `src/shared/lib/localFirst.ts`

- Añadir `"proveedores"`, `"compras"`, `"compra_detalles"` en el array `LOCAL_FIRST_MIRROR_TABLES`.
- Añadir `"proveedores"` en `LOCAL_FIRST_IMMEDIATE_TABLES`.
- Añadir `"proveedores"`, `"compras"`, `"compra_detalles"` en `LOCAL_FIRST_HISTORY_TABLES`.

### Task 4: Agregar Compras al Sidebar y SidebarCustomIcon
**Archivo**: `src/app/components/AppLayout.tsx`

- Modificar el tipo `customIcon` para admitir `"compras"`.
- En `SidebarCustomIcon`, agregar la condición para `"compras"` que retorne el SVG de carrito de compras.
- En `sidebarSections` (sección `inventario`), registrar:
  ```typescript
  { label: "Compras", customIcon: "compras", path: "/compras", feature: "inventory_purchases" }
  ```

### Task 5: Crear el componente placeholder Compras
**Archivos**:
- `src/features/compras/components/Compras.tsx`
- `src/features/compras/index.ts`

- Crear el componente `Compras` que renderice un título y un texto informativo (ej: "Módulo de Compras (En construcción)").
- Reexportar `Compras` en `index.ts`.

### Task 6: Registrar la ruta en la aplicación
**Archivo**: `src/app/routes.tsx`

- Importar de forma lazy `{ Compras }` de `../features/compras` y registrar la ruta en `/compras` bajo `AppLayout` children.

### Task 7: Ejecutar verificaciones locales
- Ejecutar `npm run typecheck`
- Ejecutar `npm run test`

---

## Commits

| Commit | Contenido |
|--------|-----------|
| `migration: add compras and proveedores schemas with rls` | Task 1 |
| `test: add validation suite for compras and proveedores migration` | Task 2 |
| `local-first: add new tables to synchronization arrays` | Task 3 |
| `navigation: register compras route, icon and sidebar menu` | Task 4 + Task 5 + Task 6 |
