import type { LimitDraft, TenantRow } from "./types";
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

/**
 * Checks if the payments portion of the draft changed relative to the initial draft.
 */
export function isPaymentsFormDirty(current: LimitDraft, initial: LimitDraft): boolean {
  return current.paymentDayOfMonth.trim() !== initial.paymentDayOfMonth.trim();
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
