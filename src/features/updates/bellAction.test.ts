import { describe, expect, it } from "vitest";
import { decideBellAction } from "./bellAction";

describe("decideBellAction", () => {
  it("opens the card when an update is available, downloading, ready or failed", () => {
    expect(decideBellAction({ hasUpdateBellAlert: true, phase: "ready", canCheck: true })).toBe("open_card");
  });

  it("runs a real check when nothing is pending (release published after startup)", () => {
    expect(decideBellAction({ hasUpdateBellAlert: false, phase: "idle", canCheck: true })).toBe("check");
  });

  it("does not start a second check while one is running", () => {
    expect(decideBellAction({ hasUpdateBellAlert: false, phase: "checking", canCheck: true })).toBe("wait");
  });

  it("reports unsupported outside the desktop app", () => {
    expect(decideBellAction({ hasUpdateBellAlert: false, phase: "unsupported", canCheck: false })).toBe("unsupported");
  });
});
