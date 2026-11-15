import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryChips } from "./CategoryChips";

describe("CategoryChips", () => {
  const sampleCategories = ["Entradas", "Principales", "Bebidas", "Postres"];

  it("renders 'Todo' chip plus all category chips with horizontal scroll semantics", () => {
    const html = renderToStaticMarkup(
      <CategoryChips
        categories={sampleCategories}
        selectedCategory="all"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
      />
    );

    expect(html).toContain("Todo");
    expect(html).toContain("Entradas");
    expect(html).toContain("Principales");
    expect(html).toContain("Bebidas");
    expect(html).toContain("Postres");
    expect(html).toContain('aria-label="Categorías del menú"');
    expect(html).toContain("snap-x");
  });

  it("marks active category as aria-pressed and styles it with active tokens", () => {
    const html = renderToStaticMarkup(
      <CategoryChips
        categories={sampleCategories}
        selectedCategory="Principales"
        onSelectCategory={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
      />
    );

    // Selected chip has bg-white and text-zinc-950
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("bg-white text-zinc-950");
  });

  it("renders search input with placeholder and accessibility label", () => {
    const html = renderToStaticMarkup(
      <CategoryChips
        categories={sampleCategories}
        selectedCategory="all"
        onSelectCategory={vi.fn()}
        searchQuery="burger"
        onSearchChange={vi.fn()}
      />
    );

    expect(html).toContain('placeholder="Buscar en el menú"');
    expect(html).toContain('aria-label="Buscar platos, categorías o ingredientes en el menú"');
    expect(html).toContain('value="burger"');
    expect(html).toContain('aria-label="Limpiar búsqueda"');
  });
});
