/**
 * Cheap structural compare of rows/ids + updated_at.
 * Returns true if the next rows are structurally equal to the current rows,
 * preventing redundant state updates and unneeded React re-renders.
 */
export function areCierreRowsEqual<T>(
  prev: readonly T[] | null | undefined,
  next: readonly T[] | null | undefined
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    const a = prev[i] as any;
    const b = next[i] as any;
    if (a === b) continue;
    if (!a || !b) return false;

    // Primary identifier check
    if ('id' in a && 'id' in b && a.id !== b.id) {
      return false;
    }

    // If updated_at is present, compare updated_at and critical status fields
    if ('updated_at' in a && 'updated_at' in b) {
      if (a.updated_at !== b.updated_at) return false;
      if ('closed_at' in a && 'closed_at' in b && a.closed_at !== b.closed_at) return false;
      if ('estado' in a && 'estado' in b && a.estado !== b.estado) return false;
      continue;
    }

    // If updated_at is absent or not shared, perform shallow comparison
    if ('closed_at' in a && 'closed_at' in b && a.closed_at !== b.closed_at) return false;
    if ('estado' in a && 'estado' in b && a.estado !== b.estado) return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (a[key] !== b[key]) return false;
    }
  }

  return true;
}
