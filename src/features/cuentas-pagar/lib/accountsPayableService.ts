import { enqueueLocalWrite, readLocalMirror, getDeviceId } from "../../../shared/lib/localFirst";
import { executePayablesCommandLocally } from "../../../shared/lib/payablesUiAdapter";

/** True on desktop where both the SQLite payables and expense bridges exist. */
function hasSqlitePayables(): boolean {
  return typeof window !== "undefined"
    && Boolean(window.electronAPI?.executePayablesCommand)
    && Boolean(window.electronAPI?.executeExpenseCommand);
}

/** Resolves (or creates) the automatic "Compras" expense category in SQLite. */
async function resolveComprasCategoryIdSqlite(): Promise<string | null> {
  try {
    const res = await window.electronAPI?.listExpenseCategories?.();
    const cats = res?.ok && Array.isArray(res.data) ? res.data : [];
    const found = cats.find((c) => String((c as { nombre?: unknown }).nombre ?? "").trim().toLowerCase() === "compras");
    if (found) return String((found as { id: unknown }).id);
    const id = crypto.randomUUID();
    await window.electronAPI!.executeExpenseCommand!({
      type: "expense.category.create",
      id,
      name: "Compras",
      description: "Categoría automática para registrar compras de insumos",
      color: "#ff906d",
    });
    return id;
  } catch {
    return null;
  }
}

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
    compra_id: string | null;
    monto_total: number;
    monto_pagado: number;
    estado: string;
  }>(tenantId, "cuentas_pagar");

  const debt = cuentasPagar.find(c => c.id === cuentaPagarId);
  // On desktop the payable may live only in SQLite; the SQLite command validates
  // the balance authoritatively there. On web the mirror is the source of truth.
  if (!debt && !hasSqlitePayables()) {
    throw new Error("La cuenta por pagar no existe.");
  }

  const total = Number(debt?.monto_total) || 0;
  const pagado = Number(debt?.monto_pagado) || 0;
  const balance = Number((total - pagado).toFixed(2));
  if (debt && monto > balance) {
    throw new Error(`El monto del pago (${monto}) excede el balance pendiente (${balance}).`);
  }
  const nuevoPagado = Number((pagado + monto).toFixed(2));
  const fullyPaid = debt ? nuevoPagado >= total : false;

  // Every settlement is part of the active operating cycle.
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
    throw new Error("No hay un ciclo operativo abierto para registrar un pago de cuenta por pagar.");
  }
  const activeCycleId = activeCycle.id;

  // Provider name is display-only on the expense; best-effort from the mirror.
  const providers = await readLocalMirror<{ id: string; nombre: string }>(tenantId, "proveedores");
  const providerName = (debt && providers.find(p => p.id === debt.proveedor_id)?.nombre) || "Proveedor";
  const descripcion = `Abono Cuenta Pagar - Ref ID: ${cuentaPagarId.slice(0, 8)}`;
  const gastoNotes = notas || "Abono registrado a cuenta por pagar.";

  // Desktop: SQLite is the single engine. One atomic command inserts the
  // cxp_pago, updates the debt, and records the operational expense together;
  // its outbox pushes the cxp_pago (the cloud trigger recomputes the debt
  // balance) and the gasto. Falling back to IndexedDB after a rejection is safe
  // because the command commits all-or-nothing (no partial or duplicate writes).
  if (hasSqlitePayables()) {
    try {
      const comprasCategoryId = await resolveComprasCategoryIdSqlite();
      await executePayablesCommandLocally({
        type: "payables.payment.record",
        paymentId: pagoId,
        payableId: cuentaPagarId,
        amount: monto,
        paymentMethod: metodoPago,
        sucursalId,
        cycleId: activeCycleId,
        notas: notas || null,
        usuarioId,
        fechaPago,
        expense: {
          id: crypto.randomUUID(),
          categoryId: comprasCategoryId,
          description: descripcion,
          supplier: providerName,
          notes: gastoNotes,
        },
      });
      await markCompraFiscalPaidIfNeeded({ tenantId, deviceId, fullyPaid, compraId: debt?.compra_id ?? null, fechaPago });
      return { pagoId };
    } catch (error) {
      console.warn("[CxP] SQLite payment path failed, falling back to IndexedDB:", error);
    }
  }

  // IndexedDB fallback (web). Requires the debt in the mirror to compute state.
  if (!debt) {
    throw new Error("La cuenta por pagar no existe.");
  }

  let comprasCategoryId = "";
  const categories = await readLocalMirror<{ id: string; nombre: string; activa: boolean }>(tenantId, "gasto_categorias");
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

  const nuevoEstado = fullyPaid ? "pagada" : "parcial";
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

  const gastoId = crypto.randomUUID();
  await enqueueLocalWrite({
    tenantId,
    tableName: "gastos",
    rowId: gastoId,
    op: "insert",
    payload: {
      id: gastoId,
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      category_id: comprasCategoryId || null,
      cycle_id: activeCycleId || null,
      descripcion,
      proveedor: providerName,
      monto,
      metodo_pago: metodoPago,
      fecha_gasto: fechaPago,
      notas: gastoNotes,
      created_by_auth_user_id: usuarioId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    deviceId,
  });

  await markCompraFiscalPaidIfNeeded({ tenantId, deviceId, fullyPaid, compraId: debt.compra_id, fechaPago });

  return { pagoId };
}

async function markCompraFiscalPaidIfNeeded(input: { tenantId: string; deviceId: string; fullyPaid: boolean; compraId: string | null; fechaPago: string }): Promise<void> {
  const { tenantId, deviceId, fullyPaid, compraId, fechaPago } = input;
  if (!fullyPaid || !compraId) return;
  const fiscalRows = await readLocalMirror<{ id: string; compra_id: string }>(tenantId, "compra_fiscal");
  const fiscal = fiscalRows.find((row) => row.compra_id === compraId);
  if (!fiscal) return;
  await enqueueLocalWrite({
    tenantId,
    tableName: "compra_fiscal",
    rowId: fiscal.id,
    op: "update",
    payload: { fecha_pago: fechaPago.slice(0, 10), updated_at: fechaPago },
    deviceId,
  });
}
