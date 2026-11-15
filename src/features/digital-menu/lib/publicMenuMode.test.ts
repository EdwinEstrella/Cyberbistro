import { describe, expect, it } from "vitest";
import { resolvePublicMenuMode } from "./publicMenuMode";

describe("resolvePublicMenuMode", () => {
  it("returns takeout mode without error when mesaParam is missing or blank", () => {
    expect(resolvePublicMenuMode({ mesaParam: undefined, cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: false,
    });
    expect(resolvePublicMenuMode({ mesaParam: null, cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: false,
    });
    expect(resolvePublicMenuMode({ mesaParam: "", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: false,
    });
    expect(resolvePublicMenuMode({ mesaParam: "   ", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: false,
    });
  });

  it("resolves valid table mode within bounds", () => {
    expect(resolvePublicMenuMode({ mesaParam: "1", cantidadMesas: 10 })).toEqual({
      kind: "table",
      mesa: 1,
    });
    expect(resolvePublicMenuMode({ mesaParam: "5", cantidadMesas: 10 })).toEqual({
      kind: "table",
      mesa: 5,
    });
    expect(resolvePublicMenuMode({ mesaParam: "10", cantidadMesas: 10 })).toEqual({
      kind: "table",
      mesa: 10,
    });
    expect(resolvePublicMenuMode({ mesaParam: " 7 ", cantidadMesas: 10 })).toEqual({
      kind: "table",
      mesa: 7,
    });
  });

  it("marks invalid mesa when value is 0, negative, decimal, or NaN", () => {
    expect(resolvePublicMenuMode({ mesaParam: "0", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
    expect(resolvePublicMenuMode({ mesaParam: "-1", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
    expect(resolvePublicMenuMode({ mesaParam: "2.5", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
    expect(resolvePublicMenuMode({ mesaParam: "abc", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
    expect(resolvePublicMenuMode({ mesaParam: "1e2", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
    expect(resolvePublicMenuMode({ mesaParam: "05", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
  });

  it("marks invalid mesa when value exceeds cantidadMesas", () => {
    expect(resolvePublicMenuMode({ mesaParam: "11", cantidadMesas: 10 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
    expect(resolvePublicMenuMode({ mesaParam: "1", cantidadMesas: 0 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
    expect(resolvePublicMenuMode({ mesaParam: "1", cantidadMesas: -5 })).toEqual({
      kind: "takeout",
      invalidMesa: true,
    });
  });
});
