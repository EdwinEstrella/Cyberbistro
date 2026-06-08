import { describe, expect, it } from "vitest";
import {
  bottlesAndMlToTotalMl,
  totalMlToBottlesAndMl,
  totalMlToFractionalBottles,
  formatPresentationStock,
  calculateCostPerMl,
  calculateStockValue,
} from "./presentationUnits";

describe("presentationUnits", () => {
  it("conversiones de botellas y ml a mililitros totales", () => {
    expect(bottlesAndMlToTotalMl(3, 750, 250)).toBe(2500);
    expect(bottlesAndMlToTotalMl(0, 750, 250)).toBe(2500 - 3 * 750); // 250
    expect(bottlesAndMlToTotalMl(2, 1000, 0)).toBe(2000);
    expect(bottlesAndMlToTotalMl(2, 0, 100)).toBe(0); // Borde: tamaño botella 0
  });

  it("conversiones de total ml a botellas y remanente", () => {
    expect(totalMlToBottlesAndMl(2500, 750)).toEqual({
      bottles: 3,
      remainingMl: 250,
    });
    expect(totalMlToBottlesAndMl(1500, 750)).toEqual({
      bottles: 2,
      remainingMl: 0,
    });
    expect(totalMlToBottlesAndMl(100, 750)).toEqual({
      bottles: 0,
      remainingMl: 100,
    });
    expect(totalMlToBottlesAndMl(100, 0)).toEqual({
      bottles: 0,
      remainingMl: 0,
    }); // Borde: tamaño botella 0
  });

  it("conversiones a botellas fraccionales (decimales)", () => {
    expect(totalMlToFractionalBottles(1000, 750)).toBe(1.3333);
    expect(totalMlToFractionalBottles(1500, 750)).toBe(2.0);
    expect(totalMlToFractionalBottles(2500, 750)).toBe(3.3333);
    expect(totalMlToFractionalBottles(100, 0)).toBe(0); // Borde: tamaño botella 0
  });

  it("formateo visual del stock por presentacion", () => {
    expect(formatPresentationStock(1500, 750)).toBe("2 bot.");
    expect(formatPresentationStock(2500, 750)).toBe("3 bot. y 250 ml");
    expect(formatPresentationStock(0, 750)).toBe("0 bot.");
    expect(formatPresentationStock(250, 750)).toBe("250 ml");
    expect(formatPresentationStock(100, 0)).toBe("0 bot."); // Borde: tamaño botella 0
  });

  it("calculo de costo por ml", () => {
    expect(calculateCostPerMl(15.0, 750)).toBe(0.02);
    expect(calculateCostPerMl(20.5, 1000)).toBe(0.0205);
    expect(calculateCostPerMl(0, 750)).toBe(0.0);
    expect(calculateCostPerMl(15.0, 0)).toBe(0.0); // Borde: tamaño botella 0
  });

  it("calculo de valuación de stock", () => {
    expect(calculateStockValue(2500, 750, 15)).toBe(50.0);
    expect(calculateStockValue(0, 750, 15)).toBe(0.0);
    expect(calculateStockValue(2500, 0, 15)).toBe(0.0); // Borde: tamaño botella 0
    expect(calculateStockValue(1000, 1000, 20.5)).toBe(20.5);
  });
});
