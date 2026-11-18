import {
  CupSoda,
  IceCreamCone,
  UtensilsCrossed,
  Salad,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps category names (with case and accent normalization) to representative Lucide icons:
 * - Bebidas -> CupSoda
 * - Postres -> IceCreamCone
 * - Almuerzos / Platos -> UtensilsCrossed
 * - Acompañantes -> Salad
 * - default -> UtensilsCrossed
 */
export function getCategoryIcon(category?: string | null): LucideIcon {
  if (!category) return UtensilsCrossed;

  const normalized = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (
    normalized.includes("bebida") ||
    normalized.includes("trago") ||
    normalized.includes("jugo") ||
    normalized.includes("refresco") ||
    normalized.includes("drink")
  ) {
    return CupSoda;
  }

  if (
    normalized.includes("postre") ||
    normalized.includes("dulce") ||
    normalized.includes("helado") ||
    normalized.includes("dessert")
  ) {
    return IceCreamCone;
  }

  if (
    normalized.includes("almuerzo") ||
    normalized.includes("plato") ||
    normalized.includes("principal") ||
    normalized.includes("comida")
  ) {
    return UtensilsCrossed;
  }

  if (
    normalized.includes("acompanante") ||
    normalized.includes("guarnicion") ||
    normalized.includes("ensalada") ||
    normalized.includes("entrada") ||
    normalized.includes("side")
  ) {
    return Salad;
  }

  return UtensilsCrossed;
}
