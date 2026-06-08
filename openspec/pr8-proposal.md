# Propuesta — PR 8: Cuentas por Pagar

**Change**: `cuentas-pagar-feature`
**Branch**: `feature/cuentas-pagar-feature`

---

## Objetivos del Cambio

1. Crear las tablas de base de datos `cuentas_pagar` y `cxp_pagos` con aislamiento multi-tenant y políticas RLS operativas.
2. Registrar las nuevas tablas en el outbox de sincronización y configurar IndexedDB local-first (`localFirst.ts`).
3. Automatizar la creación de deudas (`cuentas_pagar`) al registrar compras a crédito (`tipoPago === "credito"`).
4. Implementar el módulo UI de Cuentas por Pagar (`CuentasPagar.tsx`) con visualización de deudas, historial de pagos y registro de nuevos abonos.
5. Sincronizar los pagos en efectivo de CxP con el flujo de gastos operativos de la sucursal actual.

---

## Diseño del Sistema

### 1. Actualizaciones de Navegación y Rutas
- Registrar la ruta `/cuentas-pagar` en `routes.tsx`.
- Añadir el menú lateral `"Cuentas por Pagar"` con icono `"cxp"` bajo la categoría `"Finanzas"` en `AppLayout.tsx`.

### 2. Automatización compras a crédito (`purchaseService.ts`)
- Cuando `tipoPago === "credito"`, encolar una inserción en `cuentas_pagar` con el total de la compra y fecha de vencimiento a 30 días.

### 3. Servicio de Pagos (`accountsPayableService.ts`)
- Implementar `registrarPagoCxP` para descontar el saldo, registrar el abono en `cxp_pagos`, actualizar el estado de la cuenta por pagar a `'parcial'` o `'pagada'`, e insertar un gasto en efectivo si corresponde.

---

## Análisis de Riesgos

- **Riesgo**: Desincronización de saldos (`monto_pagado` superior a `monto_total`).
  - *Mitigación*: Validar en `registrarPagoCxP` que el monto del abono no exceda la deuda restante.
- **Riesgo**: Sobrecarga de cambios (exceder el límite de 400 líneas).
  - *Mitigación*: Mantener el componente de UI conciso utilizando componentes Tailwind CSS existentes, o solicitar una excepción de tamaño al usuario.
