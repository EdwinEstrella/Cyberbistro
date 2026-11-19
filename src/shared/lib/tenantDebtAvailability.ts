const unavailableTenants = new Set<string>();
const warnedTenants = new Set<string>();

/**
 * Checks if an error from PostgREST / Supabase indicates that the tenant debt columns
 * (debt_amount, debt_currency, debt_due_date, debt_updated_at) have not yet been migrated.
 */
export function isMissingDebtColumnsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: number; status?: number; code?: string; message?: string; details?: string };
  const text = `${value.code ?? ""} ${value.message ?? ""} ${value.details ?? ""}`.toLowerCase();
  const status = value.statusCode ?? value.status;
  const mentionsDebtColumn =
    text.includes("debt_amount") ||
    text.includes("debt_currency") ||
    text.includes("debt_due_date") ||
    text.includes("debt_updated_at") ||
    text.includes("monthly_fee_amount") ||
    text.includes("monthly_fee_currency") ||
    text.includes("last_charged_period");
  const identifiesMissingSchema =
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("missing column") ||
    text.includes("undefined column") ||
    value.code === "42703";
  return mentionsDebtColumn && identifiesMissingSchema && (status === undefined || status === 400);
}

export function markDebtColumnsUnavailable(tenantId: string): boolean {
  unavailableTenants.add(tenantId);
  if (warnedTenants.has(tenantId)) return false;
  warnedTenants.add(tenantId);
  return true;
}

export function isDebtColumnsUnavailable(tenantId: string): boolean {
  return unavailableTenants.has(tenantId);
}

export function resetDebtColumnsAvailabilityForTests(): void {
  unavailableTenants.clear();
  warnedTenants.clear();
}
