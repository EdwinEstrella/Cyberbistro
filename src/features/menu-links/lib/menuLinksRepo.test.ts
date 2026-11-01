import { describe, expect, it } from "vitest";
import { createMenuLink, isNetworkError, normalizeRepoError } from "./menuLinksRepo";

describe("menuLinksRepo", () => {
  describe("createMenuLink validation", () => {
    it("requires sucursalId when calling createMenuLink", async () => {
      await expect(
        createMenuLink({
          tenantId: "t-1",
          sucursalId: "" as unknown as string,
          menuId: "m-1",
          label: "Test",
          linkType: "company",
          allowExtras: false,
        })
      ).rejects.toThrow("Se requiere una sucursal para crear el link.");
    });
  });

  describe("error handling", () => {
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

    it("normalizes LINK_LIMIT_REACHED to friendly Spanish message", () => {
      const pgError = { message: "new row violates check: LINK_LIMIT_REACHED" };
      expect(normalizeRepoError(pgError).message).toBe("Se alcanzó el límite de links activos permitido para tu plan.");
      expect(normalizeRepoError(new Error("LINK_LIMIT_REACHED")).message).toBe("Se alcanzó el límite de links activos permitido para tu plan.");
    });

    it("normalizes PUBLIC_LINK_NOT_ALLOWED to friendly Spanish message", () => {
      const pgError = { message: "trigger failed: PUBLIC_LINK_NOT_ALLOWED" };
      expect(normalizeRepoError(pgError).message).toBe("Ya no se permite crear links de menú públicos. El menú público se gestiona desde Soporte.");
      expect(normalizeRepoError(new Error("PUBLIC_LINK_NOT_ALLOWED")).message).toBe("Ya no se permite crear links de menú públicos. El menú público se gestiona desde Soporte.");
    });

    it("propagates other error messages", () => {
      const err = normalizeRepoError(new Error("El nombre es requerido"));
      expect(err.message).toBe("El nombre es requerido");
    });
  });
});
