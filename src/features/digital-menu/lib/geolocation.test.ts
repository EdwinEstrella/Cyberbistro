import { describe, expect, it, vi } from "vitest";
import { describeGeolocationFailure, GeolocationFailure, requestCurrentPosition } from "./geolocation";

type Success = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Failure = (error: { code: number }) => void;

function fakeGeolocation(run: (success: Success, failure: Failure) => void) {
  return { getCurrentPosition: vi.fn((success: Success, failure: Failure) => run(success, failure)) } as unknown as Geolocation;
}

describe("requestCurrentPosition", () => {
  it("resolves with coordinates and accuracy", async () => {
    const geo = fakeGeolocation((success) =>
      success({ coords: { latitude: 18.4861, longitude: -69.9312, accuracy: 35 } })
    );
    await expect(requestCurrentPosition(geo)).resolves.toEqual({ lat: 18.4861, lng: -69.9312, accuracy: 35 });
  });

  it("reports a null accuracy when the device gives none", async () => {
    const geo = fakeGeolocation((success) =>
      success({ coords: { latitude: 1, longitude: 2, accuracy: Number.NaN } })
    );
    await expect(requestCurrentPosition(geo)).resolves.toMatchObject({ accuracy: null });
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
    [99, "unavailable"],
  ])("maps position error %i to %s", async (errorCode, expected) => {
    const geo = fakeGeolocation((_success, failure) => failure({ code: errorCode }));
    await expect(requestCurrentPosition(geo)).rejects.toMatchObject({ code: expected });
  });

  it("fails as unsupported when the browser has no geolocation", async () => {
    const error = await requestCurrentPosition(undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeolocationFailure);
    expect((error as GeolocationFailure).code).toBe("unsupported");
  });
});

describe("describeGeolocationFailure", () => {
  it("has a distinct Spanish message for every failure code", () => {
    const messages = (["unsupported", "denied", "unavailable", "timeout"] as const).map(describeGeolocationFailure);
    expect(new Set(messages).size).toBe(4);
    for (const message of messages) expect(message.length).toBeGreaterThan(20);
  });
});
