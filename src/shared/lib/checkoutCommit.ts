import { enqueueLocalWritesAtomically, type LocalFirstWrite } from "./localFirst";
import { enqueueThermalPrint, type PrintThermalResult } from "./thermalPrint";
import { saveLocalInvoice } from "../../features/billing/lib/invoicesLocal";

export async function commitCheckout(args: {
  writes: readonly LocalFirstWrite[];
  prints: ReadonlyArray<{ id: string; label: string; print: () => Promise<PrintThermalResult> }>;
}): Promise<void> {
  const hasSqliteInvoices = typeof window !== "undefined" && Boolean(window.electronAPI?.saveInvoiceLocal);
  if (hasSqliteInvoices) {
    const facturaWrites = args.writes.filter((w) => w.tableName === "facturas");
    const otherWrites = args.writes.filter((w) => w.tableName !== "facturas");
    for (const fw of facturaWrites) {
      if (fw.payload) {
        await saveLocalInvoice(fw.payload);
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
