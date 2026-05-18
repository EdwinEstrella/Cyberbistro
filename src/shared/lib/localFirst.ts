import { insforgeClient } from "./insforge";

export const LOCAL_FIRST_MIRROR_TABLES = [
  "tenants",
  "tenant_users",
  "configuracion",
  "platos",
  "menu_categories",
  "mesas_estado",
  "cocina_estado",
  "comandas",
  "consumos",
  "facturas",
  "cierres_operativos",
  "gastos",
  "gasto_categorias",
] as const;

export const LOCAL_FIRST_METADATA_TABLES = [
  "sync_outbox",
  "sync_state",
  "sync_errors",
  "local_device_session",
  "local_license_cache",
] as const;

export const LOCAL_FIRST_IMMEDIATE_TABLES = [
  "tenants",
  "tenant_users",
  "configuracion",
  "menu_categories",
  "platos",
  "mesas_estado",
  "cocina_estado",
  "cierres_operativos",
  "comandas",
  "consumos",
  "facturas",
] as const;

export const LOCAL_FIRST_HISTORY_TABLES = [
  "tenants",
  "tenant_users",
  "configuracion",
  "menu_categories",
  "platos",
  "mesas_estado",
  "cocina_estado",
  "cierres_operativos",
  "comandas",
  "facturas",
  "consumos",
  "gasto_categorias",
  "gastos",
] as const;

export type LocalFirstMirrorTable = (typeof LOCAL_FIRST_MIRROR_TABLES)[number];
export type LocalFirstMetadataTable = (typeof LOCAL_FIRST_METADATA_TABLES)[number];
export type LocalFirstPhase = "minimum" | "history" | "incremental";
export type LocalWriteMode = "desktop-local-first" | "web-server-first";
export type LocalFirstStatus =
  | "idle"
  | "bootstrapping_minimum"
  | "ready_history_syncing"
  | "history_complete"
  | "offline"
  | "syncing"
  | "error";

export interface SyncStateRow {
  key: string;
  tenant_id: string;
  table_name: LocalFirstMirrorTable;
  phase: LocalFirstPhase;
  cursor: string | null;
  completed: boolean;
  row_count: number;
  updated_at: string;
  last_error: string | null;
}

export interface SyncOutboxEntry {
  id: string;
  tenant_id: string;
  table_name: LocalFirstMirrorTable;
  row_id: string;
  op: "insert" | "update" | "delete" | "upsert";
  payload: Record<string, unknown> | null;
  created_at: string;
  created_by_auth_user_id: string | null;
  device_id: string;
  status: "pending" | "syncing" | "synced" | "error" | "not_retryable";
  syncing_started_at?: string | null;
  error_message: string | null;
}

export type SyncRetryStatus = "retryable" | "not_retryable" | "max_retries_exceeded";

export interface IncrementalCursor {
  updated_at: string;
  id: string;
}

const COMPOSITE_UPSERT_CONFLICT_TABLES = new Set<LocalFirstMirrorTable>(["mesas_estado"]);
const LOCAL_FIRST_PHASES = ["minimum", "history", "incremental"] as const satisfies readonly LocalFirstPhase[];

function isTenantScopedMirrorTable(tableName: LocalFirstMirrorTable): boolean {
  return tableName !== "tenants";
}

export function resolveMirrorStoreKeyPath(tableName: LocalFirstMirrorTable): "id" | "clave" {
  return tableName === "configuracion" ? "clave" : "id";
}

function normalizeObjectStoreKeyPath(keyPath: IDBObjectStore["keyPath"]): string | null {
  return typeof keyPath === "string" ? keyPath : null;
}

export function buildMirrorStoreResetSyncStateKeys(tenantId: string, tableName: LocalFirstMirrorTable): string[] {
  return LOCAL_FIRST_PHASES.map((phase) => buildSyncStateKey(tenantId, tableName, phase));
}

function applyLocalFirstDbSchema(db: IDBDatabase, tx: IDBTransaction, tenantId: string): void {
  const recreatedMirrorTables: LocalFirstMirrorTable[] = [];

  for (const table of LOCAL_FIRST_MIRROR_TABLES) {
    const expectedKeyPath = resolveMirrorStoreKeyPath(table);
    if (!db.objectStoreNames.contains(table)) {
      db.createObjectStore(table, { keyPath: expectedKeyPath });
      continue;
    }

    const currentStore = tx.objectStore(table);
    const currentKeyPath = normalizeObjectStoreKeyPath(currentStore.keyPath);
    if (currentKeyPath !== expectedKeyPath) {
      db.deleteObjectStore(table);
      db.createObjectStore(table, { keyPath: expectedKeyPath });
      recreatedMirrorTables.push(table);
    }
  }

  if (!db.objectStoreNames.contains("sync_outbox")) db.createObjectStore("sync_outbox", { keyPath: "id" });
  if (!db.objectStoreNames.contains("sync_state")) db.createObjectStore("sync_state", { keyPath: "key" });
  if (!db.objectStoreNames.contains("sync_errors")) db.createObjectStore("sync_errors", { keyPath: "id" });
  if (!db.objectStoreNames.contains("local_device_session")) db.createObjectStore("local_device_session", { keyPath: "tenant_id" });
  if (!db.objectStoreNames.contains("local_license_cache")) db.createObjectStore("local_license_cache", { keyPath: "tenant_id" });

  if (recreatedMirrorTables.length > 0 && db.objectStoreNames.contains("sync_state")) {
    const syncStateStore = tx.objectStore("sync_state");
    for (const table of recreatedMirrorTables) {
      for (const key of buildMirrorStoreResetSyncStateKeys(tenantId, table)) {
        syncStateStore.delete(key);
      }
    }
  }
}

export function encodeIncrementalCursor(cursor: IncrementalCursor): string {
  return JSON.stringify(cursor);
}

export function decodeIncrementalCursor(cursor: string | null): IncrementalCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(cursor) as Partial<IncrementalCursor>;
    if (typeof parsed.updated_at === "string" && typeof parsed.id === "string") {
      return { updated_at: parsed.updated_at, id: parsed.id };
    }
  } catch {
    // old timestamp-only cursor format
  }
  return { updated_at: cursor, id: "" };
}

export function compareRowsByUpdatedAtThenId(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const aUpdatedAt = String(a["updated_at"] ?? "");
  const bUpdatedAt = String(b["updated_at"] ?? "");
  if (aUpdatedAt !== bUpdatedAt) return aUpdatedAt.localeCompare(bUpdatedAt);
  return String(a["id"] ?? a["clave"] ?? "").localeCompare(String(b["id"] ?? b["clave"] ?? ""));
}

export function isRowAfterCursor(row: Record<string, unknown>, cursor: IncrementalCursor): boolean {
  const rowUpdatedAt = String(row["updated_at"] ?? "");
  if (rowUpdatedAt > cursor.updated_at) return true;
  if (rowUpdatedAt < cursor.updated_at) return false;
  return String(row["id"] ?? row["clave"] ?? "") > cursor.id;
}

export function resolveUpsertConflictTarget(tableName: LocalFirstMirrorTable): "id" | "tenant_id,id" {
  return COMPOSITE_UPSERT_CONFLICT_TABLES.has(tableName) ? "tenant_id,id" : "id";
}

export function buildServerWritePayload(
  tenantId: string,
  tableName: LocalFirstMirrorTable,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (!isTenantScopedMirrorTable(tableName)) {
    return payload;
  }

  const payloadTenantId = payload["tenant_id"];
  if (payloadTenantId !== undefined && payloadTenantId !== tenantId) {
    throw new Error(`Payload tenant_id mismatch for ${tableName}.`);
  }

  return {
    ...payload,
    tenant_id: tenantId,
  };
}

export interface SyncErrorRow {
  id: string;
  outbox_id: string;
  tenant_id: string;
  table_name: LocalFirstMirrorTable;
  row_id: string;
  op: SyncOutboxEntry["op"];
  reason: string;
  created_at: string;
  recoverable: boolean;
  retry_status: SyncRetryStatus;
}

export type OutboxConflictGuardrailAction =
  | "apply_local_write"
  | "mark_synced_server_wins"
  | "skip_with_audit_error";

export interface OutboxConflictGuardrail {
  action: OutboxConflictGuardrailAction;
  reason: string;
  shouldWriteServer: boolean;
}

const PAGE_SIZE = 250;
const DB_VERSION = 2;
const SYNCING_STALE_MS = 5 * 60 * 1000;
const FULL_REFRESH_ON_SYNC_TABLES = [
  "tenant_users",
  "platos",
  "cocina_estado",
  "cierres_operativos",
] as const satisfies readonly LocalFirstMirrorTable[];

export function isLocalFirstEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (Boolean((window as Window & { electronAPI?: unknown }).electronAPI)) return true;
  return import.meta.env.VITE_ENABLE_WEB_LOCAL_FIRST === "true";
}

function isDesktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as Window & { electronAPI?: unknown }).electronAPI);
}

export function resolveLocalWriteMode(args: { isDesktop: boolean; isOnline: boolean }): LocalWriteMode {
  void args.isOnline;
  return args.isDesktop ? "desktop-local-first" : "web-server-first";
}

export function isLocalFirstMirrorTable(table: string): table is LocalFirstMirrorTable {
  return (LOCAL_FIRST_MIRROR_TABLES as readonly string[]).includes(table);
}

export function buildSyncStateKey(
  tenantId: string,
  tableName: LocalFirstMirrorTable,
  phase: LocalFirstPhase
): string {
  return `${tenantId}:${phase}:${tableName}`;
}

export function createSyncStateRow(args: {
  tenantId: string;
  tableName: LocalFirstMirrorTable;
  phase: LocalFirstPhase;
  cursor?: string | null;
  completed: boolean;
  rowCount: number;
  lastError?: string | null;
}): SyncStateRow {
  return {
    key: buildSyncStateKey(args.tenantId, args.tableName, args.phase),
    tenant_id: args.tenantId,
    table_name: args.tableName,
    phase: args.phase,
    cursor: args.cursor ?? null,
    completed: args.completed,
    row_count: args.rowCount,
    updated_at: new Date().toISOString(),
    last_error: args.lastError ?? null,
  };
}

export function createSyncOutboxEntry(args: {
  tenantId: string;
  tableName: LocalFirstMirrorTable;
  rowId: string;
  op: SyncOutboxEntry["op"];
  payload?: Record<string, unknown> | null;
  authUserId?: string | null;
  deviceId: string;
}): SyncOutboxEntry {
  return {
    id: `${args.tenantId}:${args.tableName}:${args.rowId}:${args.op}:${Date.now()}`,
    tenant_id: args.tenantId,
    table_name: args.tableName,
    row_id: args.rowId,
    op: args.op,
    payload: args.payload ?? null,
    created_at: new Date().toISOString(),
    created_by_auth_user_id: args.authUserId ?? null,
    device_id: args.deviceId,
    status: "pending",
    syncing_started_at: null,
    error_message: null,
  };
}

export function getLocalFirstDatabaseName(tenantId: string): string {
  return `cloudix-local-first-${tenantId}`;
}

function openLocalFirstDbForSync(tenantId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible en este entorno."));
      return;
    }
    const request = indexedDB.open(getLocalFirstDatabaseName(tenantId), DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la DB local."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) throw new Error("No se pudo acceder a la transacción de upgrade IndexedDB.");
      applyLocalFirstDbSchema(db, tx, tenantId);
    };
  });
}

async function writeLocalOutboxEntry(tenantId: string, entry: SyncOutboxEntry): Promise<void> {
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    await putOne(db, "sync_outbox", entry);
  } finally {
    db.close();
  }
}

async function getPendingOutboxEntries(db: IDBDatabase): Promise<SyncOutboxEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_outbox", "readonly");
    const store = tx.objectStore("sync_outbox");
    const entries: SyncOutboxEntry[] = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const entry = cursor.value as SyncOutboxEntry;
        entries.push(entry);
        cursor.continue();
      } else {
        resolve(selectProcessableOutboxEntries(entries));
      }
    };
    request.onerror = () => reject(request.error ?? new Error("No se pudo leer sync_outbox."));
  });
}

export function isOutboxEntryProcessable(entry: SyncOutboxEntry, nowMs = Date.now()): boolean {
  if (entry.status === "pending" || entry.status === "error") return true;
  if (entry.status !== "syncing") return false;
  if (!entry.syncing_started_at) return true;

  const syncingStartedAt = Date.parse(entry.syncing_started_at);
  if (Number.isNaN(syncingStartedAt)) return true;
  return nowMs - syncingStartedAt >= SYNCING_STALE_MS;
}

function compareOutboxEntriesByCreatedAtThenId(a: SyncOutboxEntry, b: SyncOutboxEntry): number {
  const aTs = Date.parse(a.created_at);
  const bTs = Date.parse(b.created_at);
  const aTime = Number.isNaN(aTs) ? Number.MAX_SAFE_INTEGER : aTs;
  const bTime = Number.isNaN(bTs) ? Number.MAX_SAFE_INTEGER : bTs;
  if (aTime !== bTime) return aTime - bTime;
  return a.id.localeCompare(b.id);
}

export function selectProcessableOutboxEntries(entries: readonly SyncOutboxEntry[], nowMs = Date.now()): SyncOutboxEntry[] {
  return [...entries]
    .filter((entry) => isOutboxEntryProcessable(entry, nowMs))
    .sort(compareOutboxEntriesByCreatedAtThenId);
}

async function updateOutboxEntryStatus(
  db: IDBDatabase,
  entryId: string,
  status: SyncOutboxEntry["status"],
  errorMessage?: string | null
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_outbox", "readwrite");
    const store = tx.objectStore("sync_outbox");
    const getReq = store.get(entryId);
    getReq.onsuccess = () => {
      const entry = getReq.result as SyncOutboxEntry | undefined;
      if (!entry) { resolve(); return; }
      entry.status = status;
      entry.syncing_started_at = status === "syncing" ? new Date().toISOString() : null;
      if (errorMessage !== undefined) entry.error_message = errorMessage ?? null;
      const putReq = store.put(entry);
      putReq.onerror = () => reject(putReq.error ?? new Error("No se pudo actualizar outbox."));
      putReq.onsuccess = () => resolve();
    };
    getReq.onerror = () => reject(getReq.error ?? new Error("No se pudo leer outbox."));
  });
}

async function tryAcquireOutboxEntryLease(db: IDBDatabase, snapshot: SyncOutboxEntry): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_outbox", "readwrite");
    const store = tx.objectStore("sync_outbox");
    const getReq = store.get(snapshot.id);
    const now = new Date();

    getReq.onsuccess = () => {
      const current = getReq.result as SyncOutboxEntry | undefined;
      if (!current || !isOutboxEntryProcessable(current, now.getTime())) {
        resolve(false);
        return;
      }

      current.status = "syncing";
      current.syncing_started_at = now.toISOString();
      current.error_message = null;
      const putReq = store.put(current);
      putReq.onerror = () => reject(putReq.error ?? new Error("No se pudo reservar outbox."));
      putReq.onsuccess = () => resolve(true);
    };
    getReq.onerror = () => reject(getReq.error ?? new Error("No se pudo leer outbox."));
  });
}

async function writeDirectlyToServer(args: {
  tenantId: string;
  tableName: LocalFirstMirrorTable;
  rowId: string;
  op: SyncOutboxEntry["op"];
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  let result: { error?: { message?: string } | null } | null = null;
  const serverPayload = args.payload
    ? buildServerWritePayload(args.tenantId, args.tableName, args.payload)
    : null;
  if (args.op === "insert") {
    result = await (insforgeClient.database.from(args.tableName).insert([serverPayload as Record<string, unknown>]) as any);
  } else if (args.op === "update") {
    result = await (insforgeClient.database.from(args.tableName).update(serverPayload as Record<string, unknown>).eq("id", args.rowId) as any);
  } else if (args.op === "upsert") {
    result = await (insforgeClient.database.from(args.tableName).upsert(serverPayload as Record<string, unknown>, { onConflict: resolveUpsertConflictTarget(args.tableName) }) as any);
  } else if (args.op === "delete") {
    result = await (insforgeClient.database.from(args.tableName).delete().eq("id", args.rowId) as any);
  }
  if (result?.error) {
    throw new Error(result.error.message || `No se pudo sincronizar ${args.tableName}.`);
  }
}

export async function enqueueLocalWrite(args: {
  tenantId: string;
  tableName: LocalFirstMirrorTable;
  rowId: string;
  op: SyncOutboxEntry["op"];
  payload?: Record<string, unknown> | null;
  authUserId?: string | null;
  deviceId: string;
}): Promise<void> {
  const isOnline = typeof navigator === "undefined" || navigator.onLine;
  const mode = resolveLocalWriteMode({
    isDesktop: isDesktopRuntime(),
    isOnline,
  });

  if (mode === "web-server-first") {
    if (!isOnline) {
      throw new Error("La versión web requiere conexión para escribir datos. Usá la app de escritorio para operar offline.");
    }

    await writeDirectlyToServer(args);
    if (isLocalFirstEnabled()) {
      await applyLocalMirrorWrite(args);
    }
    return;
  }

  if (!isOnline) {
    const licenseCheck = await assertCanWriteOffline(args.tenantId);
    if (!licenseCheck.valid) {
      throw new Error(licenseCheck.reason || "Licencia offline inválida para operar.");
    }
  }

  const entry = createSyncOutboxEntry({
    tenantId: args.tenantId,
    tableName: args.tableName,
    rowId: args.rowId,
    op: args.op,
    payload: args.payload,
    authUserId: args.authUserId,
    deviceId: args.deviceId,
  });
  await writeLocalOutboxEntry(args.tenantId, entry);

  // Apply change locally to mirror table so the UI can see it immediately offline
  await applyLocalMirrorWrite(args);

  if (isOnline) {
    void pushOutboxToServer(args.tenantId).catch((error) => {
      console.error("Error pushing outbox after local enqueue:", error);
    });
  }
}

export function buildLocalMirrorWriteResult(args: {
  op: SyncOutboxEntry["op"];
  rowId: string;
  existing: Record<string, unknown> | undefined;
  payload?: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  if (args.op === "delete") return null;
  if (!args.payload) return args.existing ?? null;
  if (args.op === "insert") return args.payload;
  if (args.op === "update" || args.op === "upsert") {
    return { ...(args.existing ?? { id: args.rowId }), ...args.payload };
  }
  return args.existing ?? null;
}

async function applyLocalMirrorWrite(args: {
  tenantId: string;
  tableName: LocalFirstMirrorTable;
  rowId: string;
  op: SyncOutboxEntry["op"];
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  const db = await openLocalFirstDbForSync(args.tenantId);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(args.tableName, "readwrite");
      const store = tx.objectStore(args.tableName);

      if (args.op === "delete") {
        store.delete(args.rowId);
      } else if (args.payload) {
        if (args.op === "insert") {
          store.put(args.payload);
        } else if (args.op === "update" || args.op === "upsert") {
          const getReq = store.get(args.rowId);
          getReq.onsuccess = () => {
            const merged = buildLocalMirrorWriteResult({
              op: args.op,
              rowId: args.rowId,
              existing: (getReq.result as Record<string, unknown> | undefined) ?? undefined,
              payload: args.payload,
            });
            if (merged) store.put(merged);
          };
          getReq.onerror = () => reject(getReq.error);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error(`Error applying local write to mirror ${args.tableName}:`, error);
  } finally {
    db.close();
  }
}

export type ConflictResolution = "local_wins" | "server_wins" | "skip" | "abort";

export interface ConflictResult {
  resolution: ConflictResolution;
  reason: string;
}

export function resolveConflictForTable(
  tableName: LocalFirstMirrorTable,
  localEntry: SyncOutboxEntry,
  serverRow: Record<string, unknown> | null
): ConflictResult {
  switch (tableName) {
    case "facturas": {
      if (localEntry.op === "delete") {
        return { resolution: "skip", reason: "Delete de factura no sincronizable automaticamente — requiere audit." };
      }
      if (localEntry.op === "update" && serverRow) {
        const localUpdatedAt = (localEntry.payload as Record<string, unknown>)?.["updated_at"] as string;
        const serverUpdatedAt = serverRow["updated_at"] as string;
        if (localUpdatedAt && serverUpdatedAt && new Date(localUpdatedAt) < new Date(serverUpdatedAt)) {
          return { resolution: "server_wins", reason: "Version servidora mas reciente — factura no sobrescrita." };
        }
      }
      return { resolution: "local_wins", reason: "Sin conflicto en factura." };
    }

    case "cierres_operativos": {
      if (localEntry.op === "insert" && serverRow) {
        return { resolution: "server_wins", reason: "Cierre de ciclo ya existe en servidor — no se duplica." };
      }
      if (localEntry.op === "update" && serverRow) {
        const localClosedAt = (localEntry.payload as Record<string, unknown>)?.["closed_at"];
        const serverClosedAt = serverRow["closed_at"];
        if (localClosedAt && serverClosedAt) {
          return { resolution: "skip", reason: "Cierre ya confirmado en servidor." };
        }
      }
      return { resolution: "local_wins", reason: "Sin conflicto en cierre." };
    }

    case "comandas":
    case "consumos": {
      if (localEntry.op === "insert" && serverRow) {
        return { resolution: "server_wins", reason: "Registro ya existe en servidor." };
      }
      return { resolution: "local_wins", reason: "Sin conflicto en operacion viva." };
    }

    case "tenants":
    case "tenant_users": {
      return { resolution: "server_wins", reason: "Identidades/permisos siempre ganan del servidor." };
    }

    default:
      return { resolution: "local_wins", reason: "Default: local gana." };
  }
}

export function resolveOutboxConflictGuardrail(
  _tenantId: string,
  entry: SyncOutboxEntry,
  serverRow: Record<string, unknown> | null
): OutboxConflictGuardrail {
  const conflict = resolveConflictForTable(entry.table_name, entry, serverRow);
  if (conflict.resolution === "server_wins") {
    return { action: "mark_synced_server_wins", reason: conflict.reason, shouldWriteServer: false };
  }
  if (conflict.resolution === "skip" || conflict.resolution === "abort") {
    return { action: "skip_with_audit_error", reason: conflict.reason, shouldWriteServer: false };
  }
  return { action: "apply_local_write", reason: conflict.reason, shouldWriteServer: true };
}

export function buildSyncErrorRow(args: {
  outboxEntry: SyncOutboxEntry;
  reason: string;
  retryStatus: SyncRetryStatus;
  recoverable: boolean;
}): SyncErrorRow {
  const isTerminal = args.retryStatus === "not_retryable" || args.retryStatus === "max_retries_exceeded";
  return {
    id: isTerminal
      ? `sync-error:terminal:${args.outboxEntry.id}:${args.retryStatus}`
      : `sync-error:${args.outboxEntry.id}:${Date.now()}`,
    outbox_id: args.outboxEntry.id,
    tenant_id: args.outboxEntry.tenant_id,
    table_name: args.outboxEntry.table_name,
    row_id: args.outboxEntry.row_id,
    op: args.outboxEntry.op,
    reason: args.reason,
    created_at: new Date().toISOString(),
    recoverable: args.recoverable,
    retry_status: args.retryStatus,
  };
}

async function persistSyncError(db: IDBDatabase, row: SyncErrorRow): Promise<void> {
  await putOne(db, "sync_errors", row);
}

export async function checkServerRowExists(
  _tenantId: string,
  tableName: LocalFirstMirrorTable,
  rowId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await (insforgeClient.database.from(tableName).select("*").eq("id", rowId).single() as any);
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

export async function validateNcfSequence(
  tenantId: string,
  ncfTipo: string,
  ncfToUse: string
): Promise<{ valid: boolean; reason?: string }> {
  const { data: tenant, error } = await (insforgeClient.database.from("tenants").select("ncf_secuencias_por_tipo").eq("id", tenantId).single() as any);
  if (error || !tenant) return { valid: false, reason: "No se pudo leer secuencia NCF del tenant." };

  const secuencias = tenant.ncf_secuencias_por_tipo as Record<string, { secuencia_actual: number }> | null;
  if (!secuencias || !secuencias[ncfTipo]) return { valid: true, reason: "NCF tipo sin control de secuencia." };

  const expectedSeq = secuencias[ncfTipo].secuencia_actual;
  const ncfSeq = parseInt(ncfToUse.replace(/\D/g, "").slice(-8), 10);
  if (!isNaN(ncfSeq) && ncfSeq !== expectedSeq) {
    return { valid: false, reason: `NCF secuencia fuera de orden: esperado ${expectedSeq}, obtenido ${ncfSeq}.` };
  }
  return { valid: true };
}

export async function validateCierreCicleSequence(
  tenantId: string,
  cycleNumber: number
): Promise<{ valid: boolean; reason?: string }> {
  const { data, error } = await (insforgeClient.database
    .from("cierres_operativos")
    .select("cycle_number")
    .eq("tenant_id", tenantId)
    .eq("cycle_number", cycleNumber)
    .single() as any);

  if (error && (error as any)?.code !== "PGRST116") {
    return { valid: false, reason: "No se pudo validar secuencia de ciclo." };
  }
  if (data) {
    return { valid: false, reason: `Ciclo ${cycleNumber} ya existe en servidor — no se duplica.` };
  }
  return { valid: true };
}

const pushOutboxLocks = new Set<string>();

export async function pushOutboxToServer(tenantId: string): Promise<{ pushed: number; failed: number }> {
  if (pushOutboxLocks.has(tenantId)) return { pushed: 0, failed: 0 };
  pushOutboxLocks.add(tenantId);
  const db = await openLocalFirstDbForSync(tenantId);
  let pushed = 0;
  let failed = 0;
  try {
    const pending = await getPendingOutboxEntries(db);
    for (const entry of pending) {
      const leaseAcquired = await tryAcquireOutboxEntryLease(db, entry);
      if (!leaseAcquired) continue;

      const serverRow = await checkServerRowExists(tenantId, entry.table_name, entry.row_id);
      const guardrail = resolveOutboxConflictGuardrail(tenantId, entry, serverRow);
      if (guardrail.action === "mark_synced_server_wins") {
        await updateOutboxEntryStatus(db, entry.id, "synced", guardrail.reason);
        continue;
      }
      if (guardrail.action === "skip_with_audit_error") {
        await persistSyncError(db, buildSyncErrorRow({
          outboxEntry: entry,
          reason: guardrail.reason,
          retryStatus: "not_retryable",
          recoverable: true,
        }));
        await updateOutboxEntryStatus(db, entry.id, "not_retryable", guardrail.reason);
        failed++;
        continue;
      }

      if (entry.table_name === "facturas" && entry.op === "insert") {
        const payload = entry.payload as Record<string, unknown>;
        const ncfTipo = payload["ncf_tipo"] as string | undefined;
        const ncf = payload["ncf"] as string | undefined;
        if (ncf && ncfTipo) {
          const ncfValidation = await validateNcfSequence(tenantId, ncfTipo, ncf);
          if (!ncfValidation.valid) {
            await persistSyncError(db, buildSyncErrorRow({
              outboxEntry: entry,
              reason: ncfValidation.reason || "NCF inválido",
              retryStatus: "not_retryable",
              recoverable: true,
            }));
            await updateOutboxEntryStatus(db, entry.id, "not_retryable", ncfValidation.reason);
            failed++;
            continue;
          }
        }
      }

      if (entry.table_name === "cierres_operativos" && entry.op === "insert") {
        const payload = entry.payload as Record<string, unknown>;
        const cycleNumber = payload["cycle_number"] as number | undefined;
        if (cycleNumber !== undefined) {
          const cycleValidation = await validateCierreCicleSequence(tenantId, cycleNumber);
          if (!cycleValidation.valid) {
            await persistSyncError(db, buildSyncErrorRow({
              outboxEntry: entry,
              reason: cycleValidation.reason || "Ciclo inválido",
              retryStatus: "not_retryable",
              recoverable: true,
            }));
            await updateOutboxEntryStatus(db, entry.id, "not_retryable", cycleValidation.reason);
            failed++;
            continue;
          }
        }
      }

      try {
        let result: { data?: unknown; error?: { message?: string } } | null = null;
        const serverPayload = entry.payload
          ? buildServerWritePayload(tenantId, entry.table_name, entry.payload as Record<string, unknown>)
          : null;
        if (entry.op === "insert") {
          result = await (insforgeClient.database.from(entry.table_name).insert([serverPayload as Record<string, unknown>]) as any);
        } else if (entry.op === "update") {
          result = await (insforgeClient.database.from(entry.table_name).update(serverPayload as Record<string, unknown>).eq("id", entry.row_id) as any);
        } else if (entry.op === "upsert") {
          result = await (insforgeClient.database.from(entry.table_name).upsert(serverPayload as Record<string, unknown>, { onConflict: resolveUpsertConflictTarget(entry.table_name) }) as any);
        } else if (entry.op === "delete") {
          result = await (insforgeClient.database.from(entry.table_name).delete().eq("id", entry.row_id) as any);
        }
        if (result?.error) {
          await persistSyncError(db, buildSyncErrorRow({
            outboxEntry: entry,
            reason: result.error.message || "Error en sync.",
            retryStatus: "retryable",
            recoverable: true,
          }));
          await updateOutboxEntryStatus(db, entry.id, "error", result.error.message || "Error en sync.");
          failed++;
        } else {
          await updateOutboxEntryStatus(db, entry.id, "synced");
          pushed++;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Excepcion en sync.";
        await persistSyncError(db, buildSyncErrorRow({
          outboxEntry: entry,
          reason,
          retryStatus: "retryable",
          recoverable: true,
        }));
        await updateOutboxEntryStatus(db, entry.id, "error", reason);
        failed++;
      }
    }
    return { pushed, failed };
  } finally {
    db.close();
    pushOutboxLocks.delete(tenantId);
  }
}

export async function getDeviceId(): Promise<string> {
  const stored = localStorage.getItem("cloudix_device_id");
  if (stored) return stored;
  const deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  localStorage.setItem("cloudix_device_id", deviceId);
  return deviceId;
}

export interface LocalLicenseCache {
  tenant_id: string;
  tenant_activa: boolean;
  validated_at: string;
  window_valid_until: string;
  tenant_users_activo: boolean;
}

export interface LocalDeviceSession {
  tenant_id: string;
  user_id: string;
  email: string;
  pin_hash?: string;
  created_at: string;
  tenant_user_row: Record<string, unknown>;
}

export async function saveLocalDeviceSession(
  tenantId: string,
  userId: string,
  email: string,
  tenantUserRow: Record<string, unknown> | object
): Promise<void> {
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    const session: LocalDeviceSession = {
      tenant_id: tenantId,
      user_id: userId,
      email,
      created_at: new Date().toISOString(),
      tenant_user_row: tenantUserRow as Record<string, unknown>,
    };
    await putOne(db, "local_device_session", session);
  } finally {
    db.close();
  }
}

export async function getLastTenantId(): Promise<string | null> {
  return localStorage.getItem("cloudix_last_tenant_id");
}

export function setLastTenantId(tenantId: string) {
  localStorage.setItem("cloudix_last_tenant_id", tenantId);
}

export async function getLocalDeviceSession(tenantId?: string): Promise<LocalDeviceSession | null> {
  const targetTenantId = tenantId ?? await getLastTenantId();
  if (!targetTenantId) return null;
  const db = await openLocalFirstDbForSync(targetTenantId);
  try {
    return await getOneFromStore<LocalDeviceSession>(db, "local_device_session", targetTenantId);
  } finally {
    db.close();
  }
}

export async function clearLocalDeviceSession(tenantId: string): Promise<void> {
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("local_device_session", "readwrite");
      const store = tx.objectStore("local_device_session");
      store.delete(tenantId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Error clearing local session:", error);
  } finally {
    db.close();
  }
}

const OFFLINE_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function saveLicenseCache(
  tenantId: string,
  tenantActiva: boolean,
  tenantUsersActivo: boolean
): Promise<LocalLicenseCache> {
  const cache: LocalLicenseCache = {
    tenant_id: tenantId,
    tenant_activa: tenantActiva,
    tenant_users_activo: tenantUsersActivo,
    validated_at: new Date().toISOString(),
    window_valid_until: new Date(Date.now() + OFFLINE_WINDOW_MS).toISOString(),
  };
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    await putOne(db, "local_license_cache", cache);
  } finally {
    db.close();
  }
  return cache;
}

export async function loadLicenseCache(tenantId: string): Promise<LocalLicenseCache | null> {
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    return await getOneFromStore<LocalLicenseCache>(db, "local_license_cache", tenantId);
  } finally {
    db.close();
  }
}

export async function assertCanWriteOffline(
  tenantId: string,
  cacheOverride?: LocalLicenseCache | null
): Promise<{ valid: boolean; reason?: string }> {
  const cache = cacheOverride ?? await loadLicenseCache(tenantId);
  if (isLicenseValidOffline(cache)) {
    return { valid: true };
  }
  return {
    valid: false,
    reason: "Licencia offline expirada o ausente. Requiere reconexión para revalidar.",
  };
}

export function isLicenseValidOffline(cache: LocalLicenseCache | null): boolean {
  if (!cache) return false;
  if (!cache.tenant_activa || !cache.tenant_users_activo) return false;
  return new Date(cache.window_valid_until) > new Date();
}

export async function validateAndCacheLicense(
  tenantId: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const { data: tenant, error: tenantErr } = await insforgeClient.database
      .from("tenants")
      .select("activa")
      .eq("id", tenantId)
      .single();

    if (tenantErr || !tenant?.activa) {
      await saveLicenseCache(tenantId, false, false);
      return { valid: false, reason: "Tenant bloqueado o inactivo." };
    }

    const { data: tu, error: tuErr } = await insforgeClient.database
      .from("tenant_users")
      .select("activo")
      .eq("tenant_id", tenantId)
      .eq("activo", true)
      .limit(1);

    if (tuErr || !tu || tu.length === 0) {
      await saveLicenseCache(tenantId, true, false);
      return { valid: false, reason: "Usuario sin acceso activo." };
    }

    await saveLicenseCache(tenantId, true, true);
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "Error de validacion." };
  }
}

export async function revalidateLicenseOnReconnect(
  tenantId: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!navigator.onLine) return { valid: false, reason: "Sin conexion." };
  return validateAndCacheLicense(tenantId);
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error(`No se pudo leer ${storeName}.`));
  });
}

function getOneFromStore<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error(`No se pudo leer ${storeName}.`));
  });
}

export async function readLocalMirror<T = Record<string, unknown>>(
  tenantId: string,
  tableName: LocalFirstMirrorTable
): Promise<T[]> {
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    return await getAllFromStore<T>(db, tableName);
  } finally {
    db.close();
  }
}

export async function readLocalOutbox<T = SyncOutboxEntry>(tenantId: string): Promise<T[]> {
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    return await getAllFromStore<T>(db, "sync_outbox");
  } finally {
    db.close();
  }
}

export async function hasPendingLocalWrites(
  tenantId: string,
  tableNames?: readonly LocalFirstMirrorTable[]
): Promise<boolean> {
  const tableSet = tableNames ? new Set<string>(tableNames) : null;
  const outbox = await readLocalOutbox<SyncOutboxEntry>(tenantId);
  return outbox.some((entry) => {
    if (tableSet && !tableSet.has(entry.table_name)) return false;
    return entry.status === "pending" || entry.status === "syncing" || entry.status === "error";
  });
}

export async function shouldReadLocalFirst(
  tenantId: string,
  tableNames?: readonly LocalFirstMirrorTable[]
): Promise<boolean> {
  void tenantId;
  void tableNames;
  if (!isLocalFirstEnabled()) return false;
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export async function writeLocalMirrorRow<T extends Record<string, unknown>>(
  tenantId: string,
  tableName: LocalFirstMirrorTable,
  row: T
): Promise<void> {
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    await putOne(db, tableName, row);
  } finally {
    db.close();
  }
}

export async function readLocalMirrorRow<T = Record<string, unknown>>(
  tenantId: string,
  tableName: LocalFirstMirrorTable,
  rowId: string
): Promise<T | null> {
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    return await getOneFromStore<T>(db, tableName, rowId);
  } finally {
    db.close();
  }
}

async function getIncrementalCursor(
  db: IDBDatabase,
  tenantId: string,
  tableName: LocalFirstMirrorTable
): Promise<IncrementalCursor | null> {
  const row = await getSyncState(db, buildSyncStateKey(tenantId, tableName, "incremental"));
  return decodeIncrementalCursor(row?.cursor ?? null);
}

async function pullIncrementalChanges(
  tenantId: string,
  tableName: LocalFirstMirrorTable,
  sinceCursor: IncrementalCursor | null
): Promise<{ rows: Record<string, unknown>[]; newCursor: IncrementalCursor }> {
  const selectedRows: Record<string, unknown>[] = [];
  let offset = 0;
  let latestSeenCursor = sinceCursor;
  let reachedEnd = false;

  while (selectedRows.length < PAGE_SIZE && !reachedEnd) {
    let query = insforgeClient.database
      .from(tableName)
      .select("*")
      .order("updated_at", { ascending: true })
      .order(tableName === "configuracion" ? "clave" : "id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1) as any;

    if (shouldFilterByTenant(tableName)) {
      query = query.eq("tenant_id", tenantId);
    } else if (tableName !== "configuracion") {
      query = query.eq("id", tenantId);
    }

    if (sinceCursor?.updated_at) {
      query = query.gte("updated_at", sinceCursor.updated_at);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message || `Error pull incremental ${tableName}`);

    const batchRows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    if (batchRows.length === 0) {
      reachedEnd = true;
      break;
    }

    for (const row of batchRows) {
      latestSeenCursor = {
        updated_at: String(row["updated_at"] ?? sinceCursor?.updated_at ?? new Date(0).toISOString()),
        id: String(row["id"] ?? row["clave"] ?? ""),
      };

      if (!sinceCursor || isRowAfterCursor(row, sinceCursor)) {
        selectedRows.push(row);
        if (selectedRows.length >= PAGE_SIZE) break;
      }
    }

    reachedEnd = batchRows.length < PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  const newCursor = selectedRows.length > 0
    ? {
      updated_at: String(selectedRows[selectedRows.length - 1]["updated_at"] ?? sinceCursor?.updated_at ?? new Date(0).toISOString()),
      id: String(selectedRows[selectedRows.length - 1]["id"] ?? selectedRows[selectedRows.length - 1]["clave"] ?? ""),
    }
    : (latestSeenCursor ?? sinceCursor ?? { updated_at: new Date(0).toISOString(), id: "" });

  return { rows: selectedRows, newCursor };
}

async function pullFullTableRows(
  tenantId: string,
  tableName: LocalFirstMirrorTable
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await pullTablePage(tableName, tenantId, offset);
    if (error) throw new Error(error.message || `Error full refresh ${tableName}`);
    const pageRows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    rows.push(...pageRows);
    hasMore = pageRows.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  return rows;
}

function replaceStoreRows(db: IDBDatabase, storeName: string, rows: readonly object[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`No se pudo reemplazar ${storeName}.`));
  });
}

export async function refreshFullTableMirror(
  tenantId: string,
  tableName: LocalFirstMirrorTable
): Promise<number> {
  const rows = await pullFullTableRows(tenantId, tableName);
  const db = await openLocalFirstDbForSync(tenantId);
  try {
    await replaceStoreRows(db, tableName, rows);
    await putOne(db, "sync_state", createSyncStateRow({
      tenantId,
      tableName,
      phase: "incremental",
      cursor: encodeIncrementalCursor({ updated_at: new Date().toISOString(), id: "" }),
      completed: true,
      rowCount: rows.length,
    }));
    return rows.length;
  } finally {
    db.close();
  }
}

export async function pullIncrementalChangesForTable(
  tenantId: string,
  tableName: LocalFirstMirrorTable
): Promise<number> {
  const db = await openLocalFirstDbForSync(tenantId);
  let pulled = 0;
  try {
    let sinceCursor = await getIncrementalCursor(db, tenantId, tableName);
    let completed = false;

    while (!completed) {
      const { rows, newCursor } = await pullIncrementalChanges(tenantId, tableName, sinceCursor);
      if (rows.length > 0) {
        await putMany(db, tableName, rows);
        pulled += rows.length;
      }
      sinceCursor = newCursor;
      completed = rows.length < PAGE_SIZE;

      await putOne(db, "sync_state", createSyncStateRow({
        tenantId,
        tableName,
        phase: "incremental",
        cursor: encodeIncrementalCursor(newCursor),
        completed,
        rowCount: pulled,
      }));
    }
    return pulled;
  } finally {
    db.close();
  }
}

export async function syncIncremental(tenantId: string): Promise<{ tablesUpdated: number; rowsPulled: number }> {
  let tablesUpdated = 0;
  let rowsPulled = 0;
  for (const tableName of LOCAL_FIRST_MIRROR_TABLES) {
    if (await hasPendingLocalWrites(tenantId, [tableName])) continue;
    const pulled = (FULL_REFRESH_ON_SYNC_TABLES as readonly LocalFirstMirrorTable[]).includes(tableName)
      ? await refreshFullTableMirror(tenantId, tableName)
      : await pullIncrementalChangesForTable(tenantId, tableName);
    if (pulled > 0) {
      tablesUpdated++;
      rowsPulled += pulled;
    }
  }
  return { tablesUpdated, rowsPulled };
}

function openLocalFirstDb(tenantId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible en este entorno."));
      return;
    }

    const request = indexedDB.open(getLocalFirstDatabaseName(tenantId), DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la DB local."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) throw new Error("No se pudo acceder a la transacción de upgrade IndexedDB.");
      applyLocalFirstDbSchema(db, tx, tenantId);
    };
  });
}

function putMany(db: IDBDatabase, storeName: string, rows: readonly object[]): Promise<void> {
  if (rows.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`No se pudo escribir ${storeName}.`));
  });
}

function putOne(db: IDBDatabase, storeName: string, row: object): Promise<void> {
  return putMany(db, storeName, [row]);
}

function getAllSyncStates(db: IDBDatabase): Promise<SyncStateRow[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_state", "readonly");
    const request = tx.objectStore("sync_state").getAll();
    request.onsuccess = () => resolve(request.result as SyncStateRow[]);
    request.onerror = () => reject(request.error ?? new Error("No se pudo leer sync_state."));
  });
}

function getSyncState(db: IDBDatabase, key: string): Promise<SyncStateRow | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_state", "readonly");
    const request = tx.objectStore("sync_state").get(key);
    request.onsuccess = () => resolve((request.result as SyncStateRow | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("No se pudo leer el cursor de sync_state."));
  });
}

function shouldFilterByTenant(tableName: LocalFirstMirrorTable): boolean {
  return tableName !== "tenants" && tableName !== "configuracion";
}

async function pullTablePage(tableName: LocalFirstMirrorTable, tenantId: string, offset: number) {
  let query = insforgeClient.database
    .from(tableName)
    .select("*")
    .order(tableName === "configuracion" ? "clave" : "id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1) as any;

  if (shouldFilterByTenant(tableName)) {
    query = query.eq("tenant_id", tenantId);
  } else if (tableName === "configuracion") {
    // configuracion is global
  } else {
    query = query.eq("id", tenantId);
  }

  return query;
}
export async function bootstrapLocalFirstPhase(args: {
  tenantId: string;
  phase: LocalFirstPhase;
  tables: readonly LocalFirstMirrorTable[];
  onTableDone?: (tableName: LocalFirstMirrorTable, rows: number) => void;
}): Promise<void> {
  const db = await openLocalFirstDb(args.tenantId);
  try {
    for (const tableName of args.tables) {
      const existing = await getSyncState(db, buildSyncStateKey(args.tenantId, tableName, args.phase));
      if (existing?.completed) {
        args.onTableDone?.(tableName, existing.row_count);
        continue;
      }

      let offset = Number(existing?.cursor ?? 0);
      let rowCount = existing?.row_count ?? 0;
      let completed = false;

      while (!completed) {
        const { data, error } = await pullTablePage(tableName, args.tenantId, offset);
        if (error) {
          await putOne(
            db,
            "sync_state",
            createSyncStateRow({
              tenantId: args.tenantId,
              tableName,
              phase: args.phase,
              cursor: String(offset),
              completed: false,
              rowCount,
              lastError: error.message || `No se pudo descargar ${tableName}.`,
            })
          );
          throw new Error(error.message || `No se pudo descargar ${tableName}.`);
        }

        const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        await putMany(db, tableName, rows);
        rowCount += rows.length;
        offset += PAGE_SIZE;
        completed = rows.length < PAGE_SIZE;
        await putOne(
          db,
          "sync_state",
          createSyncStateRow({
            tenantId: args.tenantId,
            tableName,
            phase: args.phase,
            cursor: String(offset),
            completed,
            rowCount,
          })
        );
      }
      args.onTableDone?.(tableName, rowCount);
    }
  } finally {
    db.close();
  }
}

export async function getLocalFirstStatusSnapshot(tenantId: string): Promise<{
  status: LocalFirstStatus;
  completedHistoryTables: number;
  totalHistoryTables: number;
}> {
  const db = await openLocalFirstDb(tenantId);
  try {
    const states = await getAllSyncStates(db);
    const historyCompleted = new Set(
      states.filter((row) => row.phase === "history" && row.completed).map((row) => row.table_name)
    );
    const minimumCompleted = new Set(
      states.filter((row) => row.phase === "minimum" && row.completed).map((row) => row.table_name)
    );
    const totalHistoryTables = LOCAL_FIRST_HISTORY_TABLES.length;
    const completedHistoryTables = historyCompleted.size;

    if (completedHistoryTables >= totalHistoryTables) {
      return { status: "history_complete", completedHistoryTables, totalHistoryTables };
    }
    if (minimumCompleted.size >= LOCAL_FIRST_IMMEDIATE_TABLES.length) {
      return { status: "ready_history_syncing", completedHistoryTables, totalHistoryTables };
    }
    return { status: "bootstrapping_minimum", completedHistoryTables, totalHistoryTables };
  } finally {
    db.close();
  }
}

export function getHistoricalSyncIncompleteMessage(status: LocalFirstStatus): string | null {
  if (status === "ready_history_syncing" || status === "bootstrapping_minimum") {
    return "El historial antiguo todavía se está sincronizando. Los resultados pueden estar incompletos hasta finalizar.";
  }
  if (status === "offline") {
    return "Sin internet: se muestra la última foto local conocida.";
  }
  return null;
}
