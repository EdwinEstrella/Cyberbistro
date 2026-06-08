# Exploración: Menú Digital Administrable y Pedidos en Tiempo Real

Este documento analiza el diseño técnico, las tablas de base de datos, el ruteo de Next.js y la integración de tiempo real para implementar el Menú Digital del Plan Profesional (Issue #36).

## 1. Diseño de Base de Datos (InsForge / PostgreSQL)

Para dar soporte al Menú Digital y al registro de pedidos, se requieren las siguientes tablas en PostgreSQL:

### A. Tabla `digital_menu_settings`
Almacena la configuración general del menú digital por sucursal/tenant:
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid REFERENCES tenants(id) ON DELETE CASCADE)
- `sucursal_id` (uuid REFERENCES sucursales(id) ON DELETE SET NULL)
- `enabled` (boolean DEFAULT false)
- `public_slug` (text UNIQUE NOT NULL)
- `title` (text)
- `description` (text)
- `logo_url` (text)
- `banner_url` (text)
- `theme` (jsonb)
- `created_at` (timestamptz DEFAULT now())
- `updated_at` (timestamptz DEFAULT now())

### B. Tabla `digital_menu_items`
Permite ocultar o personalizar productos específicos de la carta en el menú digital:
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid REFERENCES tenants(id) ON DELETE CASCADE)
- `plato_id` (integer REFERENCES platos(id) ON DELETE CASCADE)
- `display_name` (text)
- `description` (text)
- `image_url` (text)
- `visible` (boolean DEFAULT true)
- `sort_order` (integer DEFAULT 0)
- `created_at` (timestamptz DEFAULT now())

### C. Tabla `digital_orders`
Registra los pedidos generados desde el menú digital:
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid REFERENCES tenants(id) ON DELETE CASCADE)
- `sucursal_id` (uuid REFERENCES sucursales(id) ON DELETE SET NULL)
- `customer_name` (text NOT NULL)
- `customer_phone` (text)
- `status` (text NOT NULL DEFAULT 'pending') -- 'pending' | 'confirming' | 'accepted' | 'rejected'
- `total` (numeric NOT NULL DEFAULT 0.00)
- `notes` (text)
- `rejection_reason` (text)
- `accepted_at` (timestamptz)
- `rejected_at` (timestamptz)
- `created_at` (timestamptz DEFAULT now())
- `updated_at` (timestamptz DEFAULT now())

### D. Tabla `digital_order_items`
Detalle de productos dentro de un pedido digital:
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `order_id` (uuid REFERENCES digital_orders(id) ON DELETE CASCADE)
- `plato_id` (integer REFERENCES platos(id) ON DELETE SET NULL)
- `name_snapshot` (text NOT NULL)
- `price_snapshot` (numeric NOT NULL)
- `quantity` (integer NOT NULL)
- `notes` (text)
- `subtotal` (numeric NOT NULL)

---

## 2. Ruteo Dinámico en Next.js (website/claudix)

El cliente final escanea el código QR y accede a la URL:
`https://cyberbistro.app/[restaurant-slug]`

Para esto, se estructurará la ruta dinámica en el App Router de Next.js:
`website/claudix/app/[slug]/page.tsx`

### Flujo de la página:
1. Buscar en la base de datos `digital_menu_settings` el registro donde `public_slug === params.slug` y `enabled === true`.
2. Si no se encuentra, renderizar página 404 o estado "Menú temporalmente inactivo".
3. Si existe, cargar las categorías y productos de `platos` y `menu_categories` que pertenezcan al mismo `tenant_id`.
4. Cruzar los productos con la tabla `digital_menu_items` para aplicar exclusiones (`visible === false`) o personalizaciones de nombres/imágenes.
5. Permitir armar un carrito local y rellenar formulario (Nombre obligatorio, Teléfono opcional).
6. Enviar la orden insertando un registro en `digital_orders` y sus correspondientes filas en `digital_order_items` mediante `@insforge/sdk`.

---

## 3. Recepción en Tiempo Real en la App de Escritorio (Electron/React)

Para que el negocio no tenga que recargar la pantalla para enterarse de pedidos nuevos, se utilizará el sistema Realtime de InsForge:

```typescript
insforgeClient.realtime.channel('digital-orders-channel')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'digital_orders',
    filter: `tenant_id=eq.${tenantId}`
  }, (payload) => {
    // Disparar sonido/alerta y recargar listado local de pedidos
  })
  .subscribe()
```

---

## 4. UI y Módulos del Desktop POS

1. **Soporte > Menú Digital**:
   - Agregar una pestaña o botón de configuración dentro de `/soporte` que abra el panel de control del Menú Digital.
   - Formulario para activar/desactivar el menú, definir el slug público, título, descripción y subir logo/banner.
   - Generación y descarga del código QR.
   - Lista interactiva de productos de la carta para marcar cuáles son visibles/ocultos en la web.

2. **Panel de Pedidos**:
   - Nuevo ítem en la navegación lateral de **Operación** llamado **Pedidos** (`/pedidos`).
   - Muestra pedidos con estado `pending`, `confirming` y `accepted`.
   - Permite:
     - Cambiar estado a `confirming` (para contacto telefónico).
     - **Rechazar**: pedir motivo opcional y pasarlo a `rejected`.
     - **Aceptar**: generar automáticamente una comanda / consumo en el sistema POS vinculando los platos seleccionados y pasar el estado a `accepted`.
