# Spec + Tasks — PR 9: Cuentas por Cobrar + Fiado en POS

**Change**: `cuentas-cobrar-feature`
**Estimated lines**: ~550 | **Budget risk**: High (Exceeds 400-line budget limit; requires size exception or splitting)

---

## Spec

### Invariantes

1. Al cobrar una cuenta en el POS usando el método de pago `"fiado"`, es obligatorio que un cliente esté seleccionado (`selectedCustomer !== null`).
2. Al seleccionar `"fiado"`, la factura generada se creará con `estado === "pendiente"`.
3. Al emitir una factura de tipo `"fiado"`, se registrará automáticamente un registro en `cuentas_cobrar` asociado al cliente y a la factura, por el total adeudado y con fecha de vencimiento a 30 días por defecto.
4. Cada abono realizado a una cuenta por cobrar debe registrarse en `cxc_pagos`. El abono no puede superar el balance pendiente de la cuenta (`monto_total - monto_pagado`).
5. Al recibir un abono en `cxc_pagos`, se actualizan los campos `monto_pagado` y `estado` (`'pendiente'` | `'parcial'` | `'pagada'`) en la tabla `cuentas_cobrar` de forma reactiva/incremental.
6. Si el método de pago del abono es `"efectivo"`, se requiere obligatoriamente que exista un ciclo operativo activo (caja abierta) en `cierres_operativos` de la sucursal actual.
7. Los abonos en efectivo registrados en `cxc_pagos` enlazados al ciclo operativo activo se incluirán dinámicamente en los reportes e impresiones de cierre (`Cierre.tsx`) como un ingreso de caja en el desglose de métodos de pago y cálculo neto de caja.

---

## Tasks

### Task 1: Crear la migración SQL de la Base de Datos
**Archivo**: `migrations/20260608180000_add-cuentas-cobrar-tables.sql`

- Crear las tablas `cuentas_cobrar` y `cxc_pagos`.
- Habilitar RLS con aislamiento multi-tenant y roles operativos (`admin`, `cajera`, `cajero`, `ventas`).
- Bloquear actualizaciones/borrados directos en `cxc_pagos` (inmutabilidad histórica).
- Crear índices por `tenant_id`, `customer_id`, `estado` y `cuenta_cobrar_id`.

### Task 2: Configurar Sincronización Local-First
**Archivo**: `src/shared/lib/localFirst.ts`

- Agregar `"cuentas_cobrar"` y `"cxc_pagos"` a `LOCAL_FIRST_MIRROR_TABLES` y `LOCAL_FIRST_HISTORY_TABLES`.
- Incrementar `DB_VERSION` a `7`.

### Task 3: Integrar Método de Pago Fiado en POS
**Archivo**: `src/features/billing/components/MesaCloseAccountModal.tsx`

- Ampliar el tipo de `paymentMethod` para incluir `"fiado"`.
- Mostrar el botón `"Fiado"` con el icono `"🤝"`.
- En `createInvoice` y `createSplitInvoices`, si `paymentMethod === "fiado"`, validar que exista un cliente seleccionado.
- En ambos métodos, si es `"fiado"`, crear la factura con `estado === "pendiente"`, y encolar la inserción en `cuentas_cobrar` con fecha de vencimiento a 30 días.

### Task 4: Desarrollar el Servicio de Cuentas por Cobrar
**Archivos**: `src/features/cuentas-cobrar/lib/accountsReceivableService.ts` y `.test.ts`

- Escribir `registrarPagoCxC` validando balances, ciclo activo para pagos en efectivo, y encolando la inserción en `cxc_pagos` y actualización de `cuentas_cobrar`.
- Escribir pruebas unitarias que cubran abono parcial, liquidación completa y casos de error (monto excedido, ciclo cerrado).

### Task 5: Desarrollar el Componente UI de Cuentas por Cobrar
**Archivo**: `src/features/cuentas-cobrar/components/CuentasCobrar.tsx`

- Diseñar panel interactivo que muestre:
  - Resumen ejecutivo de cuentas por cobrar (monto total adeudado, cobrado, pendiente).
  - Pestañas para filtrar deudas en `'pendientes'` y `'pagadas'`.
  - Historial de abonos de la deuda seleccionada.
  - Modal para registrar nuevos abonos.

### Task 6: Integrar Rutas e Iconos en el Sidebar
**Archivos**: `src/app/components/AppLayout.tsx` y `src/app/routes.tsx`

- Registrar la ruta `/cuentas-cobrar` en `routes.tsx` dirigida al módulo lazy-loaded.
- Agregar la opción en el sidebar bajo la sección Finanzas en `AppLayout.tsx`, habilitándolo para los roles `admin` y `cajera` bajo la feature `accounts_receivable`.
- Agregar el soporte del icono `"cxc"` en `SidebarCustomIcon` con un SVG de tarjeta/cobro modificado.

### Task 7: Integrar CxC al Cierre de Caja
**Archivo**: `src/features/cierre/components/Cierre.tsx`

- Modificar `cargar` y el método de cerrado para incluir la carga de `cxc_pagos` del ciclo.
- Sumar los abonos de CxC en efectivo en `resumen` para que afecten el efectivo neto de caja.
- Sincronizar el método de desglose en el ticket térmico para incluir los cobros realizados.

---

## Review Workload Forecast

- **Chained PRs recommended**: Yes (if user prefers to keep diffs extremely focused, we can split the database/backend work in PR 9a, and the UI work in PR 9b).
- **400-line budget risk**: High (The addition of the UI file along with service, SQL, and configurations will likely total ~550 lines).
- **Decision needed before apply**: Yes (User must choose between chained PRs or accepting a single PR size exception).
