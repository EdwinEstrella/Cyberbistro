import { describe, expect, it } from "vitest";
import { buildPosCategoryTabs } from "./menuCategories";

describe("buildPosCategoryTabs", () => {
  it("keeps plato-only categories when explicit menu categories exist", () => {
    expect(
      buildPosCategoryTabs(
        ["Bebidas", "Postres"],
        ["Bebidas", "Mofongos", "Yaroas"]
      )
    ).toEqual(["Todos", "Bebidas", "Postres", "Mofongos", "Yaroas"]);
  });
});
