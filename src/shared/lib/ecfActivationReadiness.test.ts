import { describe, expect, it } from "vitest";
import {
  activationNotice,
  buildActivationPayload,
  buildDeactivationPayload,
  describeActivationSuccess,
  evaluateEcfActivationReadiness,
  formatReadinessIssues,
  normalizeFiscalFallback,
  type EcfReadinessInput,
} from "./ecfActivationReadiness";

const NOW = new Date("2026-10-17T12:00:00Z");

function readyInput(overrides: Partial<EcfReadinessInput> = {}): EcfReadinessInput {
  return {
    plan: "profesional",
    environment: "test",
    issuer: {
      rnc: "131123456",
      nombre: "Salpimentao SRL",
      direccion: "Calle 1",
      sucursal: "Principal",
      municipio: "Santo Domingo",
      provincia: "Distrito Nacional",
      actividadEconomica: "Restaurantes",
      correoEmisor: "fiscal@example.com",
    },
    certificate: {
      subject: "CN=Salpimentao RNC 131123456",
      valid_until: "2027-10-17T00:00:00Z",
      is_ready: true,
      environment: "test",
      last_validation_error: null,
    },
    sequencesNextRaw: { E31: 5 },
    sequencesBoundsRaw: { E31: { start: 1, end: 1000 } },
    ecfTypeCodes: ["E31", "E32"],
    now: NOW,
    ...overrides,
  };
}

const codes = (input: EcfReadinessInput) => evaluateEcfActivationReadiness(input).missing.map((m) => m.code);

describe("evaluateEcfActivationReadiness", () => {
  it("is ready when everything is in place", () => {
    expect(evaluateEcfActivationReadiness(readyInput())).toEqual({ ready: true, missing: [] });
  });

  it("blocks when the plan does not include e-CF", () => {
    const result = evaluateEcfActivationReadiness(readyInput({ plan: "basico" }));
    expect(result.ready).toBe(false);
    expect(result.missing.map((m) => m.code)).toEqual(["PLAN"]);
    expect(result.missing[0].message).toMatch(/Plan Profesional/);
  });

  it("blocks when no valid environment is selected", () => {
    expect(codes(readyInput({ environment: "" }))).toContain("ENVIRONMENT");
    expect(codes(readyInput({ environment: "staging" }))).toContain("ENVIRONMENT");
    expect(codes(readyInput({ environment: null }))).toContain("ENVIRONMENT");
  });

  it("blocks when issuer data is incomplete or malformed", () => {
    const base = readyInput();
    const missingMunicipio = readyInput({ issuer: { ...base.issuer, municipio: "" } });
    const result = evaluateEcfActivationReadiness(missingMunicipio);
    expect(result.missing.map((m) => m.code)).toEqual(["ISSUER"]);
    expect(result.missing[0].message).toMatch(/Municipio/);
    expect(codes(readyInput({ issuer: { ...base.issuer, rnc: "123" } }))).toContain("ISSUER");
  });

  it("blocks when there is no certificate for the environment", () => {
    const result = evaluateEcfActivationReadiness(readyInput({ certificate: null }));
    expect(result.missing.map((m) => m.code)).toEqual(["CERTIFICATE"]);
  });

  it("blocks when the certificate is not ready", () => {
    const base = readyInput();
    expect(codes(readyInput({ certificate: { ...base.certificate, is_ready: false } }))).toEqual(["CERTIFICATE"]);
  });

  it("accepts a natural-person signer certificate and never blocks on a representative warning", () => {
    const base = readyInput();
    const person = { ...base.certificate, subject: "undefined=IDCDO-12100129126, CN=JOSE ABRAHAN TORIBIO GUERRERO" };
    expect(evaluateEcfActivationReadiness(readyInput({ certificate: person }))).toEqual({ ready: true, missing: [] });
    expect(evaluateEcfActivationReadiness(readyInput({ certificate: person, representativeId: "12100129126" })).ready).toBe(true);
    expect(evaluateEcfActivationReadiness(readyInput({ certificate: person, representativeId: "00112345678" })).ready).toBe(true);
  });

  it("blocks an expired certificate and tells what to do", () => {
    const base = readyInput();
    const result = evaluateEcfActivationReadiness(readyInput({ certificate: { ...base.certificate, valid_until: "2026-10-01T00:00:00Z" } }));
    expect(result.missing.map((m) => m.code)).toEqual(["CERTIFICATE"]);
    expect(result.missing[0].message).toMatch(/vencido/);
    expect(result.missing[0].message).toMatch(/Solicitá un certificado nuevo/);
  });

  it("blocks a certificate from another environment", () => {
    const base = readyInput();
    const result = evaluateEcfActivationReadiness(readyInput({ environment: "production", certificate: { ...base.certificate, environment: "test" } }));
    expect(result.missing.map((m) => m.code)).toEqual(["CERTIFICATE"]);
    expect(result.missing[0].message).toMatch(/otro ambiente/);
  });

  it("blocks when the worker recorded a signing failure", () => {
    const base = readyInput();
    expect(codes(readyInput({ certificate: { ...base.certificate, last_validation_error: "CERTIFICATE_NOT_FOUND" } }))).toEqual(["CERTIFICATE"]);
  });

  it("allows a certificate that is only expiring soon", () => {
    const base = readyInput();
    const result = evaluateEcfActivationReadiness(readyInput({ certificate: { ...base.certificate, valid_until: "2026-11-01T00:00:00Z" } }));
    expect(result.ready).toBe(true);
  });

  it("blocks when no sequences are configured", () => {
    const result = evaluateEcfActivationReadiness(readyInput({ sequencesNextRaw: {}, sequencesBoundsRaw: {} }));
    expect(result.missing.map((m) => m.code)).toEqual(["SEQUENCES"]);
    expect(result.missing[0].message).toMatch(/paso 3/);
  });

  it("blocks when the only configured range is exhausted and reports why", () => {
    const result = evaluateEcfActivationReadiness(readyInput({ sequencesNextRaw: { E31: 1001 }, sequencesBoundsRaw: { E31: { start: 1, end: 1000 } } }));
    expect(result.missing.map((m) => m.code)).toEqual(["SEQUENCES"]);
    expect(result.missing[0].message).toMatch(/agotado/);
  });

  it("is ready when one type is exhausted but another is valid", () => {
    const result = evaluateEcfActivationReadiness(
      readyInput({
        sequencesNextRaw: { E31: 1001, E32: 10 },
        sequencesBoundsRaw: { E31: { start: 1, end: 1000 }, E32: { start: 1, end: 500 } },
      })
    );
    expect(result.ready).toBe(true);
  });

  it("accepts legacy sequences that only have a next number", () => {
    expect(evaluateEcfActivationReadiness(readyInput({ sequencesBoundsRaw: {} })).ready).toBe(true);
  });

  it("ignores unknown types", () => {
    expect(codes(readyInput({ sequencesNextRaw: { E99: 5 }, sequencesBoundsRaw: {} }))).toEqual(["SEQUENCES"]);
  });

  it("collects every reason at once", () => {
    const result = evaluateEcfActivationReadiness(
      readyInput({ plan: null, environment: "", issuer: {}, certificate: null, sequencesNextRaw: null, sequencesBoundsRaw: null })
    );
    expect(result.missing.map((m) => m.code)).toEqual(["PLAN", "ENVIRONMENT", "ISSUER", "CERTIFICATE", "SEQUENCES"]);
    expect(formatReadinessIssues(result).length).toBeGreaterThan(50);
  });
});

describe("activation payloads", () => {
  it("builds the activation payload with environment and timestamp", () => {
    expect(buildActivationPayload("certification", NOW)).toEqual({
      fiscal_mode: "dgii_ecf",
      ecf_environment: "certification",
      ncf_fiscal_activo: true,
      updated_at: "2026-10-17T12:00:00.000Z",
    });
  });

  it("deactivates to the configured fallback and defaults to internal_receipt", () => {
    expect(buildDeactivationPayload("ncf_legacy", NOW).fiscal_mode).toBe("ncf_legacy");
    expect(buildDeactivationPayload("internal_receipt", NOW).fiscal_mode).toBe("internal_receipt");
    expect(buildDeactivationPayload(null, NOW).fiscal_mode).toBe("internal_receipt");
    expect(buildDeactivationPayload("ncf_legacy", NOW).ncf_fiscal_activo).toBe(true);
    expect(buildDeactivationPayload("internal_receipt", NOW).ncf_fiscal_activo).toBe(false);
    expect(buildDeactivationPayload("dgii_ecf", NOW).fiscal_mode).toBe("internal_receipt");
  });

  it("normalizes unknown fallbacks", () => {
    expect(normalizeFiscalFallback("whatever")).toBe("internal_receipt");
  });

  it("shows the activation notice only while the tenant is on dgii_ecf", () => {
    expect(activationNotice("dgii_ecf", "certification")).toMatch(/CerteCF/);
    for (const mode of ["ncf_legacy", "internal_receipt", null, undefined, ""]) {
      expect(activationNotice(mode, "certification")).toBeNull();
    }
  });

  it("mentions environment and worker dependency in the success message", () => {
    const text = describeActivationSuccess("production");
    expect(text).toMatch(/Producción/);
    expect(text).toMatch(/worker/);
  });
});
