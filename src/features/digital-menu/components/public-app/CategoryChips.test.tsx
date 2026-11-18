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

    // Selected chip has white bg and text-#0e0e0e
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("bg-[#fafafa] text-[#0e0e0e]");
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

    expect(html).toContain('placeholder="¿Qué se te antoja hoy?"');
    expect(html).toContain('aria-label="Buscar platos, categorías o ingredientes en el menú"');
    expect(html).toContain('value="burger"');
    expect(html).toContain('aria-label="Limpiar búsqueda"');
  });
});
