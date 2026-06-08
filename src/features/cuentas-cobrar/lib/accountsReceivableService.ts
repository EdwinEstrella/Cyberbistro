import { enqueueLocalWrite, readLocalMirror, getDeviceId } from "../../../shared/lib/localFirst";

export interface PaymentInput {
  tenantId: string;
  sucursalId: string | null;
  usuarioId: string | null;
  cuentaCobrarId: string;
  monto: number;
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "digital";
  notas?: string;
}

export async function registrarPagoCxC(input: PaymentInput): Promise<{ pagoId: string }> {
  const { tenantId, sucursalId, usuarioId, cuentaCobrarId, monto, metodoPago, notas } = input;
  
  if (monto <= 0) {
    throw new Error("El monto del pago debe ser mayor a cero.");
  }

  const deviceId = await getDeviceId();
  const pagoId = crypto.randomUUID();
  const fechaPago = new Date().toISOString();

  // 1. Fetch debt details
  const cuentasCobrar = await readLocalMirror<{
    id: string;
    tenant_id: string;
    customer_id: string;
    monto_total: number;
    monto_pagado: number;
    estado: string;
  }>(tenantId, "cuentas_cobrar");

  const debt = cuentasCobrar.find(c => c.id === cuentaCobrarId);
  if (!debt) {
    throw new Error("La cuenta por cobrar no existe.");
  }

  const total = Number(debt.monto_total) || 0;
  const pagado = Number(debt.monto_pagado) || 0;
  const balance = Number((total - pagado).toFixed(2));

  if (monto > balance) {
    throw new Error(`El monto del pago (${monto}) excede el balance pendiente (${balance}).`);
  }

  // 2. Active cycle validation for cash payments
  let activeCycleId = "";

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
  }

  // 3. Enqueue payment insert
  await enqueueLocalWrite({
    tenantId,
    tableName: "cxc_pagos",
    rowId: pagoId,
    op: "insert",
    payload: {
      id: pagoId,
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      cuenta_cobrar_id: cuentaCobrarId,
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
    tableName: "cuentas_cobrar",
    rowId: cuentaCobrarId,
    op: "update",
    payload: {
      monto_pagado: nuevoPagado,
      estado: nuevoEstado,
      updated_at: new Date().toISOString(),
    },
    deviceId,
  });

  return { pagoId };
}
