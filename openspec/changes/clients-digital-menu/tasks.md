# Tasks - Clientes + Menu Digital

## 1. Discovery
- [ ] Verificar proyecto InsForge actual con CLI.
- [ ] Inspeccionar tablas reales de ventas/facturas/productos/planes/tenants.
- [ ] Confirmar rutas/componentes actuales de cobro, pedidos, soporte y carta.

## 2. Database
- [ ] Crear migracion customers.
- [ ] Agregar customer_id nullable a ventas/facturas.
- [ ] Crear migraciones digital_menu_settings, digital_menu_items, digital_orders, digital_order_items.
- [ ] Agregar indices, constraints y RLS por negocio.

## 3. Clientes
- [ ] Crear repositorio/servicio de clientes.
- [ ] Crear listado, busqueda, crear, editar, eliminar.
- [ ] Crear detalle con historial y resumen de gasto.

## 4. Cobro y factura
- [ ] Agregar selector opcional de cliente al popup de cobrar.
- [ ] Persistir customer_id en venta/factura.
- [ ] Mostrar cliente en factura/recibo.

## 5. Menu digital admin
- [ ] Crear seccion Soporte > Menu Digital.
- [ ] Configurar estado, slug legible `/nombre-del-restaurante`, fotos, tema y QR.
- [ ] Personalizar visibilidad/fotos/textos de la carta existente.

## 6. Menu publico y pedidos
- [ ] Crear ruta publica por slug con formato /nombre-del-restaurante, leyendo el menu desde base de datos.
- [ ] Crear carrito y formulario con nombre obligatorio.
- [ ] Guardar pedido pendiente en base de datos.
- [ ] Suscribir el modulo Pedidos a eventos en tiempo real por negocio.
- [ ] Crear nuevo modulo Pedidos con lista en tiempo real.
- [ ] Implementar estado de confirmacion/contacto con cliente antes de aceptar.
- [ ] Implementar aceptar/rechazar.

## 7. Verification
- [ ] Ejecutar typecheck/build/tests.
- [ ] Probar plan basico y profesional.
- [ ] Probar RLS/multi-tenant.


