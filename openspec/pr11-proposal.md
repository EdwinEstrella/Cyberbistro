# Propuesta Técnica: Menú Digital Administrable y Pedidos en Tiempo Real (PR 11)

Esta propuesta detalla el diseño y la integración técnica del Menú Digital para el plan Profesional.

## 1. Migraciones de Base de Datos (InsForge)

Crearemos el archivo de migración `migrations/20260608190000_add-digital-menu-tables.sql` con los esquemas de:

1. **`digital_menu_settings`**:
   - Políticas RLS:
     - `SELECT`: Público (cualquier usuario que visite la web por el slug).
     - `INSERT`/`UPDATE`: Restringido a usuarios autenticados con rol `'admin'` en el tenant.
2. **`digital_menu_items`**:
   - Políticas RLS:
     - `SELECT`: Público.
     - `INSERT`/`UPDATE`/`DELETE`: Restringido a `'admin'`.
3. **`digital_orders`**:
   - Políticas RLS:
     - `SELECT`: Público (para que el cliente pueda consultar su estado temporalmente) y usuarios del tenant (`admin`, `cajera`, `cajero`, `ventas`).
     - `INSERT`: Público (cualquier visitante de la web puede crear un pedido).
     - `UPDATE`: Usuarios del tenant (`admin`, `cajera`, etc.).
4. **`digital_order_items`**:
   - Políticas RLS:
     - `SELECT`/`INSERT`: Público.

---

## 2. Aplicación Next.js (website/claudix)

### A. Estructura de Rutas
Crearemos `website/claudix/app/[slug]/page.tsx` para renderizar el menú digital del restaurante correspondiente al `slug`.

### B. Configuración de InsForge Client en Next.js
En `website/claudix/app/lib/insforge.ts` definiremos el cliente utilizando variables de entorno:
```typescript
import { createClient } from '@insforge/sdk';

export const insforgeClient = createClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL || '',
  anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || ''
});
```

### C. Flujo de Pedidos
- El usuario selecciona platos de la lista.
- Se abre un modal de checkout donde ingresa su nombre y notas.
- Se ejecuta la transacción:
  1. Insertar fila en `digital_orders` (retorna `order_id`).
  2. Insertar las filas correspondientes en `digital_order_items` asociadas al `order_id`.

---

## 3. Módulo de Pedidos en la App de Escritorio (Electron/React)

### A. Registro de Rutas
En `src/app/routes.tsx` agregaremos la ruta `/pedidos` dentro del AppLayout:
```typescript
{ path: "/pedidos", lazy: () => import("../features/pedidos").then(({ Pedidos }) => ({ Component: Pedidos })) }
```

### B. Integración en el Sidebar
En `src/app/components/AppLayout.tsx`, agregaremos el acceso en la sección "OPERACIÓN":
```typescript
{ label: "Pedidos Digitales", customIcon: "pedidos", path: "/pedidos" }
```

### C. Suscripción en Tiempo Real (Realtime WebSockets)
Al montar el panel de `/pedidos`, nos suscribiremos a la tabla `digital_orders` filtrando por `tenant_id` y `sucursal_id` activa:
```typescript
useEffect(() => {
  if (!tenantId) return;

  const channel = insforgeClient.realtime.channel(`digital_orders_realtime_${tenantId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'digital_orders',
      filter: `tenant_id=eq.${tenantId}`
    }, () => {
      // Recargar la lista de pedidos en el estado local
      void reloadDigitalOrders();
    })
    .subscribe();

  return () => {
    void channel.unsubscribe();
  };
}, [tenantId]);
```

### D. Flujo de Aceptación/Rechazo
- **Aceptar**:
  1. Cambiar estado del pedido digital a `'accepted'`.
  2. Insertar una fila en la tabla `comandas` con los ítems del pedido en formato `ComandaItem[]` y estado `'pendiente'`.
- **Rechazar**:
  1. Solicitar motivo de rechazo.
  2. Cambiar estado a `'rejected'` guardando el motivo en `rejection_reason`.
