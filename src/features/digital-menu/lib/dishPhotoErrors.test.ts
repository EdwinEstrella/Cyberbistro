import { describe, it, expect } from "vitest";
import {
  DishPhotoError,
  dishPhotoErrorMessage,
  isDishPhotoErrorCode,
  DISH_PHOTO_ERROR_CODES,
} from "./dishPhotoErrors";

describe("dishPhotoErrors", () => {
  it("initializes DishPhotoError with code and message", () => {
    const err = new DishPhotoError("unsupported_format");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DishPhotoError);
    expect(err.name).toBe("DishPhotoError");
    expect(err.code).toBe("unsupported_format");
    expect(err.message).toBe("unsupported_format");

    const customErr = new DishPhotoError("forbidden", "Custom message");
    expect(customErr.code).toBe("forbidden");
    expect(customErr.message).toBe("Custom message");
  });

  it("returns expected Spanish copy for required codes", () => {
    expect(dishPhotoErrorMessage("unsupported_format")).toBe(
      "Ese formato no se puede leer en este dispositivo. Usa una foto JPG o PNG."
    );
    expect(dishPhotoErrorMessage("forbidden")).toBe(
      "Solo un administrador del negocio puede subir fotos."
    );
    expect(dishPhotoErrorMessage("network")).toBe(
      "Sin conexión. Intenta de nuevo cuando tengas internet."
    );
    expect(dishPhotoErrorMessage("too_large")).toBe(
      "La imagen es demasiado pesada (máximo 1.5 MB). Intenta con otra foto."
    );
    expect(dishPhotoErrorMessage("missing_token")).toBe(
      "Tu sesión ha expirado o no es válida. Inicia sesión de nuevo."
    );
    expect(dishPhotoErrorMessage("invalid_token")).toBe(
      "Tu sesión ha expirado o no es válida. Inicia sesión de nuevo."
    );
    expect(dishPhotoErrorMessage("unsupported_type")).toBe(
      "El tipo de archivo no es compatible. Debe ser una imagen WebP válida."
    );
    expect(dishPhotoErrorMessage("encode_failed")).toBe(
      "No se pudo codificar la imagen en formato WebP."
    );
    expect(dishPhotoErrorMessage("auth_unavailable")).toBe(
      "El servicio de autenticación no está disponible en este momento. Intenta más tarde."
    );
    expect(dishPhotoErrorMessage("invalid_tenant")).toBe(
      "Datos de restaurante o plato inválidos."
    );
    expect(dishPhotoErrorMessage("invalid_plato")).toBe(
      "Datos de restaurante o plato inválidos."
    );
    expect(dishPhotoErrorMessage("unknown_fallback_code")).toBe(
      "Error inesperado al subir la foto."
    );
  });

  describe("isDishPhotoErrorCode", () => {
    it("returns true for every recognized DishPhotoErrorCode", () => {
      for (const code of DISH_PHOTO_ERROR_CODES) {
        expect(isDishPhotoErrorCode(code)).toBe(true);
      }
    });

    it("returns false for unknown strings and invalid values", () => {
      expect(isDishPhotoErrorCode("something_new")).toBe(false);
      expect(isDishPhotoErrorCode("")).toBe(false);
      expect(isDishPhotoErrorCode("random_error")).toBe(false);
      expect(isDishPhotoErrorCode(null)).toBe(false);
      expect(isDishPhotoErrorCode(undefined)).toBe(false);
      expect(isDishPhotoErrorCode(123)).toBe(false);
      expect(isDishPhotoErrorCode({})).toBe(false);
      expect(isDishPhotoErrorCode(["forbidden"])).toBe(false);
    });
  });
});
