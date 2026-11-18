/**
 * Pure search filtering functions for public digital menu dishes.
 * Case-insensitive and accent-insensitive matching.
 */

export function normalizeSearchTerm(term: string): string {
  return term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function filterDishesByName<T extends { name: string }>(
  dishes: T[],
  query: string
): T[] {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) {
    return dishes;
  }
  return dishes.filter((dish) => {
    const normalizedName = normalizeSearchTerm(dish.name);
    return normalizedName.includes(normalizedQuery);
  });
}
