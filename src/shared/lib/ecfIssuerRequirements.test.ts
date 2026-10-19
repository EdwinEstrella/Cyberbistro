import { describe, expect, it } from "vitest";
import {
  buildIssuerUpdatePayload,
  buildRepresentativeIdPayload,
  ECF_ISSUER_FIELDS,
  isValidRnc,
  issuerInputFromTenantRow,
  normalizeRepresentativeId,
  normalizeRnc,
  validateEcfIssuer,
  validateRepresentativeId,
} from "./ecfIssuerRequirements";

const complete = {
  rnc: "131123456",
  nombre: "Mi Negocio SRL",
  direccion: "Calle 1",
  sucursal: "Principal",
  municipio: "Santo Domingo",
  provincia: "Distrito Nacional",
  actividadEconomica: "Restaurantes",
  correoEmisor: "fiscal@negocio.do",
};

describe("validateEcfIssuer", () => {
  it("accepts complete issuer data", () => {
    expect(validateEcfIssuer(complete)).toEqual({ complete: true, missing: [], invalid: [], message: "" });
  });

  it("names every missing field in Spanish", () => {
    const v = validateEcfIssuer({ rnc: "131123456", nombre: " " });
    expect(v.complete).toBe(false);
    expect(v.missing).toEqual(["Razón social", "Dirección fiscal", "Sucursal emisora", "Municipio", "Provincia", "Actividad económica", "Correo del emisor e-CF"]);
    expect(v.message).toContain("Falta completar:");
    expect(v.message).toContain("Razón social");
  });

  it("accepts RNC with 9 or 11 digits, with separators", () => {
    expect(isValidRnc("1-31-12345-6")).toBe(true);
    expect(isValidRnc("00112345678")).toBe(true);
    expect(isValidRnc("1234567")).toBe(false);
    expect(isValidRnc("1234567890")).toBe(false);
  });

  it("flags a malformed RNC and email", () => {
    const v = validateEcfIssuer({ ...complete, rnc: "123", correoEmisor: "no-es-correo" });
    expect(v.complete).toBe(false);
    expect(v.invalid.map((i) => i.key)).toEqual(["rnc", "correoEmisor"]);
    expect(v.message).toContain("9 u 11 dígitos");
    expect(v.message).toContain("formato válido");
  });

  it("treats null and undefined as missing", () => {
    expect(validateEcfIssuer({ ...complete, provincia: null, municipio: undefined }).missing).toEqual(["Municipio", "Provincia"]);
  });
});

describe("issuer mapping helpers", () => {
  it("maps tenant columns to the validator input", () => {
    const input = issuerInputFromTenantRow({
      rnc: "131123456", nombre_negocio: "X", direccion: "D", ecf_issuer_sucursal: "S",
      ecf_issuer_municipio: "M", ecf_issuer_provincia: "P", ecf_issuer_actividad_economica: "A", ecf_issuer_correo_emisor: "a@b.co",
    });
    expect(validateEcfIssuer(input).complete).toBe(true);
    expect(validateEcfIssuer(issuerInputFromTenantRow(null)).complete).toBe(false);
  });

  it("builds a trimmed payload covering every required column, RNC digits only", () => {
    const payload = buildIssuerUpdatePayload({ ...complete, rnc: " 1-31-12345-6 ", sucursal: "  Principal " });
    expect(payload.rnc).toBe("131123456");
    expect(payload.ecf_issuer_sucursal).toBe("Principal");
    expect(Object.keys(payload).sort()).toEqual(ECF_ISSUER_FIELDS.map((f) => f.column).sort());
    expect(normalizeRnc(null)).toBe("");
  });
});

describe("representative cedula", () => {
  it("normalizes to digits only", () => {
    expect(normalizeRepresentativeId("121-0012912-6")).toBe("12100129126");
    expect(normalizeRepresentativeId(null)).toBe("");
  });

  it("is optional but must be 11 digits when present", () => {
    expect(validateRepresentativeId("").valid).toBe(true);
    expect(validateRepresentativeId("121-0012912-6").valid).toBe(true);
    expect(validateRepresentativeId("1210012").valid).toBe(false);
    expect(validateRepresentativeId("1210012").message).toMatch(/11 dígitos/);
  });

  it("builds the persisted payload (null when empty, never part of the issuer payload)", () => {
    expect(buildRepresentativeIdPayload("121-0012912-6")).toEqual({ ecf_representative_id: "12100129126" });
    expect(buildRepresentativeIdPayload("  ")).toEqual({ ecf_representative_id: null });
    expect(buildIssuerUpdatePayload(complete)).not.toHaveProperty("ecf_representative_id");
  });
});
