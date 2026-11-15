/**
 * Home delivery for public-menu takeout orders.
 * Pure helpers shared by the public menu form (validation + RPC args) and the staff Pedidos screen (map link).
 * The RPC enforces the same rules server-side; these checks only give the customer fast, readable feedback.
 */

export type DeliveryMode = "pickup" | "delivery";

export interface DeliveryDraft {
  mode: DeliveryMode;
  lat: number | null;
  lng: number | null;
  reference: string;
}

export const DELIVERY_REFERENCE_MAX = 300;

export const EMPTY_DELIVERY_DRAFT: DeliveryDraft = { mode: "pickup", lat: null, lng: null, reference: "" };

export function isValidCoordinatePair(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Returns a Spanish message for the first problem, or null when the draft can be submitted. */
export function validateDeliveryDraft(draft: DeliveryDraft, customerPhone: string): string | null {
  if (draft.mode !== "delivery") return null;

  if (customerPhone.trim() === "") return "Ingresa tu teléfono para coordinar la entrega.";

  const reference = draft.reference.trim();
  if (reference.length > DELIVERY_REFERENCE_MAX) {
    return `La referencia no puede pasar de ${DELIVERY_REFERENCE_MAX} caracteres.`;
  }

  const hasCoordinates = draft.lat !== null || draft.lng !== null;
  if (hasCoordinates && !isValidCoordinatePair(draft.lat, draft.lng)) {
    return "La ubicación seleccionada no es válida. Vuelve a elegirla en el mapa.";
  }

  if (!hasCoordinates && reference === "") {
    return "Comparte tu ubicación o escribe un punto de referencia para la entrega.";
  }

  return null;
}

/** RPC arguments for the delivery fields. Pickup sends nothing so the server defaults apply. */
export function toDeliveryRpcArgs(draft: DeliveryDraft): Record<string, unknown> {
  if (draft.mode !== "delivery") return {};
  const hasCoordinates = isValidCoordinatePair(draft.lat, draft.lng);
  return {
    p_delivery_mode: "delivery",
    p_delivery_lat: hasCoordinates ? draft.lat : null,
    p_delivery_lng: hasCoordinates ? draft.lng : null,
    p_delivery_reference: draft.reference.trim() || null,
  };
}

/** Link the delivery person can open on their phone; null when the order has no coordinates. */
export function buildMapsUrl(lat: unknown, lng: unknown): string | null {
  if (!isValidCoordinatePair(lat, lng)) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
