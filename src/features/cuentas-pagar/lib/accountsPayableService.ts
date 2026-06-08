import { enqueueLocalWrite, readLocalMirror, getDeviceId } from "../../../shared/lib/localFirst";

export interface PaymentInput {
  tenantId: string;
  sucursalId: string | null;
  usuarioId: string | null;
  cuentaPagarId: string;
  monto: number;
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "digital";
  notas?: string;
}

export async function registrarPagoCxP(input: PaymentInput): Promise<{ pagoId: string }> {
  const { tenantId, sucursalId, usuarioId, cuentaPagarId, monto, metodoPago, notas } = input;
  
  if (monto <= 0) {
    throw new Error("El monto del pago debe ser mayor a cero.");
  }

  const deviceId = await getDeviceId();
  const pagoId = crypto.randomUUID();
  const fechaPago = new Date().toISOString();

  // 1. Fetch debt details
  const cuentasPagar = await readLocalMirror<{
    id: string;
    tenant_id: string;
    proveedor_id: string;
    monto_total: number;
    monto_pagado: number;
    estado: string;
  }>(tenantId, "cuentas_pagar");

  const debt = cuentasPagar.find(c => c.id === cuentaPagarId);
  if (!debt) {
    throw new Error("La cuenta por pagar no existe.");
  }

  const total = Number(debt.monto_total) || 0;
  const pagado = Number(debt.monto_pagado) || 0;
  const balance = Number((total - pagado).toFixed(2));

  if (monto > balance) {
    throw new Error(`El monto del pago (${monto}) excede el balance pendiente (${balance}).`);
  }

  // 2. Active cycle validation for cash payments
  let activeCycleId = "";
  let comprasCategoryId = "";
  let providerName = "Proveedor";

  if (metodoPago === "efectivo") {
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
      throw new Error("No hay un ciclo operativo abierto para registrar un pago en efectivo.");
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
    const providers = await readLocalMirror<{
      id: string;
      nombre: string;
    }>(tenantId, "proveedores");
    const foundProv = providers.find(p => p.id === debt.proveedor_id);
    if (foundProv) {
      providerName = foundProv.nombre;
    }
  }

  // 3. Enqueue payment insert
  await enqueueLocalWrite({
    tenantId,
    tableName: "cxp_pagos",
    rowId: pagoId,
    op: "insert",
    payload: {
      id: pagoId,
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      cuenta_pagar_id: cuentaPagarId,
      monto,
      fecha_pago: fechaPago,
      metodo_pago: metodoPago,
      notas: notas || null,
      cycle_id: activeCycleId || null,
      created_by_auth_user_id: usuarioId,
      created_at: fechaPago,
    },
    deviceId,
  });

  // 4. Enqueue debt update
  const nuevoPagado = Number((pagado + monto).toFixed(2));
  const nuevoEstado = nuevoPagado >= total ? "pagada" : "parcial";

  await enqueueLocalWrite({
    tenantId,
    tableName: "cuentas_pagar",
    rowId: cuentaPagarId,
    op: "update",
    payload: {
      monto_pagado: nuevoPagado,
      estado: nuevoEstado,
      updated_at: new Date().toISOString(),
    },
    deviceId,
  });

  // 5. Enqueue expense (gasto) for cash payments
  if (metodoPago === "efectivo") {
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
        descripcion: `Abono Cuenta Pagar - Ref ID: ${cuentaPagarId.slice(0, 8)}`,
        proveedor: providerName,
        monto,
        metodo_pago: "efectivo",
        fecha_gasto: fechaPago,
        notas: notas || `Abono registrado a cuenta por pagar.`,
        created_by_auth_user_id: usuarioId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      deviceId,
    });
  }

  return { pagoId };
}
