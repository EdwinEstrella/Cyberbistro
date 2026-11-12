import { describe, expect, it } from "vitest";
import {
  isRestaurantClosedError,
  mapOnlineMenuError,
  parseOnlineMenuStatus,
  RESTAURANT_CLOSED_MESSAGE,
  RETRY_BUTTON_LABEL,
} from "./onlineStatus";

describe("onlineStatus pure helpers", () => {
  describe("parseOnlineMenuStatus", () => {
    it("returns true when open is true", () => {
      expect(parseOnlineMenuStatus({ open: true })).toBe(true);
    });

    it("returns false when open is false", () => {
      expect(parseOnlineMenuStatus({ open: false })).toBe(false);
    });

    it("returns false for null, undefined, primitive, or malformed data", () => {
      expect(parseOnlineMenuStatus(null)).toBe(false);
      expect(parseOnlineMenuStatus(undefined)).toBe(false);
      expect(parseOnlineMenuStatus({})).toBe(false);
      expect(parseOnlineMenuStatus({ open: "true" })).toBe(false);
      expect(parseOnlineMenuStatus("open")).toBe(false);
      expect(parseOnlineMenuStatus(123)).toBe(false);
    });
  });

  describe("isRestaurantClosedError", () => {
    it("detects RESTAURANT_CLOSED in plain string", () => {
      expect(isRestaurantClosedError("RESTAURANT_CLOSED")).toBe(true);
      expect(isRestaurantClosedError("Error: RESTAURANT_CLOSED")).toBe(true);
      expect(isRestaurantClosedError("restaurant_closed")).toBe(true);
    });

    it("detects RESTAURANT_CLOSED in Error or PostgrestError objects", () => {
      expect(isRestaurantClosedError(new Error("RESTAURANT_CLOSED"))).toBe(true);
      expect(isRestaurantClosedError({ message: "Database error: RESTAURANT_CLOSED" })).toBe(true);
    });

    it("detects Spanish closed phrases including RPC message and mixed case", () => {
      // Real RPC message from public.create_public_service_request
      expect(
        isRestaurantClosedError("El restaurante se encuentra cerrado en este momento")
      ).toBe(true);
      // Mixed case / uppercase variants
      expect(
        isRestaurantClosedError("EL RESTAURANTE SE ENCUENTRA CERRADO EN ESTE MOMENTO")
      ).toBe(true);
      expect(
        isRestaurantClosedError("restaurante se encuentra cerrado")
      ).toBe(true);
      expect(
        isRestaurantClosedError("Cerrado En Este Momento")
      ).toBe(true);
      expect(
        isRestaurantClosedError({
          message: "El restaurante se encuentra cerrado en este momento",
        })
      ).toBe(true);
    });

    it("returns false for unrelated errors or falsy values", () => {
      expect(isRestaurantClosedError(null)).toBe(false);
      expect(isRestaurantClosedError(undefined)).toBe(false);
      expect(isRestaurantClosedError("")).toBe(false);
      expect(isRestaurantClosedError(new Error("NETWORK_ERROR"))).toBe(false);
      expect(isRestaurantClosedError("Código de mesa incorrecto")).toBe(false);
      expect(isRestaurantClosedError("Mesa inválida")).toBe(false);
      expect(isRestaurantClosedError(new Error("Código de mesa incorrecto"))).toBe(false);
      expect(isRestaurantClosedError({ message: "Mesa inválida" })).toBe(false);
    });
  });

  describe("mapOnlineMenuError", () => {
    it("returns RESTAURANT_CLOSED_MESSAGE when error matches RESTAURANT_CLOSED", () => {
      expect(mapOnlineMenuError("RESTAURANT_CLOSED")).toBe(RESTAURANT_CLOSED_MESSAGE);
      expect(mapOnlineMenuError(new Error("RESTAURANT_CLOSED"))).toBe(RESTAURANT_CLOSED_MESSAGE);
    });

    it("returns custom fallback message when not matching RESTAURANT_CLOSED", () => {
      expect(mapOnlineMenuError(null, "Fallback error")).toBe("Fallback error");
      expect(mapOnlineMenuError("Something else")).toBe("Something else");
    });
  });

  describe("constants", () => {
    it("matches exact user-facing Spanish strings", () => {
      expect(RESTAURANT_CLOSED_MESSAGE).toBe(
        "Este restaurante no está trabajando en este momento. Por favor, vuelva en horario laboral."
      );
      expect(RETRY_BUTTON_LABEL).toBe("Reintentar");
    });
  });
});
