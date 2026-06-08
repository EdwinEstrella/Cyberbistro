# Spec + Tasks — PR 8: Cuentas por Pagar

**Change**: `cuentas-pagar-feature`
**Estimated lines**: ~500 | **Budget risk**: High (Exceeds 400-line budget limit; requires size exception or splitting)

---

## Spec

### Invariantes

1. Al insertar una compra de tipo `"credito"`, se debe generar automáticamente una cuenta por pagar (`cuentas_pagar`) por el total de la compra con fecha de vencimiento por defecto a 30 días.
2. Cada abono realizado a una cuenta por pagar debe insertarse en `cxp_pagos`. El abono no puede superar el balance pendiente de la cuenta (`monto_total - monto_pagado`).
3. Al recibir un abono en `cxp_pagos`, se actualizan los campos `monto_pagado` y `estado` en la tabla `cuentas_pagar` de forma reactiva/incremental.
4. Si el método de pago del abono es `"efectivo"`, se requiere obligatoriamente que exista un ciclo operativo activo (caja abierta) en `cierres_operativos`. De lo contrario, se debe rechazar el pago.
5. Si el método de pago del abono es `"efectivo"`, se encolará de manera complementaria un egreso en la tabla `gastos` asociado al ciclo operativo activo y a la categoría `"Compras"` o `"Pagos a Proveedores"`.
6. Las políticas RLS deben autorizar a los administradores y personal de caja a registrar e interactuar con las cuentas por pagar y pagos.

---

## Tasks

### Task 1: Crear la migración SQL de la Base de Datos
**Archivo**: `migrations/20260608170000_add-cuentas-pagar-tables.sql`

- Definir la estructura de `cuentas_pagar` y `cxp_pagos`.
- Aplicar políticas RLS para multi-tenant y perfiles de usuario.
- Crear índices para búsquedas optimizadas por `tenant_id`, `proveedor_id` y `estado`.

### Task 2: Configurar Sincronización Local-First
**Archivo**: `src/shared/lib/localFirst.ts`

- Agregar `"cuentas_pagar"` y `"cxp_pagos"` a `LOCAL_FIRST_MIRROR_TABLES` y `LOCAL_FIRST_HISTORY_TABLES`.
- Incrementar `DB_VERSION` a `6`.

### Task 3: Integrar Rutas e Iconos en el Sidebar
**Archivos**: `src/app/components/AppLayout.tsx` y `src/app/routes.tsx`

- Agregar ruta `/cuentas-pagar` en `routes.tsx` direccionada al módulo lazy-loaded.
- Agregar el SVG del icono `"cxp"` en `SidebarCustomIcon` de `AppLayout.tsx`.
- Registrar el menú lateral `"Cuentas por Pagar"` bajo Finanzas y permitir el acceso al rol `cajera`.

### Task 4: Integración en Compras a Crédito
**Archivo**: `src/features/compras/lib/purchaseService.ts`

- Modificar `registrarCompra` para que, cuando `tipoPago === "credito"`, encole la creación de la deuda en `cuentas_pagar`.

### Task 5: Desarrollar el Servicio de Cuentas por Pagar
**Archivo**: `src/features/cuentas-pagar/lib/accountsPayableService.ts` y `.test.ts`

- Escribir `registrarPagoCxP` validando balances, ciclo activo (para efectivo) e insertando registros en `cxp_pagos`, `cuentas_pagar` y `gastos`.
- Agregar pruebas unitarias cubriendo amortización parcial, liquidación total y rechazos.

### Task 6: Desarrollar el Componente UI de Cuentas por Pagar
**Archivo**: `src/features/cuentas-pagar/components/CuentasPagar.tsx`

- Diseñar panel interactivo con:
  - Resumen ejecutivo de deudas (total adeudado, vencido, pagado).
  - Pestañas de filtrado: `'pendientes'`, `'pagadas'`.
  - Botón "Registrar Abono" por fila, que abra modal para ingresar el monto y seleccionar método de pago.
  - Tabla histórica de abonos.

---

## Review Workload Forecast

- **Chained PRs recommended**: Yes (if user prefers to keep diffs extremely focused, we can split the database/backend work in PR 8a, and the UI work in PR 8b).
- **400-line budget risk**: High (The addition of the UI file along with service, SQL, and configurations will likely total ~500 lines).
- **Decision needed before apply**: Yes (User must choose between chained PRs or accepting a single PR size exception).
