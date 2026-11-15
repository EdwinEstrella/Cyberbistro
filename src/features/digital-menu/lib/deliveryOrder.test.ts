import { describe, expect, it } from "vitest";
import {
  buildMapsUrl,
  DELIVERY_REFERENCE_MAX,
  EMPTY_DELIVERY_DRAFT,
  isValidCoordinatePair,
  toDeliveryRpcArgs,
  validateDeliveryDraft,
  type DeliveryDraft,
} from "./deliveryOrder";

const delivery = (overrides: Partial<DeliveryDraft> = {}): DeliveryDraft => ({
  mode: "delivery",
  lat: 18.4861,
  lng: -69.9312,
  reference: "Casa azul",
  ...overrides,
});

describe("validateDeliveryDraft", () => {
  it("never blocks a pickup order", () => {
    expect(validateDeliveryDraft(EMPTY_DELIVERY_DRAFT, "")).toBeNull();
  });

  it("accepts delivery with coordinates, with only a reference, or with both", () => {
    expect(validateDeliveryDraft(delivery(), "8095551234")).toBeNull();
    expect(validateDeliveryDraft(delivery({ lat: null, lng: null }), "8095551234")).toBeNull();
    expect(validateDeliveryDraft(delivery({ reference: "" }), "8095551234")).toBeNull();
  });

  it("requires a phone number to coordinate the delivery", () => {
    expect(validateDeliveryDraft(delivery(), "   ")).toMatch(/teléfono/);
  });

  it("requires a location or a reference", () => {
    expect(validateDeliveryDraft(delivery({ lat: null, lng: null, reference: "   " }), "8095551234")).toMatch(
      /ubicación o escribe un punto de referencia/
    );
  });

  it("rejects half a coordinate pair and out-of-range coordinates", () => {
    expect(validateDeliveryDraft(delivery({ lng: null }), "8095551234")).toMatch(/no es válida/);
    expect(validateDeliveryDraft(delivery({ lat: 95 }), "8095551234")).toMatch(/no es válida/);
    expect(validateDeliveryDraft(delivery({ lng: -181 }), "8095551234")).toMatch(/no es válida/);
  });

  it("rejects a reference longer than the limit", () => {
    expect(validateDeliveryDraft(delivery({ reference: "x".repeat(DELIVERY_REFERENCE_MAX + 1) }), "8095551234")).toMatch(
      /300 caracteres/
    );
    expect(validateDeliveryDraft(delivery({ reference: "x".repeat(DELIVERY_REFERENCE_MAX) }), "8095551234")).toBeNull();
  });
});

describe("toDeliveryRpcArgs", () => {
  it("sends nothing for pickup so the server defaults apply", () => {
    expect(toDeliveryRpcArgs(EMPTY_DELIVERY_DRAFT)).toEqual({});
  });

  it("sends the mode, coordinates and trimmed reference for delivery", () => {
    expect(toDeliveryRpcArgs(delivery({ reference: "  Casa azul  " }))).toEqual({
      p_delivery_mode: "delivery",
      p_delivery_lat: 18.4861,
      p_delivery_lng: -69.9312,
      p_delivery_reference: "Casa azul",
    });
  });

  it("sends null coordinates and null reference when only one of them was provided", () => {
    expect(toDeliveryRpcArgs(delivery({ lat: null, lng: null }))).toMatchObject({
      p_delivery_lat: null,
      p_delivery_lng: null,
      p_delivery_reference: "Casa azul",
    });
    expect(toDeliveryRpcArgs(delivery({ reference: "   " }))).toMatchObject({ p_delivery_reference: null });
  });
});

describe("coordinates helpers", () => {
  it("validates coordinate pairs", () => {
    expect(isValidCoordinatePair(0, 0)).toBe(true);
    expect(isValidCoordinatePair(90, 180)).toBe(true);
    expect(isValidCoordinatePair(NaN, 10)).toBe(false);
    expect(isValidCoordinatePair("18.4", "-69.9")).toBe(false);
    expect(isValidCoordinatePair(null, null)).toBe(false);
  });

  it("builds a maps link only when there are valid coordinates", () => {
    expect(buildMapsUrl(18.4861, -69.9312)).toBe("https://www.google.com/maps?q=18.4861,-69.9312");
    expect(buildMapsUrl(null, null)).toBeNull();
    expect(buildMapsUrl(200, 10)).toBeNull();
  });
});
