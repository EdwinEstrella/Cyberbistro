import { describe, expect, it } from "vitest";
import { EcfRangeError, ecfRangeTerminalMessage, enforceEcfRangeLocally, mapEcfRangeRpcError } from "../src/shared/lib/ecfRangeErrors";
import { decideEcfSaveGate } from "../src/shared/lib/ecfActivationReadiness";
import { buildLocalTenantNcfReservation } from "../src/shared/lib/localFirst";

describe("mapEcfRangeRpcError", () => {
  it("maps NOT_CONFIGURED with the type from DETAIL", () => {
    const err = mapEcfRangeRpcError({ message: "ECF_RANGE_NOT_CONFIGURED", details: "E31" }, "E32");
    expect(err).toBeInstanceOf(EcfRangeError);
    expect(err?.code).toBe("ECF_RANGE_NOT_CONFIGURED");
    expect(err?.message).toContain("rango autorizado de E31");
    expect(err?.message).toContain("Activación");
  });

  it("maps EXHAUSTED with the end bound", () => {
    const err = mapEcfRangeRpcError({ message: "ECF_RANGE_EXHAUSTED", details: "E32:1500" }, "E32");
    expect(err?.code).toBe("ECF_RANGE_EXHAUSTED");
    expect(err?.end).toBe(1500);
    expect(err?.message).toContain("hasta 1500");
    expect(err?.message).toContain("Oficina Virtual de la DGII");
  });

  it("falls back to the requested type and ignores other errors", () => {
    expect(mapEcfRangeRpcError({ message: "ECF_RANGE_EXHAUSTED" }, "E32")?.tipo).toBe("E32");
    expect(mapEcfRangeRpcError({ message: "ECF_RANGE_EXHAUSTED" }, "E32")?.message).not.toContain("hasta");
    expect(mapEcfRangeRpcError({ message: "insufficient_privilege" }, "E32")).toBeNull();
    expect(mapEcfRangeRpcError(null, "E32")).toBeNull();
  });
});

describe("enforceEcfRangeLocally", () => {
  const bounds = { E31: { start: 100, end: 102 } };
  it("raises a counter behind start and allows the last number", () => {
    expect(enforceEcfRangeLocally({ tipo: "E31", currentSequence: 1, boundsRaw: bounds })).toBe(100);
    expect(enforceEcfRangeLocally({ tipo: "E31", currentSequence: 102, boundsRaw: bounds })).toBe(102);
  });
  it("throws EXHAUSTED past end and NOT_CONFIGURED without bounds", () => {
    expect(() => enforceEcfRangeLocally({ tipo: "E31", currentSequence: 103, boundsRaw: bounds })).toThrow(/Se agotó/);
    expect(() => enforceEcfRangeLocally({ tipo: "E32", currentSequence: 1, boundsRaw: bounds })).toThrow(/No hay un rango/);
    expect(() => enforceEcfRangeLocally({ tipo: "E31", currentSequence: 1, boundsRaw: null })).toThrow(EcfRangeError);
  });
});

describe("buildLocalTenantNcfReservation (e-CF)", () => {
  const row = (rangos: unknown, next: number) => ({
    ncf_fiscal_activo: true,
    ncf_tipo_default: "E32",
    ncf_secuencias_por_tipo: { E32: next },
    ecf_secuencias_rangos: rangos,
  });

  it("reserves inside the range and advances the counter", () => {
    const res = buildLocalTenantNcfReservation(row({ E32: { start: 5, end: 10 } }, 7), "E32");
    expect("reserved" in res && res.reserved.usedSequence).toBe(7);
    expect("nextTenantRow" in res && res.nextTenantRow.ncf_secuencias_por_tipo?.E32).toBe(8);
  });

  it("starts from the range start when the counter is behind", () => {
    const res = buildLocalTenantNcfReservation(row({ E32: { start: 50, end: 60 } }, 3), "E32");
    expect("reserved" in res && res.reserved.usedSequence).toBe(50);
    expect("reserved" in res && res.reserved.ncf).toMatch(/50$/);
  });

  it("blocks when exhausted or not configured", () => {
    expect(() => buildLocalTenantNcfReservation(row({ E32: { start: 5, end: 10 } }, 11), "E32")).toThrow(/Se agotó/);
    expect(() => buildLocalTenantNcfReservation(row({}, 7), "E32")).toThrow(/No hay un rango/);
  });
});

describe("decideEcfSaveGate", () => {
  const notReady = { ready: false, missing: [{ code: "CERTIFICATE", message: "Falta el certificado." }] } as never;
  const ready = { ready: true, missing: [] } as never;
  it("ignores readiness when not saving dgii_ecf", () => {
    expect(decideEcfSaveGate({ previousMode: "dgii_ecf", nextMode: "ncf_legacy", readiness: notReady }).decision).toBe("allow");
    expect(decideEcfSaveGate({ previousMode: "internal_receipt", nextMode: "internal_receipt", readiness: null }).decision).toBe("allow");
  });
  it("blocks switching into dgii_ecf when not ready, with the shared reasons", () => {
    const gate = decideEcfSaveGate({ previousMode: "ncf_legacy", nextMode: "dgii_ecf", readiness: notReady });
    expect(gate.decision).toBe("block");
    expect(gate.message).toContain("Falta el certificado.");
  });
  it("fails closed when switching in and readiness cannot be read (also with unknown previous mode)", () => {
    expect(decideEcfSaveGate({ previousMode: "internal_receipt", nextMode: "dgii_ecf", readiness: null }).decision).toBe("block");
    expect(decideEcfSaveGate({ previousMode: null, nextMode: "dgii_ecf", readiness: null }).decision).toBe("block");
  });
  it("allows switching in when ready", () => {
    expect(decideEcfSaveGate({ previousMode: "internal_receipt", nextMode: "dgii_ecf", readiness: ready })).toEqual({ decision: "allow", message: null });
  });
  it("never blocks when already on dgii_ecf; warns with reasons when not ready", () => {
    const gate = decideEcfSaveGate({ previousMode: "dgii_ecf", nextMode: "dgii_ecf", readiness: notReady });
    expect(gate.decision).toBe("allow_with_warning");
    expect(gate.message).toContain("Falta el certificado.");
  });
  it("allows silently when already on dgii_ecf and ready or unreadable", () => {
    expect(decideEcfSaveGate({ previousMode: "dgii_ecf", nextMode: "dgii_ecf", readiness: ready }).decision).toBe("allow");
    expect(decideEcfSaveGate({ previousMode: "dgii_ecf", nextMode: "dgii_ecf", readiness: null }).decision).toBe("allow");
  });
});

describe("ecfRangeTerminalMessage", () => {
  it("classifies the typed error and keeps its message", () => {
    const err = new EcfRangeError("ECF_RANGE_EXHAUSTED", "E31", 100);
    expect(ecfRangeTerminalMessage(err)).toBe(err.message);
  });
  it("detects a plain Error that kept the Spanish text of a range error", () => {
    const original = new EcfRangeError("ECF_RANGE_NOT_CONFIGURED", "E32");
    expect(ecfRangeTerminalMessage(new Error(original.message + " ECF_RANGE_NOT_CONFIGURED"))).toBeTruthy();
  });
  it("detects serialized errors by code and maps them to the friendly message", () => {
    expect(ecfRangeTerminalMessage({ code: "ECF_RANGE_EXHAUSTED", details: "E31:100" })).toContain("Se agotó el rango autorizado de E31 (hasta 100)");
    expect(ecfRangeTerminalMessage("ECF_RANGE_NOT_CONFIGURED")).toContain("No hay un rango autorizado");
    expect(ecfRangeTerminalMessage({ message: "P0001 ECF_RANGE_EXHAUSTED", details: "E32" })).toContain("E32");
  });
  it("returns null for other errors", () => {
    expect(ecfRangeTerminalMessage(new Error("network down"))).toBeNull();
    expect(ecfRangeTerminalMessage(null)).toBeNull();
    expect(ecfRangeTerminalMessage(undefined)).toBeNull();
    expect(ecfRangeTerminalMessage("timeout")).toBeNull();
  });
});
