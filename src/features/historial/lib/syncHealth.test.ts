import { describe, expect, it } from "vitest";
import { resolveSyncHealth } from "./syncHealth";

describe("resolveSyncHealth", () => {
  it("does not report healthy while upload work is pending", () => {
    expect(resolveSyncHealth({ pendingUpload: 1, blocked: 0, pendingDownload: 0 })).toMatchObject({ tone: "attention", label: "Subida pendiente" });
  });

  it("prioritizes manual blocks over ordinary pending work", () => {
    expect(resolveSyncHealth({ pendingUpload: 3, blocked: 1, pendingDownload: 5 })).toMatchObject({ tone: "blocked", label: "Bloqueado" });
  });

  it("never claims full cloud sync while the download side is unverified", () => {
    const health = resolveSyncHealth({ pendingUpload: 0, blocked: 0, pendingDownload: null });
    expect(health.tone).toBe("unknown");
    expect(health.label).not.toContain("Saludable");
    expect(health.detail.toLowerCase()).not.toContain("al día con la nube");
  });

  it("flags rows waiting to come down from the cloud", () => {
    expect(resolveSyncHealth({ pendingUpload: 0, blocked: 0, pendingDownload: 4 })).toMatchObject({ tone: "attention", label: "Bajada pendiente" });
  });

  it("reports desynced when both directions have pending work", () => {
    expect(resolveSyncHealth({ pendingUpload: 2, blocked: 0, pendingDownload: 3 })).toMatchObject({ tone: "attention", label: "Desincronizado" });
  });

  it("only reports 100% healthy after both directions are verified clean", () => {
    expect(resolveSyncHealth({ pendingUpload: 0, blocked: 0, pendingDownload: 0 })).toEqual({
      label: "100% Saludable",
      tone: "healthy",
      detail: "Local y nube al día (verificado)",
    });
  });
});
