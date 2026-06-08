import { enqueueLocalWrite, readLocalMirror, getDeviceId } from "../../../shared/lib/localFirst";
import { calculateCostPerMl } from "../../../shared/lib/presentationUnits";

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

export async function registrarCompra(input: PurchaseInput): Promise<{ compraId: string }> {
  const { tenantId, sucursalId, usuarioId, proveedorId, numeroFactura, tipoPago, items, observacion } = input;
  if (!items || items.length === 0) {
    throw new Error("La compra debe contener al menos un ítem.");
  }

  // 1. Fetch products catalog details
  const inventarioRows = await readLocalMirror<{
    id: string;
    nombre: string;
    unidad_base: string;
    ml_por_botella: number | null;
    stock_actual: number;
    costo_promedio: number;
  }>(tenantId, "productos_inventario");

  const inventarioMap = new Map(inventarioRows.map(r => [r.id, r]));
  const deviceId = await getDeviceId();
  const compraId = crypto.randomUUID();
  const fechaCompra = new Date().toISOString();

  // Validate items and pre-calculate conversions
  let totalCompra = 0;
  const processedItems = items.map(item => {
    const product = inventarioMap.get(item.producto_id);
    if (!product) {
      throw new Error(`El producto con ID ${item.producto_id} no existe en el catálogo.`);
    }

    const mlBotella = product.unidad_base === "ml" ? (product.ml_por_botella || 0) : 0;
    const isLiquid = mlBotella > 0;

    // Converted stock quantities & costs
    const cantidadBase = isLiquid ? (item.cantidad * mlBotella) : item.cantidad;
    const costoBase = isLiquid ? calculateCostPerMl(item.costo_unitario, mlBotella) : item.costo_unitario;
    const itemTotal = item.cantidad * item.costo_unitario;
    totalCompra += itemTotal;

    const stockActual = Number(product.stock_actual) || 0;
    const costoPromedioActual = Number(product.costo_promedio) || 0;

    const nuevoStock = stockActual + cantidadBase;
    
    // Average Cost Pondered
    let nuevoCostoPromedio = costoBase;
    if (stockActual > 0) {
      nuevoCostoPromedio = Number((((stockActual * costoPromedioActual) + (cantidadBase * costoBase)) / nuevoStock).toFixed(4));
    } else {
      nuevoCostoPromedio = Number(costoBase.toFixed(4));
    }

    return {
      ...item,
      cantidadBase,
      costoBase,
      itemTotal,
      stockActual,
      nuevoStock,
      nuevoCostoPromedio,
    };
  });

  // 2. Enqueue Local Write for Cabecera de Compra
  await enqueueLocalWrite({
    tenantId,
    tableName: "compras",
    rowId: compraId,
    op: "insert",
    payload: {
      id: compraId,
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      proveedor_id: proveedorId,
      numero_factura: numeroFactura,
      tipo_pago: tipoPago,
      fecha_compra: fechaCompra,
      total: totalCompra,
      estado: "completada",
      observacion: observacion || null,
      usuario_id: usuarioId,
    },
    deviceId,
  });

  // 3. Enqueue Local Writes for each Item (Detalle, Stock Update, and Movement)
  for (const item of processedItems) {
    const detalleId = crypto.randomUUID();
    const movimientoId = crypto.randomUUID();

    // Detalle de compra
    await enqueueLocalWrite({
      tenantId,
      tableName: "compra_detalles",
      rowId: detalleId,
      op: "insert",
      payload: {
        id: detalleId,
        tenant_id: tenantId,
        compra_id: compraId,
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        costo_unitario: item.costo_unitario,
        total: item.itemTotal,
      },
      deviceId,
    });

    // Actualización catálogo (stock y costo promedio)
    await enqueueLocalWrite({
      tenantId,
      tableName: "productos_inventario",
      rowId: item.producto_id,
      op: "update",
      payload: {
        stock_actual: item.nuevoStock,
        costo_promedio: item.nuevoCostoPromedio,
        updated_at: new Date().toISOString(),
      },
      deviceId,
    });

    // Historial movimientos
    await enqueueLocalWrite({
      tenantId,
      tableName: "inventario_movimientos",
      rowId: movimientoId,
      op: "insert",
      payload: {
        id: movimientoId,
        tenant_id: tenantId,
        sucursal_id: sucursalId,
        producto_id: item.producto_id,
        tipo: "entrada",
        cantidad: item.cantidadBase,
        stock_antes: item.stockActual,
        stock_despues: item.nuevoStock,
        costo_unitario: item.costoBase,
        motivo: "Ingreso por compra",
        referencia: `Compra: ${compraId}`,
        fecha: fechaCompra,
        usuario_id: usuarioId,
      },
      deviceId,
    });
  }

  return { compraId };
}
