import { describe, expect, it } from "vitest";
import {
  parentAndFractionsToTotal,
  totalToParentAndFractions,
  totalToFractionalParents,
  formatFractionalStock,
  calculateCostPerFraction,
  calculateStockValue,
} from "./presentationUnits";

describe("presentationUnits", () => {
  it("conversiones de unidades principales y fracciones a fracciones totales", () => {
    expect(parentAndFractionsToTotal(3, 750, 250)).toBe(2500);
    expect(parentAndFractionsToTotal(0, 750, 250)).toBe(2500 - 3 * 750); // 250
    expect(parentAndFractionsToTotal(2, 1000, 0)).toBe(2000);
    expect(parentAndFractionsToTotal(2, 0, 100)).toBe(0); // Borde: tamaño fraccion 0
  });

  it("conversiones de total fracciones a unidades principales y remanente", () => {
    expect(totalToParentAndFractions(2500, 750)).toEqual({
      parentUnits: 3,
      remainingFractions: 250,
    });
    expect(totalToParentAndFractions(1500, 750)).toEqual({
      parentUnits: 2,
      remainingFractions: 0,
    });
    expect(totalToParentAndFractions(100, 750)).toEqual({
      parentUnits: 0,
      remainingFractions: 100,
    });
    expect(totalToParentAndFractions(100, 0)).toEqual({
      parentUnits: 0,
      remainingFractions: 0,
    }); // Borde: tamaño fraccion 0
  });

  it("conversiones a unidades principales fraccionales (decimales)", () => {
    expect(totalToFractionalParents(1000, 750)).toBe(1.3333);
    expect(totalToFractionalParents(1500, 750)).toBe(2.0);
    expect(totalToFractionalParents(2500, 750)).toBe(3.3333);
    expect(totalToFractionalParents(100, 0)).toBe(0); // Borde: tamaño fraccion 0
  });

  it("formateo visual del stock por presentacion generica", () => {
    expect(formatFractionalStock(1500, 750)).toBe("2 unidades");
    expect(formatFractionalStock(2500, 750)).toBe("3 unidades y 250 fracciones");
    expect(formatFractionalStock(0, 750)).toBe("0 unidades");
    expect(formatFractionalStock(250, 750)).toBe("250 fracciones");
    expect(formatFractionalStock(100, 0)).toBe("0 unidades"); // Borde: tamaño fraccion 0
    
    // Con nombres customizados
    expect(formatFractionalStock(2500, 750, "Cajas", "Botellas")).toBe("3 Cajas y 250 Botellas");
    expect(formatFractionalStock(250, 750, "Cajas", "Botellas")).toBe("250 Botellas");
  });

  it("calculo de costo por fraccion", () => {
    expect(calculateCostPerFraction(15.0, 750)).toBe(0.02);
    expect(calculateCostPerFraction(20.5, 1000)).toBe(0.0205);
    expect(calculateCostPerFraction(0, 750)).toBe(0.0);
    expect(calculateCostPerFraction(15.0, 0)).toBe(0.0); // Borde: tamaño fraccion 0
  });

  it("calculo de valuación de stock", () => {
    expect(calculateStockValue(2500, 750, 15)).toBe(50.0);
    expect(calculateStockValue(0, 750, 15)).toBe(0.0);
    expect(calculateStockValue(2500, 0, 15)).toBe(0.0); // Borde: tamaño fraccion 0
    expect(calculateStockValue(1000, 1000, 20.5)).toBe(20.5);
  });
});
