# Tareas de Implementación: Menú Digital Administrable (PR 11)

Este documento detalla la hoja de ruta paso a paso para la implementación del Menú Digital en Next.js y el POS de escritorio.

## Tarea 1: Base de Datos y Local-First
- [ ] Crear la migración SQL `migrations/20260608190000_add-digital-menu-tables.sql` con las tablas:
  - `digital_menu_settings`
  - `digital_menu_items`
  - `digital_orders`
  - `digital_order_items`
- [ ] Registrar las nuevas tablas en `src/shared/lib/localFirst.ts`:
  - Añadir a `LOCAL_FIRST_MIRROR_TABLES` y `LOCAL_FIRST_HISTORY_TABLES`.
  - Incrementar `DB_VERSION` a `8`.
- [ ] Ejecutar la migración localmente.

## Tarea 2: Web Pública de Menú (Next.js - website/claudix)
- [ ] Configurar variables de entorno y cliente de InsForge en `website/claudix/app/lib/insforge.ts`.
- [ ] Crear la ruta dinámica `website/claudix/app/[slug]/page.tsx`:
  - Recuperar configuración de `digital_menu_settings` y validar si está activo.
  - Cargar catálogo de `platos` y categorías de `menu_categories`.
  - Cruzar con `digital_menu_items` para aplicar filtros de visibilidad y personalización.
  - Implementar estado de carrito de compras local.
  - Formulario de checkout: Nombre (obligatorio), teléfono/notas (opcionales).
  - Enviar pedido insertando registros en `digital_orders` y `digital_order_items`.

## Tarea 3: Panel de Administración (Escritorio - Soporte > Menú Digital)
- [ ] Modificar `src/features/soporte/components/Soporte.tsx` para agregar la pestaña "Menú Digital":
  - Formulario para activar/desactivar el menú, configurar título, descripción, slug público.
  - Integración para subir logo y banner (almacenar en InsForge Storage o guardar URLs directamente).
  - Generador visual de código QR con el link público al menú digital.
  - Sub-pestaña para configurar visibilidad de la carta existente (guardando y actualizando filas en `digital_menu_items`).

## Tarea 4: Módulo de Pedidos y Realtime (Escritorio - POS)
- [ ] Crear el componente `src/features/pedidos/components/Pedidos.tsx`:
  - Listado de pedidos agrupados por estado (`pending`, `confirming`, `accepted`).
  - Suscripción WebSocket a `postgres_changes` sobre `digital_orders` filtrando por `tenant_id` y `sucursal_id`.
  - Sonido de alerta al recibir un pedido nuevo en estado `'pending'`.
- [ ] Implementar acciones sobre los pedidos:
  - **Confirmar**: pasar estado a `'confirming'`.
  - **Rechazar**: pedir motivo opcional en un modal, guardar en `rejection_reason` y pasar a `'rejected'`.
  - **Aceptar**:
    - Cambiar estado a `'accepted'`.
    - Generar la fila correspondiente en `comandas` mapeando los ítems seleccionados y guardando la comanda con estado `'pendiente'` y creador `'Menú Digital'`.
- [ ] Registrar la ruta `/pedidos` en `src/app/routes.tsx` y añadir el botón al menú lateral en `src/app/components/AppLayout.tsx`.
