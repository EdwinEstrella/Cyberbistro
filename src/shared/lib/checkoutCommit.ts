import { enqueueLocalWritesAtomically, type LocalFirstWrite } from "./localFirst";
import { enqueueThermalPrint, type PrintThermalResult } from "./thermalPrint";
import { saveLocalInvoice } from "../../features/billing/lib/invoicesLocal";
import { saveLocalConsumo, deleteLocalComanda } from "./ordersLocal";
import { executeReceivablesCommandLocally } from "./receivablesUiAdapter";
import type { ReceivablesCommand } from "../../../electron/persistence/receivablesRepository";

/** Maps a checkout `cuentas_cobrar` insert to the SQLite receivables.create command. */
function toReceivableCreate(w: LocalFirstWrite): ReceivablesCommand {
  const p = w.payload ?? {};
  return {
    type: "receivables.create",
    id: String(p.id ?? w.rowId),
    customerId: String(p.customer_id ?? ""),
    facturaId: p.factura_id ? String(p.factura_id) : undefined,
    totalAmount: Number(p.monto_total ?? 0),
    dueDate: p.fecha_vencimiento ? String(p.fecha_vencimiento) : undefined,
    sucursalId: (p.sucursal_id as string | null | undefined) ?? null,
    fechaEmision: p.fecha_emision ? String(p.fecha_emision) : undefined,
    observacion: (p.observacion as string | null | undefined) ?? null,
  };
}

/** Maps a checkout `cxc_pagos` insert (fiado down-payment) to receivables.payment.record. */
function toReceivablePayment(w: LocalFirstWrite): ReceivablesCommand {
  const p = w.payload ?? {};
  return {
    type: "receivables.payment.record",
    paymentId: String(p.id ?? w.rowId),
    receivableId: String(p.cuenta_cobrar_id ?? ""),
    amount: Number(p.monto ?? 0),
    paymentMethod: String(p.metodo_pago ?? "efectivo"),
    sucursalId: (p.sucursal_id as string | null | undefined) ?? null,
    cycleId: (p.cycle_id as string | null | undefined) ?? null,
    notas: (p.notas as string | null | undefined) ?? null,
    usuarioId: (p.created_by_auth_user_id as string | null | undefined) ?? null,
    fechaPago: p.fecha_pago ? String(p.fecha_pago) : undefined,
  };
}

export async function commitCheckout(args: {
  writes: readonly LocalFirstWrite[];
  prints: ReadonlyArray<{ id: string; label: string; print: () => Promise<PrintThermalResult> }>;
}): Promise<void> {
  const hasSqlite = typeof window !== "undefined" && Boolean(window.electronAPI?.saveInvoiceLocal);
  const hasSqliteReceivables = typeof window !== "undefined" && Boolean(window.electronAPI?.executeReceivablesCommand);

  if (hasSqlite) {
    const facturaWrites = args.writes.filter((w) => w.tableName === "facturas");
    const consumoWrites = args.writes.filter((w) => w.tableName === "consumos");
    const comandaDeletes = args.writes.filter((w) => w.tableName === "comandas" && w.op === "delete");
    // Fiado (accounts receivable) routes through the SQLite receivables command
    // when the desktop bridge is present; otherwise it stays on the IndexedDB
    // atomic path with the rest of `otherWrites`.
    const receivableCreates = hasSqliteReceivables
      ? args.writes.filter((w) => w.tableName === "cuentas_cobrar" && w.op === "insert")
      : [];
    const receivablePayments = hasSqliteReceivables
      ? args.writes.filter((w) => w.tableName === "cxc_pagos" && w.op === "insert")
      : [];

    const routedToSqlite = (w: LocalFirstWrite): boolean =>
      w.tableName === "facturas" ||
      w.tableName === "consumos" ||
      (w.tableName === "comandas" && w.op === "delete") ||
      (hasSqliteReceivables && (w.tableName === "cuentas_cobrar" || w.tableName === "cxc_pagos") && w.op === "insert");
    const otherWrites = args.writes.filter((w) => !routedToSqlite(w));
    const fallbackWrites: LocalFirstWrite[] = [];

    // Order matters: the invoice lands before its paid consumos (FK factura_id),
    // and the comanda is unlinked/removed only AFTER its consumos are settled, so
    // the kitchen screen (which reads SQLite) sees the closed order immediately.
    for (const fw of facturaWrites) {
      if (fw.payload) await saveLocalInvoice(fw.payload);
    }
    for (const cw of consumoWrites) {
      if (cw.payload) await saveLocalConsumo(cw.tenantId, { ...cw.payload, id: cw.rowId });
    }
    for (const dw of comandaDeletes) {
      await deleteLocalComanda(dw.tenantId, dw.rowId);
    }
    // Fiado: create the debt before recording its down-payment (the payment reads
    // the debt balance). On any failure fall the whole group back to IndexedDB so
    // the fiado is never silently dropped; the cloud upsert is idempotent by id.
    if (receivableCreates.length > 0 || receivablePayments.length > 0) {
      try {
        for (const rw of receivableCreates) await executeReceivablesCommandLocally(toReceivableCreate(rw));
        for (const pw of receivablePayments) await executeReceivablesCommandLocally(toReceivablePayment(pw));
      } catch (error) {
        console.warn("[checkout] SQLite receivables path failed, falling back to IndexedDB:", error);
        fallbackWrites.push(...receivableCreates, ...receivablePayments);
      }
    }

    const indexedDbWrites = [...otherWrites, ...fallbackWrites];
    if (indexedDbWrites.length > 0) {
      await enqueueLocalWritesAtomically(indexedDbWrites);
    }
  } else {
    await enqueueLocalWritesAtomically(args.writes);
  }

  for (const print of args.prints) enqueueThermalPrint(print);
}
