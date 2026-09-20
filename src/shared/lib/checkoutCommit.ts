import { enqueueLocalWritesAtomically, type LocalFirstWrite } from "./localFirst";
import { enqueueThermalPrint, type PrintThermalResult } from "./thermalPrint";
import { saveLocalInvoice } from "../../features/billing/lib/invoicesLocal";
import { saveLocalConsumo, deleteLocalComanda } from "./ordersLocal";

/**
 * A paid consumo belongs to its factura, not to the comanda that is being
 * deleted at checkout. Dropping the comanda link at the source removes the
 * foreign-key race that used to leave consumos stuck (`consumos_comanda_id_fkey`):
 * the row no longer references a comanda that another engine deletes in the
 * cloud, and the local comanda delete below can never hit a FK error either.
 * factura_id is preserved — dropping the invoice link is what reopens paid tables.
 */
export function unlinkPaidConsumoFromComanda(write: LocalFirstWrite): LocalFirstWrite {
  if (write.tableName !== "consumos" || !write.payload) return write;
  const isPaid = write.payload.estado === "pagado" || Boolean(write.payload.factura_id);
  if (!isPaid) return write;
  return { ...write, payload: { ...write.payload, comanda_id: null } };
}

export async function commitCheckout(args: {
  writes: readonly LocalFirstWrite[];
  prints: ReadonlyArray<{ id: string; label: string; print: () => Promise<PrintThermalResult> }>;
}): Promise<void> {
  const writes = args.writes.map(unlinkPaidConsumoFromComanda);
  const hasSqlite = typeof window !== "undefined" && Boolean(window.electronAPI?.saveInvoiceLocal);
  if (hasSqlite) {
    const facturaWrites = writes.filter((w) => w.tableName === "facturas");
    const consumoWrites = writes.filter((w) => w.tableName === "consumos");
    const comandaDeletes = writes.filter((w) => w.tableName === "comandas" && w.op === "delete");
    const otherWrites = writes.filter(
      (w) => w.tableName !== "facturas" && w.tableName !== "consumos" && !(w.tableName === "comandas" && w.op === "delete"),
    );

    // Order matters: the invoice must exist before its consumos reference it,
    // and the consumos must be unlinked (above) before their comanda is deleted.
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
    // Delete comandas through the SAME SQLite outbox instead of the IndexedDB
    // queue, so the whole order/consumo/comanda flow lives in one engine.
    for (const cd of comandaDeletes) {
      await deleteLocalComanda(cd.tenantId, cd.rowId);
    }
    if (otherWrites.length > 0) {
      await enqueueLocalWritesAtomically(otherWrites);
    }
  } else {
    await enqueueLocalWritesAtomically(writes);
  }

  for (const print of args.prints) enqueueThermalPrint(print);
}
