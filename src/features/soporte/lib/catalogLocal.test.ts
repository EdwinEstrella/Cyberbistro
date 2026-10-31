import { describe, expect, it } from "vitest";
import { normalizePlato, normalizeMenuCategory } from "./catalogLocal";

describe("catalogLocal normalizePlato", () => {
  it("normalizes a full plato with is_extra=true", () => {
    const raw = {
      id: "101",
      nombre: "Queso extra",
      precio: "50.5",
      categoria: "Extras",
      disponible: 1,
      va_a_cocina: 0,
      is_extra: 1,
      sucursal_id: "suc-1",
    };

    const plato = normalizePlato(raw);
    expect(plato).toEqual({
      id: 101,
      nombre: "Queso extra",
      precio: 50.5,
      categoria: "Extras",
      disponible: true,
      va_a_cocina: false,
      is_extra: true,
      sucursal_id: "suc-1",
    });
  });

  it("handles is_extra default false and string representations", () => {
    const plato1 = normalizePlato({ id: 1, nombre: "Plato 1" });
    expect(plato1.is_extra).toBe(false);

    const plato2 = normalizePlato({ id: 2, nombre: "Plato 2", is_extra: "true" });
    expect(plato2.is_extra).toBe(true);

    const plato3 = normalizePlato({ id: 3, nombre: "Plato 3", isExtra: true });
    expect(plato3.is_extra).toBe(true);
  });

  it("normalizes a menu category correctly", () => {
    const category = normalizeMenuCategory({
      id: "cat-1",
      tenant_id: "ten-1",
      nombre: "Extras",
      color: "#ff906d",
      sort_order: "2",
      sucursal_id: "suc-1",
    });

    expect(category).toEqual({
      id: "cat-1",
      tenant_id: "ten-1",
      nombre: "Extras",
      color: "#ff906d",
      sort_order: 2,
      sucursal_id: "suc-1",
    });
  });
});
