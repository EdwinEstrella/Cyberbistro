import { describe, expect, it } from "vitest";
import {
  ECF_ENVIRONMENTS,
  buildCertificateRows,
} from "../supabase/functions/validate-ecf-certificate/certificateRows";

describe("validate-ecf-certificate row fan-out", () => {
  const basePayload = Object.freeze({
    tenant_id: "7b474da6-d4f1-4db4-9122-832f05d4b584",
    subject: "CN=EMPRESA DEMO, C=DO, VATDO-133488485",
    issuer: "CN=DGII CA, C=DO",
    serial_number: "40200112233",
    valid_from: "2026-01-01T00:00:00Z",
    valid_until: "2027-01-01T00:00:00Z",
    storage_ref: "7b474da6-d4f1-4db4-9122-832f05d4b584/test-1731350000000.p12",
    password_encrypted: "aes256gcm:abcdef0123456789:0123456789abcdef:fedcba9876543210",
    is_ready: true,
    last_validation_error: null,
  });

  it("defines the three standard e-CF environments", () => {
    expect(ECF_ENVIRONMENTS).toEqual(["test", "certification", "production"]);
  });

  it("builds 3 rows, one per environment, with identical storage_ref and encrypted secret", () => {
    const rows = buildCertificateRows(basePayload);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.environment)).toEqual(["test", "certification", "production"]);

    for (const row of rows) {
      expect(row.tenant_id).toBe(basePayload.tenant_id);
      expect(row.storage_ref).toBe(basePayload.storage_ref);
      expect(row.password_encrypted).toBe(basePayload.password_encrypted);
      expect(row.subject).toBe(basePayload.subject);
      expect(row.issuer).toBe(basePayload.issuer);
      expect(row.serial_number).toBe(basePayload.serial_number);
      expect(row.valid_from).toBe(basePayload.valid_from);
      expect(row.valid_until).toBe(basePayload.valid_until);
      expect(row.is_ready).toBe(true);
      expect(row.last_validation_error).toBeNull();
    }
  });

  it("ensures only the environment property differs between rows", () => {
    const rows = buildCertificateRows(basePayload);
    const [testRow, certRow, prodRow] = rows;

    const stripEnv = <T extends { environment: string }>(row: T) => {
      const { environment, ...rest } = row;
      return rest;
    };

    expect(stripEnv(testRow)).toEqual(stripEnv(certRow));
    expect(stripEnv(certRow)).toEqual(stripEnv(prodRow));
    expect(testRow.environment).toBe("test");
    expect(certRow.environment).toBe("certification");
    expect(prodRow.environment).toBe("production");
  });

  it("does not mutate the input object", () => {
    const mutableInput = {
      tenant_id: "7b474da6-d4f1-4db4-9122-832f05d4b584",
      environment: "test",
      storage_ref: "7b474da6-d4f1-4db4-9122-832f05d4b584/test-123.p12",
      password_encrypted: "encrypted",
      is_ready: true,
    };
    const inputCopy = { ...mutableInput };

    const rows = buildCertificateRows(mutableInput);

    expect(mutableInput).toEqual(inputCopy);
    expect(mutableInput.environment).toBe("test");
    expect(rows.map((r) => r.environment)).toEqual(["test", "certification", "production"]);
  });

  it("supports custom environment lists if provided", () => {
    const customEnvironments = ["test", "production"] as const;
    const rows = buildCertificateRows(basePayload, customEnvironments);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.environment)).toEqual(["test", "production"]);
  });
});
