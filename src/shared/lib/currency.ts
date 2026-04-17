export type TenantCurrencyCode = "DOP" | "ARS";

export function normalizeTenantCurrencyCode(value: string | null | undefined): TenantCurrencyCode {
  return String(value || "").trim().toUpperCase() === "ARS" ? "ARS" : "DOP";
}

export function tenantCurrencySymbol(code: TenantCurrencyCode): string {
  return code === "ARS" ? "AR$" : "RD$";
}

export function tenantCurrencyLocale(code: TenantCurrencyCode): string {
  return code === "ARS" ? "es-AR" : "es-DO";
}

export function formatTenantCurrency(
  amount: number,
  code: TenantCurrencyCode,
  opts?: { withSymbol?: boolean }
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const withSymbol = opts?.withSymbol !== false;
  const formatted = safe.toLocaleString(tenantCurrencyLocale(code), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `${tenantCurrencySymbol(code)} ${formatted}` : formatted;
}
