# Propuesta — PR 5: Modelo Compras + Proveedores (Tablas + CRUD)

**Change**: `compras-proveedores-model`
**Branch**: `feature/compras-proveedores-model`

---

## Objetivos del Cambio

1. Crear las tablas `proveedores`, `compras` y `compra_detalles` en la base de datos PostgreSQL mediante un archivo de migración SQL, equipándolas con aislamiento multi-tenant RLS y privilegios de acceso basados en roles.
2. Registrar las nuevas tablas en el sistema local-first (`LOCAL_FIRST_MIRROR_TABLES`, `LOCAL_FIRST_IMMEDIATE_TABLES`, `LOCAL_FIRST_HISTORY_TABLES`) en `localFirst.ts` para que se sincronicen de forma local.
3. Habilitar la ruta `/compras` en `routes.tsx` para lazy loading.
4. Agregar el botón "Compras" con un icono descriptivo en el sidebar (`AppLayout.tsx`) en la sección de "Inventario", y que requiere la característica `inventory_purchases`.

---

## Modificaciones de Base de Datos (SQL)

La migración se definirá en el archivo `migrations/20260608160000_add-compras-and-proveedores-tables.sql` con el siguiente contenido:

```sql
-- 1. Crear tabla de proveedores
CREATE TABLE IF NOT EXISTS public.proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  rnc varchar(20),
  telefono varchar(20),
  email text,
  direccion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Crear tabla de compras
CREATE TABLE IF NOT EXISTS public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sucursal_id uuid REFERENCES public.sucursales(id) ON DELETE SET NULL,
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  numero_factura varchar(50),
  tipo_pago varchar(20) NOT NULL, -- 'contado' | 'credito'
  fecha_compra timestamptz NOT NULL DEFAULT now(),
  total numeric NOT NULL DEFAULT 0.00,
  estado varchar(20) NOT NULL DEFAULT 'completada', -- 'pendiente' | 'completada' | 'anulada'
  observacion text,
  usuario_id uuid REFERENCES public.tenant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Crear tabla de detalles de compra
CREATE TABLE IF NOT EXISTS public.compra_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos_inventario(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL,
  costo_unitario numeric NOT NULL,
  total numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Habilitar RLS en todas las nuevas tablas
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_detalles ENABLE ROW LEVEL SECURITY;

-- 5. Crear políticas de aislamiento multi-tenant y roles

-- PROVEEDORES:
-- Select y Modificaciones (Insert/Update) permitidas para admin y roles operativos
DROP POLICY IF EXISTS cb_proveedores_tenant_select ON public.proveedores;
CREATE POLICY cb_proveedores_tenant_select ON public.proveedores
  FOR SELECT TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor', 'mesero', 'mesera', 'cocina', 'cocinero'])
  );

DROP POLICY IF EXISTS cb_proveedores_tenant_write ON public.proveedores;
CREATE POLICY cb_proveedores_tenant_write ON public.proveedores
  FOR INSERT TO public
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

CREATE POLICY cb_proveedores_tenant_update ON public.proveedores
  FOR UPDATE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  )
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

-- Delete restringido únicamente a administradores
DROP POLICY IF EXISTS cb_proveedores_admin_delete ON public.proveedores;
CREATE POLICY cb_proveedores_admin_delete ON public.proveedores
  FOR DELETE TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin'])
  );

-- COMPRAS Y DETALLES:
-- Son tablas de historial y auditoría inmutables (Append-Only). No permiten UPDATE/DELETE en la app.
DROP POLICY IF EXISTS cb_compras_tenant_select ON public.compras;
CREATE POLICY cb_compras_tenant_select ON public.compras
  FOR SELECT TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

DROP POLICY IF EXISTS cb_compras_tenant_insert ON public.compras;
CREATE POLICY cb_compras_tenant_insert ON public.compras
  FOR INSERT TO public
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

-- Bloqueo total de update y delete
DROP POLICY IF EXISTS cb_compras_no_app_update ON public.compras;
CREATE POLICY cb_compras_no_app_update ON public.compras
  FOR UPDATE TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS cb_compras_no_app_delete ON public.compras;
CREATE POLICY cb_compras_no_app_delete ON public.compras
  FOR DELETE TO public
  USING (false);

-- DETALLES DE COMPRA:
DROP POLICY IF EXISTS cb_compra_detalles_tenant_select ON public.compra_detalles;
CREATE POLICY cb_compra_detalles_tenant_select ON public.compra_detalles
  FOR SELECT TO public
  USING (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

DROP POLICY IF EXISTS cb_compra_detalles_tenant_insert ON public.compra_detalles;
CREATE POLICY cb_compra_detalles_tenant_insert ON public.compra_detalles
  FOR INSERT TO public
  WITH CHECK (
    public.cyberbistro_has_tenant_role(tenant_id, ARRAY['admin', 'cajera', 'cajero', 'ventas', 'vender', 'vendedor'])
  );

-- Bloqueo total de update y delete
DROP POLICY IF EXISTS cb_compra_detalles_no_app_update ON public.compra_detalles;
CREATE POLICY cb_compra_detalles_no_app_update ON public.compra_detalles
  FOR UPDATE TO public
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS cb_compra_detalles_no_app_delete ON public.compra_detalles;
CREATE POLICY cb_compra_detalles_no_app_delete ON public.compra_detalles
  FOR DELETE TO public
  USING (false);
```

---

## Modificaciones de Código (TS)

### 1. `localFirst.ts`
- Agregar `"proveedores"`, `"compras"`, `"compra_detalles"` a `LOCAL_FIRST_MIRROR_TABLES`.
- Agregar `"proveedores"` a `LOCAL_FIRST_IMMEDIATE_TABLES`.
- Agregar `"proveedores"`, `"compras"`, `"compra_detalles"` a `LOCAL_FIRST_HISTORY_TABLES`.

### 2. `routes.tsx`
- Añadir la ruta `/compras` importando de forma diferida el componente `Compras` del módulo a crear posteriormente:
  ```typescript
  { path: "/compras", lazy: () => import("../features/compras").then(({ Compras }) => ({ Component: Compras })) },
  ```

### 3. `AppLayout.tsx`
- Extender el tipo `customIcon` con `"compras"`.
- Añadir a `SidebarCustomIcon` el SVG de carrito de compras para `"compras"`.
- Añadir en la sección `inventario` de `sidebarSections`:
  ```typescript
  { label: "Compras", customIcon: "compras", path: "/compras", feature: "inventory_purchases" }
  ```

---

## Análisis de Riesgos

- **Riesgo**: Que al hacer pre-fetch o lazy load de la ruta `/compras` falle porque el archivo `src/features/compras/index.ts` o `Compras.tsx` no existe.
  - *Mitigación*: En este PR crearemos un placeholder o componente base vacío en `src/features/compras/components/Compras.tsx` (que simplemente renderice "Módulo de Compras (En construcción)") para que la ruta compile y el sidebar funcione sin romperse, de modo que el PR sea completamente integrable, autónomo y testeable.
- **Riesgo**: Incompatibilidad de RLS en entornos sin `cyberbistro_has_tenant_role` helper.
  - *Mitigación*: La función trigger y helper de roles multi-tenant ya están plenamente implementados en la base de datos de Cyberbistro y se heredan automáticamente.
