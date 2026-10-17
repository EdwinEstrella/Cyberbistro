import { describe, expect, it } from "vitest";
import { EcfRangeError, enforceEcfRangeLocally, mapEcfRangeRpcError } from "../src/shared/lib/ecfRangeErrors";
import { ecfSaveBlockMessage } from "../src/shared/lib/ecfActivationReadiness";
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

describe("ecfSaveBlockMessage", () => {
  const notReady = { ready: false, missing: [{ code: "CERTIFICATE", message: "Falta el certificado." }] } as never;
  it("only gates dgii_ecf", () => {
    expect(ecfSaveBlockMessage("internal_receipt", null)).toBeNull();
    expect(ecfSaveBlockMessage("ncf_legacy", notReady)).toBeNull();
  });
  it("blocks with the shared reasons, or fails closed when unreadable", () => {
    expect(ecfSaveBlockMessage("dgii_ecf", notReady)).toContain("Falta el certificado.");
    expect(ecfSaveBlockMessage("dgii_ecf", null)).toContain("No se pudo verificar");
    expect(ecfSaveBlockMessage("dgii_ecf", { ready: true, missing: [] } as never)).toBeNull();
  });
});
