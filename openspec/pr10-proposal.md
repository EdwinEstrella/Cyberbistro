# Propuesta — PR 10: Analíticas Financieras Ampliadas

**Change**: `analytics-finance-extension`
**Branch**: `feature/analytics-finance-extension`

---

## Objetivos del Cambio

1. **Pestaña Finanzas Pro**: Implementar la vista `"finanzas"` dentro del dashboard `Billing.tsx`, visible mediante verificación de feature `finance_reports`.
2. **KPIs Financieros**: Mostrar 4 tarjetas métricas dedicadas para carteras pendientes (CxC/CxP) y flujos cobrados/abonados en el período.
3. **Top Listas**: Tablas resumen de deudores y proveedores clave para análisis de riesgo y cobros rápidos.
4. **Libro Diario de Transacciones**: Tabla consolidada histórica de cobros (`cxc_pagos`) y abonos (`cxp_pagos`) con formato homogéneo, orden cronológico y filtros de método de pago.

---

## Diseño del Sistema

### 1. Extensión del Tipo de Vista
- Modificar el tipo `BillingView` a `"facturas" | "ciclos" | "finanzas"`.

### 2. Extensión de la Carga de Datos (`loadBillingData`)
- Encolar búsquedas asíncronas para:
  - `cuentas_cobrar` y `cxc_pagos`
  - `cuentas_pagar` y `cxp_pagos`
  - `customers` y `proveedores`
- Filtrar la información para que respete la sucursal activa (`activeSucursalId`).

### 3. Computación de Métricas del Período
- Calcular dinámicamente:
  - Deuda total activa de clientes (`cuentas_cobrar` no pagadas, sumando `monto_total - monto_pagado`).
  - Deuda total activa de proveedores (`cuentas_pagar` no pagadas, sumando `monto_total - monto_pagado`).
  - Suma de abonos hechos a proveedores (`cxp_pagos` filtrados por fecha).
  - Suma de cobros recibidos de clientes (`cxc_pagos` filtrados por fecha).

---

## Análisis de Riesgos

- **Riesgo**: Sobrecarga de renders debido al número de tablas cargadas simultáneamente.
  - *Mitigación*: Utilizar `Promise.all` para paralelizar las consultas asíncronas a IndexedDB/Backend, y actualizar los estados en bloque.
- **Riesgo**: Falta de consistencia en el orden de fechas.
  - *Mitigación*: Homogeneizar la ordenación en memoria ordenando la lista consolidada de transacciones mediante `new Date(fecha).getTime()`.
