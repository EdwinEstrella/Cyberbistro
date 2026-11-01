/**
 * Formats a currency amount in Dominican Pesos (RD$).
 */
export function formatRD(val: number): string {
  const rounded = Number(val || 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `RD$${rounded}`;
}

/**
 * Generates the user-facing credit usage label:
 * "Crédito usado RD$X de RD$Y" when limit is configured.
 */
export function formatCreditUsage(used: number, limit?: number | null): string {
  const safeUsed = Math.max(0, Number(used || 0));
  if (limit === null || limit === undefined) {
    return `${formatRD(safeUsed)} (Sin límite)`;
  }
  const safeLimit = Math.max(0, Number(limit || 0));
  return `Crédito usado ${formatRD(safeUsed)} de ${formatRD(safeLimit)}`;
}

/**
 * Checks whether the credit limit is reached or exceeded.
 */
export function isCreditLimitReached(used: number, limit?: number | null): boolean {
  if (limit === null || limit === undefined) return false;
  return Number(used || 0) >= Number(limit);
}

/**
 * Checks whether accepting an incoming order would exceed the company's credit limit.
 */
export function wouldExceedCreditLimit(
  currentUsed: number,
  orderTotal: number,
  limit?: number | null
): boolean {
  if (limit === null || limit === undefined) return false;
  return Number(currentUsed || 0) + Number(orderTotal || 0) > Number(limit);
}

/**
 * Computes the integer progress bar percentage (0 to 100).
 */
export function getCreditProgressPercentage(used: number, limit?: number | null): number {
  if (limit === null || limit === undefined || limit <= 0) return 0;
  const pct = Math.round((Number(used || 0) / Number(limit)) * 100);
  return Math.min(100, Math.max(0, pct));
}
