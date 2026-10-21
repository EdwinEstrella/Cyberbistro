import type { DatabaseSync } from "node:sqlite";

/**
 * Local NCF (type B) sequencing for the desktop POS. One sales caja per
 * business, so this device can keep issuing NCFs while the cloud is down.
 *
 * Invariants:
 * - The next number is max(local counter, last known cloud counter, highest NCF
 *   already present in local facturas + 1): a stale local copy never reuses a
 *   number the cloud (or this device) already issued.
 * - Reservation is a single BEGIN IMMEDIATE transaction in the main process, so
 *   the same NCF is never handed out twice on this device.
 * - The cloud counter (`tenants.ncf_bXX_secuencia_siguiente`) is advanced by the
 *   renderer with a monotonic conditional update once the cloud is reachable.
 *
 * e-CF (E31/E32) is intentionally NOT handled here: its numbers must be signed
 * and range-enforced by the cloud RPC (offline e-CF signing is a separate feature).
 */

export const NCF_B_CODES = ["B01", "B02", "B14", "B15", "B16", "B17"] as const;
export type NcfBCode = (typeof NCF_B_CODES)[number];
/** NCF B numbers are 8 digits (B01 + 00000001). */
export const NCF_MAX_SEQUENCE = 99_999_999;

export type NcfLocalErrorCode = "no_local_tenant" | "fiscal_inactive" | "exhausted" | "invalid_request";

export class NcfLocalSequenceError extends Error {
  constructor(readonly code: NcfLocalErrorCode, message: string) {
    super(message);
    this.name = "NcfLocalSequenceError";
  }
}

export type NcfLocalReservation = { tipoCodigo: NcfBCode; sequence: number };
export type NcfLocalPeek = {
  tipoCodigo: NcfBCode;
  /** The number the next local reservation would hand out. */
  nextSequence: number;
  /** Highest number this device has issued or seen issued, plus one (cloud excluded). */
  localNextSequence: number;
  /** Highest cloud counter this device knows of (pulled row or recorded RPC results). */
  cloudNextSequence: number;
};

export const NCF_LOCAL_SEQUENCES_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS ncf_local_sequences (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    tipo_codigo TEXT NOT NULL,
    next_sequence INTEGER NOT NULL CHECK (next_sequence > 0),
    cloud_next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (cloud_next_sequence > 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, tipo_codigo)
  ) STRICT;
`;

function isNcfBCode(value: string): value is NcfBCode {
  return (NCF_B_CODES as readonly string[]).includes(value);
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** Mirrors cloudix_reserve_ncf: requested type, else tenant default, else B01; non-B codes fall back to B01. */
export function resolveNcfBType(settings: Record<string, unknown>, preferredType?: string | null): NcfBCode {
  const requested = typeof preferredType === "string" ? preferredType.trim().toUpperCase() : "";
  const fallback = typeof settings.ncf_tipo_default === "string" ? settings.ncf_tipo_default.trim().toUpperCase() : "";
  const code = requested || fallback || "B01";
  return isNcfBCode(code) ? code : "B01";
}

/** Next cloud number for a type from the pulled tenant row: the max of every place the cloud keeps it. */
export function cloudNextSequenceFromSettings(settings: Record<string, unknown>, code: NcfBCode): number {
  const candidates: Array<number | null> = [positiveInt(settings[`ncf_${code.toLowerCase()}_secuencia_siguiente`])];
  const map = settings.ncf_secuencias_por_tipo;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    candidates.push(positiveInt((map as Record<string, unknown>)[code]));
  }
  if (String(settings.ncf_tipo_default ?? "").toUpperCase() === code) {
    candidates.push(positiveInt(settings.ncf_secuencia_siguiente));
  }
  return Math.max(1, ...candidates.filter((n): n is number => n != null));
}

export function computeNcfReservationStart(input: { cloudNext: number; localNext: number; maxIssued: number }): number {
  return Math.max(1, input.cloudNext, input.localNext, input.maxIssued + 1);
}

function readTenantSettings(db: DatabaseSync, tenantId: string): Record<string, unknown> {
  const row = db.prepare("SELECT settings_json FROM tenants WHERE id = ? AND cloud_synced = 1")
    .get(tenantId) as { settings_json: string | null } | undefined;
  let settings: unknown = null;
  try {
    settings = row?.settings_json ? JSON.parse(row.settings_json) : null;
  } catch {
    settings = null;
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new NcfLocalSequenceError(
      "no_local_tenant",
      "No hay datos fiscales locales del negocio. Conectate a internet una vez para descargar la configuración NCF.",
    );
  }
  return settings as Record<string, unknown>;
}

function readState(db: DatabaseSync, tenantId: string, settings: Record<string, unknown>, code: NcfBCode) {
  const counter = db.prepare(
    "SELECT next_sequence, cloud_next_sequence FROM ncf_local_sequences WHERE tenant_id = ? AND tipo_codigo = ?",
  ).get(tenantId, code) as { next_sequence: number; cloud_next_sequence: number } | undefined;
  const issued = db.prepare(
    "SELECT MAX(CAST(substr(ncf, 4) AS INTEGER)) AS max_seq FROM facturas WHERE tenant_id = ? AND ncf LIKE ? AND length(ncf) = 11",
  ).get(tenantId, `${code}%`) as { max_seq: number | null } | undefined;
  const maxIssued = Number(issued?.max_seq ?? 0) || 0;
  const localNext = Math.max(Number(counter?.next_sequence ?? 1), maxIssued + 1);
  const cloudNext = Math.max(cloudNextSequenceFromSettings(settings, code), Number(counter?.cloud_next_sequence ?? 1));
  return { localNext, cloudNext, maxIssued };
}

function runImmediate<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = work();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

/** Atomically reserves the next local NCF B number for this tenant. */
export function reserveLocalNcfSequence(
  db: DatabaseSync,
  tenantId: string,
  preferredType?: string | null,
  now: () => string = () => new Date().toISOString(),
): NcfLocalReservation {
  return runImmediate(db, () => {
    const settings = readTenantSettings(db, tenantId);
    if (settings.ncf_fiscal_activo !== true) {
      throw new NcfLocalSequenceError("fiscal_inactive", "La facturación con NCF no está activa para este negocio.");
    }
    const code = resolveNcfBType(settings, preferredType);
    const state = readState(db, tenantId, settings, code);
    const sequence = computeNcfReservationStart(state);
    if (sequence > NCF_MAX_SEQUENCE) {
      throw new NcfLocalSequenceError("exhausted", `La secuencia NCF ${code} está agotada. Configurá una nueva secuencia autorizada.`);
    }
    db.prepare(`
      INSERT INTO ncf_local_sequences (tenant_id, tipo_codigo, next_sequence, cloud_next_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, tipo_codigo) DO UPDATE SET next_sequence = excluded.next_sequence, updated_at = excluded.updated_at
    `).run(tenantId, code, sequence + 1, state.cloudNext, now());
    return { tipoCodigo: code, sequence };
  });
}

/**
 * Records a number issued elsewhere (the cloud RPC) or confirmed on the cloud
 * (a catch-up). Counters only move forward.
 */
export function recordIssuedNcfSequence(
  db: DatabaseSync,
  tenantId: string,
  tipoCodigo: string,
  sequence: number,
  source: "cloud" | "local",
  now: () => string = () => new Date().toISOString(),
): void {
  const code = tipoCodigo.trim().toUpperCase();
  if (!isNcfBCode(code) || !Number.isSafeInteger(sequence) || sequence < 1 || sequence > NCF_MAX_SEQUENCE) {
    throw new NcfLocalSequenceError("invalid_request", "Secuencia NCF inválida.");
  }
  const next = sequence + 1;
  const cloudNext = source === "cloud" ? next : 1;
  runImmediate(db, () => {
    db.prepare(`
      INSERT INTO ncf_local_sequences (tenant_id, tipo_codigo, next_sequence, cloud_next_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, tipo_codigo) DO UPDATE SET
        next_sequence = MAX(next_sequence, excluded.next_sequence),
        cloud_next_sequence = MAX(cloud_next_sequence, excluded.cloud_next_sequence),
        updated_at = excluded.updated_at
    `).run(tenantId, code, next, cloudNext, now());
  });
}

/** Read-only view of the counters for a type (no number is consumed). */
export function peekLocalNcfSequence(db: DatabaseSync, tenantId: string, preferredType?: string | null): NcfLocalPeek {
  const settings = readTenantSettings(db, tenantId);
  const code = resolveNcfBType(settings, preferredType);
  const state = readState(db, tenantId, settings, code);
  return {
    tipoCodigo: code,
    nextSequence: computeNcfReservationStart(state),
    localNextSequence: state.localNext,
    cloudNextSequence: state.cloudNext,
  };
}

export type NcfLocalSequenceRequest =
  | { action: "reserve"; tenantId?: string; preferredType?: string | null }
  | { action: "peek"; tenantId?: string; preferredType?: string | null }
  | { action: "record"; tenantId?: string; tipoCodigo: string; sequence: number; source: "cloud" | "local" };

export type NcfLocalSequenceResponse =
  | { ok: true; data: NcfLocalReservation | NcfLocalPeek | null }
  | { ok: false; code: NcfLocalErrorCode; message: string };

/** Validates an untrusted IPC payload; null when malformed. */
export function parseNcfLocalSequenceRequest(payload: unknown): NcfLocalSequenceRequest | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (p.tenantId !== undefined && typeof p.tenantId !== "string") return null;
  const tenantId = p.tenantId as string | undefined;
  const preferredOk = p.preferredType === undefined || p.preferredType === null || (typeof p.preferredType === "string" && p.preferredType.length <= 8);
  if (p.action === "reserve" || p.action === "peek") {
    if (!preferredOk) return null;
    return { action: p.action, tenantId, preferredType: (p.preferredType as string | null | undefined) ?? null };
  }
  if (p.action === "record") {
    if (typeof p.tipoCodigo !== "string" || p.tipoCodigo.length > 8) return null;
    if (!Number.isSafeInteger(p.sequence) || (p.sequence as number) < 1) return null;
    if (p.source !== "cloud" && p.source !== "local") return null;
    return { action: "record", tenantId, tipoCodigo: p.tipoCodigo, sequence: p.sequence as number, source: p.source };
  }
  return null;
}

/** Executes a request against the tenant database, mapping domain errors to a typed response. */
export function executeNcfLocalSequenceRequest(db: DatabaseSync, tenantId: string, request: NcfLocalSequenceRequest): NcfLocalSequenceResponse {
  try {
    switch (request.action) {
      case "reserve":
        return { ok: true, data: reserveLocalNcfSequence(db, tenantId, request.preferredType) };
      case "peek":
        return { ok: true, data: peekLocalNcfSequence(db, tenantId, request.preferredType) };
      case "record":
        recordIssuedNcfSequence(db, tenantId, request.tipoCodigo, request.sequence, request.source);
        return { ok: true, data: null };
    }
  } catch (error) {
    if (error instanceof NcfLocalSequenceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
