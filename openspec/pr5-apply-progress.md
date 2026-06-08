# Apply Progress — PR 5: Modelo Compras + Proveedores (Tablas + CRUD)

**Change**: `compras-proveedores-model`
**Mode**: Strict TDD

## Completed Tasks

- [x] **Task 1: Crear archivo de migración SQL**
  - Creada `migrations/20260608160000_add-compras-and-proveedores-tables.sql` definiendo las tablas `proveedores`, `compras` y `compra_detalles` con llaves primarias/foráneas y aislamiento multi-tenant.
  - Implementada inmutabilidad para registros de compras y detalles (bloqueo RLS de UPDATE/DELETE).
- [x] **Task 2: Crear test de verificación de la migración SQL**
  - Creado `test/compras-proveedores-migration.test.ts` con pruebas para verificar la existencia de las tablas, RLS, y el bloqueo de actualizaciones en compras.
- [x] **Task 3: Registrar tablas en la configuración de Local-First**
  - Modificado `src/shared/lib/localFirst.ts` agregando las nuevas tablas a los arrays `LOCAL_FIRST_MIRROR_TABLES`, `LOCAL_FIRST_IMMEDIATE_TABLES` y `LOCAL_FIRST_HISTORY_TABLES`.
- [x] **Task 4: Agregar Compras al Sidebar y SidebarCustomIcon**
  - Modificado `src/app/components/AppLayout.tsx` agregando `"compras"` a los iconos de navegación y mapeando el correspondiente icono SVG. Registrada la entrada "Compras" bajo la sección de Inventario requerida por `inventory_purchases`.
- [x] **Task 5: Crear el componente placeholder Compras**
  - Creados `src/features/compras/components/Compras.tsx` y `src/features/compras/index.ts` con una vista informativa elegante de compras (indicando en construcción) para evitar rotura de enlaces.
- [x] **Task 6: Registrar la ruta en la aplicación**
  - Añadida la ruta `/compras` con lazy loading en `src/app/routes.tsx`.
- [x] **Task 7: Ejecutar verificaciones locales**
  - `npm run typecheck` completado con éxito.
  - `npm run test` completado con éxito (100 tests aprobados).

---

## Verificación de Invariantes

1. Las tres tablas existen en el esquema PostgreSQL y local-first. (Verificado por test)
2. Los roles operativos tienen permisos controlados y las compras son inmutables. (Verificado por test)
3. La aplicación compila sin errores de tipos y la ruta se carga bajo demanda de forma segura. (Verificado por typecheck)
