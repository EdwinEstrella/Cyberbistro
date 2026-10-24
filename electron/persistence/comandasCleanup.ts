import type { DatabaseSync } from "node:sqlite";

/**
 * Deletes one comanda after clearing the two local references to it, or the
 * DELETE trips a foreign-key constraint: consumos.comanda_id is nullable
 * (unlink - consumos are kept, they belong to their factura), while
 * produccion_cocina.comanda_id is NOT NULL, so those local-only kitchen rows
 * are removed with the comanda.
 */
export function deleteComandaWithReferences(db: DatabaseSync, comandaId: string, tenantId?: string): void {
  const scope = tenantId ? " AND tenant_id = ?" : "";
  const args = tenantId ? [comandaId, tenantId] : [comandaId];
  db.prepare(`UPDATE consumos SET comanda_id = NULL WHERE comanda_id = ?${scope}`).run(...args);
  db.prepare(`DELETE FROM produccion_cocina WHERE comanda_id = ?${scope}`).run(...args);
  db.prepare(`DELETE FROM comandas WHERE id = ?${scope}`).run(...args);
}
