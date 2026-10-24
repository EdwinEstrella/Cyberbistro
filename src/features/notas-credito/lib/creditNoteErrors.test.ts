import { describe, expect, it } from "vitest";
import { CREDIT_NOTE_REASON_MAX_LENGTH, mapCreditNoteError, validateCreditNoteReason } from "./creditNoteErrors";

describe("validateCreditNoteReason", () => {
  it("requires a non-blank reason and trims it", () => {
    expect(validateCreditNoteReason("   ")).toEqual({ ok: false, message: "Escribí el motivo de la nota de crédito." });
    expect(validateCreditNoteReason("  Devolución  ")).toEqual({ ok: true, value: "Devolución" });
  });
  it("caps at the DGII RazonModificacion limit", () => {
    expect(CREDIT_NOTE_REASON_MAX_LENGTH).toBe(90);
    expect(validateCreditNoteReason("x".repeat(90)).ok).toBe(true);
    expect(validateCreditNoteReason("x".repeat(91)).ok).toBe(false);
  });
});

describe("mapCreditNoteError", () => {
  const cases: Array<[string, RegExp]> = [
    ["CREDIT_NOTE_FORBIDDEN", /administradores/],
    ["CREDIT_NOTE_REASON_REQUIRED", /motivo/],
    ["CREDIT_NOTE_ORIGINAL_NOT_FOUND", /no existe/],
    ["CREDIT_NOTE_ORIGINAL_IS_CREDIT_NOTE", /nota de crédito/],
    ["CREDIT_NOTE_TYPE_NOT_ALLOWED", /E31.*E32/],
    ["CREDIT_NOTE_ORIGINAL_NOT_ACCEPTED", /DGII/],
    ["CREDIT_NOTE_ALREADY_EXISTS", /ya tiene/],
    ["CREDIT_NOTE_CREDIT_SALE_UNSUPPORTED", /fiado/i],
    ["CREDIT_NOTE_WINDOW_EXPIRED", /30 días/],
    ["CREDIT_NOTE_NO_OPEN_CYCLE", /caja/],
    ["ECF_RANGE_NOT_CONFIGURED", /E34/],
    ["ECF_RANGE_EXHAUSTED", /E34/],
    ["NCF fiscal no esta activo para el tenant", /fiscal/i],
    ["insufficient_privilege", /permiso/],
  ];
  it.each(cases)("maps %s", (message, pattern) => {
    expect(mapCreditNoteError({ message })).toMatch(pattern);
  });
  it("finds the code inside a wrapped message and in Error instances", () => {
    expect(mapCreditNoteError(new Error("rpc failed: CREDIT_NOTE_WINDOW_EXPIRED (P0001)"))).toMatch(/30 días/);
  });
  it("detects network failures", () => {
    expect(mapCreditNoteError(new TypeError("Failed to fetch (cloud is offline)"))).toMatch(/conexión/);
  });
  it("falls back to a generic message", () => {
    expect(mapCreditNoteError({ message: "boom" })).toMatch(/No se pudo emitir/);
    expect(mapCreditNoteError(null)).toMatch(/No se pudo emitir/);
  });
});
