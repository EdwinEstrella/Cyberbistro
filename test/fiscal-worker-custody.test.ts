import { describe, expect, it, vi } from "vitest";
import {
  FailClosedCertificateCustody,
  createWorkerMemoryCertificateCustody,
  validateCertificateForCustody,
} from "../worker/fiscal/certificateCustody";

const validParsedCertificate = {
  subject: "CN=Cyberbistro Test",
  issuer: "CN=DGII Test CA",
  serialNumber: "ABC123",
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validUntil: new Date("2027-01-01T00:00:00.000Z"),
};

describe("fiscal certificate custody", () => {
  it("fails closed when encrypted external custody is not configured for production signing", async () => {
    const custody = new FailClosedCertificateCustody();

    const result = await custody.getSigningMaterial({
      tenantId: "tenant-1",
      certificateId: "cert-1",
      environment: "certification",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CERTIFICATE_CUSTODY_NOT_CONFIGURED");
  });

  it("fails closed when no certificate parser is configured", async () => {
    const result = await validateCertificateForCustody({
      tenantId: "tenant-1",
      environment: "certification",
      p12Bytes: new Uint8Array([1, 2, 3]),
      passphrase: "secret",
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CERTIFICATE_PARSER_NOT_CONFIGURED");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("validates certificate readiness without returning p12 bytes or passphrases", async () => {
    const parser = vi.fn().mockResolvedValue(validParsedCertificate);

    const result = await validateCertificateForCustody({
      tenantId: "tenant-1",
      environment: "certification",
      p12Bytes: new Uint8Array([1, 2, 3]),
      passphrase: "secret",
      now: new Date("2026-06-01T00:00:00.000Z"),
      parser,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        tenantId: "tenant-1",
        environment: "certification",
        subject: "CN=Cyberbistro Test",
        issuer: "CN=DGII Test CA",
        serialNumber: "ABC123",
        validFrom: validParsedCertificate.validFrom.toISOString(),
        validUntil: validParsedCertificate.validUntil.toISOString(),
        isReady: true,
        lastValidationError: null,
      });
      expect(JSON.stringify(result.value)).not.toContain("secret");
      expect(JSON.stringify(result.value)).not.toContain("p12");
    }
  });

  it("keeps signing material tenant-scoped inside worker custody", async () => {
    const custody = createWorkerMemoryCertificateCustody({
      parser: vi.fn().mockResolvedValue(validParsedCertificate),
      now: () => new Date("2026-06-01T00:00:00.000Z"),
    });

    const stored = await custody.store({
      tenantId: "tenant-1",
      environment: "certification",
      p12Bytes: new Uint8Array([8, 9, 10]),
      passphrase: "safe-password",
    });

    expect(stored.ok).toBe(true);
    if (!stored.ok) throw new Error("expected certificate to store");

    const allowed = await custody.getSigningMaterial({
      tenantId: "tenant-1",
      certificateId: stored.value.certificateId,
      environment: "certification",
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(Array.from(allowed.value.p12Bytes)).toEqual([8, 9, 10]);
      expect(allowed.value.passphrase).toBe("safe-password");
    }

    const denied = await custody.getSigningMaterial({
      tenantId: "other-tenant",
      certificateId: stored.value.certificateId,
      environment: "certification",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("CERTIFICATE_NOT_FOUND");
  });
});
