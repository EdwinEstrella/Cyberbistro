# Propuesta — PR 7: Compras → Gastos + Cierre/Analíticas

**Change**: `compras-gastos-cierre-integration`
**Branch**: `feature/compras-gastos-cierre-integration`

---

## Objetivos del Cambio

1. Integrar el registro de compras al contado (`tipoPago === "contado"`) como gastos directos en la caja operativa de la sucursal actual.
2. Asegurar que las compras al contado no se registren si no hay un ciclo de caja operativo abierto.
3. Mostrar advertencias e inhabilitar preventivamente en la interfaz de compras cuando se intente realizar una compra al contado sin un ciclo activo.

---

## Modificaciones Planificadas

### 1. Núcleo del Servicio (`purchaseService.ts`)

- Modificar la firma de `registrarCompra` para verificar e inyectar el gasto si corresponde:
  - Leer el ciclo operativo activo de `cierres_operativos`.
  - Si es compra al contado y no hay un ciclo abierto, lanzar `Error("No hay un ciclo operativo abierto para registrar una compra al contado.")`.
  - Cargar o crear la categoría de gasto `"Compras"`.
  - Si el proveedor está presente, resolver su nombre de la tabla `proveedores` para rellenar el campo `proveedor` del gasto.
  - Encolar una inserción de gasto (`gastos`) con el total de la compra.

### 2. Cambios en la Vista del Frontend (`Compras.tsx`)

- Cargar la lista de ciclos operativos en `cargarDatos` y determinar si hay un ciclo abierto en el estado `cicloAbierto`.
- En el modal de Nueva Compra, mostrar un bloque de advertencia si `tipo_pago === "contado"` y no hay un ciclo operativo abierto.
- Deshabilitar el botón "Guardar Compra" si se selecciona pago al contado y no hay ciclo operativo.

---

## Archivos que serán Modificados

- [purchaseService.ts](file:///C:/Users/Asistente/Desktop/Nueva_carpeta/Cyberbistro/src/features/compras/lib/purchaseService.ts) — Integración de gastos y validación de ciclos en `registrarCompra`.
- [purchaseService.test.ts](file:///C:/Users/Asistente/Desktop/Nueva_carpeta/Cyberbistro/src/features/compras/lib/purchaseService.test.ts) — Pruebas para flujos de contado con ciclo activo, fallos sin ciclo, y creación de categorías.
- [Compras.tsx](file:///C:/Users/Asistente/Desktop/Nueva_carpeta/Cyberbistro/src/features/compras/components/Compras.tsx) — Validación visual de ciclo activo y carga de ciclos en estado.

---

## Estimación de Líneas

- **Total aproximado**: ~120 líneas de código y pruebas.
- **Riesgo presupuestario**: Muy bajo.
