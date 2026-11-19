import type { LimitDraft, TenantRow } from "./types";
import type { DebtCurrency } from "../../../shared/lib/tenantDebt";
import { extractTenantUserLimitConfig } from "../../../shared/lib/tenantUserLimits";

export function toDraft(tenant: TenantRow): LimitDraft {
  const config = extractTenantUserLimitConfig(tenant);

  return {
    userLimitEnabled: config.userLimitEnabled,
    adminUserLimit: "1",
    cajeraUserLimit: config.cajeraUserLimit?.toString() ?? "",
    cocinaUserLimit: config.cocinaUserLimit?.toString() ?? "",
    meseroUserLimit: config.meseroUserLimit?.toString() ?? "",
    sucursalLimitEnabled: tenant.sucursal_limit_enabled !== false,
    sucursalLimit: tenant.sucursal_limit?.toString() ?? "",
    paymentDayOfMonth: tenant.payment_day_of_month?.toString() ?? "",
    monthlyFeeAmount:
      tenant.monthly_fee_amount !== null && tenant.monthly_fee_amount !== undefined
        ? tenant.monthly_fee_amount.toString()
        : "",
    monthlyFeeCurrency:
      (tenant.monthly_fee_currency as DebtCurrency) === "USD" ? "USD" : "DOP",
    debtAmount:
      tenant.debt_amount !== null && tenant.debt_amount !== undefined
        ? tenant.debt_amount.toString()
        : "",
    debtCurrency: (tenant.debt_currency as DebtCurrency) === "USD" ? "USD" : "DOP",
    debtDueDate: tenant.debt_due_date ?? "",
  };
}

export function parseNullableLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Los límites deben ser enteros mayores o iguales a 0.");
  }
  return parsed;
}

export function parseNullablePositiveLimit(value: string): number | null {
  const parsed = parseNullableLimit(value);
  if (parsed !== null && parsed < 1) {
    throw new Error("El límite de sucursales debe ser 1 o mayor.");
  }
  return parsed;
}

export function parsePaymentDay(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    throw new Error("El día de pago debe ser un entero entre 1 y 31.");
  }
  return parsed;
}

/**
 * Checks if the limits portion of the draft changed relative to the initial draft.
 */
export function isLimitsFormDirty(current: LimitDraft, initial: LimitDraft): boolean {
  return (
    current.userLimitEnabled !== initial.userLimitEnabled ||
    current.cajeraUserLimit.trim() !== initial.cajeraUserLimit.trim() ||
    current.cocinaUserLimit.trim() !== initial.cocinaUserLimit.trim() ||
    current.meseroUserLimit.trim() !== initial.meseroUserLimit.trim() ||
    current.sucursalLimitEnabled !== initial.sucursalLimitEnabled ||
    current.sucursalLimit.trim() !== initial.sucursalLimit.trim()
  );
}

export function parseMonthlyFeeAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0 || parsed > 9999999.99) {
    throw new Error("El monto de la cuota mensual debe ser un número entre 0 y 9,999,999.99.");
  }
  return parsed;
}

export function parseDebtAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0 || parsed > 9999999.99) {
    throw new Error("El monto de la deuda debe ser un número entre 0 y 9,999,999.99.");
  }
  return parsed;
}

/**
 * Normalizes a debt amount string for comparison.
 * Empty string, whitespace, and 0 (or "0.00") all normalize to 0.
 * Returns null if parsing fails so caller can treat invalid inputs safely.
 */
function normalizeDebtAmount(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

/**
 * Compares the debt fields of a draft against its initial values.
 * Empty amounts and 0 are considered equivalent.
 * Strings are trimmed for comparison.
 */
export function isDebtDraftChanged(draft: LimitDraft, initial: LimitDraft): boolean {
  const draftAmountNorm = normalizeDebtAmount(draft.debtAmount);
  const initialAmountNorm = normalizeDebtAmount(initial.debtAmount);

  if (draftAmountNorm !== initialAmountNorm) {
    return true;
  }

  if (draft.debtCurrency !== initial.debtCurrency) {
    return true;
  }

  if (draft.debtDueDate.trim() !== initial.debtDueDate.trim()) {
    return true;
  }

  return false;
}

export function isValidIsoDate(isoDate: string): boolean {
  if (!isoDate || typeof isoDate !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into display format (DD/MM/YYYY).
 * e.g. "2026-11-12" -> "12/11/2026"
 */
export function formatIsoDateDisplay(isoDate: string): string {
  if (!isoDate || typeof isoDate !== "string") return "";
  const trimmed = isoDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return trimmed;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * Resolves the due date for a debt.
 * - Debt amount null or <= 0 resolves to null.
 * - Existing debt with a valid ISO date preserves its original due date.
 * - New debt or invalid existing due date defaults to today's local date (YYYY-MM-DD).
 */
export function resolveDebtDueDate(input: {
  amount: number | null;
  existingDueDate: string;
  hadSavedDebt: boolean;
  today: Date;
}): string | null {
  if (input.amount === null || input.amount <= 0) {
    return null;
  }

  if (input.hadSavedDebt && isValidIsoDate(input.existingDueDate)) {
    return input.existingDueDate.trim();
  }

  const year = input.today.getFullYear();
  const month = String(input.today.getMonth() + 1).padStart(2, "0");
  const day = String(input.today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDebtCurrency(value: string): DebtCurrency {
  const trimmed = value.trim().toUpperCase();
  if (trimmed !== "DOP" && trimmed !== "USD") {
    throw new Error("La moneda de la deuda debe ser DOP o USD.");
  }
  return trimmed as DebtCurrency;
}

/**
 * Normalizes a payment day string for comparison.
 * Empty or invalid strings normalize to null.
 * Valid days (1-31) normalize to the integer number.
 */
export function normalizePaymentDay(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }
  return parsed;
}

/**
 * Checks if the monthly fee or payment day portion of the draft changed relative to initial.
 * Compares only normalized amount, currency, and normalized payment day.
 */
export function isMonthlyFeeConfigChanged(current: LimitDraft, initial: LimitDraft): boolean {
  const currentFeeNorm = normalizeDebtAmount(current.monthlyFeeAmount);
  const initialFeeNorm = normalizeDebtAmount(initial.monthlyFeeAmount);
  const feeChanged = currentFeeNorm !== initialFeeNorm;
  const currencyChanged = current.monthlyFeeCurrency !== initial.monthlyFeeCurrency;
  const dayChanged =
    normalizePaymentDay(current.paymentDayOfMonth) !==
    normalizePaymentDay(initial.paymentDayOfMonth);
  return feeChanged || currencyChanged || dayChanged;
}

/**
 * Checks if the payments/debt portion of the draft changed relative to the initial draft.
 */
export function isPaymentsFormDirty(current: LimitDraft, initial: LimitDraft): boolean {
  return (
    current.paymentDayOfMonth.trim() !== initial.paymentDayOfMonth.trim() ||
    current.monthlyFeeAmount.trim() !== initial.monthlyFeeAmount.trim() ||
    current.monthlyFeeCurrency !== initial.monthlyFeeCurrency ||
    current.debtAmount.trim() !== initial.debtAmount.trim() ||
    current.debtCurrency !== initial.debtCurrency ||
    current.debtDueDate.trim() !== initial.debtDueDate.trim()
  );
}

/**
 * Validates fields inside the Limits form, returning error strings by field name.
 */
export function validateLimitsDraft(draft: LimitDraft): {
  valid: boolean;
  errors: Partial<Record<keyof LimitDraft, string>>;
} {
  const errors: Partial<Record<keyof LimitDraft, string>> = {};

  try {
    parseNullablePositiveLimit(draft.sucursalLimit);
  } catch (err) {
    errors.sucursalLimit = err instanceof Error ? err.message : "Valor inválido";
  }

  try {
    parseNullableLimit(draft.cajeraUserLimit);
  } catch (err) {
    errors.cajeraUserLimit = err instanceof Error ? err.message : "Valor inválido";
  }

  try {
    parseNullableLimit(draft.cocinaUserLimit);
  } catch (err) {
    errors.cocinaUserLimit = err instanceof Error ? err.message : "Valor inválido";
  }

  try {
    parseNullableLimit(draft.meseroUserLimit);
  } catch (err) {
    errors.meseroUserLimit = err instanceof Error ? err.message : "Valor inválido";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates the payment day string.
 */
export function validatePaymentDayInput(value: string): { valid: boolean; error?: string } {
  try {
    parsePaymentDay(value);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "El día de pago debe ser entre 1 y 31.",
    };
  }
}

export interface PaymentsValidationErrors {
  paymentDayOfMonth?: string;
  monthlyFeeAmount?: string;
  monthlyFeeCurrency?: string;
  debtAmount?: string;
  debtCurrency?: string;
}

export interface PaymentsValidationResult {
  valid: boolean;
  errors: PaymentsValidationErrors;
}

/**
 * Validates the payments and debt fields in the draft.
 */
export function validatePaymentsDraft(draft: LimitDraft): PaymentsValidationResult {
  const errors: PaymentsValidationErrors = {};

  const dayResult = validatePaymentDayInput(draft.paymentDayOfMonth);
  if (!dayResult.valid && dayResult.error) {
    errors.paymentDayOfMonth = dayResult.error;
  }

  let parsedFee: number | null = null;
  try {
    parsedFee = parseMonthlyFeeAmount(draft.monthlyFeeAmount);
  } catch (err) {
    errors.monthlyFeeAmount = err instanceof Error ? err.message : "Monto de cuota mensual inválido.";
  }

  try {
    parseDebtCurrency(draft.monthlyFeeCurrency);
  } catch (err) {
    errors.monthlyFeeCurrency = err instanceof Error ? err.message : "Moneda inválida.";
  }

  try {
    parseDebtAmount(draft.debtAmount);
  } catch (err) {
    errors.debtAmount = err instanceof Error ? err.message : "Monto de deuda inválido.";
  }

  try {
    parseDebtCurrency(draft.debtCurrency);
  } catch (err) {
    errors.debtCurrency = err instanceof Error ? err.message : "Moneda inválida.";
  }

  // When fee > 0, payment_day_of_month is required (1..31)
  if (parsedFee !== null && parsedFee > 0) {
    if (!draft.paymentDayOfMonth || !draft.paymentDayOfMonth.trim()) {
      errors.paymentDayOfMonth = "El día de pago es obligatorio cuando se configura una cuota mensual.";
    }
  }

  // Mixed currencies check: whenever fee > 0, balance currency must match fee currency
  if (parsedFee !== null && parsedFee > 0) {
    if (draft.debtCurrency !== draft.monthlyFeeCurrency) {
      errors.debtCurrency = "La moneda del saldo debe ser la misma de la cuota mensual.";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
