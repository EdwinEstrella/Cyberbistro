import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { decryptPassphrase, resolveRequiredEcfEncryptionKey } from "../worker/fiscal/crypto";
import {
  classifySupabaseWorkerCredential,
  resolveFiscalWorkerCredentialFromEnv,
  resolveFiscalWorkerSupabaseUrlFromEnv,
} from "../worker/fiscal/fiscalWorkerRuntime";

const validEcfKey = "ecf-v1:ABEiM0RVZneImaq7zN3u_wARIjNEVWZ3iJmqu8zd7v8";

vi.mock("../worker/fiscal/dgiiAdapters", () => ({
  RealDgiiClient: class RealDgiiClient {},
  RealXmlSigner: class RealXmlSigner {},
}));

vi.mock("../worker/fiscal/fiscalWorker", () => ({
  FiscalWorker: class FiscalWorker {},
}));

describe("fiscal worker security readiness", () => {
  it("rejects missing, legacy, trivial, and malformed ECF encryption keys before decrypting protected material", () => {
    expect(() => resolveRequiredEcfEncryptionKey({})).toThrow(/ECF_ENCRYPTION_KEY/);
    expect(() =>
      resolveRequiredEcfEncryptionKey({ ECF_ENCRYPTION_KEY: "cyberbistro-default-dev-key-32chars" })
    ).toThrow(/ecf-v1/);
    expect(() => resolveRequiredEcfEncryptionKey({ ECF_ENCRYPTION_KEY: "ecf-v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })).toThrow(/non-uniform/);
    expect(() => resolveRequiredEcfEncryptionKey({ ECF_ENCRYPTION_KEY: "ecf-v1:short" })).toThrow(/ecf-v1/);

    expect(() => decryptPassphrase("aes256gcm:00:00:00", "")).toThrow(/ECF_ENCRYPTION_KEY/);
  });

  it("accepts a versioned 32-byte base64url key for encrypted custody paths", () => {
    expect(resolveRequiredEcfEncryptionKey({ ECF_ENCRYPTION_KEY: validEcfKey })).toBe(validEcfKey);
    expect(decryptPassphrase("plain-passphrase", validEcfKey)).toBe("plain-passphrase");
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

    expect(classifySupabaseWorkerCredential(anonJwt)).toBe("anon");
    expect(classifySupabaseWorkerCredential(serviceJwt)).toBe("service_role");
    expect(() => resolveFiscalWorkerCredentialFromEnv({ SUPABASE_SERVICE_ROLE_KEY: anonJwt })).toThrow(/anon/);
    expect(resolveFiscalWorkerCredentialFromEnv({ SUPABASE_SERVICE_ROLE_KEY: serviceJwt })).toBe(serviceJwt);
  });

  it("fails before initializing certificate storage without a valid Supabase URL", () => {
    expect(() => resolveFiscalWorkerSupabaseUrlFromEnv({})).toThrow(/SUPABASE_URL/);
    expect(() => resolveFiscalWorkerSupabaseUrlFromEnv({ SUPABASE_URL: "http://localhost" })).toThrow(/SUPABASE_URL/);
    expect(resolveFiscalWorkerSupabaseUrlFromEnv({ SUPABASE_URL: "https://cloudix-db.example.com" })).toBe("https://cloudix-db.example.com");
  });

  it("requires authenticated administrative access to a tenant-scoped certificate object", () => {
    const functionSource = readFileSync(
      join(process.cwd(), "supabase", "functions", "validate-ecf-certificate", "index.ts"),
      "utf8"
    );

    expect(functionSource).toContain('authClient.auth.getUser(token)');
    expect(functionSource).toContain('.eq("auth_user_id", authData.user.id)');
    expect(functionSource).toContain('.eq("activo", true)');
    expect(functionSource).toContain('tenantIdFromStoragePath(storagePath)');
    expect(functionSource).toContain('["admin", "super_admin"].includes(membership.rol)');
    expect(functionSource).toContain('requiredEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(functionSource).toContain('requiredEnv("SUPABASE_PUBLISHABLE_KEY")');
    expect(functionSource.indexOf('authClient.auth.getUser(token)')).toBeLessThan(functionSource.indexOf('requiredEnv("SUPABASE_SERVICE_ROLE_KEY")'));
    expect(functionSource).toContain('ecf-v1:<base64url-32-byte-key>');
    expect(functionSource).not.toContain('tenant_id, environment, storage_path, passphrase');
    expect(functionSource).not.toContain('cyberbistro-default-dev-key-32chars');
  });
});
