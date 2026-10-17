import { describe, expect, it } from "vitest";
import {
  describeCertificateErrorCode,
  evaluateCertificateHealth,
  extractSubjectRncCandidates,
  formatCertificateDate,
  formatCertificateHealth,
  isRncMismatch,
  normalizeCertificateErrorCode,
} from "./ecfCertificateHealth";

const now = new Date("2026-10-17T12:00:00Z");
const subject = "CN=RESTAURANTE EJEMPLO SRL, serialNumber=131234567, O=DGII";
const base = {
  subject,
  valid_until: "2027-10-17T00:00:00Z",
  is_ready: true,
  environment: "certification",
  last_validation_error: null,
};
const input = (metadata: any, extra: any = {}) => ({
  metadata,
  tenantRnc: "1-31-23456-7",
  selectedEnvironment: "certification",
  now,
  ...extra,
});

describe("evaluateCertificateHealth", () => {
  it("is ok for a ready, valid, matching certificate", () => {
    expect(evaluateCertificateHealth(input(base))).toMatchObject({ status: "ok", reason: "OK", action: "none" });
  });

  it("warns when expiring within 30 days and asks for a new certificate", () => {
    const h = evaluateCertificateHealth(input({ ...base, valid_until: "2026-11-10T00:00:00Z" }));
    expect(h).toMatchObject({ status: "warning", reason: "EXPIRING_SOON", action: "request_new" });
    expect(h.message).toContain("10/11/2026");
  });

  it("treats exactly 30 days as expiring and 31 days as ok", () => {
    expect(evaluateCertificateHealth(input({ ...base, valid_until: "2026-11-16T12:00:00Z" })).reason).toBe("EXPIRING_SOON");
    expect(evaluateCertificateHealth(input({ ...base, valid_until: "2026-11-17T12:00:01Z" })).reason).toBe("OK");
  });

  it("errors when expired, including the date dd/mm/yyyy", () => {
    const h = evaluateCertificateHealth(input({ ...base, valid_until: "2026-09-05T00:00:00Z" }));
    expect(h).toMatchObject({ status: "error", reason: "EXPIRED", action: "request_new" });
    expect(h.message).toContain("05/09/2026");
  });

  it("errors when the certificate RNC differs from the tenant RNC", () => {
    const h = evaluateCertificateHealth(input({ ...base, subject: "CN=OTRO, serialNumber=101000019" }));
    expect(h).toMatchObject({ status: "error", reason: "RNC_MISMATCH", action: "request_new" });
  });

  it("does not flag a mismatch when RNC is unknown on either side", () => {
    expect(evaluateCertificateHealth(input({ ...base, subject: "CN=SIN NUMEROS" })).reason).toBe("OK");
    expect(evaluateCertificateHealth(input(base, { tenantRnc: "" })).reason).toBe("OK");
    expect(evaluateCertificateHealth(input(base, { tenantRnc: null })).reason).toBe("OK");
  });

  it("reports not uploaded when there is no metadata", () => {
    expect(evaluateCertificateHealth(input(null))).toMatchObject({ status: "warning", reason: "NOT_UPLOADED", action: "upload_again" });
    expect(evaluateCertificateHealth(input(undefined)).reason).toBe("NOT_UPLOADED");
  });

  it("reports environment mismatch", () => {
    const h = evaluateCertificateHealth(input({ ...base, environment: "production" }));
    expect(h).toMatchObject({ status: "error", reason: "ENVIRONMENT_MISMATCH", action: "upload_again" });
  });

  it("reports a row that is not ready", () => {
    expect(evaluateCertificateHealth(input({ ...base, is_ready: false }))).toMatchObject({ reason: "NOT_READY", action: "upload_again" });
  });

  it("uses the last validation error (wrong password)", () => {
    const h = evaluateCertificateHealth(input({ ...base, is_ready: false, last_validation_error: "WRONG_PASSWORD" }));
    expect(h).toMatchObject({ reason: "WRONG_PASSWORD", action: "reenter_password" });
  });

  it("lets an explicit error code override stored metadata", () => {
    const h = evaluateCertificateHealth(input(base, { lastErrorCode: "CERTIFICATE_NOT_FOUND" }));
    expect(h).toMatchObject({ status: "error", reason: "CERTIFICATE_NOT_FOUND", action: "upload_again" });
  });

  it("maps worker decrypt failures to upload again", () => {
    const h = evaluateCertificateHealth(input(base, { lastErrorCode: "Unsupported state or unable to authenticate data" }));
    expect(h).toMatchObject({ reason: "DECRYPT_FAILED", action: "upload_again" });
  });
});

describe("describeCertificateErrorCode", () => {
  it.each([
    ["WRONG_PASSWORD", "WRONG_PASSWORD", "reenter_password"],
    ["INVALID_FILE", "INVALID_FILE", "upload_again"],
    ["CERTIFICATE_EXPIRED", "EXPIRED", "request_new"],
    ["CERTIFICATE_NOT_VALID_NOW", "EXPIRED", "request_new"],
    ["RNC_MISMATCH", "RNC_MISMATCH", "request_new"],
    ["CERTIFICATE_NOT_FOUND", "CERTIFICATE_NOT_FOUND", "upload_again"],
    ["CERTIFICATE_NOT_READY", "CERTIFICATE_NOT_FOUND", "upload_again"],
    ["DECRYPT_FAILED", "DECRYPT_FAILED", "upload_again"],
    ["STORAGE_DOWNLOAD_FAILED", "STORAGE_UNAVAILABLE", "contact_support"],
    ["CERTIFICATE_FETCH_ERROR", "STORAGE_UNAVAILABLE", "contact_support"],
    ["CERTIFICATE_CUSTODY_NOT_CONFIGURED", "SERVICE_ERROR", "contact_support"],
    ["FORBIDDEN", "NOT_AUTHORIZED", "contact_support"],
    ["SAVE_FAILED", "SERVICE_ERROR", "contact_support"],
  ])("%s -> %s / %s", (code, reason, action) => {
    expect(describeCertificateErrorCode(code)).toMatchObject({ status: "error", reason, action });
  });

  it("includes the expiry date when known and falls back for unknown codes", () => {
    expect(describeCertificateErrorCode("CERTIFICATE_EXPIRED", { validUntil: "2026-01-02T00:00:00Z" }).message).toContain("02/01/2026");
    expect(describeCertificateErrorCode("???", { fallbackMessage: "algo" })).toMatchObject({ reason: "UNKNOWN_ERROR", message: "algo", action: "contact_support" });
    expect(describeCertificateErrorCode(null).message).toBe("No se pudo validar el certificado.");
  });
});

describe("helpers", () => {
  it("normalizes free text to codes", () => {
    expect(normalizeCertificateErrorCode("PKCS#12 MAC could not be verified. Invalid password?")).toBe("WRONG_PASSWORD");
    expect(normalizeCertificateErrorCode("El certificado digital se encuentra vencido.")).toBe("CERTIFICATE_EXPIRED");
    expect(normalizeCertificateErrorCode("ECF_ENCRYPTION_KEY is required")).toBe("DECRYPT_FAILED");
    expect(normalizeCertificateErrorCode("")).toBeNull();
    expect(normalizeCertificateErrorCode("nada")).toBeNull();
  });

  it("formats dates as dd/mm/yyyy and tolerates invalid input", () => {
    expect(formatCertificateDate("2027-03-04T23:59:00Z")).toBe("04/03/2027");
    expect(formatCertificateDate("garbage")).toBe("fecha desconocida");
  });

  it("extracts 9 and 11 digit candidates only", () => {
    expect(extractSubjectRncCandidates("serialNumber=131234567, id=00112345678, x=12345")).toEqual(["131234567", "00112345678"]);
    expect(extractSubjectRncCandidates(null)).toEqual([]);
    expect(isRncMismatch(subject, "131-23456-7")).toBe(false);
    expect(isRncMismatch(subject, "999999999")).toBe(true);
  });

  it("appends the action hint to the message", () => {
    const text = formatCertificateHealth(describeCertificateErrorCode("WRONG_PASSWORD"));
    expect(text).toContain("contraseña");
    expect(text).toContain("Volvé a escribir");
    expect(formatCertificateHealth({ status: "ok", reason: "OK", message: "Listo.", action: "none" })).toBe("Listo.");
  });
});
