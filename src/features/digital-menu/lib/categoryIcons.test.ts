import { describe, expect, it } from "vitest";
import { CupSoda, IceCreamCone, UtensilsCrossed, Salad } from "lucide-react";
import { getCategoryIcon } from "./categoryIcons";

describe("getCategoryIcon lib", () => {
  it("maps beverage categories to CupSoda", () => {
    expect(getCategoryIcon("Bebidas")).toBe(CupSoda);
    expect(getCategoryIcon("bebidas frias")).toBe(CupSoda);
    expect(getCategoryIcon("Jugos")).toBe(CupSoda);
    expect(getCategoryIcon("Refrescos")).toBe(CupSoda);
  });

  it("maps dessert categories to IceCreamCone", () => {
    expect(getCategoryIcon("Postres")).toBe(IceCreamCone);
    expect(getCategoryIcon("Dulces")).toBe(IceCreamCone);
    expect(getCategoryIcon("Helados")).toBe(IceCreamCone);
  });

  it("maps lunch/main course categories to UtensilsCrossed", () => {
    expect(getCategoryIcon("Almuerzos")).toBe(UtensilsCrossed);
    expect(getCategoryIcon("Platos Fuertes")).toBe(UtensilsCrossed);
    expect(getCategoryIcon("Platos del Día")).toBe(UtensilsCrossed);
    expect(getCategoryIcon("Principales")).toBe(UtensilsCrossed);
  });

  it("maps side/accompaniment categories to Salad", () => {
    expect(getCategoryIcon("Acompañantes")).toBe(Salad);
    expect(getCategoryIcon("Acompanantes")).toBe(Salad);
    expect(getCategoryIcon("Guarniciones")).toBe(Salad);
    expect(getCategoryIcon("Ensaladas")).toBe(Salad);
  });

  it("falls back to UtensilsCrossed for unknown or missing category", () => {
    expect(getCategoryIcon("")).toBe(UtensilsCrossed);
    expect(getCategoryIcon(null)).toBe(UtensilsCrossed);
    expect(getCategoryIcon(undefined)).toBe(UtensilsCrossed);
    expect(getCategoryIcon("Varios")).toBe(UtensilsCrossed);
  });
});
