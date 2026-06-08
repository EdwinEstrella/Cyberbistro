# Exploración — PR 9: Cuentas por Cobrar + Fiado en POS

**Change**: `cuentas-cobrar-feature`
**Branch**: `feature/cuentas-cobrar-feature`

---

## Objetivos del Cambio

1. **Diseño de Base de Datos para Cuentas por Cobrar (CxC)**:
   - Crear las tablas `cuentas_cobrar` y `cxc_pagos` en PostgreSQL con políticas RLS y soporte multi-tenant.
   - Soportar el ciclo de vida de las deudas: `monto_total`, `monto_pagado`, `estado` (`'pendiente'` | `'parcial'` | `'pagada'`), `fecha_emision` y `fecha_vencimiento`.
   - Ligar deudas a clientes (`customers`) y opcionalmente a facturas de venta (`facturas`).
2. **Local-First Sync e IndexedDB**:
   - Registrar `cuentas_cobrar` y `cxc_pagos` en el sistema de sincronización local (`localFirst.ts`).
   - Incrementar `DB_VERSION` a `7` para migrar los esquemas locales IndexedDB en el cliente.
3. **Integración con Ventas a Crédito (Fiado en POS)**:
   - Añadir el método de pago `"fiado"` en el modal de cierre de cuenta del POS (`MesaCloseAccountModal.tsx`).
   - Validar que haya un cliente seleccionado para proceder con ventas al fiado.
   - Si se selecciona `"fiado"`, crear la factura con `estado === "pendiente"` y registrar automáticamente la deuda correspondiente en `cuentas_cobrar`.
4. **Módulo de Cuentas por Cobrar (CxC UI)**:
   - Crear una interfaz interactiva en `src/features/cuentas-cobrar/components/CuentasCobrar.tsx` para listar las deudas de clientes, registrar abonos y ver el historial de pagos.
   - Registrar la ruta `/cuentas-cobrar` en `routes.tsx` y el acceso en el menú lateral bajo Finanzas en `AppLayout.tsx`.
5. **Integración con el Cierre de Caja**:
   - Enlazar los abonos a CxC en efectivo al ciclo operativo activo (`cierres_operativos`).
   - Actualizar `Cierre.tsx` y la impresión del ticket de cierre para que los abonos a CxC en efectivo se sumen al flujo de caja y método de pago correspondiente de la jornada.

---

## Análisis de Modelos de Datos

### 1. Tabla `cuentas_cobrar`
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid REFERENCES public.tenants(id) ON DELETE CASCADE)
- `sucursal_id` (uuid REFERENCES public.sucursales(id) ON DELETE SET NULL)
- `factura_id` (uuid REFERENCES public.facturas(id) ON DELETE SET NULL) — Opcional (si se crea desde el POS).
- `customer_id` (uuid REFERENCES public.customers(id) ON DELETE CASCADE)
- `monto_total` (numeric NOT NULL CHECK (monto_total >= 0.00))
- `monto_pagado` (numeric NOT NULL DEFAULT 0.00 CHECK (monto_pagado >= 0.00))
- `fecha_emision` (timestamptz NOT NULL DEFAULT now())
- `fecha_vencimiento` (timestamptz NOT NULL)
- `estado` (varchar(20) NOT NULL DEFAULT 'pendiente') — `'pendiente'` | `'parcial'` | `'pagada'`
- `observacion` (text)
- `created_at` (timestamptz NOT NULL DEFAULT now())
- `updated_at` (timestamptz NOT NULL DEFAULT now())

### 2. Tabla `cxc_pagos`
- `id` (uuid PRIMARY KEY DEFAULT gen_random_uuid())
- `tenant_id` (uuid REFERENCES public.tenants(id) ON DELETE CASCADE)
- `sucursal_id` (uuid REFERENCES public.sucursales(id) ON DELETE SET NULL)
- `cuenta_cobrar_id` (uuid REFERENCES public.cuentas_cobrar(id) ON DELETE CASCADE)
- `monto` (numeric NOT NULL CHECK (monto > 0.00))
- `fecha_pago` (timestamptz NOT NULL DEFAULT now())
- `metodo_pago` (varchar(20) NOT NULL) — `'efectivo'` | `'tarjeta'` | `'transferencia'` | `'digital'`
- `notas` (text)
- `cycle_id` (uuid REFERENCES public.cierres_operativos(id) ON DELETE SET NULL) — Opcional (flujo de caja del turno)
- `created_by_auth_user_id` (uuid REFERENCES public.tenant_users(id) ON DELETE SET NULL)
- `created_at` (timestamptz NOT NULL DEFAULT now())

---

## Lógica del Servicio (`accountsReceivableService.ts`)

Implementaremos un servicio en `src/features/cuentas-cobrar/lib/accountsReceivableService.ts` que exponga:

1. `registrarPagoCxC(input: PaymentInput)`:
   - Valida que el monto del pago no exceda el balance restante de la cuenta (`monto_total - monto_pagado`).
   - Si el método de pago es `"efectivo"`, requiere obligatoriamente un ciclo operativo activo (cierre de caja abierto) y asocia el pago a dicho ciclo (`cycle_id`).
   - Encola la inserción del pago en `cxc_pagos`.
   - Encola la actualización de `monto_pagado` y `estado` en `cuentas_cobrar`.
