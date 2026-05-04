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
  Entradas: "#868e96",
  Hamburguesas: "#e64980",
  Pastas: "#fbbf24",
  Sushi: "#fb923c",
  Postres: "#f87171",
  Bebidas: "#15803d",
  Mofongos: "#a69069",
  Mariscos: "#0d9488",
  Salchipapa: "#d97706",
  Quesadillas: "#c2410c",
  Yaroas: "#9333ea",
  Burritos: "#0ea5e9",
  Sandwich: "#0369a1",
  /** Legacy: platos guardados antes del split (hex distinto de Burritos). */
  "Burritos sandwich": "#0891b2",
  Tacos: "#c026d3",
  "Menú especial": "#065f46",
  "Plato del día": "#f59e0b",
  General: "#52525b",
}

const orderIndex = new Map(MENU_CATEGORIES.map((c, i) => [c, i]))

/** Ordena categorías que vienen de la BD según el menú estándar; el resto al final. */
export function sortCategoriesForTabs(names: string[]): string[] {
  return [...new Set(names)].sort(
    (a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999)
  )
}
