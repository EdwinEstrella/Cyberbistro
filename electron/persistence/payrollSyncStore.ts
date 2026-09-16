import type { DatabaseSync } from "node:sqlite";
import { DurableSyncStore, DurableOperation, DurableOperationStatus, DurableOperationKind, PullBatch } from "./syncWorker";
import { applyCloudExpenseRows, applyCloudExpenseCategoryRows, applyCloudCustomerRows, applyCloudDeletes } from "./cloudApply";
import { createHash } from "node:crypto";

/** Tables whose cloud→local pull is implemented (Camino B, stage 1). */
const PULLABLE_TABLES = new Set(["gastos", "gasto_categorias", "customers"]);

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

export class SQLitePayrollSyncStore implements DurableSyncStore {
  private active = true;

  constructor(
    private readonly db: DatabaseSync,
    private readonly tenantId: string
  ) {
    this.releaseClaims();
  }

  deactivate(): void {
    this.active = false;
  }

  releaseClaims(): void {
    this.db.prepare(`
      UPDATE sync_outbox
      SET status = 'pending', error_json = NULL
      WHERE tenant_id = ?
        AND (
          table_name IN ('payroll_employees', 'payroll_payments', 'payroll_payment_adjustments', 'gasto_categorias', 'customers', 'cierres_operativos')
          OR (
            table_name = 'gastos'
            AND (
              operation = 'delete'
              OR (
                json_valid(payload_json) = 1
                AND json_extract(payload_json, '$.expenseType') IN ('payroll', 'operational')
              )
            )
          )
        )
    `).run(this.tenantId);
  }

  get operations(): DurableOperation[] {
    return [];
  }

  commitMutation(operation: DurableOperation): void {
    // Existing schema pushes to sync_outbox via repository directly.
    // This adapter acts purely as a consumer for phase 1.
    throw new Error("commitMutation not implemented for legacy sync_outbox bridge");
  }

  claim(nowMs: number): DurableOperation[] {
    if (!this.active) {
      return [];
    }

    // Operational cycles use the same durable claim path, but the client only
    // reconciles exact remote IDs and never applies a legacy close.
    // Payroll rows:
    // payroll_employees, payroll_payments, payroll_payment_adjustments,
    // and gastos where payload_json has expenseType = 'payroll'.
    
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const candidates = this.db.prepare(`
        SELECT id, tenant_id, branch_id, table_name, row_id, operation, payload_json, error_json
        FROM sync_outbox 
        WHERE status = 'pending' 
          AND tenant_id = ?
          AND (
            error_json IS NULL
            OR json_valid(error_json) = 0
            OR COALESCE(json_extract(error_json, '$.retryable'), 1) = 1
          )
          AND (
            table_name IN ('payroll_employees', 'payroll_payments', 'payroll_payment_adjustments', 'gasto_categorias', 'customers', 'cierres_operativos')
            OR (
              table_name = 'gastos'
              AND (
                operation = 'delete'
                OR (
                  json_valid(payload_json) = 1
                  AND json_extract(payload_json, '$.expenseType') IN ('payroll', 'operational')
                )
              )
            )
          )
        ORDER BY rowid ASC
        LIMIT 50
      `).all(this.tenantId) as Array<{
        id: string;
        tenant_id: string;
        branch_id: string;
        table_name: string;
        row_id: string;
        operation: DurableOperationKind;
        payload_json: string;
        error_json: string | null;
      }>;

      if (candidates.length === 0) {
        this.db.exec("COMMIT;");
        return [];
      }

      const invalidPayloadIds: string[] = [];
      const claimIds: string[] = [];
      const claimedOperations: DurableOperation[] = [];

      for (const row of candidates) {
        const payloadResult = safeParseJson(row.payload_json);
        if (!payloadResult.ok) {
          invalidPayloadIds.push(row.id);
          continue;
        }

        if (!isClaimablePayrollRow(row.table_name, payloadResult.value, row.operation)) {
          continue;
        }

        const errorResult = safeParseJson(row.error_json);
        const payload = payloadResult.value as Record<string, unknown> | null;
        claimIds.push(row.id);
        claimedOperations.push({
          id: row.id,
          tenantId: row.tenant_id,
          branchId: row.branch_id,
          tableName: row.table_name,
          rowId: row.row_id,
          op: row.operation,
          payload,
          payloadHash: hashCanonical({
            tenantId: row.tenant_id,
            tableName: row.table_name,
            rowId: row.row_id,
            op: row.operation,
            payload,
            sequence: 0,
            deviceId: "local"
          }),
          sequence: 0,
          deviceId: "local",
          status: "syncing" as DurableOperationStatus,
          leaseUntil: nowMs + 60000,
          result: errorResult.ok ? (errorResult.value as Record<string, unknown> | null) : {
            reason: "Invalid stored error_json",
            detail: errorResult.error,
          }
        });
      }

      if (invalidPayloadIds.length > 0) {
        const invalidPlaceholders = invalidPayloadIds.map(() => "?").join(",");
        this.db.prepare(`
          UPDATE sync_outbox
          SET status = 'pending', error_json = ?
          WHERE id IN (${invalidPlaceholders})
        `).run(
          JSON.stringify({ reason: "Invalid payload_json", category: "invalid_json", retryable: false }),
          ...invalidPayloadIds
        );
      }

      if (claimIds.length === 0) {
        this.db.exec("COMMIT;");
        return [];
      }

      const placeholders = claimIds.map(() => "?").join(",");
      this.db.prepare(`
        UPDATE sync_outbox 
        SET status = 'syncing'
        WHERE id IN (${placeholders})
      `).run(...claimIds);

      this.db.exec("COMMIT;");
      return claimedOperations;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  settle(id: string, status: DurableOperationStatus, result: Record<string, unknown> | null): void {
    if (!this.active) {
      return;
    }

    if (status === "synced") {
      this.db.prepare("DELETE FROM sync_outbox WHERE id = ?").run(id);
    } else {
      const storedResult = normalizeStoredResult(status, result);
      this.db.prepare(`
        UPDATE sync_outbox 
        SET status = 'pending', error_json = ? 
        WHERE id = ?
      `).run(storedResult ? JSON.stringify(storedResult) : null, id);
    }
  }

  applyPull(batch: PullBatch): void {
    if (!this.active) return;

    // Group changes by table so each mapper runs once per table.
    const upsertsByTable = new Map<string, Array<Record<string, unknown>>>();
    const deletesByTable = new Map<string, string[]>();
    for (const change of batch.changes ?? []) {
      if (!PULLABLE_TABLES.has(change.tableName)) continue;
      if (change.deleted) {
        const ids = deletesByTable.get(change.tableName) ?? [];
        ids.push(change.rowId);
        deletesByTable.set(change.tableName, ids);
      } else if (change.payload && typeof change.payload === "object") {
        const rows = upsertsByTable.get(change.tableName) ?? [];
        rows.push({ id: change.rowId, ...change.payload });
        upsertsByTable.set(change.tableName, rows);
      }
    }

    // Rows AND cursor must commit atomically so an interrupted pull never
    // advances the cursor past changes that were not applied.
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const expenseCats = upsertsByTable.get("gasto_categorias");
      if (expenseCats?.length) applyCloudExpenseCategoryRows(this.db, this.tenantId, expenseCats);
      const expenses = upsertsByTable.get("gastos");
      if (expenses?.length) applyCloudExpenseRows(this.db, this.tenantId, expenses);
      const customers = upsertsByTable.get("customers");
      if (customers?.length) applyCloudCustomerRows(this.db, this.tenantId, customers);

      for (const [tableName, ids] of deletesByTable) {
        applyCloudDeletes(this.db, tableName, ids);
      }

      const appliedCount = batch.changes?.length ?? 0;
      this.db.prepare(`
        INSERT INTO sync_state (key, tenant_id, table_name, phase, cursor, completed, row_count, updated_at)
        VALUES (?, ?, '__pull__', 'incremental', ?, 1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          cursor = excluded.cursor,
          row_count = excluded.row_count,
          updated_at = CURRENT_TIMESTAMP
      `).run(this.pullCursorKey(), this.tenantId, batch.cursor ?? null, appliedCount);

      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  getCursor(): string | null {
    const row = this.db.prepare("SELECT cursor FROM sync_state WHERE key = ?").get(this.pullCursorKey()) as { cursor: string | null } | undefined;
    return row?.cursor ?? null;
  }

  private pullCursorKey(): string {
    return `${this.tenantId}:pull`;
  }
}

function isClaimablePayrollRow(tableName: string, payload: unknown, op: string): boolean {
  if (tableName === "gasto_categorias" || tableName === "customers") return true;
  if (tableName !== "gastos") return true;
  // Deletions carry no expenseType semantics worth gating on: a gasto removed
  // locally (any type, including 'purchase') must also be removed in the cloud
  // through the durable outbox instead of a direct Supabase call.
  if (op === "delete") return true;
  if (!payload || typeof payload !== "object") return false;
  const expenseType = (payload as Record<string, unknown>).expenseType;
  return expenseType === "payroll" || expenseType === "operational";
}

function safeParseJson(raw: string | null): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

function normalizeStoredResult(status: DurableOperationStatus, result: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!result) {
    return status === "not_retryable" ? { reason: "Not retryable", retryable: false } : null;
  }

  if (status === "not_retryable") {
    return { ...result, retryable: false };
  }

  return result;
}
