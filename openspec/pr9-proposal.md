# Propuesta — PR 9: Cuentas por Cobrar + Fiado en POS

**Change**: `cuentas-cobrar-feature`
**Branch**: `feature/cuentas-cobrar-feature`

---

## Objetivos del Cambio

1. **Esquema de BD e IndexedDB**: Crear las tablas `cuentas_cobrar` y `cxc_pagos` con RLS, multi-tenant e índices. Integrar estas tablas a `localFirst.ts` e incrementar `DB_VERSION` a `7`.
2. **POS Checkout**: Registrar el método de pago `"fiado"`. Validar selección de cliente. Crear facturas con estado `"pendiente"` y registrar la deuda asociada en `cuentas_cobrar`.
3. **Servicio CxC**: Implementar `registrarPagoCxC` con validación de ciclo activo para efectivo, y encolado de transacciones locales.
4. **UI CxC**: Módulo de gestión en `/cuentas-cobrar` para ver balances por cliente, historial de abonos y registrar nuevos abonos.
5. **Cierre de Caja**: Sincronizar abonos de CxC en efectivo con el total de caja y métodos de pago de `Cierre.tsx`.

---

## Diseño del Sistema

### 1. Rutas y Navegación
- Agregar ruta `/cuentas-cobrar` en `src/app/routes.tsx`.
- Añadir enlace lateral `"Cuentas por Cobrar"` con icono `"cxc"` en `AppLayout.tsx` bajo la sección `"Finanzas"`.

### 2. POS (`MesaCloseAccountModal.tsx`)
- Añadir el botón `"Fiado"` con icono `"🤝"` a los métodos de pago.
- En `createInvoice` y `createSplitInvoices`, si `paymentMethod === "fiado"`, validar `selectedCustomer != null`, colocar `estado: "pendiente"` a la factura, y encolar la inserción en `cuentas_cobrar` con vencimiento a 30 días.

### 3. Servicio de Cobros (`accountsReceivableService.ts`)
- `registrarPagoCxC`:
  - Validar que el monto del abono no supere la deuda restante.
  - Si `metodo_pago === "efectivo"`, validar y asociar al ciclo de caja abierto (`cycle_id`).
  - Encolar inserción en `cxc_pagos`.
  - Encolar actualización de `monto_pagado` y `estado` (`'parcial'` o `'pagada'`) en `cuentas_cobrar`.

### 4. Integración del Flujo de Caja (`Cierre.tsx`)
- En `Cierre.tsx`, cargar `cxc_pagos` correspondientes al ciclo operativo.
- Sumar los abonos a CxC en efectivo al total de caja y al desglose por métodos de pago de la jornada.

---

## Análisis de Riesgos

- **Riesgo**: Venta al fiado sin cliente asignado.
  - *Mitigación*: Validar estrictamente en el modal de cierre que un cliente esté seleccionado antes de emitir la factura.
- **Riesgo**: Monto del abono superior a la deuda.
  - *Mitigación*: En `registrarPagoCxC` verificar que el abono sea menor o igual al balance pendiente.
