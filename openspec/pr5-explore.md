# Exploración — PR 5: Modelo Compras + Proveedores (Tablas + CRUD)

**Change**: `compras-proveedores-model`
**Branch**: `feature/compras-proveedores-model`

---

## Objetivos del Cambio

1. Diseñar y crear las tablas de base de datos para la gestión de proveedores (`proveedores`), compras (`compras`) y sus partidas correspondientes (`compra_detalles`) en PostgreSQL, aplicando políticas RLS rigurosas.
2. Incorporar el nuevo módulo de `Compras` al sidebar agrupado (sección Inventario) en `AppLayout.tsx` con un icono descriptivo de compras (`compras`).
3. Registrar la ruta `/compras` en el enrutador de la aplicación (`src/app/routes.tsx`).
4. Sentar las bases en IndexedDB / Local-First para dar soporte a la sincronización bidireccional y almacenamiento local de compras y proveedores.

---

## Diseño de Base de Datos y RLS

### 1. Tabla `proveedores`
Almacena la información de contacto y fiscal de los proveedores.
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE)
- `nombre` (text NOT NULL)
- `rnc` (varchar(20) NULL) — Identificador fiscal (RNC en RD).
- `telefono` (varchar(20) NULL)
- `email` (text NULL)
- `direccion` (text NULL)
- `activo` (boolean NOT NULL DEFAULT true)
- `created_at` (timestamptz DEFAULT now())
- `updated_at` (timestamptz DEFAULT now())

### 2. Tabla `compras`
Registra la cabecera de las facturas de adquisición.
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE)
- `sucursal_id` (uuid REFERENCES public.sucursales(id) ON DELETE SET NULL)
- `proveedor_id` (uuid REFERENCES public.proveedores(id) ON DELETE SET NULL)
- `numero_factura` (varchar(50) NULL) — Código de factura del proveedor.
- `tipo_pago` (varchar(20) NOT NULL) — `'contado'` | `'credito'`.
- `fecha_compra` (timestamptz NOT NULL DEFAULT now())
- `total` (numeric NOT NULL DEFAULT 0.00)
- `estado` (varchar(20) NOT NULL DEFAULT 'completada') — `'pendiente'` | `'completada'` | `'anulada'`.
- `observacion` (text NULL)
- `usuario_id` (uuid REFERENCES public.tenant_users(id) ON DELETE SET NULL)
- `created_at` (timestamptz DEFAULT now())

### 3. Tabla `compra_detalles`
Detalle de insumos comprados.
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE)
- `compra_id` (uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE)
- `producto_id` (uuid NOT NULL REFERENCES public.productos_inventario(id) ON DELETE CASCADE)
- `cantidad` (numeric NOT NULL) — Cantidad del producto adquirida.
- `costo_unitario` (numeric NOT NULL) — Costo por unidad comprada.
- `total` (numeric NOT NULL) — `cantidad * costo_unitario`.
- `created_at` (timestamptz DEFAULT now())

### Políticas RLS (Seguridad)
Se implementarán políticas RLS multi-tenant basadas en roles (`admin` para gestión total, y roles operativos como `cajero` y `ventas` para lectura e inserción de compras y proveedores):
- **proveedores**:
  - `SELECT`: Administradores y personal operativo.
  - `INSERT` / `UPDATE`: Administradores y personal operativo (permitiendo creación rápida inline).
  - `DELETE`: Solo administradores.
- **compras** y **compra_detalles**:
  - `SELECT` / `INSERT`: Administradores y personal operativo autorizado.
  - `UPDATE` / `DELETE`: Deshabilitados (`USING (false)` / `WITH CHECK (false)`) para asegurar que el registro de compras sea inmutable e histórico.

---

## Modificaciones de Rutas y Navegación

- **Iconografía**: Modificar el tipo `customIcon` en `AppLayout.tsx` para incluir `"compras"` y agregar su correspondiente SVG en la función `SidebarCustomIcon`.
- **Sidebar**: Registrar en `mainNavItems` bajo la sección `inventario`:
  ```typescript
  { label: "Compras", customIcon: "compras", path: "/compras", feature: "inventory_purchases" }
  ```
- **Rutas**: En `src/app/routes.tsx`, añadir:
  ```typescript
  { path: "/compras", lazy: () => import("../features/compras").then(({ Compras }) => ({ Component: Compras })) },
  ```

---

## Estrategia de Pruebas

1. **Test de SQL**: Crear un test `test/compras-proveedores-migration.test.ts` que valide que el archivo de migración SQL incluya los comandos correctos de creación de tablas, llaves foráneas y RLS.
2. **Typecheck y Build**: Asegurar que añadir el customIcon y las nuevas rutas no quiebre la compilación.
