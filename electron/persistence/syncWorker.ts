import { createHash, randomUUID } from "node:crypto";

export type DurableOperationStatus = "pending" | "syncing" | "synced" | "conflicted" | "not_retryable";
export type DurableOperationKind = "insert" | "update" | "upsert" | "delete";

export interface DurableOperation {
  id: string;
  tenantId: string;
  branchId?: string;
  tableName: string;
  rowId: string;
  op: DurableOperationKind;
  payload: Record<string, unknown> | null;
  payloadHash: string;
  sequence: number;
  deviceId: string;
  status: DurableOperationStatus;
  leaseUntil: number;
  result: Record<string, unknown> | null;
}

export interface ServerChange {
  tableName: string;
  rowId: string;
  payload: Record<string, unknown>;
  deleted: boolean;
}

export interface PullBatch {
  cursor: string;
  changes: ServerChange[];
  /** Complete, tenant-scoped snapshots; absent previously downloaded IDs are deletions. */
  snapshotTables?: string[];
}

export interface DurableSyncStore {
  operations: DurableOperation[];
  commitMutation(operation: DurableOperation): void;
  claim(nowMs: number): DurableOperation[];
  settle(id: string, status: DurableOperationStatus, result: Record<string, unknown> | null): void;
  applyPull(batch: PullBatch): void;
  getCursor(): string | null;
}

export interface ServerSyncClient {
  push(operation: DurableOperation): Promise<{ result?: Record<string, unknown>; conflict?: { reason: string }; permanent?: Record<string, unknown> & { reason: string; retryable?: false } }>;
  /**
   * Optional bulk path: pushes several same-table, non-partial upsert operations
   * in a single request. Returns `{ ok: true }` when the whole group landed, or
   * `{ ok: false }` (optionally with the error) when the group cannot be sent as
   * one call — the worker then falls back to per-row {@link push} so every
   * row-level fallback (FK repair, conflict classification) still applies.
   */
  pushBatch?(operations: DurableOperation[]): Promise<{ ok: true } | { ok: false; error?: { message: string } }>;
  pull(input: { tenantId: string; cursor: string | null }): Promise<PullBatch>;
}

const MANUAL_CONFLICT_TABLES = new Set(["facturas", "ecf_documents", "fiscal_outbox", "cierres_operativos", "inventario_movimientos"]);

/** Creates immutable, tenant-bound operation metadata before a cloud attempt. */
export function createDurableOperation(input: Omit<DurableOperation, "payloadHash" | "status" | "leaseUntil" | "result" | "id"> & { id?: string }): DurableOperation {
  const payload = input.payload ?? null;
  return {
    ...input,
    id: input.id ?? randomUUID(),
    payload,
    payloadHash: hashCanonical({ tenantId: input.tenantId, tableName: input.tableName, rowId: input.rowId, op: input.op, payload, sequence: input.sequence, deviceId: input.deviceId }),
    status: "pending",
    leaseUntil: 0,
    result: null,
  };
}

/** Sync orchestration only; realtime may call pull(), but never supplies state or writes directly. */
export class DurableSyncWorker {
  constructor(
    private readonly store: DurableSyncStore,
    private readonly server: ServerSyncClient,
    private readonly tenantId: string,
  ) {}

  async push(nowMs = Date.now()): Promise<{ pushed: number; conflicted: number }> {
    let pushed = 0;
    let conflicted = 0;
    const claimed = this.store.claim(nowMs);
    // Iterate in sequence order, but coalesce a consecutive run of same-table
    // upserts into one bulk request (e.g. a mesa checkout stamping N consumos as
    // paid). Preserving order keeps cross-table FK dependencies intact; only
    // adjacent, independent upserts of the same table are grouped.
    let i = 0;
    while (i < claimed.length) {
      const operation = claimed[i];
      if (this.canBatch(operation)) {
        let j = i + 1;
        while (j < claimed.length && this.canBatch(claimed[j]) && claimed[j].tableName === operation.tableName) j++;
        const group = claimed.slice(i, j);
        if (group.length > 1) {
          const outcome = await this.pushGroup(group);
          pushed += outcome.pushed;
          conflicted += outcome.conflicted;
          i = j;
          continue;
        }
      }
      const one = await this.pushOne(operation);
      pushed += one.pushed;
      conflicted += one.conflicted;
      i++;
    }
    if (claimed.length > 0) {
      console.log(`[sync↑] resumen: ${pushed} subido(s), ${conflicted} con problema, de ${claimed.length} en cola`);
    }
    return { pushed, conflicted };
  }

  /** Eligible for bulk upsert: right tenant, a plain upsert, and a table with no
   * per-row conflict semantics. Everything else takes the per-row path. */
  private canBatch(operation: DurableOperation): boolean {
    return (
      Boolean(this.server.pushBatch) &&
      operation.tenantId === this.tenantId &&
      operation.op === "upsert" &&
      !MANUAL_CONFLICT_TABLES.has(operation.tableName)
    );
  }

  /** Sends a same-table group as one bulk upsert; on any batch failure falls back
   * to per-row pushes so the row-level fallbacks still run. */
  private async pushGroup(group: DurableOperation[]): Promise<{ pushed: number; conflicted: number }> {
    const tag = `${group[0].tableName} ×${group.length} (upsert lote)`;
    try {
      const response = await this.server.pushBatch!(group);
      if (response.ok) {
        for (const operation of group) this.store.settle(operation.id, "synced", {});
        console.log(`[sync↑] ${tag} → subido a la nube`);
        return { pushed: group.length, conflicted: 0 };
      }
    } catch (error) {
      console.warn(`[sync↑] ${tag} → lote falló, reintento fila por fila: ${error instanceof Error ? error.message : "batch failed"}`);
    }
    let pushed = 0;
    let conflicted = 0;
    for (const operation of group) {
      const one = await this.pushOne(operation);
      pushed += one.pushed;
      conflicted += one.conflicted;
    }
    return { pushed, conflicted };
  }

  /** Pushes a single operation and settles it. */
  private async pushOne(operation: DurableOperation): Promise<{ pushed: number; conflicted: number }> {
    const tag = `${operation.tableName} ${operation.rowId} (${operation.op})`;
    if (operation.tenantId !== this.tenantId) {
      this.store.settle(operation.id, "not_retryable", { reason: "Tenant mismatch" });
      console.warn(`[sync↑] ${tag} → BLOQUEADO: tenant mismatch`);
      return { pushed: 0, conflicted: 1 };
    }
    try {
      const response = await this.server.push(operation);
      if (response.permanent) {
        this.store.settle(operation.id, "not_retryable", { ...response.permanent, retryable: false });
        console.warn(`[sync↑] ${tag} → BLOQUEADO: ${String(response.permanent.reason)}`);
        return { pushed: 0, conflicted: 1 };
      }
      if (response.conflict || MANUAL_CONFLICT_TABLES.has(operation.tableName) && response.result?.["conflict"] === true) {
        this.store.settle(operation.id, "conflicted", response.conflict ?? response.result ?? { reason: "Manual conflict resolution required" });
        console.warn(`[sync↑] ${tag} → CONFLICTO (requiere intervención)`);
        return { pushed: 0, conflicted: 1 };
      }
      this.store.settle(operation.id, "synced", response.result ?? {});
      console.log(`[sync↑] ${tag} → subido a la nube`);
      return { pushed: 1, conflicted: 0 };
    } catch (error) {
      this.store.settle(operation.id, "pending", { reason: error instanceof Error ? error.message : "Cloud push failed" });
      console.warn(`[sync↑] ${tag} → reintenta luego: ${error instanceof Error ? error.message : "push failed"}`);
      return { pushed: 0, conflicted: 0 };
    }
  }

  async pull(): Promise<number> {
    const batch = await this.server.pull({ tenantId: this.tenantId, cursor: this.store.getCursor() });
    // Store implementations MUST commit rows/tombstones and cursor in one transaction.
    this.store.applyPull(batch);
    if (batch.changes.length > 0) {
      const byTable = new Map<string, number>();
      for (const change of batch.changes) byTable.set(change.tableName, (byTable.get(change.tableName) ?? 0) + 1);
      const detail = [...byTable.entries()].map(([table, count]) => `${table}:${count}`).join(", ");
      console.log(`[sync↓] bajaron ${batch.changes.length} cambio(s) de la nube (${detail})`);
    }
    return batch.changes.length;
  }
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
