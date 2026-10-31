import { describe, expect, it } from "vitest";
import { isNetworkError, normalizeRepoError } from "./menuLinksRepo";

describe("menuLinksRepo error handling", () => {
  it("detects network errors from messages and types", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
    expect(isNetworkError(new Error("Connection refused"))).toBe(true);
    expect(isNetworkError(new Error("fetch failed"))).toBe(true);
    expect(isNetworkError(new Error("Se requiere conexión a internet"))).toBe(true);
    expect(isNetworkError(new Error("Random database error"))).toBe(false);
  });

  it("normalizes network error to 'Se requiere conexión a internet'", () => {
    const err = normalizeRepoError(new TypeError("Failed to fetch"));
    expect(err.message).toBe("Se requiere conexión a internet");
  });

  it("handles foreign key restrict on menu delete", () => {
    const pgError = {
      code: "23503",
      message: 'update or delete on table "menus" violates foreign key constraint "menu_links_menu_id_fkey" on table "menu_links"',
    };
    const err = normalizeRepoError(pgError);
    expect(err.message).toBe("No se puede eliminar este menú porque está asignado a uno o más links.");
  });

  it("propagates other error messages", () => {
    const err = normalizeRepoError(new Error("El nombre es requerido"));
    expect(err.message).toBe("El nombre es requerido");
  });
});
