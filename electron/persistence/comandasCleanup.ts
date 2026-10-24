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

/**
 * Deletes comandas older than `days`. created_at may be ISO
 * ('2026-10-10T08:00:00.123+00:00') or SQLite ('2026-10-10 08:00:00'), so both
 * sides go through datetime() instead of a lexical string comparison. Rows with
 * no parseable created_at (FK stubs) are kept; the cierre purge removes them.
 */
export function purgeExpiredComandasOlderThan(db: DatabaseSync, tenantId: string, days = 3, now = Date.now()): number {
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(
    "SELECT id FROM comandas WHERE tenant_id = ? AND datetime(created_at) < datetime(?)",
  ).all(tenantId, cutoff) as Array<{ id: string }>;
  for (const row of rows) deleteComandaWithReferences(db, row.id, tenantId);
  return rows.length;
}
