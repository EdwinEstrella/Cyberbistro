import { describe, expect, it } from "vitest";
import { resolveSyncHealth } from "./syncHealth";

describe("resolveSyncHealth", () => {
  it("does not report healthy while work is pending", () => {
    expect(resolveSyncHealth(1, 0)).toEqual({ label: "Atención", tone: "attention" });
  });

  it("prioritizes manual blocks over ordinary pending work", () => {
    expect(resolveSyncHealth(3, 1)).toEqual({ label: "Bloqueado", tone: "blocked" });
  });
});
