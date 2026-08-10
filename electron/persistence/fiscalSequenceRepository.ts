import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const STALE_LEASE_MS = 5 * 60 * 1000;

export type FiscalSequenceAllocation = {
  id: string;
  sequenceNumber: number;
  status: "reserved";
};

/** Main-process-only local reservation; it does not dispatch or accept fiscal documents. */
export class FiscalSequenceRepository {
  constructor(private readonly input: {
    database: DatabaseSync;
    tenantId: string;
    branchId: string;
    createId?: () => string;
    now?: () => string;
  }) {}

  allocate(documentType: string): FiscalSequenceAllocation {
    const now = this.input.now?.() ?? new Date().toISOString();
    const staleBefore = new Date(Date.parse(now) - STALE_LEASE_MS).toISOString();
    const id = this.input.createId?.() ?? randomUUID();
    const { database, tenantId, branchId } = this.input;

    database.exec("BEGIN IMMEDIATE;");
    try {
      database.prepare("UPDATE ecf_sequence_allocations SET status = 'reserved' WHERE tenant_id = ? AND sucursal_id = ? AND document_type = ? AND status = 'allocating' AND allocated_at <= ?")
        .run(tenantId, branchId, documentType, staleBefore);
      const row = database.prepare("SELECT COALESCE(MAX(sequence_number), 0) + 1 AS sequence_number FROM ecf_sequence_allocations WHERE tenant_id = ? AND sucursal_id = ? AND document_type = ?")
        .get(tenantId, branchId, documentType) as { sequence_number: number };
      database.prepare("INSERT INTO ecf_sequence_allocations (id, tenant_id, sucursal_id, document_type, sequence_number, status, allocated_at) VALUES (?, ?, ?, ?, ?, 'allocating', ?)")
        .run(id, tenantId, branchId, documentType, row.sequence_number, now);
      database.prepare("UPDATE ecf_sequence_allocations SET status = 'reserved' WHERE id = ?").run(id);
      database.exec("COMMIT;");
      return { id, sequenceNumber: row.sequence_number, status: "reserved" };
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  }
}
