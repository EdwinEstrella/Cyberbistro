import { describe, expect, it } from "vitest";
import {
  buildCertificateStoragePath,
  buildValidateRequest,
  extractInvokeError,
  extractInvokeErrorMessage,
  interpretValidateResponse,
  isCertificateReadyInCloud,
  validateCertificateFile,
} from "./ecfCertificateUpload";

const tenantId = "3f2b8c1e-5d4a-4b6f-8a9c-1234567890ab";
// Mirrors the edge function's tenantPathPattern.
const edgePattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/[^/]+\.p12$/i;

describe("ecfCertificateUpload", () => {
  it("builds a storage path accepted by the edge function", () => {
    const path = buildCertificateStoragePath(tenantId, "TesteCF", new Date(1700000000000));
    expect(path).toBe(`${tenantId}/testecf-1700000000000.p12`);
    expect(path.match(edgePattern)?.[1]).toBe(tenantId);
  });

  it("strips unsafe characters from the environment and rejects non-uuid tenants", () => {
    expect(buildCertificateStoragePath(tenantId, "../x/y", new Date(1))).toMatch(edgePattern);
    expect(() => buildCertificateStoragePath("not-a-uuid", "prod")).toThrow();
  });

  it("builds the request with the exact edge function field names", () => {
    expect(buildValidateRequest({ environment: " prod ", storagePath: "a/b.p12", passphrase: "pw" })).toEqual({
      environment: "prod",
      storage_path: "a/b.p12",
      passphrase: "pw",
    });
  });

  it("interprets success only when success === true", () => {
    expect(interpretValidateResponse({ success: true, subject: "X" }).ok).toBe(true);
    expect(interpretValidateResponse({ subject: "X" }).ok).toBe(false);
    expect(interpretValidateResponse(null).ok).toBe(false);
    expect(interpretValidateResponse({ error: "El certificado digital se encuentra vencido." })).toEqual({
      ok: false,
      message: "El certificado digital se encuentra vencido.",
    });
  });

  it("extracts the error message from a FunctionsHttpError-like context", async () => {
    const error = { context: new Response(JSON.stringify({ error: "Invalid certificate or passphrase." }), { status: 400 }) };
    expect(await extractInvokeErrorMessage(error)).toBe("Invalid certificate or passphrase.");
    expect(await extractInvokeErrorMessage(new Error("boom"))).toBe("No se pudo validar el certificado.");
    expect(await extractInvokeErrorMessage({ context: new Response("not json") })).toBe("No se pudo validar el certificado.");
  });

  it("keeps the error code from the edge function body", async () => {
    expect(interpretValidateResponse({ error: "x", code: "WRONG_PASSWORD" })).toEqual({ ok: false, message: "x", code: "WRONG_PASSWORD" });
    const error = { context: new Response(JSON.stringify({ error: "x", code: "INVALID_FILE" }), { status: 400 }) };
    expect(await extractInvokeError(error)).toEqual({ message: "x", code: "INVALID_FILE" });
    expect(await extractInvokeError(new Error("boom"))).toEqual({ message: "No se pudo validar el certificado." });
  });

  it("validates the selected file", () => {
    expect(validateCertificateFile({ name: "cert.p12", size: 3000 })).toBeNull();
    expect(validateCertificateFile({ name: "cert.txt", size: 3000 })).not.toBeNull();
    expect(validateCertificateFile({ name: "cert.p12", size: 0 })).not.toBeNull();
    expect(validateCertificateFile({ name: "cert.p12", size: 10 * 1024 * 1024 })).not.toBeNull();
  });

  it("reports readiness only for is_ready === true", () => {
    expect(isCertificateReadyInCloud({ is_ready: true })).toBe(true);
    expect(isCertificateReadyInCloud({ is_ready: false })).toBe(false);
    expect(isCertificateReadyInCloud(null)).toBe(false);
  });
});
