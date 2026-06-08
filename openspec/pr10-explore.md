# Exploración — PR 10: Analíticas Financieras Ampliadas

**Change**: `analytics-finance-extension`
**Branch**: `feature/analytics-finance-extension`

---

## Objetivos del Cambio

1. **Dashboard de Analíticas Ampliado (Finanzas Pro)**:
   - Extender el módulo de analíticas en `src/features/billing/components/Billing.tsx` agregando una tercera pestaña `"Finanzas Pro"`.
   - Restringir la visibilidad de esta pestaña a los tenants que cuenten con la feature `"finance_reports"` (del Plan Profesional o superior).
2. **Carga e Integración de Datos Financieros**:
   - Modificar la función `loadBillingData` para consultar y cachear de forma híbrida (local-first/online) las tablas `cuentas_cobrar`, `cxc_pagos`, `cuentas_pagar`, `cxp_pagos`, `customers` y `proveedores`.
3. **Métricas Clave (KPIs)**:
   - Mostrar métricas agregadas del período filtrado:
     - **Deuda Pendiente de Clientes (CxC)**: Total que los clientes nos deben.
     - **Deuda Pendiente a Proveedores (CxP)**: Total que debemos a proveedores.
     - **Cobros Realizados**: Suma de pagos recibidos en `cxc_pagos`.
     - **Abonos Realizados**: Suma de pagos efectuados en `cxp_pagos`.
4. **Análisis de Deudores y Acreedores**:
   - Listar los Top 5 clientes con mayor saldo deudor y Top 5 proveedores con mayor saldo acreedor.
5. **Historial de Transacciones Unificado**:
   - Mostrar una tabla cronológica unificada de transacciones que consolide tanto abonos a CxP como cobros a CxC, permitiendo filtrar por rango de fechas y método de pago.

---

## Análisis de Integración en el Flujo de Datos (`Billing.tsx`)

1. **Estados del Componente**:
   - Añadir `cuentasCobrar`, `cxcPagos`, `cuentasPagar`, `cxpPagos`, `customers` y `proveedores` como estados principales del componente `Billing.tsx`.
2. **Carga Dinámica**:
   - Consultar la base de datos IndexedDB o el backend utilizando el patrón `shouldReadLocalFirst` y `readLocalMirror` para cada una de las tablas.
3. **Filtrado por Fecha**:
   - Aplicar el rango de fechas `dateFrom` y `dateTo` para delimitar las transacciones y pagos históricos en la UI.
