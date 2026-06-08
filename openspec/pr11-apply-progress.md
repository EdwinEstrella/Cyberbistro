# Progreso de Implementación: Menú Digital Administrable (PR 11)

Este documento registra el progreso de cada una de las tareas y hitos de la PR 11.

## Estado General
- **Estado**: Tarea 1 completada. Listo para comenzar Tarea 2.
- **Riesgos**:
  - Asegurar la propagación de RLS para el canal público de Next.js.
  - Asegurar que la inserción de comandas al aceptar pedidos digitales se haga bajo el contexto de sincronización local-first.

## Tareas

### Tarea 1: Base de Datos y Local-First
- [x] Crear la migración SQL `migrations/20260608190000_add-digital-menu-tables.sql`.
- [x] Registrar las nuevas tablas en `src/shared/lib/localFirst.ts`.
- [x] Incrementar `DB_VERSION` a `8`.
- [x] Aplicar migraciones en base de datos.

### Tarea 2: Web Pública de Menú (Next.js - website/claudix)
- [ ] Configurar variables de entorno y cliente de InsForge en Next.js.
- [ ] Crear la ruta dinámica `website/claudix/app/[slug]/page.tsx`.
- [ ] Implementar listado, carrito y checkout.
- [ ] Enviar pedido y persistir en la base de datos central.

### Tarea 3: Panel de Administración (Soporte > Menú Digital)
- [ ] Agregar la pestaña "Menú Digital" en `/soporte`.
- [ ] Formulario de configuración general del menú.
- [ ] Generación visual de código QR.
- [ ] Configuración de visibilidad de productos de la carta en `digital_menu_items`.

### Tarea 4: Módulo de Pedidos y Realtime (POS)
- [ ] Crear componente `src/features/pedidos/components/Pedidos.tsx`.
- [ ] Integrar suscripción WebSocket de InsForge.
- [ ] Implementar flujo Aceptar/Rechazar/Confirmar.
- [ ] Automatizar la generación de comandas en estado pendiente al aceptar pedidos.
- [ ] Registrar la ruta en routes y sidebar layout.
