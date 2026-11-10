import { describe, expect, it } from "vitest";
import {
  ECF_DELAY_HINT_TEXT,
  ECF_DELAY_THRESHOLD_MS,
  getEcfStatusDisplay,
  isEcfDocumentDelayed,
  shouldShowEcfDelayHint,
} from "./ecfStatusDisplay";

describe("getEcfStatusDisplay", () => {
  it("maps pending sync statuses to offline presentation", () => {
    expect(getEcfStatusDisplay("pending_offline")).toEqual({
      label: "e-CF local pendiente de sincronización",
      color: "#6b7280",
      bg: "rgba(107, 114, 128, 0.1)",
    });
    expect(getEcfStatusDisplay("pending_sync")).toEqual({
      label: "e-CF local pendiente de sincronización",
      color: "#6b7280",
      bg: "rgba(107, 114, 128, 0.1)",
    });
  });

  it("maps queued to en cola de firma", () => {
    expect(getEcfStatusDisplay("queued")).toEqual({
      label: "e-CF: En cola de firma",
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.1)",
    });
  });

  it("maps signed to firmada, enviando a la DGII", () => {
    expect(getEcfStatusDisplay("signed")).toEqual({
      label: "e-CF: Firmada, enviando a la DGII",
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.1)",
    });
  });

  it("maps submitted to enviado a DGII", () => {
    expect(getEcfStatusDisplay("submitted")).toEqual({
      label: "e-CF: Enviado a DGII",
      color: "#3b82f6",
      bg: "rgba(59, 130, 246, 0.1)",
    });
  });

  it("maps accepted to aceptado", () => {
    expect(getEcfStatusDisplay("accepted")).toEqual({
      label: "e-CF: Aceptado",
      color: "#10b981",
      bg: "rgba(16, 185, 129, 0.1)",
    });
  });

  it("maps rejected to rechazado", () => {
    expect(getEcfStatusDisplay("rejected")).toEqual({
      label: "e-CF: Rechazado",
      color: "#ef4444",
      bg: "rgba(239, 68, 68, 0.1)",
    });
  });

  it("maps error statuses to error fiscal", () => {
    expect(getEcfStatusDisplay("retryable_error")).toEqual({
      label: "e-CF: Error fiscal",
      color: "#f97316",
      bg: "rgba(249, 115, 22, 0.1)",
    });
    expect(getEcfStatusDisplay("terminal_error")).toEqual({
      label: "e-CF: Error fiscal",
      color: "#f97316",
      bg: "rgba(249, 115, 22, 0.1)",
    });
  });

  it("formats unmapped statuses with fallback", () => {
    expect(getEcfStatusDisplay("custom_status")).toEqual({
      label: "e-CF: custom_status",
      color: "#6b7280",
      bg: "rgba(107, 114, 128, 0.1)",
    });
  });
});

describe("shouldShowEcfDelayHint", () => {
  const baseTime = 1_700_000_000_000;
  const fiveMinutesMs = ECF_DELAY_THRESHOLD_MS; // 300_000ms

  it("returns false for non-queued and non-signed statuses even if very old", () => {
    const oldTime = baseTime - (10 * 60 * 1000);
    expect(shouldShowEcfDelayHint("submitted", oldTime, baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("accepted", oldTime, baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("rejected", oldTime, baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("retryable_error", oldTime, baseTime)).toBe(false);
  });

  it("returns false when timestamp is missing or invalid", () => {
    expect(shouldShowEcfDelayHint("queued", null, baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("queued", undefined, baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("queued", "", baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("queued", "not-a-date", baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("signed", null, baseTime)).toBe(false);
  });

  it("returns false when age is strictly less than 5 minutes", () => {
    const recent = baseTime - (fiveMinutesMs - 1_000); // 4m 59s
    expect(shouldShowEcfDelayHint("queued", recent, baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("signed", recent, baseTime)).toBe(false);
  });

  it("returns false at the exact 5-minute boundary (not older than 5 min)", () => {
    const exactBoundary = baseTime - fiveMinutesMs; // exactly 5m
    expect(shouldShowEcfDelayHint("queued", exactBoundary, baseTime)).toBe(false);
    expect(shouldShowEcfDelayHint("signed", exactBoundary, baseTime)).toBe(false);
  });

  it("returns true when age is strictly greater than 5 minutes", () => {
    const older = baseTime - (fiveMinutesMs + 1); // 5m + 1ms
    expect(shouldShowEcfDelayHint("queued", older, baseTime)).toBe(true);
    expect(shouldShowEcfDelayHint("signed", older, baseTime)).toBe(true);

    const veryOld = baseTime - (30 * 60 * 1000); // 30m
    expect(shouldShowEcfDelayHint("queued", veryOld, baseTime)).toBe(true);
    expect(shouldShowEcfDelayHint("signed", veryOld, baseTime)).toBe(true);
  });

  it("handles ISO date strings and Date instances correctly", () => {
    const nowDate = new Date("2026-11-10T12:10:00.000Z");
    const fourMinAgo = new Date("2026-11-10T12:06:00.000Z").toISOString();
    const sixMinAgo = new Date("2026-11-10T12:04:00.000Z").toISOString();

    expect(shouldShowEcfDelayHint("queued", fourMinAgo, nowDate)).toBe(false);
    expect(shouldShowEcfDelayHint("queued", sixMinAgo, nowDate)).toBe(true);
  });
});

describe("isEcfDocumentDelayed", () => {
  const baseTime = new Date("2026-11-10T12:10:00.000Z");
  const sixMinAgo = new Date("2026-11-10T12:04:00.000Z").toISOString();
  const twoMinAgo = new Date("2026-11-10T12:08:00.000Z").toISOString();

  it("returns false for null or empty document", () => {
    expect(isEcfDocumentDelayed(null, baseTime)).toBe(false);
    expect(isEcfDocumentDelayed(undefined, baseTime)).toBe(false);
  });

  it("prefers updated_at if present", () => {
    const doc = {
      status: "queued",
      created_at: sixMinAgo,
      updated_at: twoMinAgo,
    };
    // created_at is 6m ago, but updated_at is only 2m ago -> not delayed
    expect(isEcfDocumentDelayed(doc, baseTime)).toBe(false);
  });

  it("falls back to created_at when updated_at is missing", () => {
    const doc = {
      status: "signed",
      created_at: sixMinAgo,
      updated_at: null,
    };
    expect(isEcfDocumentDelayed(doc, baseTime)).toBe(true);
  });

  it("exposes the expected Spanish hint text", () => {
    expect(ECF_DELAY_HINT_TEXT).toBe("Demorada: si sigue así avisá a soporte");
  });
});
