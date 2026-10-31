import { supabase } from "../../../shared/lib/supabase";

/**
 * Checks whether an error is caused by a missing internet connection or network failure.
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  if (!error) return false;
  const msg = (error as any).message ? String((error as any).message).toLowerCase() : "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("connection refused") ||
    msg.includes("fetch failed") ||
    msg.includes("se requiere conexión a internet") ||
    ((error as any).name === "TypeError" && msg.includes("fetch"))
  );
}

/**
 * Normalizes error to ensure network issues display the required message.
 */
function wrapRepoError(error: unknown, fallbackMessage: string): Error {
  if (isNetworkError(error)) {
    return new Error("Se requiere conexión a internet");
  }
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "object" && error !== null && (error as any).message) {
    return new Error(String((error as any).message));
  }
  return new Error(fallbackMessage);
}

/**
 * Pure helper to parse a credit limit input.
 * Returns null for empty, throws for invalid or negative numbers, rounds to 2 decimals.
 */
export function parseCreditLimit(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (str === "") return null;
  const parsed = Number(str);
  if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
    throw new Error("El límite de crédito debe ser un número mayor o igual a 0.");
  }
  return Math.round(parsed * 100) / 100;
}

/**
 * Pure helper to determine whether the credit limit value has actually changed.
 * If original is undefined (e.g. fetch failed or unknown), returns false to prevent overwriting.
 */
export function hasCreditLimitChanged(
  original: number | null | undefined,
  current: number | null | undefined
): boolean {
  if (original === undefined) return false;
  const normOriginal = original === null || original === undefined ? null : Math.round(original * 100) / 100;
  const normCurrent = current === null || current === undefined ? null : Math.round(current * 100) / 100;
  return normOriginal !== normCurrent;
}

/**
 * Fetches the credit limit for a customer directly from the cloud.
 */
export async function fetchCreditLimit(
  tenantId: string,
  customerId: string
): Promise<number | null> {
  if (!tenantId || !customerId) return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Se requiere conexión a internet");
  }

  try {
    const { data, error } = await supabase
      .from("customers")
      .select("credit_limit")
      .eq("tenant_id", tenantId)
      .eq("id", customerId)
      .single();

    if (error) {
      throw error;
    }

    if (!data || data.credit_limit === null || data.credit_limit === undefined) {
      return null;
    }
    return Number(data.credit_limit);
  } catch (err) {
    throw wrapRepoError(err, "Error al consultar el límite de crédito");
  }
}

/**
 * Updates only the credit_limit of a customer directly in the cloud.
 */
export async function saveCreditLimit(
  tenantId: string,
  customerId: string,
  value: number | null
): Promise<void> {
  if (!tenantId || !customerId) {
    throw new Error("Tenant y cliente son requeridos.");
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Se requiere conexión a internet");
  }

  const parsed = value !== null ? parseCreditLimit(value) : null;

  try {
    const { error } = await supabase
      .from("customers")
      .update({ credit_limit: parsed })
      .eq("tenant_id", tenantId)
      .eq("id", customerId);

    if (error) {
      throw error;
    }
  } catch (err) {
    throw wrapRepoError(err, "Error al guardar el límite de crédito");
  }
}
