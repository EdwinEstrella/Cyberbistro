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
  "Burritos sandwich",
  "Tacos",
  "Menú especial",
  "Plato del día",
  "General",
]

/** Colores de chips en dashboard / soporte (categorías sin entrada usan fallback). */
export const MENU_CATEGORY_COLORS: Record<string, string> = {
  Entradas: "#adaaaa",
  Hamburguesas: "#ff6aa0",
  Pastas: "#ffd06d",
  Sushi: "#ff906d",
  Postres: "#ff784d",
  Bebidas: "#59ee50",
  Mofongos: "#c4a574",
  Mariscos: "#4ecdc4",
  Salchipapa: "#e8b923",
  Quesadillas: "#f4a261",
  Yaroas: "#9b5de5",
  "Burritos sandwich": "#00bbf9",
  Tacos: "#f15bb5",
  "Menú especial": "#00f5d4",
  "Plato del día": "#fe9600",
  General: "#6b7280",
}

const orderIndex = new Map(MENU_CATEGORIES.map((c, i) => [c, i]))

/** Ordena categorías que vienen de la BD según el menú estándar; el resto al final. */
export function sortCategoriesForTabs(names: string[]): string[] {
  return [...new Set(names)].sort(
    (a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999)
  )
}
