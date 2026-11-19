import type { DatabaseSync } from "node:sqlite";
import { DurableSyncStore, DurableOperation, DurableOperationStatus, DurableOperationKind, PullBatch } from "./syncWorker";
import { reconcileGhostCycles, type GhostCycleCloudPort, type ReconcileGhostCyclesResult } from "./ghostCycleReconcile";
import { applyCloudTenantRows, applyCloudSucursalRows, applyCloudExpenseRows, applyCloudExpenseCategoryRows, applyCloudCustomerRows, applyCloudOperationalCycleRows, applyCloudFacturaRows, applyCloudCompraRows, applyCloudCompraFiscalRows, applyCloudReceivableRows, applyCloudPayableRows, applyCloudCxcPagoRows, applyCloudCxpPagoRows, applyCloudDeletes, applyCloudMenuCategoryRows, applyCloudPlatoRows, applyCloudInventoryProductRows, applyCloudRecipeRows, applyCloudMesasEstadoRows, applyCloudCocinaEstadoRows, applyCloudComandaRows, applyCloudConsumoRows } from "./cloudApply";
import { createHash } from "node:crypto";
import { applyCloudPayrollEmployees, applyCloudPayrollPayments, applyCloudPayrollAdjustments } from "./payrollCloudApply";
import { SYNC_PULL_TABLES, SYNC_PULLABLE_LOCAL_TABLES, SYNC_PULL_DELETE_ORDER } from "./syncPullRegistry";

type CloudRowApplier = (db: DatabaseSync, tenantId: string, rows: Array<Record<string, unknown>>) => void;

/** Maps each pullable local table to the function that persists its cloud rows. */
const PULL_APPLIERS: Record<string, CloudRowApplier> = {
  payroll_employees: applyCloudPayrollEmployees,
  payroll_payments: applyCloudPayrollPayments,
  payroll_cloud_adjustments: applyCloudPayrollAdjustments,
  sucursales: applyCloudSucursalRows,
  tenants: applyCloudTenantRows,
  gasto_categorias: applyCloudExpenseCategoryRows,
  gastos: applyCloudExpenseRows,
  customers: applyCloudCustomerRows,
  cierres_operativos: applyCloudOperationalCycleRows,
  facturas: applyCloudFacturaRows,
  compras: applyCloudCompraRows,
  compra_fiscal: applyCloudCompraFiscalRows,
  cuentas_cobrar: applyCloudReceivableRows,
  cxc_pagos: applyCloudCxcPagoRows,
  cuentas_pagar: applyCloudPayableRows,
  cxp_pagos: applyCloudCxpPagoRows,
  platos: applyCloudPlatoRows,
  menu_categories: applyCloudMenuCategoryRows,
  productos_inventario: applyCloudInventoryProductRows,
  recetas: applyCloudRecipeRows,
  mesas_estado: applyCloudMesasEstadoRows,
  cocina_estado: applyCloudCocinaEstadoRows,
  comandas: applyCloudComandaRows,
  consumos: applyCloudConsumoRows,
};

interface PullTableFailure {
  message: string;
  rowId: string | null;
}

/** Upper bound on rows re-applied one by one to find the failing row id. */
const MAX_FAILING_ROW_PROBE = 5000;

/** Tables whose cloud→local pull is implemented, declared once in the registry. */
const PULLABLE_TABLES = SYNC_PULLABLE_LOCAL_TABLES;

/** Tables supported for local→cloud durable outbox sync claims. */
export const SUPPORTED_OUTBOX_TABLES = [
  "payroll_employees",
  "payroll_payments",
  "payroll_payment_adjustments",
  "gasto_categorias",
  "customers",
  "cierres_operativos",
  "platos",
  "menu_categories",
  "facturas",
  "cuentas_cobrar",
  "cxc_pagos",
  "cuentas_pagar",
  "cxp_pagos",
  "mesas_estado",
  "cocina_estado",
  "comandas",
  "consumos",
  "compras",
  "detalles_compra",
  "compra_detalles",
  "compra_fiscal",
  "movimientos_inventario",
  "inventario_movimientos",
  "productos_inventario",
  "proveedores",
  "ecf_documents",
  "fiscal_outbox",
] as const;

const SUPPORTED_TABLES_SQL = SUPPORTED_OUTBOX_TABLES.map((t) => `'${t}'`).join(", ");

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

  async reconcileGhostCycles(port: GhostCycleCloudPort): Promise<ReconcileGhostCyclesResult> {
    return reconcileGhostCycles(this.db, this.tenantId, port);
  }

  releaseClaims(): void {
    this.db.prepare(`
      UPDATE sync_outbox
      SET status = 'pending', error_json = NULL
      WHERE tenant_id = ?
        AND status = 'syncing'
        AND (
          table_name IN (${SUPPORTED_TABLES_SQL})
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
            table_name IN (${SUPPORTED_TABLES_SQL})
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
      this.db.exec("BEGIN IMMEDIATE;");
      try {
        const outboxRow = this.db.prepare(
          "SELECT table_name, row_id FROM sync_outbox WHERE id = ?"
        ).get(id) as { table_name: string; row_id: string } | undefined;

        if (outboxRow) {
          if (outboxRow.table_name === "ecf_documents") {
            this.db.prepare(
              "UPDATE ecf_documents SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND status = 'pending_offline'"
            ).run(outboxRow.row_id, this.tenantId);
          } else if (outboxRow.table_name === "fiscal_outbox") {
            this.db.prepare(
              "UPDATE fiscal_outbox SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND status = 'pending_sync'"
            ).run(outboxRow.row_id, this.tenantId);
          } else if (outboxRow.table_name === "cierres_operativos" && result && result.renumberedCycleNumber != null) {
            const rawNumber = result.renumberedCycleNumber;
            const newCycleNumber = typeof rawNumber === "number" ? rawNumber : Number(rawNumber);
            if (Number.isFinite(newCycleNumber)) {
              this.applyCycleRenumber(outboxRow.row_id, id, newCycleNumber);
            }
          }
        }
        this.db.prepare("DELETE FROM sync_outbox WHERE id = ?").run(id);
        this.db.exec("COMMIT;");
      } catch (err) {
        this.db.exec("ROLLBACK;");
        throw err;
      }
    } else {
      const storedResult = normalizeStoredResult(status, result);
      this.db.prepare(`
        UPDATE sync_outbox 
        SET status = 'pending', error_json = ? 
        WHERE id = ?
      `).run(storedResult ? JSON.stringify(storedResult) : null, id);
    }
  }

  private applyCycleRenumber(cycleId: string, settledOutboxId: string, newCycleNumber: number): void {
    const selectOldCycleStmt = this.db.prepare(
      "SELECT cycle_number FROM cierres_operativos WHERE id = ? AND tenant_id = ?"
    );
    const updateCycleStmt = this.db.prepare(
      "UPDATE cierres_operativos SET cycle_number = ? WHERE id = ? AND tenant_id = ?"
    );
    const selectPendingOutboxStmt = this.db.prepare(
      "SELECT id, payload_json FROM sync_outbox WHERE tenant_id = ? AND table_name = 'cierres_operativos' AND row_id = ? AND id != ?"
    );
    const updatePendingOutboxStmt = this.db.prepare(
      "UPDATE sync_outbox SET payload_json = ? WHERE id = ?"
    );

    const cycleRow = selectOldCycleStmt.get(cycleId, this.tenantId) as { cycle_number: number | null } | undefined;
    const oldCycleNumber = cycleRow?.cycle_number ?? "?";

    updateCycleStmt.run(newCycleNumber, cycleId, this.tenantId);

    const pendingOutboxRows = selectPendingOutboxStmt.all(this.tenantId, cycleId, settledOutboxId) as Array<{
      id: string;
      payload_json: string | null;
    }>;

    for (const pending of pendingOutboxRows) {
      if (!pending.payload_json) continue;
      try {
        const payload = JSON.parse(pending.payload_json);
        if (payload && typeof payload === "object" && "cycleNumber" in payload) {
          payload.cycleNumber = newCycleNumber;
          updatePendingOutboxStmt.run(JSON.stringify(payload), pending.id);
        }
      } catch {
        // Ignore malformed JSON in pending row
      }
    }

    console.warn(`[sync↑] cierres_operativos ${cycleId} → ciclo renumerado #${oldCycleNumber} → #${newCycleNumber}`);
  }

  applyPull(batch: PullBatch): void {
    if (!this.active) return;

    // Snapshot imports are retried in full, so pending/conflicted local rows can
    // be protected without moving a timestamp cursor past their remote changes.
    const upsertsByTable = new Map<string, Array<Record<string, unknown>>>();
    const deletesByTable = new Map<string, string[]>();
    const snapshotIds = new Map<string, Set<string>>();
    for (const table of batch.snapshotTables ?? []) {
      if (!PULLABLE_TABLES.has(table)) throw new Error(`Unsupported snapshot table: ${table}`);
      snapshotIds.set(table, new Set());
    }
    for (const change of batch.changes ?? []) {
      if (!PULLABLE_TABLES.has(change.tableName)) continue;
      if (change.payload?.tenant_id != null && change.payload.tenant_id !== this.tenantId) throw new Error("Pull tenant mismatch");
      // rowId is normalized to string form; a cloud integer id (e.g. platos)
      // arrives as a number in the payload, so compare stringwise (identity for
      // the uuid tables) to keep the transport-integrity check without a false
      // type mismatch.
      if (change.payload?.id != null && String(change.payload.id) !== change.rowId) throw new Error("Pull row ID mismatch");
      if (!change.deleted) snapshotIds.get(change.tableName)?.add(change.rowId);
      if (this.hasPendingWrite(change.tableName, change.rowId)) continue;
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
    // advances the cursor past changes that were not applied. Each table is
    // isolated in its own SAVEPOINT so one bad row cannot roll back every other
    // table: a failing table is rolled back alone and recorded, the rest commit.
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const failed = new Map<string, PullTableFailure>();
      const attempted = new Set<string>();

      for (const table of SYNC_PULL_TABLES) {
        const rows = upsertsByTable.get(table.localTable);
        if (!rows?.length) continue;
        attempted.add(table.localTable);
        const applier = PULL_APPLIERS[table.localTable];
        if (!applier) continue;
        const failure = this.runIsolated(table.localTable, () => applier(this.db, this.tenantId, rows), () => this.locateFailingRow(applier, rows));
        if (failure) failed.set(table.localTable, failure);
      }

      // Client-side download failures (timeout, RLS, network): recorded like
      // applier failures. Such a table is absent from snapshotTables, so its
      // snapshot and rows stay untouched.
      for (const { table, message } of batch.failedTables ?? []) {
        if (!PULLABLE_TABLES.has(table) || failed.has(table)) continue;
        failed.set(table, { message: `No se pudo descargar de la nube: ${message}`.slice(0, 500), rowId: null });
      }

      // Only remove IDs acknowledged in a previous snapshot. Old, unsynced local
      // data is never treated as a remote deletion merely because it is absent.
      // A table that failed to apply is skipped entirely: reconciling deletes
      // against a snapshot we could not apply would delete rows by mistake.
      for (const [table, ids] of snapshotIds) {
        attempted.add(table);
        if (failed.has(table)) continue;
        const previous = this.db.prepare("SELECT cursor FROM sync_state WHERE key=?")
          .get(`${this.tenantId}:snapshot:${table}`) as { cursor: string } | undefined;
        const previousIds: string[] = previous ? JSON.parse(previous.cursor) : [];
        const deleted = deletesByTable.get(table) ?? [];
        for (const id of previousIds) if (!ids.has(id)) deleted.push(id);
        deletesByTable.set(table, deleted);
      }
      for (const table of SYNC_PULL_DELETE_ORDER) {
        if (failed.has(table)) continue;
        const ids = deletesByTable.get(table) ?? [];
        if (ids.length === 0) continue;
        attempted.add(table);
        const failure = this.runIsolated(table, () => {
          for (const id of ids) {
            if (this.hasPendingWrite(table, id) || !applyCloudDeletes(this.db, table, [id], this.tenantId)) {
              snapshotIds.get(table)?.add(id);
            }
          }
        }, () => null);
        if (failure) failed.set(table, failure);
      }
      for (const [table, ids] of snapshotIds) {
        if (failed.has(table)) continue;
        this.db.prepare(`INSERT INTO sync_state (key, tenant_id, table_name, phase, cursor, completed, row_count, updated_at)
          VALUES (?, ?, ?, 'incremental', ?, 1, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET cursor=excluded.cursor, row_count=excluded.row_count, updated_at=CURRENT_TIMESTAMP`)
          .run(`${this.tenantId}:snapshot:${table}`, this.tenantId, table, JSON.stringify([...ids]), ids.size);
      }

      // Persist per-table outcome: failures are recorded, tables that applied
      // cleanly in this pull have any earlier failure cleared.
      for (const table of attempted) {
        if (failed.has(table)) continue;
        this.db.prepare("DELETE FROM sync_pull_errors WHERE tenant_id = ? AND table_name = ?").run(this.tenantId, table);
      }
      for (const [table, failure] of failed) {
        console.error(`[sync↓] tabla ${table} falló al aplicar la bajada${failure.rowId ? ` (fila ${failure.rowId})` : ""}: ${failure.message}`);
        this.db.prepare(`INSERT INTO sync_pull_errors (tenant_id, table_name, message, row_id, occurred_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(tenant_id, table_name) DO UPDATE SET message=excluded.message, row_id=excluded.row_id, occurred_at=CURRENT_TIMESTAMP`)
          .run(this.tenantId, table, failure.message, failure.rowId);
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

  /**
   * Runs one table's work inside a SAVEPOINT. On error the savepoint is rolled
   * back (the outer transaction stays usable) and the failure is returned
   * instead of thrown, so other tables can still commit.
   */
  private runIsolated(table: string, work: () => void, locate: () => string | null): PullTableFailure | null {
    const savepoint = `pull_${table.replace(/[^A-Za-z0-9_]/g, "_")}`;
    this.db.exec(`SAVEPOINT ${savepoint};`);
    try {
      work();
      this.db.exec(`RELEASE ${savepoint};`);
      return null;
    } catch (err) {
      this.db.exec(`ROLLBACK TO ${savepoint};`);
      let rowId: string | null = null;
      try { rowId = locate(); } catch { /* diagnostic only */ }
      this.db.exec(`ROLLBACK TO ${savepoint};`);
      this.db.exec(`RELEASE ${savepoint};`);
      const message = err instanceof Error ? err.message : String(err);
      return { message: message.slice(0, 500), rowId };
    }
  }

  /**
   * Diagnostic only, run after a table failed and was rolled back: re-applies
   * the rows cumulatively (so parents earlier in the batch are present) and
   * returns the first row the applier rejects. The caller rolls everything back.
   */
  private locateFailingRow(applier: CloudRowApplier, rows: Array<Record<string, unknown>>): string | null {
    const limit = Math.min(rows.length, MAX_FAILING_ROW_PROBE);
    for (let i = 0; i < limit; i++) {
      this.db.exec("SAVEPOINT pull_probe;");
      try {
        applier(this.db, this.tenantId, [rows[i]]);
        this.db.exec("RELEASE pull_probe;");
      } catch {
        this.db.exec("ROLLBACK TO pull_probe;");
        this.db.exec("RELEASE pull_probe;");
        return rows[i].id == null ? null : String(rows[i].id);
      }
    }
    return null;
  }

  getCursor(): string | null {
    // Never throw from cursor lookup: a missing/unready sync_state simply means
    // "no cursor yet" → a full pull, which is the correct safe fallback.
    try {
      const row = this.db.prepare("SELECT cursor FROM sync_state WHERE key = ?").get(this.pullCursorKey()) as { cursor: string | null } | undefined;
      return row?.cursor ?? null;
    } catch {
      return null;
    }
  }

  private pullCursorKey(): string {
    return `${this.tenantId}:pull`;
  }

  private hasPendingWrite(table: string, id: string): boolean {
    const outboxTable = table === "payroll_cloud_adjustments" ? "payroll_payment_adjustments" : table;
    return Boolean(this.db.prepare("SELECT 1 FROM sync_outbox WHERE tenant_id=? AND table_name=? AND row_id=? LIMIT 1")
      .get(this.tenantId, outboxTable, id));
  }
}

function isClaimablePayrollRow(tableName: string, payload: unknown, op: string): boolean {
  if (tableName === "gasto_categorias" || tableName === "customers" || tableName === "platos" || tableName === "menu_categories") return true;
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
