/** Categorias sugeridas al crear/editar categorias por restaurante. */
export const DEFAULT_MENU_CATEGORY_SUGGESTIONS: string[] = [
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
];

/** Compatibilidad con codigo existente: ya no es fuente de verdad global. */
export const MENU_CATEGORIES = DEFAULT_MENU_CATEGORY_SUGGESTIONS;

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
  "Menu especial": "#34c759",
  "Plato del dia": "#facc15",
  General: "#a1a1aa",
};

const FALLBACK_CATEGORY_COLORS = [
  "#ff906d",
  "#59ee50",
  "#64d2ff",
  "#ffd60a",
  "#ff716c",
  "#bf5af2",
  "#5ac8fa",
  "#fb7185",
  "#34c759",
  "#f97316",
];

const orderIndex = new Map(DEFAULT_MENU_CATEGORY_SUGGESTIONS.map((c, i) => [c, i]));

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function suggestCategoryColor(name: string): string {
  const normalized = normalizeCategoryName(name);
  const known = MENU_CATEGORY_COLORS[normalized];
  if (known) return known;

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_CATEGORY_COLORS[hash % FALLBACK_CATEGORY_COLORS.length];
}

/** Ordena categorias segun el orden tenant; las desconocidas quedan al final. */
export function sortCategoriesForTabs(
  names: string[],
  preferredOrder: string[] = DEFAULT_MENU_CATEGORY_SUGGESTIONS
): string[] {
  const preferredIndex = new Map(preferredOrder.map((c, i) => [c, i]));
  return [...new Set(names.map(normalizeCategoryName).filter(Boolean))].sort(
    (a, b) =>
      (preferredIndex.get(a) ?? orderIndex.get(a) ?? 999) -
        (preferredIndex.get(b) ?? orderIndex.get(b) ?? 999) ||
      a.localeCompare(b)
  );
}
