import { enqueueLocalWritesAtomically, processInvoiceInventoryDeduction, type LocalFirstWrite } from "./localFirst";
import { enqueueThermalPrint, type PrintThermalResult } from "./thermalPrint";
import { saveLocalInvoice } from "../../features/billing/lib/invoicesLocal";
import { saveLocalConsumo, deleteLocalComanda, saveLocalComanda, saveLocalMesaEstado } from "./ordersLocal";

export async function commitCheckout(args: {
  writes: readonly LocalFirstWrite[];
  prints: ReadonlyArray<{ id: string; label: string; print: () => Promise<PrintThermalResult> }>;
}): Promise<void> {
  const desktopCommit = typeof window !== "undefined" ? window.electronAPI?.commitCheckout : undefined;
  if (desktopCommit) {
    const tenantIds = new Set(args.writes.map((write) => write.tenantId));
    if (tenantIds.size !== 1) throw new Error("Desktop checkout must contain writes for exactly one tenant.");
    const tenantId = tenantIds.values().next().value as string;
    await desktopCommit({ tenantId, writes: [...args.writes] });
    for (const print of args.prints) enqueueThermalPrint(print);
    return;
  }

  const otherDomainWrites = args.writes.filter(
    (w) =>
      w.tableName !== "facturas" &&
      w.tableName !== "comandas" &&
      w.tableName !== "mesas_estado" &&
      w.tableName !== "consumos"
  );

  // 1. Invoices are authoritative in SQLite (Desktop) or Supabase (Web). Never IndexedDB.
  const facturaWrites = args.writes.filter((w) => w.tableName === "facturas");
  for (const fw of facturaWrites) {
    if (fw.payload) {
      await saveLocalInvoice(fw.payload);
      await processInvoiceInventoryDeduction(fw.tenantId, fw.payload, fw.authUserId, fw.deviceId);
    }
  }

  // 2. Consumos are authoritative in SQLite (Desktop) or Supabase (Web). Never IndexedDB.
  // Paid before comandas are deleted so kitchen and billing stay in sync
  const consumoWrites = args.writes.filter((w) => w.tableName === "consumos");
  for (const cw of consumoWrites) {
    if (cw.payload) await saveLocalConsumo(cw.tenantId, { ...cw.payload, id: cw.rowId });
  }

  // 3. Comandas are authoritative in SQLite (Desktop) or Supabase (Web). Never IndexedDB.
  const comandaWrites = args.writes.filter((w) => w.tableName === "comandas");
  for (const cw of comandaWrites) {
    if (cw.op === "delete") {
      await deleteLocalComanda(cw.tenantId, cw.rowId);
    } else if (cw.payload) {
      await saveLocalComanda(cw.tenantId, cw.payload);
    }
  }

  // 4. Mesas estado are authoritative in SQLite (Desktop) or Supabase (Web). Never IndexedDB.
  const mesaWrites = args.writes.filter((w) => w.tableName === "mesas_estado");
  for (const mw of mesaWrites) {
    if (mw.payload) {
      await saveLocalMesaEstado(mw.tenantId, mw.payload);
    }
  }

  if (otherDomainWrites.length > 0) {
    await enqueueLocalWritesAtomically(otherDomainWrites);
  }

  for (const print of args.prints) enqueueThermalPrint(print);
}
