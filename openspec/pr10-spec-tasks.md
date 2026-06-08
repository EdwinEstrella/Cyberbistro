# Spec + Tasks — PR 10: Analíticas Financieras Ampliadas

**Change**: `analytics-finance-extension`
**Estimated lines**: ~350 | **Budget risk**: Low (Under 400-line budget limit)

---

## Spec

### Invariantes

1. La pestaña `"Finanzas Pro"` solo estará visible si el plan del tenant tiene acceso a la feature `"finance_reports"`.
2. El dashboard debe filtrar toda la información financiera (CxC, CxP, pagos y abonos) para que corresponda únicamente a la sucursal activa (`activeSucursalId`).
3. Las tarjetas KPI de la pestaña `"Finanzas Pro"` deben recalcularse dinámicamente con base en las deudas activas globales de la sucursal y los pagos realizados en el rango de fechas seleccionado (`dateFrom` y `dateTo`).
4. El listado de deudores principales y acreedores principales mostrará a los Top 5 contactos ordenados de mayor a menor saldo pendiente.
5. El libro de transacciones consolidado listará de forma unificada tanto los abonos a CxP como los cobros de CxC, ordenados cronológicamente de forma descendente.

---

## Tasks

### Task 1: Importar canUseFeature
**Archivo**: `src/features/billing/components/Billing.tsx`

- Importar `canUseFeature` desde `../../../shared/lib/planFeatures`.

### Task 2: Declarar Estados del Dashboard
**Archivo**: `src/features/billing/components/Billing.tsx`

- Ampliar el tipo `BillingView` a `"facturas" | "ciclos" | "finanzas"`.
- Añadir estados de React para `cuentasCobrar`, `cxcPagos`, `cuentasPagar`, `cxpPagos`, `customers` y `proveedores`.

### Task 3: Actualizar loadBillingData
**Archivo**: `src/features/billing/components/Billing.tsx`

- Consultar las nuevas tablas de forma local-first u online según corresponda.
- Filtrar cada listado por sucursal activa (`activeSucursalId`).

### Task 4: Implementar Renderizado de KPIs y Selector de Vista
**Archivo**: `src/features/billing/components/Billing.tsx`

- Mostrar la pestaña `"Finanzas Pro"` en el selector de vistas si se cumple `canUseFeature(plan, "finance_reports")`.
- Renderizar 4 tarjetas KPI cuando `view === "finanzas"`:
  1. Deuda Clientes (CxC)
  2. Deuda Proveedores (CxP)
  3. Cobros del Período
  4. Abonos del Período

### Task 5: Implementar Dashboard Finanzas Pro
**Archivo**: `src/features/billing/components/Billing.tsx`

- Diseñar la sección `"Finanzas Pro"` que muestre:
  - Top 5 Clientes Deudores.
  - Top 5 Proveedores Acreedores.
  - Tabla de Transacciones Consolidadas (ingresos por cobros a clientes y egresos por pagos a proveedores), respetando los filtros de fecha, método de pago y paginación.
- Actualizar el panel derecho para que cuando `view === "finanzas"` muestre el Balance Financiero Consolidado (Total cobrado - Total pagado).

---

## Review Workload Forecast

- **Chained PRs recommended**: No (The changes are local to a single file, `Billing.tsx`, and the estimated size is under 350 lines).
- **400-line budget risk**: Low.
- **Decision needed before apply**: No.
