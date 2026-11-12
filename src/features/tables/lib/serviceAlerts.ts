export type ServiceAlertKind = "waiter" | "bill";

export interface ServiceAlert {
  id: string;
  mesaNumero: number;
  kind: ServiceAlertKind;
  createdAt: string;
  sucursalId: string | null;
}

/**
 * Defensively parses an untrusted row or event payload into a ServiceAlert.
 * Returns null for malformed rows and for rows whose status is not "pending".
 */
export function parseServiceAlertRow(row: unknown): ServiceAlert | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const r = row as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) return null;

  const rawStatus = typeof r.status === "string" ? r.status.trim() : "";
  if (rawStatus !== "pending") return null;

  const rawMesaNumero = r.mesa_numero ?? r.mesaNumero;
  const mesaNumero =
    typeof rawMesaNumero === "number"
      ? rawMesaNumero
      : typeof rawMesaNumero === "string" && rawMesaNumero.trim() !== ""
        ? Number(rawMesaNumero)
        : NaN;

  if (!Number.isInteger(mesaNumero) || mesaNumero <= 0) {
    return null;
  }

  const rawKind = typeof r.kind === "string" ? r.kind.trim() : "";
  if (rawKind !== "waiter" && rawKind !== "bill") {
    return null;
  }

  const rawCreatedAt =
    typeof r.created_at === "string"
      ? r.created_at.trim()
      : typeof r.createdAt === "string"
        ? r.createdAt.trim()
        : "";
  if (!rawCreatedAt || Number.isNaN(Date.parse(rawCreatedAt))) {
    return null;
  }

  const rawSucursalId = r.sucursal_id ?? r.sucursalId;
  const sucursalId =
    typeof rawSucursalId === "string" && rawSucursalId.trim() !== ""
      ? rawSucursalId.trim()
      : null;

  return {
    id,
    mesaNumero,
    kind: rawKind as ServiceAlertKind,
    createdAt: rawCreatedAt,
    sucursalId,
  };
}

/**
 * Sorts alerts oldest first (ascending by createdAt, with deterministic tiebreakers).
 */
export function sortServiceAlerts(alerts: readonly ServiceAlert[]): ServiceAlert[] {
  return [...alerts].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    if (a.mesaNumero !== b.mesaNumero) return a.mesaNumero - b.mesaNumero;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Applies a realtime service request event (INSERT, UPDATE, DELETE) to the current list of alerts.
 * - INSERT/UPDATE of pending row adds or replaces by id (no duplicates).
 * - UPDATE/INSERT with status "attended", or DELETE, removes by id.
 * - Malformed payload returns current unchanged.
 * - Result is sorted oldest first.
 */
export function applyServiceRequestEvent(
  current: ServiceAlert[],
  event: "INSERT" | "UPDATE" | "DELETE",
  payload: unknown
): ServiceAlert[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return current;
  }

  const r = payload as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) {
    return current;
  }

  if (event === "DELETE") {
    const next = current.filter((a) => a.id !== id);
    return next.length === current.length ? current : next;
  }

  const rawStatus = typeof r.status === "string" ? r.status.trim() : "";
  if (rawStatus === "attended") {
    const next = current.filter((a) => a.id !== id);
    return next.length === current.length ? current : next;
  }

  const parsed = parseServiceAlertRow(payload);
  if (!parsed) {
    return current;
  }

  const existingIndex = current.findIndex((a) => a.id === parsed.id);
  let next: ServiceAlert[];
  if (existingIndex >= 0) {
    next = [...current];
    next[existingIndex] = parsed;
  } else {
    next = [...current, parsed];
  }

  return sortServiceAlerts(next);
}

/**
 * Returns true only for an INSERT event of a pending row whose id is not already in current alerts.
 * Prevents playing alert sounds on replays, updates, or duplicates.
 */
export function shouldPlayAlertSound(
  event: "INSERT" | "UPDATE" | "DELETE",
  payload: unknown,
  current: ServiceAlert[]
): boolean {
  if (event !== "INSERT") return false;
  const parsed = parseServiceAlertRow(payload);
  if (!parsed) return false;
  return !current.some((a) => a.id === parsed.id);
}

/**
 * Determines whether an alert should be removed optimistically from local state after an attend update.
 * Returns true if the update returned at least one row, indicating the update succeeded on the server.
 * Returns false for empty rows (e.g. silent RLS denial or another staff member attended first)
 * or non-array responses, indicating server state should be re-fetched.
 */
export function shouldRemoveAfterAttend(updatedRows: unknown): boolean {
  return Array.isArray(updatedRows) && updatedRows.length > 0;
}

/**
 * Generates user-facing title and subtitle descriptions for an alert in Spanish.
 */
export function describeServiceAlert(alert: ServiceAlert): { title: string; subtitle: string } {
  const title = `Mesa ${alert.mesaNumero}`;
  const subtitle = alert.kind === "waiter" ? "Llama al mesero" : "Pide la cuenta";
  return { title, subtitle };
}

/**
 * Formats wait duration relative to now in Spanish.
 * Returns empty string for invalid dates.
 * - < 1 min: "hace un momento"
 * - < 60 min: "hace N min"
 * - >= 60 min with remainder: "hace H h M min"
 * - >= 60 min exact hours: "hace H h"
 */
export function formatWaitTime(createdAt: string, now: Date): string {
  if (!createdAt || typeof createdAt !== "string") return "";
  const createdDate = new Date(createdAt);
  const createdTime = createdDate.getTime();
  if (Number.isNaN(createdTime)) return "";

  if (!now || !(now instanceof Date)) return "";
  const nowTime = now.getTime();
  if (Number.isNaN(nowTime)) return "";

  const diffMs = nowTime - createdTime;
  if (diffMs < 0) {
    return "hace un momento";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 1) {
    return "hace un momento";
  }

  if (totalMinutes < 60) {
    return `hace ${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (remMinutes === 0) {
    return `hace ${hours} h`;
  }
  return `hace ${hours} h ${remMinutes} min`;
}
