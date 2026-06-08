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

  const deviceId = await getDeviceId();

  // Validate active operational cycle and purchase category for cash (contado) purchases
  let activeCycleId = "";
  let comprasCategoryId = "";
  let providerName = "Proveedor";

  if (tipoPago === "contado") {
    const activeCycleRows = await readLocalMirror<{
      id: string;
      closed_at: string | null;
      sucursal_id: string | null;
      opened_at: string;
    }>(tenantId, "cierres_operativos");
    
    const activeCycle = activeCycleRows
      .filter(c => !c.closed_at && (c.sucursal_id === sucursalId || !c.sucursal_id))
      .sort((a, b) => b.opened_at.localeCompare(a.opened_at))[0];

    if (!activeCycle) {
      throw new Error("No hay un ciclo operativo abierto para registrar una compra al contado.");
    }
    activeCycleId = activeCycle.id;

    // Resolve compras category
    const categories = await readLocalMirror<{
      id: string;
      nombre: string;
      activa: boolean;
    }>(tenantId, "gasto_categorias");
    const foundCat = categories.find(c => c.activa && c.nombre.trim().toLowerCase() === "compras");
    if (foundCat) {
      comprasCategoryId = foundCat.id;
    } else {
      comprasCategoryId = crypto.randomUUID();
      await enqueueLocalWrite({
        tenantId,
        tableName: "gasto_categorias",
        rowId: comprasCategoryId,
        op: "insert",
        payload: {
          id: comprasCategoryId,
          tenant_id: tenantId,
          nombre: "Compras",
          descripcion: "Categoría automática para registrar compras de insumos",
          color: "#ff906d",
          activa: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        deviceId,
      });
    }

    // Resolve provider name
    if (proveedorId) {
      const providers = await readLocalMirror<{
        id: string;
        nombre: string;
      }>(tenantId, "proveedores");
      const foundProv = providers.find(p => p.id === proveedorId);
      if (foundProv) {
        providerName = foundProv.nombre;
      }
    }
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

  // 4. Enqueue Local Write for Gasto if contado
  if (tipoPago === "contado") {
    const gastoId = crypto.randomUUID();
    await enqueueLocalWrite({
      tenantId,
      tableName: "gastos",
      rowId: gastoId,
      op: "insert",
      payload: {
        id: gastoId,
        tenant_id: tenantId,
        category_id: comprasCategoryId || null,
        cycle_id: activeCycleId || null,
        descripcion: `Compra - Factura ${numeroFactura || "S/N"}`,
        proveedor: providerName,
        monto: totalCompra,
        metodo_pago: "efectivo",
        fecha_gasto: fechaCompra,
        notas: observacion || `Registrado automáticamente desde Módulo de Compras (ID: ${compraId})`,
        created_by_auth_user_id: usuarioId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      deviceId,
    });
  }

  return { compraId };
}
