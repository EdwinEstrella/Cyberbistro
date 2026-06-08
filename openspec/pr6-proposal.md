# Propuesta — PR 6: Servicio Compras → Inventario → Movimiento

**Change**: `compras-inventory-service`
**Branch**: `feature/compras-inventory-service`

---

## Objetivos del Cambio

1. Implementar la función `registrarCompra` en `src/features/compras/lib/purchaseService.ts` para gestionar el registro inmutable de facturas de compra, actualizar el inventario y generar asientos de movimientos de stock.
2. Garantizar un cálculo preciso del Costo Promedio Ponderado de inventario, incluso en condiciones de stock previo cero o negativo.
3. Construir la UI interactiva de Compras (`Compras.tsx`) con listado de facturas, modal de Nueva Compra con agregación dinámica de items, y pestaña de Proveedores con CRUD completo local-first.
4. Lograr una cobertura de pruebas unitarias del 100% sobre el núcleo matemático y lógico del servicio de compras.

---

## Contrato de Funciones (`purchaseService.ts`)

```typescript
export interface PurchaseItemInput {
  producto_id: string;
  cantidad: number;
  costo_unitario: number;
}

export interface PurchaseInput {
  tenantId: string;
  sucursalId: string | null;
  usuarioId: string | null;
  proveedorId: string | null;
  numeroFactura: string;
  tipoPago: "contado" | "credito";
  items: PurchaseItemInput[];
  observacion?: string;
}

export async function registrarCompra(input: PurchaseInput): Promise<{ compraId: string }>;
```

---

## Modificaciones de Interfaz de Usuario (`Compras.tsx`)

La interfaz estará dividida en dos pestañas principales:
1. **Facturas de Compra**:
   - Muestra tabla con RNC/Proveedor, fecha, total, número de factura, tipo de pago.
   - Botón "Registrar Compra" abre un modal para ingresar la factura: selección de proveedor, tipo de pago, número de factura física, selección dinámica de insumos, cantidad, costo unitario, cálculo de total dinámico y envío.
2. **Proveedores**:
   - Lista en cuadrícula o tabla con los proveedores registrados (Nombre, RNC, Teléfono, Dirección).
   - Botón "Nuevo Proveedor" abre modal para ingresar datos de contacto.
   - Botón "Editar" permite cambiar datos del proveedor.

---

## Análisis de Riesgos

- **Riesgo**: Registro de compras con productos que no existen localmente.
  - *Mitigación*: Validar en el servicio que cada `producto_id` de los items corresponda a un registro válido en `productos_inventario`; de lo contrario, lanzar un error descriptivo.
- **Riesgo**: Modificaciones simultáneas de stock (condición de carrera) mientras se calcula el costo promedio ponderado localmente.
  - *Mitigación*: En el entorno local-first de Electron, las operaciones se secuencian a través de la cola de escrituras `enqueueLocalWrite`, reduciendo riesgos de concurrencia.
