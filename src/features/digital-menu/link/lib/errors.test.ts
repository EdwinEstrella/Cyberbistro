import { describe, expect, it } from "vitest";
import { mapLinkOrderError } from "./errors";

describe("mapLinkOrderError", () => {
  it("maps ITEM_SOLD_OUT to expected message", () => {
    expect(mapLinkOrderError("ITEM_SOLD_OUT")).toBe(
      "Uno de los platos se agotó; recargamos el menú"
    );
  });

  it("maps ITEM_NOT_AVAILABLE to expected message", () => {
    expect(mapLinkOrderError("ITEM_NOT_AVAILABLE")).toBe(
      "Uno de los platos ya no está disponible en este momento."
    );
  });

  it("maps MENU_NOT_AVAILABLE to expected message", () => {
    expect(mapLinkOrderError("MENU_NOT_AVAILABLE")).toBe(
      "Este menú no está disponible en este momento."
    );
  });

  it("maps LINK_DISABLED to expected message", () => {
    expect(mapLinkOrderError("LINK_DISABLED")).toBe(
      "Este enlace de menú ha sido desactivado."
    );
  });

  it("maps PLAN_REQUIRED to expected message", () => {
    expect(mapLinkOrderError("PLAN_REQUIRED")).toBe(
      "Este enlace requiere una suscripción empresarial activa."
    );
  });

  it("maps EXTRAS_NOT_ALLOWED to expected message", () => {
    expect(mapLinkOrderError("EXTRAS_NOT_ALLOWED")).toBe(
      "Este menú no permite extras adicionales."
    );
  });

  it("maps INVALID_EMPLOYEE_NAME to expected message", () => {
    expect(mapLinkOrderError("INVALID_EMPLOYEE_NAME")).toBe(
      "Por favor ingresa tu nombre (debe tener entre 2 y 80 caracteres)."
    );
  });

  it("maps TOO_MANY_PENDING_ORDERS to expected message", () => {
    expect(mapLinkOrderError("TOO_MANY_PENDING_ORDERS")).toBe(
      "Tienes demasiados pedidos pendientes en este momento. Por favor espera a que se procesen."
    );
  });

  it("maps INVALID_QUANTITY to expected message", () => {
    expect(mapLinkOrderError("INVALID_QUANTITY")).toBe(
      "La cantidad de platos o extras debe estar entre 1 y 50."
    );
  });

  it("maps INVALID_ITEMS to expected message", () => {
    expect(mapLinkOrderError("INVALID_ITEMS")).toBe(
      "Los productos seleccionados no son válidos."
    );
  });

  it("maps NOTES_TOO_LONG to expected message", () => {
    expect(mapLinkOrderError("NOTES_TOO_LONG")).toBe(
      "Las notas no pueden exceder los 500 caracteres."
    );
  });

  it("maps network errors correctly", () => {
    expect(mapLinkOrderError("TypeError: Failed to fetch")).toBe(
      "Sin conexión. Este menú necesita internet."
    );
    expect(mapLinkOrderError("NetworkError when attempting to fetch resource.")).toBe(
      "Sin conexión. Este menú necesita internet."
    );
  });

  it("returns fallback for unknown or empty errors", () => {
    expect(mapLinkOrderError(null)).toBe(
      "Ocurrió un error inesperado. Por favor intenta nuevamente."
    );
    expect(mapLinkOrderError("CUSTOM_SERVER_ERROR")).toBe("CUSTOM_SERVER_ERROR");
  });
});
