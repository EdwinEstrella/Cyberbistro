import { enqueueLocalWritesAtomically, type LocalFirstWrite } from "./localFirst";
import { enqueueThermalPrint, type PrintThermalResult } from "./thermalPrint";
import { saveLocalInvoice } from "../../features/billing/lib/invoicesLocal";
import { saveLocalConsumo, deleteLocalComanda } from "./ordersLocal";

export async function commitCheckout(args: {
  writes: readonly LocalFirstWrite[];
  prints: ReadonlyArray<{ id: string; label: string; print: () => Promise<PrintThermalResult> }>;
}): Promise<void> {
  const hasSqlite = typeof window !== "undefined" && Boolean(window.electronAPI?.saveInvoiceLocal);
  if (hasSqlite) {
    const facturaWrites = args.writes.filter((w) => w.tableName === "facturas");
    const consumoWrites = args.writes.filter((w) => w.tableName === "consumos");
    const comandaDeletes = args.writes.filter((w) => w.tableName === "comandas" && w.op === "delete");
    // cuentas_cobrar / cxc_pagos (fiado) still ride the IndexedDB atomic path:
    // there is no SQLite renderer write helper for receivables yet.
    const otherWrites = args.writes.filter(
      (w) => w.tableName !== "facturas" && w.tableName !== "consumos" && !(w.tableName === "comandas" && w.op === "delete"),
    );

    // Order matters: the invoice lands before its paid consumos (FK factura_id),
    // and the comanda is unlinked/removed only AFTER its consumos are settled, so
    // the kitchen screen (which reads SQLite) sees the closed order immediately
    // instead of waiting for a cloud round-trip.
    for (const fw of facturaWrites) {
      if (fw.payload) {
        await saveLocalInvoice(fw.payload);
      }
    }
    for (const cw of consumoWrites) {
      if (cw.payload) {
        await saveLocalConsumo(cw.tenantId, { ...cw.payload, id: cw.rowId });
      }
    }
    for (const dw of comandaDeletes) {
      await deleteLocalComanda(dw.tenantId, dw.rowId);
    }
    if (otherWrites.length > 0) {
      await enqueueLocalWritesAtomically(otherWrites);
    }
  } else {
    await enqueueLocalWritesAtomically(args.writes);
  }

  for (const print of args.prints) enqueueThermalPrint(print);
}
