import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { toRemoteBranchId } from "./branchSentinel";

export interface GhostCycleCloudPort {
  findExistingCycleIds(ids: string[]): Promise<string[]>;
  findEarliestLaterCycle(
    sucursalId: string | null,
    afterIso: string,
  ): Promise<{ id: string; cycle_number: number; opened_at: string } | null>;
}

export interface ReconcileGhostCyclesResult {
  closed: Array<{
    id: string;
    cycleNumber: number | null;
    closedAt: string;
    supersededByCycleNumber: number;
  }>;
}

export interface GhostCycleCandidate {
  id: string;
  tenantId: string;
  sucursalId: string | null;
  effectiveSucursalId: string | null;
  cycleNumber: number | null;
  openedAtIso: string;
}

interface LocalCycleRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  cycle_number: number | null;
  opened_at: string | null;
  created_at: string | null;
  state: string;
}

/**
 * Evaluates whether a sync_outbox error_json value represents a remote conflict
 * (e.g. unique constraint 23505, duplicate cycle number, or concurrent open cycle).
 */
export function isConflictOutboxError(errorJson: string | null): boolean {
  if (!errorJson) return false;
  try {
    const parsed = JSON.parse(errorJson);
    if (!parsed || typeof parsed !== "object") return false;

    // (a) conflict key present (object or true)
    if (parsed.conflict === true || (parsed.conflict && typeof parsed.conflict === "object")) {
      return true;
    }

    // (b) code === "23505"
    if (parsed.code === "23505" || String(parsed.code) === "23505") {
      return true;
    }

    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    const message = typeof parsed.message === "string" ? parsed.message : "";
    const reasonLower = reason.toLowerCase();
    const messageLower = message.toLowerCase();
    const combined = `${reasonLower} ${messageLower}`;

    // (c) reason/message containing "23505", "duplicate key", or "ya existe un ciclo operativo abierto"
    if (
      combined.includes("23505") ||
      combined.includes("duplicate key") ||
      combined.includes("ya existe un ciclo operativo abierto")
    ) {
      return true;
    }

    // When stored JSON has no conflict key (e.g. classifyRemoteError returned { reason: "Remote upsert conflict for cierres_operativos..." }),
    // match exactly the prefix "Remote " + "conflict for cierres_operativos".
    if (
      (reason.startsWith("Remote ") || message.startsWith("Remote ")) &&
      combined.includes("conflict for cierres_operativos")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Finds local open operational cycles that are eligible candidates for ghost reconciliation:
 * 1. state = 'open'
 * 2. Has zero outbox rows, OR every outbox row is a confirmed remote conflict.
 * 3. opened_at parses to a valid finite timestamp.
 */
export function findGhostCycleCandidates(
  db: DatabaseSync,
  tenantId: string,
): GhostCycleCandidate[] {
  const rows = db
    .prepare(
      `
      SELECT id, tenant_id, sucursal_id, cycle_number, opened_at, created_at, state
      FROM cierres_operativos
      WHERE tenant_id = ? AND state = 'open'
    `,
    )
    .all(tenantId) as LocalCycleRow[];

  const candidates: GhostCycleCandidate[] = [];

  const outboxStmt = db.prepare(`
    SELECT id, error_json
    FROM sync_outbox
    WHERE tenant_id = ? AND table_name = 'cierres_operativos' AND row_id = ?
  `);

  for (const row of rows) {

    const outboxRows = outboxStmt.all(tenantId, row.id) as Array<{
      id: string;
      error_json: string | null;
    }>;

    // Must have no outbox rows or every outbox row must be a conflict.
    // If any row has error_json IS NULL or is a transient error, it is legitimately pending.
    const isCandidate =
      outboxRows.length === 0 ||
      outboxRows.every((ob) => isConflictOutboxError(ob.error_json));

    if (!isCandidate) continue;

    const openedAtIso = row.opened_at || row.created_at;
    if (!openedAtIso) continue;

    const parsedEpoch = Date.parse(openedAtIso);
    if (!Number.isFinite(parsedEpoch)) continue;

    const effectiveSucursalId = toRemoteBranchId(row.sucursal_id);

    candidates.push({
      id: row.id,
      tenantId: row.tenant_id,
      sucursalId: row.sucursal_id,
      effectiveSucursalId,
      cycleNumber: row.cycle_number,
      openedAtIso,
    });
  }

  return candidates;
}

/**
 * Reconciles and auto-closes local ghost cycles that the cloud never accepted and
 * were superseded by a subsequent cloud cycle for the same branch.
 */
export async function reconcileGhostCycles(
  db: DatabaseSync,
  tenantId: string,
  cloudPort: GhostCycleCloudPort,
): Promise<ReconcileGhostCyclesResult> {
  const candidates = findGhostCycleCandidates(db, tenantId);
  if (candidates.length === 0) {
    return { closed: [] };
  }

  // Check which candidate IDs exist in cloud. Any cloud error here will throw and abort.
  const candidateIds = candidates.map((c) => c.id);
  const existingCloudIds = await cloudPort.findExistingCycleIds(candidateIds);
  const existingSet = new Set(existingCloudIds.map(String));

  const nonExisting = candidates.filter((c) => !existingSet.has(c.id));
  if (nonExisting.length === 0) {
    return { closed: [] };
  }

  // Find the earliest later cloud cycle for each candidate.
  const confirmed: Array<{
    candidate: GhostCycleCandidate;
    earliestLater: { id: string; cycle_number: number; opened_at: string };
  }> = [];

  for (const c of nonExisting) {
    const candEpoch = Date.parse(c.openedAtIso);

    const earliestLater = await cloudPort.findEarliestLaterCycle(c.effectiveSucursalId, c.openedAtIso);
    if (!earliestLater) continue;

    const cloudEpoch = Date.parse(earliestLater.opened_at);
    if (cloudEpoch <= candEpoch) continue;

    confirmed.push({
      candidate: c,
      earliestLater,
    });
  }

  if (confirmed.length === 0) {
    return { closed: [] };
  }

  // Write phase in a single SQLite transaction
  db.exec("BEGIN IMMEDIATE;");
  try {
    const closed: ReconcileGhostCyclesResult["closed"] = [];

    const updateCycleStmt = db.prepare(`
      UPDATE cierres_operativos
      SET state = 'closed', closed_at = ?
      WHERE id = ? AND state = 'open'
    `);

    const selectOutboxStmt = db.prepare(`
      SELECT id, error_json
      FROM sync_outbox
      WHERE tenant_id = ? AND table_name = 'cierres_operativos' AND row_id = ?
    `);

    const updateOutboxStmt = db.prepare(`
      UPDATE sync_outbox
      SET error_json = ?
      WHERE id = ?
    `);

    const insertAuditStmt = db.prepare(`
      INSERT INTO sync_errors (id, tenant_id, table_name, row_id, error_message, created_at)
      VALUES (?, ?, 'cierres_operativos', ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const { candidate, earliestLater } of confirmed) {
      // Re-check state='open'
      const updateRes = updateCycleStmt.run(earliestLater.opened_at, candidate.id);
      if (updateRes.changes === 0) {
        continue;
      }

      // Update sync_outbox rows (keep row, mark retryable: false so claim() stops claiming it)
      const outboxRows = selectOutboxStmt.all(tenantId, candidate.id) as Array<{
        id: string;
        error_json: string | null;
      }>;
      for (const ob of outboxRows) {
        let parsed: Record<string, unknown> = {};
        if (ob.error_json) {
          try {
            const p = JSON.parse(ob.error_json);
            if (p && typeof p === "object") parsed = p;
          } catch {}
        }
        const merged = {
          ...parsed,
          retryable: false,
          reason: "ghost_cycle_auto_closed",
          ghostCycle: true,
        };
        updateOutboxStmt.run(JSON.stringify(merged), ob.id);
      }

      // Insert audit row in sync_errors
      const cycleNumberStr = candidate.cycleNumber != null ? `#${candidate.cycleNumber}` : candidate.id;
      const auditMsg = `Ghost cycle ${cycleNumberStr} auto-closed: not present in cloud, superseded by cloud cycle #${earliestLater.cycle_number} opened ${earliestLater.opened_at}`;
      insertAuditStmt.run(randomUUID(), tenantId, candidate.id, auditMsg);

      closed.push({
        id: candidate.id,
        cycleNumber: candidate.cycleNumber,
        closedAt: earliestLater.opened_at,
        supersededByCycleNumber: earliestLater.cycle_number,
      });
    }

    db.exec("COMMIT;");
    return { closed };
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {}
    throw err;
  }
}

/**
 * Creates a GhostCycleCloudPort backed by the Supabase table client for cierres_operativos.
 */
export function createSupabaseGhostCycleCloudPort(
  tableClientProvider: (table: string) => Promise<any> | any,
  tenantId: string,
): GhostCycleCloudPort {
  return {
    async findExistingCycleIds(ids: string[]): Promise<string[]> {
      if (ids.length === 0) return [];
      const tableClient = await tableClientProvider("cierres_operativos");
      const { data, error } = await tableClient
        .select("id")
        .eq("tenant_id", tenantId)
        .in("id", ids);
      if (error) {
        throw new Error(`Failed to check existing cycle IDs in cloud: ${error.message}`);
      }
      return ((data as Array<{ id: unknown }>) ?? []).map((row) => String(row.id));
    },

    async findEarliestLaterCycle(
      sucursalId: string | null,
      afterIso: string,
    ): Promise<{ id: string; cycle_number: number; opened_at: string } | null> {
      const tableClient = await tableClientProvider("cierres_operativos");
      let query = tableClient
        .select("id, cycle_number, opened_at")
        .eq("tenant_id", tenantId)
        .gt("opened_at", afterIso);

      if (sucursalId === null) {
        query = query.is("sucursal_id", null);
      } else {
        query = query.eq("sucursal_id", sucursalId);
      }

      query = query.order("opened_at", { ascending: true }).limit(1);

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to query later cycles in cloud: ${error.message}`);
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;

      return {
        id: String(row.id),
        cycle_number: Number(row.cycle_number),
        opened_at: String(row.opened_at),
      };
    },
  };
}
