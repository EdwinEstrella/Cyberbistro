import { describe, expect, it } from "vitest";

import { resolvePinGateAuthorization } from "./PinGate";

describe("resolvePinGateAuthorization", () => {
  it("denies the legacy shipped PIN unless a caller verifier explicitly accepts it", () => {
    expect(resolvePinGateAuthorization({ hasVerifier: true, verificationResult: false })).toEqual({
      action: "deny",
    });
  });

  it("unlocks only when caller-provided verification succeeds", () => {
    expect(resolvePinGateAuthorization({ hasVerifier: true, verificationResult: true })).toEqual({
      action: "unlock",
      includePin: true,
    });
  });

  it("collects a PIN without authorizing when no verifier is provided", () => {
    expect(resolvePinGateAuthorization({ hasVerifier: false })).toEqual({
      action: "collect",
      includePin: true,
    });
  });
});
