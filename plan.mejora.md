# Plan de mejora: Clientes + Menu Digital

Fecha: 2026-06-06
Proyecto: Cyberbistro / Cloudix
Estado: plan inicial

## Objetivo

Implementar dos bloques de producto conectados entre si:

1. Modulo de clientes para el plan basico y superior.
2. Menu digital administrable para el plan profesional, con pedidos desde QR y aprobacion del negocio.

La idea NO es solo agregar pantallas. La base correcta es modelar dominio, permisos por plan, historial y trazabilidad de ventas/pedidos. Sin eso despues se vuelve una pared torcida: parece rapido, pero todo lo que construis arriba queda fragil.

## Alcance funcional

### 1. Modulo de clientes

Disponible para plan basico.

#### Funciones principales

- Crear cliente.
- Editar cliente.
- Eliminar cliente, preferentemente soft delete si existen facturas asociadas.
- Buscar/filtrar clientes.
- Ver detalle del cliente.
- Ver historial del cliente:
  - Facturas asociadas.
  - Total gastado.
  - Ultima compra.
  - Cantidad de facturas/compras.
- Seleccionar cliente opcionalmente en el popup de cobrar.
- Mostrar el cliente en la factura cuando se haya seleccionado.

#### Campos sugeridos de cliente

- id
- business_id / tenant_id
- name
- phone
- email
- document_id / rnc / cedula opcional
- address opcional
- notes opcional
- created_at
- updated_at
- deleted_at opcional

### 2. Cobro con cliente opcional

En el popup de cobrar:

- Agregar input/select buscable de cliente.
- La seleccion es opcional.
- Permitir cobrar sin cliente, como hoy.
- Si se selecciona cliente:
  - Guardar customer_id en la venta/factura.
  - Mostrar nombre/documento del cliente en la factura.
  - Asociar la factura al historial del cliente.

Regla importante: no bloquear el flujo rapido de venta. El cajero tiene que poder cobrar en segundos. El selector de cliente no puede volver lenta la caja.

### 3. Menu digital profesional

Disponible para plan profesional.

#### Administracion desde soporte

Agregar seccion en soporte llamada `Menu Digital`.

Desde ahi el negocio puede:

- Activar/desactivar menu digital.
- Configurar informacion publica del negocio.
- Subir o cambiar fotos.
- Personalizar cartas existentes para el menu digital.
- Definir visibilidad de productos/categorias.
- Personalizar textos, portada, logo/banner y colores basicos.
- Obtener/ver QR del menu digital.
- Configurar o generar automaticamente el link publico con formato /nombre-del-restaurante.

#### Relacion con QR actual

Para el plan profesional:

- El QR debe apuntar al menu digital publico.
- Si el negocio no tiene menu digital activo, mostrar estado/configuracion pendiente.
- Mantener compatibilidad con el QR anterior si existe, pero la experiencia principal debe ser el menu digital.

### 4. Pedido desde menu digital

El cliente final, desde el menu digital publico:

Regla tecnica: el menu publico se despliega desde la base de datos. La URL /nombre-del-restaurante lee digital_menu_settings, categorias/productos visibles y personalizaciones desde InsForge/Postgres. No debe depender de contenido hardcodeado.

- Ve categorias/productos disponibles.
- Agrega productos al pedido.
- Ingresa su nombre obligatorio.
- Opcionalmente ingresa telefono/nota.
- Envia el pedido.
- El pedido se guarda en base de datos y aparece en tiempo real en el modulo Pedidos.

El negocio ve el pedido en un nuevo modulo Pedidos, en tiempo real:

- Estado inicial: pendiente.
- Puede contactar/confirmar con el cliente antes de aceptar.
- Puede aceptar o rechazar.
- Si acepta, el pedido pasa al flujo operativo correspondiente.
- La confirmacion humana evita pedidos falsos, bromas o pedidos hechos por cualquiera sin intencion real.
- Si rechaza, queda registrado con motivo opcional.

Estados sugeridos:

- pending
- confirming
- accepted
- rejected
- preparing opcional
- completed opcional
- cancelled opcional

## Modelo de datos propuesto

Usar migraciones de InsForge, no SQL suelto para cambios permanentes.

### customers

Tabla para clientes del negocio.

Campos clave:

- id uuid primary key
- business_id uuid not null
- name text not null
- phone text
- email text
- document_id text
- address text
- notes text
- created_at timestamptz default now()
- updated_at timestamptz default now()
- deleted_at timestamptz

Indices:

- business_id
- lower(name)
- phone
- email

### invoices / sales

Modificar tabla existente de ventas/facturas:

- customer_id uuid nullable references customers(id)

Si la tabla real no se llama invoices/sales, adaptar al nombre existente.

### digital_menu_settings

Configuracion del menu digital por negocio.

Campos clave:

- id uuid primary key
- business_id uuid unique not null
- enabled boolean default false
- public_slug text unique not null -- usado en la URL publica: /nombre-del-restaurante
- title text
- description text
- logo_url text
- banner_url text
- theme jsonb
- qr_url text opcional/cacheado
- created_at
- updated_at

### digital_menu_items

Personalizacion publica de productos/cartas existentes.

Campos clave:

- id uuid primary key
- business_id uuid not null
- source_product_id uuid nullable
- source_category_id uuid nullable
- display_name text
- description text
- image_url text
- visible boolean default true
- sort_order int default 0
- custom_price numeric opcional, solo si el negocio puede sobrescribir precio
- created_at
- updated_at

Nota: si ya existe una carta/productos en el sistema, no duplicar innecesariamente. Esta tabla debe actuar como capa de personalizacion sobre la carta existente.

### digital_orders

Estos pedidos deben emitirse/consultarse en tiempo real desde la base de datos para que el modulo Pedidos se actualice sin refrescar pantalla.

Pedidos enviados desde menu digital.

Campos clave:

- id uuid primary key
- business_id uuid not null
- customer_name text not null
- customer_phone text
- status text not null default 'pending'
- total numeric not null default 0
- notes text
- rejection_reason text
- accepted_at timestamptz
- rejected_at timestamptz
- created_at
- updated_at

### digital_order_items

Items del pedido digital.

Campos clave:

- id uuid primary key
- order_id uuid references digital_orders(id)
- product_id uuid nullable
- name_snapshot text not null
- price_snapshot numeric not null
- quantity int not null
- notes text
- subtotal numeric not null

## Permisos y planes

- Plan basico: clientes + seleccion de cliente al cobrar + historial.
- Plan profesional: todo lo anterior + menu digital + QR publico + pedidos desde menu.

Validar permisos en dos capas:

1. UI: ocultar o bloquear modulos segun plan.
2. Backend/RLS/API: impedir acceso aunque alguien manipule el frontend.

## Plan de implementacion

### Fase 0 - Verificacion tecnica

- Revisar esquema actual con InsForge CLI:
  - `npx @insforge/cli current`
  - `npx @insforge/cli metadata --json`
  - `npx @insforge/cli db tables`
  - `npx @insforge/cli db migrations list`
- Identificar tabla real de ventas/facturas.
- Identificar tabla real de productos/carta.
- Identificar como se modelan negocios/tenants y planes.

### Fase 1 - Base de datos

- Crear migracion para customers.
- Agregar customer_id nullable a ventas/facturas.
- Crear migraciones para digital_menu_settings, digital_menu_items, digital_orders y digital_order_items.
- Agregar indices y constraints.
- Definir RLS/policies por business_id/tenant_id.

### Fase 2 - Servicios/repositorios

- Crear capa de acceso a clientes.
- Crear queries de historial:
  - total gastado
  - facturas del cliente
  - metricas resumidas
- Crear capa de menu digital.
- Crear capa de pedidos digitales.

### Fase 3 - UI clientes

- Agregar modulo `Clientes` en la navegacion correspondiente.
- Pantalla de listado.
- Dialog/form para crear/editar.
- Accion de eliminar.
- Pantalla/drawer de detalle con historial.

### Fase 4 - Cobro

- Integrar selector buscable de cliente en popup de cobrar.
- Guardar customer_id en venta/factura.
- Mostrar datos del cliente en factura/recibo.
- Mantener flujo sin cliente sin friccion.

### Fase 5 - Administracion de menu digital

- Agregar seccion `Soporte > Menu Digital`.
- Formulario de configuracion.
- Subida/seleccion de imagenes.
- Personalizacion de cartas/productos visibles.
- Vista/accion para QR publico.

### Fase 6 - Menu publico y pedidos

- Crear ruta publica del menu por slug/QR con formato /nombre-del-restaurante.
- Mostrar categorias/productos visibles.
- Carrito simple.
- Formulario con nombre obligatorio.
- Crear pedido pendiente en base de datos.
- Suscribirse en tiempo real a nuevos pedidos/cambios de estado por negocio.
- Mostrar pedidos digitales en modulo `Pedidos`.
- Acciones aceptar/rechazar.

### Fase 7 - QA y reglas de negocio

- Testear plan basico vs profesional.
- Testear cobrar con y sin cliente.
- Testear factura con cliente.
- Testear historial del cliente.
- Testear menu publico con QR.
- Testear pedido pendiente, confirmando, aceptado y rechazado.
- Testear llegada de pedidos en tiempo real sin refrescar.
- Testear RLS/multi-tenant.

## Criterios de aceptacion

- Un usuario de plan basico puede administrar clientes.
- Una venta puede cobrarse sin cliente o con cliente seleccionado.
- Una factura con cliente muestra los datos del cliente.
- El detalle del cliente muestra historial y total gastado.
- Un usuario de plan profesional puede configurar menu digital desde soporte.
- El QR profesional abre el menu digital publico con URL legible tipo /nombre-del-restaurante.
- Un cliente final puede pedir desde el menu con su nombre.
- El negocio ve el pedido en pedidos y puede aceptarlo o rechazarlo.
- Un usuario sin plan profesional no puede usar menu digital aunque fuerce la URL.

## Riesgos

- Si ventas/facturas no tienen una entidad clara, primero hay que ordenar ese modelo antes de meter customer_id.
- Si la carta actual mezcla producto, categoria y UI, conviene crear una capa de personalizacion en vez de duplicar productos.
- Si no hay tenant/business_id consistente, RLS y seguridad quedan fragiles.
- Si el popup de cobrar se sobrecarga, se rompe la velocidad de caja. El selector de cliente debe ser opcional y rapido.

## Orden recomendado

Primero clientes + cobro. Despues menu digital. Motivo: clientes toca el core de facturacion y genera base para historial; menu digital depende de tener bien modelado pedidos/productos/negocio.


