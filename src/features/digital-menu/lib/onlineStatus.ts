export const RESTAURANT_CLOSED_MESSAGE =
  "Este restaurante no está trabajando en este momento. Por favor, vuelva en horario laboral.";

export const RETRY_BUTTON_LABEL = "Reintentar";

/**
 * Parses the jsonb response from public.get_online_menu_status RPC.
 * Expected shape: { "open": boolean }. Returns false for unknown/malformed payloads.
 */
export function parseOnlineMenuStatus(data: unknown): boolean {
  if (
    typeof data === "object" &&
    data !== null &&
    "open" in data &&
    typeof (data as { open: unknown }).open === "boolean"
  ) {
    return (data as { open: boolean }).open;
  }
  return false;
}

/**
 * Checks if an error (or error message) indicates the restaurant has no open cycle.
 */
export function isRestaurantClosedError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  return msg.toUpperCase().includes("RESTAURANT_CLOSED");
}

/**
 * Maps an RPC or submission error to a user-facing string, prioritizing RESTAURANT_CLOSED.
 */
export function mapOnlineMenuError(error: unknown, fallbackMessage?: string): string {
  if (isRestaurantClosedError(error)) {
    return RESTAURANT_CLOSED_MESSAGE;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallbackMessage || RESTAURANT_CLOSED_MESSAGE;
}
