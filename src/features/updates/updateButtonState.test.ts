import { describe, expect, it } from "vitest";
import { getUpdateButtonState } from "./updateButtonState";

describe("getUpdateButtonState", () => {
  it("is neutral and quiet when idle", () => {
    const s = getUpdateButtonState({ phase: "idle", downloadPercent: null, hasAlert: false });
    expect(s).toMatchObject({ tone: "neutral", spinning: false, showDot: false, label: null });
  });

  it("spins while checking", () => {
    expect(getUpdateButtonState({ phase: "checking", downloadPercent: null, hasAlert: false }).spinning).toBe(true);
  });

  it("shows accent tone and dot when an update is available", () => {
    const s = getUpdateButtonState({ phase: "available", downloadPercent: null, hasAlert: true });
    expect(s).toMatchObject({ tone: "accent", showDot: true, spinning: false });
  });

  it("shows the rounded and clamped percent while downloading", () => {
    expect(getUpdateButtonState({ phase: "downloading", downloadPercent: 41.6, hasAlert: true }).label).toBe("42%");
    expect(getUpdateButtonState({ phase: "downloading", downloadPercent: null, hasAlert: true }).label).toBe("0%");
    expect(getUpdateButtonState({ phase: "downloading", downloadPercent: 140, hasAlert: true }).label).toBe("100%");
  });

  it("labels the button Reiniciar sistema and installs directly when ready", () => {
    const s = getUpdateButtonState({ phase: "ready", downloadPercent: 100, hasAlert: true });
    expect(s.label).toBe("Reiniciar sistema");
    expect(s.showDot).toBe(true);
    expect(s.action).toBe("install");
  });

  it("keeps the bell flow for every phase that is not ready", () => {
    for (const phase of ["idle", "checking", "available", "downloading", "error"] as const) {
      expect(getUpdateButtonState({ phase, downloadPercent: 0, hasAlert: phase !== "idle" }).action).toBe("open");
    }
  });
});
