/** Categorías al crear/editar platos (Soporte) y orden sugerido en el POS. */
export const MENU_CATEGORIES: string[] = [
  "Entradas",
  "Hamburguesas",
  "Pastas",
  "Sushi",
  "Postres",
  "Bebidas",
  "Mofongos",
  "Mariscos",
  "Salchipapa",
  "Quesadillas",
  "Yaroas",
  "Burritos",
  "Sandwich",
  "Tacos",
  "Menú especial",
  "Plato del día",
  "General",
]

/**
 * Colores de chips en dashboard / soporte (una clave = un hex distinto).
 * Legacy "Burritos sandwich" tiene su propio tono para no duplicar Burritos.
 */
export const MENU_CATEGORY_COLORS: Record<string, string> = {
  Entradas: "#9ca3af",
  Hamburguesas: "#ff2d55",
  Pastas: "#ffd60a",
  Sushi: "#ff9f0a",
  Postres: "#ff3b30",
  Bebidas: "#32d74b",
  Mofongos: "#eab308",
  Mariscos: "#64d2ff",
  Salchipapa: "#ff9500",
  Quesadillas: "#fb7185",
  Yaroas: "#bf5af2",
  Burritos: "#5ac8fa",
  Sandwich: "#007aff",
  /** Legacy: platos guardados antes del split (hex distinto de Burritos). */
  "Burritos sandwich": "#22d3ee",
  Tacos: "#ff375f",
  "Menú especial": "#34c759",
  "Plato del día": "#facc15",
  General: "#a1a1aa",
}

const orderIndex = new Map(MENU_CATEGORIES.map((c, i) => [c, i]))

/** Ordena categorías que vienen de la BD según el menú estándar; el resto al final. */
export function sortCategoriesForTabs(names: string[]): string[] {
  return [...new Set(names)].sort(
    (a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999)
  )
}
