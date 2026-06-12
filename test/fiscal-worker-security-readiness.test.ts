import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { decryptPassphrase, resolveRequiredEcfEncryptionKey } from "../worker/fiscal/crypto";
import {
  classifyInsforgeWorkerCredential,
  resolveFiscalWorkerCredentialFromEnv,
} from "../worker/fiscal/fiscalWorkerRuntime";

vi.mock("../worker/fiscal/dgiiAdapters", () => ({
  RealDgiiClient: class RealDgiiClient {},
  RealXmlSigner: class RealXmlSigner {},
}));

vi.mock("../worker/fiscal/fiscalWorker", () => ({
  FiscalWorker: class FiscalWorker {},
}));

describe("fiscal worker security readiness", () => {
  it("rejects missing and default ECF encryption keys before decrypting protected material", () => {
    expect(() => resolveRequiredEcfEncryptionKey({})).toThrow(/ECF_ENCRYPTION_KEY/);
    expect(() =>
      resolveRequiredEcfEncryptionKey({ ECF_ENCRYPTION_KEY: "cyberbistro-default-dev-key-32chars" })
    ).toThrow(/default encryption key/);

    expect(() => decryptPassphrase("aes256gcm:00:00:00", "")).toThrow(/ECF_ENCRYPTION_KEY/);
  });

  it("allows explicit test key injection for encrypted custody paths", () => {
    expect(resolveRequiredEcfEncryptionKey({ ECF_ENCRYPTION_KEY: "test-key-for-explicit-injection" })).toBe(
      "test-key-for-explicit-injection"
    );
    expect(decryptPassphrase("plain-passphrase", "test-key-for-explicit-injection")).toBe("plain-passphrase");
  });

  it("classifies worker credentials and refuses anon keys in every environment", () => {
    const anonJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url") +
      ".signature";
    const serviceJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url") +
      ".signature";

    expect(classifyInsforgeWorkerCredential(anonJwt)).toBe("anon");
    expect(classifyInsforgeWorkerCredential(serviceJwt)).toBe("service_role");
    expect(() => resolveFiscalWorkerCredentialFromEnv({ INSFORGE_SERVICE_ROLE_KEY: anonJwt })).toThrow(/anon/);
    expect(resolveFiscalWorkerCredentialFromEnv({ INSFORGE_SERVICE_ROLE_KEY: serviceJwt })).toBe(serviceJwt);
  });

  it("keeps the certificate validation function fail-closed without a default encryption key", () => {
    const functionSource = readFileSync(
      join(process.cwd(), "supabase", "functions", "validate-ecf-certificate", "index.ts"),
      "utf8"
    );

    expect(functionSource).toContain("Deno.env.get('ECF_ENCRYPTION_KEY')");
    expect(functionSource).toContain("ECF_ENCRYPTION_KEY is required");
    expect(functionSource).toContain("cyberbistro-default-dev-key-32chars");
    expect(functionSource).toContain("default encryption key");
  });
});
