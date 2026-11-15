import { describe, expect, it } from "vitest";
import type { DeliveryDraft } from "./deliveryOrder";
import { GeolocationFailure } from "./geolocation";
import { locateCustomer } from "./locateCustomer";

const draft: DeliveryDraft = { mode: "delivery", lat: null, lng: null, reference: "Casa azul" };

describe("locateCustomer", () => {
  it("stores the detected coordinates and keeps the rest of the draft", async () => {
    const result = await locateCustomer(draft, async () => ({ lat: 18.4861, lng: -69.9312, accuracy: 20 }));
    expect(result).toEqual({
      draft: { mode: "delivery", lat: 18.4861, lng: -69.9312, reference: "Casa azul" },
      error: null,
    });
  });

  it("returns the draft untouched with a readable message when permission is denied", async () => {
    const result = await locateCustomer(draft, async () => {
      throw new GeolocationFailure("denied");
    });
    expect(result.draft).toBe(draft);
    expect(result.error).toMatch(/permiso/);
  });

  it("treats an unexpected failure as location unavailable", async () => {
    const result = await locateCustomer(draft, async () => {
      throw new Error("boom");
    });
    expect(result.draft).toBe(draft);
    expect(result.error).toMatch(/No pudimos detectar tu ubicación/);
  });
});
