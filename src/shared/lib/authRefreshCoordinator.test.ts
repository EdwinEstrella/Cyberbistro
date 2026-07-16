import { describe, expect, it } from "vitest";
import { AuthRefreshCoordinator } from "./authRefreshCoordinator";

describe("AuthRefreshCoordinator", () => {
  it("coalesces the focus and visibility events from one window restore", () => {
    const coordinator = new AuthRefreshCoordinator(1_500);

    expect(coordinator.shouldRefresh("focus", 1_000)).toBe(true);
    expect(coordinator.shouldRefresh("visibility", 1_001)).toBe(false);
    expect(coordinator.shouldRefresh("focus", 1_200)).toBe(false);
    expect(coordinator.shouldRefresh("interval", 2_501)).toBe(true);
  });

  it("does not suppress a later legitimate focus or explicit retry", () => {
    const coordinator = new AuthRefreshCoordinator(1_500);

    expect(coordinator.shouldRefresh("focus", 1_000)).toBe(true);
    expect(coordinator.shouldRefresh("focus", 2_501)).toBe(true);
    expect(coordinator.shouldRefresh("manual", 2_502)).toBe(true);
  });
});
