import { describe, expect, it } from "vitest";
import { filterDishesByName, normalizeSearchTerm } from "./searchDishes";

describe("searchDishes lib", () => {
  const sampleDishes = [
    { name: "Café Americano" },
    { name: "Plátano Maduro con Queso" },
    { name: "Hamburguesa Clásica" },
    { name: "Tacos de Pollo" },
    { name: "Jugo Natural de Chinola" },
  ];

  describe("normalizeSearchTerm", () => {
    it("strips accents and converts to lowercase", () => {
      expect(normalizeSearchTerm("Café")).toBe("cafe");
      expect(normalizeSearchTerm("PLÁTANO")).toBe("platano");
      expect(normalizeSearchTerm("  Hamburguesa  ")).toBe("hamburguesa");
    });
  });

  describe("filterDishesByName", () => {
    it("returns all dishes when query is empty or whitespace", () => {
      expect(filterDishesByName(sampleDishes, "")).toEqual(sampleDishes);
      expect(filterDishesByName(sampleDishes, "   ")).toEqual(sampleDishes);
    });

    it("matches exact name regardless of casing", () => {
      const result = filterDishesByName(sampleDishes, "HAMBURGUESA CLÁSICA");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Hamburguesa Clásica");
    });

    it("matches accent-insensitively (query without accent matches name with accent)", () => {
      const result = filterDishesByName(sampleDishes, "cafe");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Café Americano");
    });

    it("matches accent-insensitively (query with accent matches name without accent)", () => {
      const result = filterDishesByName(sampleDishes, "clásica");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Hamburguesa Clásica");
    });

    it("matches partial substrings", () => {
      const result = filterDishesByName(sampleDishes, "platano");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Plátano Maduro con Queso");
    });

    it("returns empty array when no matches are found", () => {
      const result = filterDishesByName(sampleDishes, "pizza");
      expect(result).toHaveLength(0);
    });
  });
});
