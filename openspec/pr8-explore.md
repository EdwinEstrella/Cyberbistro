# Exploración — PR 8: Cuentas por Pagar

**Change**: `cuentas-pagar-feature`
**Branch**: `feature/cuentas-pagar-feature`

---

## Objetivos del Cambio

1. **Diseño de Base de Datos para Cuentas por Pagar (CxP)**:
   - Crear las tablas `cuentas_pagar` y `cxp_pagos` en PostgreSQL con políticas RLS y soporte multi-tenant.
   - Soportar el ciclo de vida de las deudas: `monto_total`, `monto_pagado`, `estado` (`'pendiente'` | `'parcial'` | `'pagada'`), `fecha_emision` y `fecha_vencimiento`.
2. **Local-First Sync e IndexedDB**:
   - Registrar `cuentas_pagar` y `cxp_pagos` en el sistema de sincronización local (`localFirst.ts`) para habilitar la persistencia offline de la cartera de proveedores.
   - Incrementar `DB_VERSION` a `6` para migrar los esquemas locales IndexedDB en el cliente.
3. **Integración con Compras a Crédito**:
   - Enlazar el servicio `registrarCompra` para que, si `tipoPago === "credito"`, se genere automáticamente un registro de cuenta por pagar (`cuentas_pagar`) asociado a la compra y al proveedor.
4. **Módulo de Gestión Financiera (CxP UI)**:
   - Crear un nuevo módulo en `src/features/cuentas-pagar/components/CuentasPagar.tsx` para listar las deudas por proveedor, con estados de pago visuales y filtros de vencimiento.
   - Implementar un formulario/modal para registrar pagos parciales o totales de una deuda.
   - Si un pago de CxP se realiza con efectivo, encolar automáticamente un egreso en la tabla `gastos` enlazado al ciclo operativo abierto (`cierre`).
5. **Navegación**:
   - Registrar la ruta `/cuentas-pagar` en `routes.tsx`.
   - Incorporar "Cuentas por Pagar" bajo la sección "Finanzas" en `AppLayout.tsx` utilizando un icono de tarjeta/pago (`cxp`).

---

## Análisis de Modelos de Datos

### 1. Tabla `cuentas_pagar`
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid REFERENCES public.tenants(id) ON DELETE CASCADE)
- `sucursal_id` (uuid REFERENCES public.sucursales(id) ON DELETE SET NULL)
- `compra_id` (uuid REFERENCES public.compras(id) ON DELETE SET NULL) — Opcional (si se crea por compra).
- `proveedor_id` (uuid REFERENCES public.proveedores(id) ON DELETE CASCADE)
- `monto_total` (numeric NOT NULL CHECK (monto_total >= 0))
- `monto_pagado` (numeric NOT NULL DEFAULT 0.00 CHECK (monto_pagado >= 0))
- `fecha_emision` (timestamptz NOT NULL DEFAULT now())
- `fecha_vencimiento` (timestamptz NOT NULL)
- `estado` (varchar(20) NOT NULL DEFAULT 'pendiente') — `'pendiente'` | `'parcial'` | `'pagada'`
- `observacion` (text)
- `created_at` (timestamptz NOT NULL DEFAULT now())
- `updated_at` (timestamptz NOT NULL DEFAULT now())

### 2. Tabla `cxp_pagos`
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid REFERENCES public.tenants(id) ON DELETE CASCADE)
- `sucursal_id` (uuid REFERENCES public.sucursales(id) ON DELETE SET NULL)
- `cuenta_pagar_id` (uuid REFERENCES public.cuentas_pagar(id) ON DELETE CASCADE)
- `monto` (numeric NOT NULL CHECK (monto > 0))
- `fecha_pago` (timestamptz NOT NULL DEFAULT now())
- `metodo_pago` (varchar(20) NOT NULL) — `'efectivo'` | `'tarjeta'` | `'transferencia'` | `'digital'`
- `notas` (text)
- `cycle_id` (uuid REFERENCES public.cierres_operativos(id) ON DELETE SET NULL) — Opcional (egreso de caja)
- `created_by_auth_user_id` (uuid REFERENCES public.tenant_users(id) ON DELETE SET NULL)
- `created_at` (timestamptz NOT NULL DEFAULT now())

---

## Lógica del Servicio (`accountsPayableService.ts`)

Para mantener el balance financiero, implementaremos un servicio puro en `src/features/cuentas-pagar/lib/accountsPayableService.ts` que exponga:

1. `registrarPagoCxP(input: PaymentInput)`:
   - Valida que el monto del pago no exceda el balance restante de la cuenta (`monto_total - monto_pagado`).
   - Si `metodo_pago === "efectivo"`, valida la existencia de un ciclo operativo activo (cierre de caja abierto) y lanza un error descriptivo si no hay caja abierta.
   - Encola la inserción del pago en `cxp_pagos`.
   - Encola la actualización de `monto_pagado` y `estado` en `cuentas_pagar`.
   - Si el método de pago es efectivo, resuelve el nombre del proveedor y encola una inserción de egreso en `gastos` vinculada al ciclo y a la categoría `"Compras"` o `"Pagos a Proveedores"`.
