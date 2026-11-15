export type PublicMenuMode =
  | { kind: "table"; mesa: number }
  | { kind: "takeout"; invalidMesa: boolean };

export interface ResolvePublicMenuModeParams {
  mesaParam: string | null | undefined;
  cantidadMesas: number;
}

const STRICT_POSITIVE_INT_REGEX = /^[1-9]\d*$/;

/**
 * Resolves whether the customer entered table mode (?mesa=N) or takeout mode.
 * Enforces strict integer parsing: rejects 0, negatives, decimals, alphabetic strings,
 * and numbers beyond the restaurant's configured table count.
 */
export function resolvePublicMenuMode({
  mesaParam,
  cantidadMesas,
}: ResolvePublicMenuModeParams): PublicMenuMode {
  if (mesaParam === null || mesaParam === undefined) {
    return { kind: "takeout", invalidMesa: false };
  }

  const trimmed = mesaParam.trim();
  if (trimmed.length === 0) {
    return { kind: "takeout", invalidMesa: false };
  }

  if (!STRICT_POSITIVE_INT_REGEX.test(trimmed)) {
    return { kind: "takeout", invalidMesa: true };
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { kind: "takeout", invalidMesa: true };
  }

  const maxMesas = Number.isSafeInteger(cantidadMesas) ? cantidadMesas : 0;
  if (maxMesas < 1 || parsed > maxMesas) {
    return { kind: "takeout", invalidMesa: true };
  }

  return { kind: "table", mesa: parsed };
}
