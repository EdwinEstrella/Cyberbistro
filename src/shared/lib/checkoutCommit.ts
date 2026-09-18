import { enqueueLocalWritesAtomically, type LocalFirstWrite } from "./localFirst";
import { enqueueThermalPrint, type PrintThermalResult } from "./thermalPrint";
import { saveLocalInvoice } from "../../features/billing/lib/invoicesLocal";
import { saveLocalConsumo } from "./ordersLocal";

export async function commitCheckout(args: {
  writes: readonly LocalFirstWrite[];
  prints: ReadonlyArray<{ id: string; label: string; print: () => Promise<PrintThermalResult> }>;
}): Promise<void> {
  const hasSqlite = typeof window !== "undefined" && Boolean(window.electronAPI?.saveInvoiceLocal);
  if (hasSqlite) {
    const facturaWrites = args.writes.filter((w) => w.tableName === "facturas");
    const consumoWrites = args.writes.filter((w) => w.tableName === "consumos");
    const otherWrites = args.writes.filter((w) => w.tableName !== "facturas" && w.tableName !== "consumos");

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
    if (otherWrites.length > 0) {
      await enqueueLocalWritesAtomically(otherWrites);
    }
  } else {
    await enqueueLocalWritesAtomically(args.writes);
  }

  for (const print of args.prints) enqueueThermalPrint(print);
}
