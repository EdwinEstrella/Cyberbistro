const unavailableTenants = new Set<string>();
const warnedTenants = new Set<string>();

export function isMissingPaymentDayColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: number; status?: number; code?: string; message?: string; details?: string };
  const text = `${value.code ?? ""} ${value.message ?? ""} ${value.details ?? ""}`.toLowerCase();
  const hasErrorText = Boolean(value.code || value.message || value.details);
  const status = value.statusCode ?? value.status;
  return (
    status === 400 &&
    (!hasErrorText || text.includes("payment_day_of_month"))
  ) || (
    text.includes("payment_day_of_month") &&
    (text.includes("does not exist") || text.includes("schema cache") || text.includes("column"))
  );
}

export function markPaymentDayUnavailable(tenantId: string): boolean {
  unavailableTenants.add(tenantId);
  if (warnedTenants.has(tenantId)) return false;
  warnedTenants.add(tenantId);
  return true;
}

export function isPaymentDayUnavailable(tenantId: string): boolean {
  return unavailableTenants.has(tenantId);
}

export function resetPaymentDayAvailabilityForTests(): void {
  unavailableTenants.clear();
  warnedTenants.clear();
}
