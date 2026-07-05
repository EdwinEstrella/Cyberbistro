import { describe, expect, it } from "vitest";
import { calculateExpectedCashDrawer, sumCashExpenses } from "./cycleCash";

describe("calculateExpectedCashDrawer", () => {
  it("includes initial cash in the expected physical cash drawer", () => {
    expect(
      calculateExpectedCashDrawer({
        efectivoInicial: 500,
        efectivoVentas: 1200,
        efectivoCxc: 300,
        efectivoGastos: 250,
      })
    ).toBe(1750);
  });

  it("does not subtract non-cash expenses from the expected physical cash drawer", () => {
    const efectivoGastos = sumCashExpenses([
      { monto: 250, metodo_pago: "efectivo" },
      { monto: 900, metodo_pago: "tarjeta" },
      { monto: 125, metodo_pago: "transferencia" },
    ]);

    expect(efectivoGastos).toBe(250);
    expect(
      calculateExpectedCashDrawer({
        efectivoInicial: 500,
        efectivoVentas: 1200,
        efectivoGastos,
      })
    ).toBe(1450);
  });

  it("subtracts cash expenses from the expected physical cash drawer", () => {
    expect(
      calculateExpectedCashDrawer({
        efectivoInicial: 500,
        efectivoVentas: 1200,
        efectivoGastos: sumCashExpenses([
          { monto: 250, metodo_pago: "efectivo" },
          { monto: 50, metodo_pago: "EFECTIVO" },
        ]),
      })
    ).toBe(1400);
  });
});
