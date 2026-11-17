import { describe, expect, it } from "vitest";
import {
  ECF_TYPES_REQUIRING_EXPIRY,
  buildRangesSavePayload,
  ecfTypeRequiresExpiry,
  expiryToInputValue,
  inputValueToExpiry,
  isValidExpiryDate,
  parseNextNumbers,
  parseStoredBounds,
  restoreRanges,
  validateEcfExpiry,
  validateEcfRange,
  validateRangeBounds,
} from "./ecfSequenceRanges";
import { ECF_TYPES_WITH_SEQUENCE_EXPIRY } from "../../../worker/fiscal/mapper";

describe("expiry rules and types", () => {
  it("defines ECF_TYPES_REQUIRING_EXPIRY matching worker ECF_TYPES_WITH_SEQUENCE_EXPIRY", () => {
    const expected = ECF_TYPES_WITH_SEQUENCE_EXPIRY.map((num) => `E${num}`);
    expect([...ECF_TYPES_REQUIRING_EXPIRY]).toEqual(expected);
  });

  it("checks whether an e-CF type requires expiry", () => {
    expect(ecfTypeRequiresExpiry("E31")).toBe(true);
    expect(ecfTypeRequiresExpiry("E33")).toBe(true);
    expect(ecfTypeRequiresExpiry("E41")).toBe(true);
    expect(ecfTypeRequiresExpiry("E32")).toBe(false);
    expect(ecfTypeRequiresExpiry("E34")).toBe(false);
    expect(ecfTypeRequiresExpiry("B02")).toBe(false);
  });
});

describe("date helpers and converters", () => {
  it("validates strict dd-MM-yyyy calendar dates", () => {
    expect(isValidExpiryDate("31-12-2027")).toBe(true);
    expect(isValidExpiryDate("29-02-2028")).toBe(true); // Leap year
    expect(isValidExpiryDate("29-02-2027")).toBe(false); // Non-leap year
    expect(isValidExpiryDate("31-02-2027")).toBe(false); // Invalid day
    expect(isValidExpiryDate("2027-12-31")).toBe(false); // Wrong format
    expect(isValidExpiryDate("31/12/2027")).toBe(false); // Slashes
    expect(isValidExpiryDate("")).toBe(false);
    expect(isValidExpiryDate("not-a-date")).toBe(false);
  });

  it("converts expiryToInputValue and inputValueToExpiry round-trip", () => {
    expect(expiryToInputValue("31-12-2027")).toBe("2027-12-31");
    expect(inputValueToExpiry("2027-12-31")).toBe("31-12-2027");
  });

  it("returns empty string or null for invalid converter inputs", () => {
    expect(expiryToInputValue("")).toBe("");
    expect(expiryToInputValue("invalid")).toBe("");
    expect(expiryToInputValue("31-02-2027")).toBe("");
    expect(inputValueToExpiry("")).toBeNull();
    expect(inputValueToExpiry("invalid")).toBeNull();
    expect(inputValueToExpiry("2027-02-31")).toBeNull();
  });
});

describe("restoreRanges", () => {
  it("restores start, end and used from persisted bounds and the next number", () => {
    const r = restoreRanges(["E31"], { E31: 125 }, { E31: { start: 100, end: 500, vence: "31-12-2027" } });
    expect(r.E31).toEqual({ start: 100, end: 500, used: 25, vence: "31-12-2027" });
  });

  it("carries vence from persisted bounds into the restored range", () => {
    const r = restoreRanges(["E31", "E32"], { E31: 10, E32: 20 }, {
      E31: { start: 1, end: 500, vence: "15-08-2028" },
      E32: { start: 1, end: 500 },
    });
    expect(r.E31.vence).toBe("15-08-2028");
    expect(r.E32.vence).toBeUndefined();
  });

  it("falls back to the legacy shape when only the next number exists", () => {
    expect(restoreRanges(["E32"], { E32: 7 }, {}).E32).toEqual({ start: 7, end: 1006, used: 0 });
  });

  it("uses start as next when bounds exist but no counter was saved", () => {
    expect(restoreRanges(["E31"], {}, { E31: { start: 10, end: 20 } }).E31).toEqual({ start: 10, end: 20, used: 0 });
  });

  it("skips types with no data and ignores malformed bounds", () => {
    expect(restoreRanges(["E31", "E34"], {}, { E31: { start: 9, end: 3 } })).toEqual({});
  });
});

describe("parsers", () => {
  it("accepts numbers and { secuencia_actual } for next numbers", () => {
    expect(parseNextNumbers({ E31: 3, E32: { secuencia_actual: 4 }, E33: "x", E34: 0 })).toEqual({ E31: 3, E32: 4 });
    expect(parseNextNumbers(null)).toEqual({});
  });

  it("drops malformed bounds", () => {
    expect(parseStoredBounds({ E31: { start: 1, end: 5 }, E32: { start: 5, end: 1 }, E33: 4, E34: { start: 1 } })).toEqual({ E31: { start: 1, end: 5 } });
    expect(parseStoredBounds([])).toEqual({});
  });

  it("keeps valid vence (trimmed) and drops malformed vence while keeping the entry", () => {
    const parsed = parseStoredBounds({
      E31: { start: 1, end: 100, vence: " 31-12-2027 " },
      E32: { start: 1, end: 100, vence: "invalid-date" },
      E33: { start: 1, end: 100, vence: "31-02-2027" },
    });
    expect(parsed.E31).toEqual({ start: 1, end: 100, vence: "31-12-2027" });
    expect(parsed.E32).toEqual({ start: 1, end: 100 });
    expect(parsed.E33).toEqual({ start: 1, end: 100 });
  });

  it("preserves unknown keys in stored bounds", () => {
    const parsed = parseStoredBounds({
      E31: { start: 1, end: 100, vence: "31-12-2027", customId: 42, note: "dgii authorized" },
    });
    expect(parsed.E31).toEqual({
      start: 1,
      end: 100,
      vence: "31-12-2027",
      customId: 42,
      note: "dgii authorized",
    });
  });
});

const TEST_TODAY = new Date("2026-10-17T12:00:00Z");

describe("validateEcfRange", () => {
  it("accepts a healthy range", () => {
    const v = validateEcfRange("E31", { start: 1, end: 1000, used: 10, vence: "31-12-2027" }, TEST_TODAY);
    expect(v).toMatchObject({ valid: true, errors: [], warnings: [], next: 11, remaining: 990 });
  });

  it("rejects start < 1", () => {
    expect(validateEcfRange("E31", { start: 0, end: 10, used: 0, vence: "31-12-2027" }, TEST_TODAY).valid).toBe(false);
  });

  it("rejects end < start", () => {
    expect(validateEcfRange("E31", { start: 10, end: 9, used: 0, vence: "31-12-2027" }, TEST_TODAY).errors[0]).toContain("final");
  });

  it("rejects a next number outside the range", () => {
    expect(validateEcfRange("E31", { start: 1, end: 10, used: 20, vence: "31-12-2027" }, TEST_TODAY).errors[0]).toContain("fuera del rango");
    expect(validateEcfRange("E31", { start: 5, end: 10, used: -1, vence: "31-12-2027" }, TEST_TODAY).valid).toBe(false);
  });

  it("flags an exhausted range as an error", () => {
    const v = validateEcfRange("E31", { start: 1, end: 10, used: 10, vence: "31-12-2027" }, TEST_TODAY);
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toContain("agotado");
  });

  it("warns when fewer than 10% remain", () => {
    const v = validateEcfRange("E31", { start: 1, end: 100, used: 95, vence: "31-12-2027" }, TEST_TODAY);
    expect(v.valid).toBe(true);
    expect(v.remaining).toBe(5);
    expect(v.warnings).toHaveLength(1);
  });

  it("does not warn at exactly 10% remaining", () => {
    expect(validateEcfRange("E31", { start: 1, end: 100, used: 90, vence: "31-12-2027" }, TEST_TODAY).warnings).toEqual([]);
  });

  it("rejects E31 without vence", () => {
    const v = validateEcfRange("E31", { start: 1, end: 1000, used: 10 }, TEST_TODAY);
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("E31: indicá la fecha de vencimiento de la secuencia (la DGII la exige).");
  });

  it("rejects E31 with invalid vence", () => {
    const v = validateEcfRange("E31", { start: 1, end: 1000, used: 10, vence: "31-02-2027" }, TEST_TODAY);
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("E31: indicá la fecha de vencimiento de la secuencia (la DGII la exige).");
  });

  it("rejects a past expiry date", () => {
    const v = validateEcfRange("E31", { start: 1, end: 1000, used: 10, vence: "16-10-2026" }, TEST_TODAY);
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("E31: la secuencia venció el 16-10-2026. Solicitá un nuevo rango a la DGII.");
  });

  it("warns when expiry is within 30 days", () => {
    const v = validateEcfRange("E31", { start: 1, end: 1000, used: 10, vence: "01-11-2026" }, TEST_TODAY);
    expect(v.valid).toBe(true);
    expect(v.warnings.some((w) => w.includes("vence el 01-11-2026"))).toBe(true);
  });

  it("accepts E32 without vence", () => {
    const v = validateEcfRange("E32", { start: 1, end: 1000, used: 10 }, TEST_TODAY);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });
});

describe("validateRangeBounds", () => {
  it("validates healthy bounds", () => {
    const res = validateRangeBounds("E31", { start: 1, end: 1000, used: 10 });
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(res.next).toBe(11);
    expect(res.remaining).toBe(990);
  });
});

describe("validateEcfExpiry", () => {
  it("rejects when E31 is missing expiry", () => {
    const res = validateEcfExpiry("E31", undefined, TEST_TODAY);
    expect(res.error).toBe("E31: indicá la fecha de vencimiento de la secuencia (la DGII la exige).");
    expect(res.warning).toBeNull();
  });

  it("accepts when E32 is missing expiry", () => {
    const res = validateEcfExpiry("E32", undefined, TEST_TODAY);
    expect(res.error).toBeNull();
    expect(res.warning).toBeNull();
  });

  it("rejects when expiry date is in the past", () => {
    const res = validateEcfExpiry("E31", "16-10-2026", TEST_TODAY);
    expect(res.error).toBe("E31: la secuencia venció el 16-10-2026. Solicitá un nuevo rango a la DGII.");
    expect(res.warning).toBeNull();
  });

  it("warns when expiry is within 30 days", () => {
    const res = validateEcfExpiry("E31", "01-11-2026", TEST_TODAY);
    expect(res.error).toBeNull();
    expect(res.warning).toBe("E31: la secuencia vence el 01-11-2026 (en 15 días). Solicitá un nuevo rango pronto.");
  });

  it("warns with (hoy) when expiry is exactly today", () => {
    const res = validateEcfExpiry("E31", "17-10-2026", TEST_TODAY);
    expect(res.error).toBeNull();
    expect(res.warning).toBe("E31: la secuencia vence el 17-10-2026 (hoy). Solicitá un nuevo rango pronto.");
  });

  it("produces neither error nor warning when expiry is 31 days ahead", () => {
    const res = validateEcfExpiry("E31", "17-11-2026", TEST_TODAY);
    expect(res.error).toBeNull();
    expect(res.warning).toBeNull();
  });
});

describe("buildRangesSavePayload", () => {
  it("writes next = start + used and the bounds for enabled types, keeping others", () => {
    const payload = buildRangesSavePayload(
      ["E31"],
      { E31: { start: 100, end: 200, used: 5 } },
      { E32: 50, E31: 1 },
      { E32: { start: 40, end: 90 } }
    );
    expect(payload).toEqual({
      ncf_secuencias_por_tipo: { E32: 50, E31: 105 },
      ecf_secuencias_rangos: { E32: { start: 40, end: 90 }, E31: { start: 100, end: 200 } },
      keptTypes: [],
    });
  });

  it("removes e-CF types the user turned off when nothing was issued from them", () => {
    const payload = buildRangesSavePayload(
      ["E31"],
      { E31: { start: 1, end: 300, used: 0 } },
      { E31: 1, E33: 1, B02: 77 },
      { E31: { start: 1, end: 300 }, E33: { start: 1, end: 1000 } },
      ["E31", "E33", "E34"]
    );
    expect(payload).toEqual({
      ncf_secuencias_por_tipo: { E31: 1, B02: 77 },
      ecf_secuencias_rangos: { E31: { start: 1, end: 300 } },
      keptTypes: [],
    });
  });

  it("keeps a turned-off e-CF type that already issued numbers so they are never reused", () => {
    const payload = buildRangesSavePayload(
      ["E31"],
      { E31: { start: 1, end: 300, used: 0 } },
      { E31: 1, E34: 4 },
      { E31: { start: 1, end: 300 }, E34: { start: 1, end: 10 } },
      ["E31", "E34"]
    );
    expect(payload.ecf_secuencias_rangos.E34).toEqual({ start: 1, end: 10 });
    expect(payload.ncf_secuencias_por_tipo.E34).toBe(4);
    expect(payload.keptTypes).toEqual(["E34"]);
  });

  it("removes a turned-off legacy counter-only e-CF type that never issued", () => {
    const payload = buildRangesSavePayload(["E31"], { E31: { start: 1, end: 9, used: 0 } }, { E32: 1 }, {}, ["E31", "E32"]);
    expect(payload.ncf_secuencias_por_tipo).toEqual({ E31: 1 });
  });

  it("keeps the next-number map numeric so the reserve RPC can cast it", () => {
    const payload = buildRangesSavePayload(["E31"], { E31: { start: 1, end: 9, used: 0 } }, { E31: { secuencia_actual: 3 } }, null);
    expect(Object.values(payload.ncf_secuencias_por_tipo).every((v) => typeof v === "number")).toBe(true);
  });

  it("REGRESSION: keeps existing vence when wizard range does not specify vence", () => {
    const payload = buildRangesSavePayload(
      ["E31"],
      { E31: { start: 1, end: 300, used: 0 } },
      { E31: 1 },
      { E31: { start: 1, end: 300, vence: "31-12-2027" } },
      ["E31"]
    );
    expect(payload.ecf_secuencias_rangos.E31).toEqual({
      start: 1,
      end: 300,
      vence: "31-12-2027",
    });
  });

  it("overrides stored vence when wizard range provides a new vence", () => {
    const payload = buildRangesSavePayload(
      ["E31"],
      { E31: { start: 1, end: 300, used: 0, vence: "15-06-2028" } },
      { E31: 1 },
      { E31: { start: 1, end: 300, vence: "31-12-2027" } },
      ["E31"]
    );
    expect(payload.ecf_secuencias_rangos.E31).toEqual({
      start: 1,
      end: 300,
      vence: "15-06-2028",
    });
  });

  it("preserves unknown keys in a raw entry", () => {
    const payload = buildRangesSavePayload(
      ["E31"],
      { E31: { start: 1, end: 300, used: 0, vence: "31-12-2027" } },
      { E31: 1, B02: 5 },
      {
        E31: { start: 1, end: 200, vence: "31-12-2027", customId: 101, dgiiMeta: { auth: "6005" } },
        B02: { note: "legacy untouched" },
      },
      ["E31"]
    );
    expect(payload.ecf_secuencias_rangos.E31).toEqual({
      start: 1,
      end: 300,
      vence: "31-12-2027",
      customId: 101,
      dgiiMeta: { auth: "6005" },
    });
    const ecfBounds = payload.ecf_secuencias_rangos as Record<string, unknown>;
    expect(ecfBounds.B02).toEqual({
      note: "legacy untouched",
    });
  });
});
