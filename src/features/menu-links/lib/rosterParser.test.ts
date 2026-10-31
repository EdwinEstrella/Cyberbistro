import { describe, it, expect } from "vitest";
import { parseRosterText, normalizeCedula, normalizeEmployeeName } from "./rosterParser";

describe("rosterParser", () => {
  it("normalizes cedula and employee name correctly", () => {
    expect(normalizeCedula("402-1234567-8")).toBe("40212345678");
    expect(normalizeCedula("  402 1234567 8 ")).toBe("40212345678");
    expect(normalizeEmployeeName("  José   Ángel   Peña  ")).toBe("jose angel pena");
  });

  it("handles empty or whitespace text", () => {
    const res = parseRosterText("   \n\n  \t  \n");
    expect(res.totalCount).toBe(0);
    expect(res.validRows).toEqual([]);
    expect(res.invalidRows).toEqual([]);
  });

  it("parses valid lines with name and cedula", () => {
    const input = [
      "Juan Pérez, 402-1234567-8",
      "María Gómez, 001-9876543-2",
      "Carlos Santana, 40200000001",
    ].join("\n");

    const res = parseRosterText(input);
    expect(res.totalCount).toBe(3);
    expect(res.validRows.length).toBe(3);
    expect(res.invalidRows.length).toBe(0);
    expect(res.validRows[0]).toMatchObject({
      fullName: "Juan Pérez",
      documentId: "40212345678",
      isValid: true,
    });
  });

  it("parses valid lines with name only (cedula optional)", () => {
    const input = ["Ana López", "Pedro Infante, "].join("\n");
    const res = parseRosterText(input);
    expect(res.validRows.length).toBe(2);
    expect(res.validRows[0].fullName).toBe("Ana López");
    expect(res.validRows[0].documentId).toBeNull();
    expect(res.validRows[1].fullName).toBe("Pedro Infante");
    expect(res.validRows[1].documentId).toBeNull();
  });

  it("flags short or long names as invalid", () => {
    const tooLong = "A".repeat(81);
    const input = ["A, 40212345678", `${tooLong}, 40212345679`].join("\n");
    const res = parseRosterText(input);
    expect(res.invalidRows.length).toBe(2);
    expect(res.validRows.length).toBe(0);
    expect(res.invalidRows[0].error).toContain("entre 2 y 80 caracteres");
  });

  it("flags invalid cedulas (not 11 digits)", () => {
    const input = ["Juan Pérez, 12345", "Pedro Gómez, 402-1234567-8901"].join("\n");
    const res = parseRosterText(input);
    expect(res.invalidRows.length).toBe(2);
    expect(res.invalidRows[0].error).toContain("11 dígitos");
  });

  it("flags duplicates within the batch by lower name or cedula", () => {
    const input = [
      "Juan Pérez, 40212345678",
      "juan perez, 40299999999", // duplicate name
      "Otro Nombre, 402-1234567-8", // duplicate cedula
    ].join("\n");

    const res = parseRosterText(input);
    expect(res.validRows.length).toBe(1);
    expect(res.invalidRows.length).toBe(2);
    expect(res.invalidRows[0].error).toContain("Nombre duplicado");
    expect(res.invalidRows[1].error).toContain("Cédula duplicada");
  });
});
