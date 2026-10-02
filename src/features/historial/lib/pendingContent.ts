/**
 * Content-aware "pending download" detection. Comparing row COUNTS cannot see a
 * row whose content changed in the cloud (e.g. a corrected NCF), so this
 * compares `updated_at` per row id: a row is pending when it is missing locally
 * or the cloud copy is strictly newer than the local one.
 */

export interface CloudRowVersion {
  id: string;
  updated_at: string | null;
}

export interface LocalRowVersion {
  id: string;
  updatedAt: string | null;
}

export interface PendingContentResult {
  /** Cloud rows with no local counterpart. */
  missing: number;
  /** Rows present locally whose cloud copy is newer. */
  stale: number;
  total: number;
}

/** Tables the monitor can compare content-wise (both sides carry updated_at). */
export const CONTENT_COMPARABLE_TABLES: readonly string[] = ["facturas"];

/**
 * Parses cloud/local timestamp spellings into epoch ms. Accepts ISO
 * ("2026-10-02T12:00:00.000Z"), Postgres ("2026-10-02 12:00:00+00",
 * "2026-10-02 12:00:00.123456+00:00") and SQLite ("2026-10-02 12:00:00", read as
 * UTC). Returns NaN when it cannot be parsed.
 */
export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  let text = String(value).trim().replace(" ", "T");
  // "+00" / "-04" -> "+00:00" / "-04:00" so Date.parse accepts the offset.
  text = text.replace(/([+-]\d{2})$/, "$1:00");
  // Trim fractional seconds beyond milliseconds (Postgres emits microseconds).
  text = text.replace(/(\.\d{3})\d+/, "$1");
  // No zone designator -> UTC (SQLite CURRENT_TIMESTAMP is UTC).
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(text)) text += "Z";
  return Date.parse(text);
}

export function countPendingContent(cloudRows: readonly CloudRowVersion[], localRows: readonly LocalRowVersion[]): PendingContentResult {
  const localById = new Map<string, string | null>();
  for (const row of localRows) localById.set(String(row.id), row.updatedAt);

  let missing = 0;
  let stale = 0;
  for (const cloud of cloudRows) {
    const id = String(cloud.id);
    if (!localById.has(id)) {
      missing += 1;
      continue;
    }
    const cloudTime = parseTimestamp(cloud.updated_at);
    if (Number.isNaN(cloudTime)) continue; // nothing to say about a cloud row without a version
    const localTime = parseTimestamp(localById.get(id));
    // Unknown local version but a known cloud version: cloud may hold newer data.
    if (Number.isNaN(localTime) || cloudTime > localTime) stale += 1;
  }
  return { missing, stale, total: missing + stale };
}
