import { describe, expect, it } from "vitest";
import { isCloudAvailabilityFailure } from "./cloudAvailability";

describe("cloudAvailability", () => {
  it("clasifica fallas reales de disponibilidad como cloud-down", () => {
    expect(isCloudAvailabilityFailure({ status: 0 })).toBe(true);
    expect(isCloudAvailabilityFailure({ statusCode: 408 })).toBe(true);
    expect(isCloudAvailabilityFailure({ httpStatus: 503 })).toBe(true);
    expect(isCloudAvailabilityFailure(new Error("Failed to fetch"))).toBe(true);
    expect(isCloudAvailabilityFailure({ message: "ECONNREFUSED 127.0.0.1" })).toBe(true);
    expect(isCloudAvailabilityFailure({ message: "Gateway timeout" })).toBe(true);
  });

  it("no abre circuito por errores 4xx, RLS, validacion o negocio", () => {
    expect(isCloudAvailabilityFailure({ status: 400, message: "validation failed" })).toBe(false);
    expect(isCloudAvailabilityFailure({ status: 401, message: "unauthorized" })).toBe(false);
    expect(isCloudAvailabilityFailure({ status: 403, message: "RLS policy denied" })).toBe(false);
    expect(isCloudAvailabilityFailure({ status: 409, message: "NCF duplicado" })).toBe(false);
    expect(isCloudAvailabilityFailure({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(false);
  });
});
