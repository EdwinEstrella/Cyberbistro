import { describe, expect, it } from "vitest";
import {
  buildRangesSavePayload,
  parseNextNumbers,
  parseStoredBounds,
  restoreRanges,
  validateEcfRange,
} from "./ecfSequenceRanges";

describe("restoreRanges", () => {
  it("restores start, end and used from persisted bounds and the next number", () => {
    const r = restoreRanges(["E31"], { E31: 125 }, { E31: { start: 100, end: 500 } });
    expect(r.E31).toEqual({ start: 100, end: 500, used: 25 });
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
});

describe("validateEcfRange", () => {
  it("accepts a healthy range", () => {
    const v = validateEcfRange("E31", { start: 1, end: 1000, used: 10 });
    expect(v).toMatchObject({ valid: true, errors: [], warnings: [], next: 11, remaining: 990 });
  });

  it("rejects start < 1", () => {
    expect(validateEcfRange("E31", { start: 0, end: 10, used: 0 }).valid).toBe(false);
  });

  it("rejects end < start", () => {
    expect(validateEcfRange("E31", { start: 10, end: 9, used: 0 }).errors[0]).toContain("final");
  });

  it("rejects a next number outside the range", () => {
    expect(validateEcfRange("E31", { start: 1, end: 10, used: 20 }).errors[0]).toContain("fuera del rango");
    expect(validateEcfRange("E31", { start: 5, end: 10, used: -1 }).valid).toBe(false);
  });

  it("flags an exhausted range as an error", () => {
    const v = validateEcfRange("E31", { start: 1, end: 10, used: 10 });
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toContain("agotado");
  });

  it("warns when fewer than 10% remain", () => {
    const v = validateEcfRange("E31", { start: 1, end: 100, used: 95 });
    expect(v.valid).toBe(true);
    expect(v.remaining).toBe(5);
    expect(v.warnings).toHaveLength(1);
  });

  it("does not warn at exactly 10% remaining", () => {
    expect(validateEcfRange("E31", { start: 1, end: 100, used: 90 }).warnings).toEqual([]);
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
});
