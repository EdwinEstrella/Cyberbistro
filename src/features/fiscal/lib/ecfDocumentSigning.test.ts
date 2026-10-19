import { describe, expect, it } from "vitest";
import {
  ECF_SIGN_MAX_BYTES,
  buildSignRequest,
  describeSigningError,
  extractSignInvokeError,
  interpretSignResponse,
  resolveSignedFileName,
  validateXmlFile,
} from "./ecfDocumentSigning";

describe("validateXmlFile", () => {
  it("accepts a normal xml file", () => {
    expect(validateXmlFile({ name: "Postulacion.XML", size: 1200 })).toBeNull();
  });

  it("rejects other extensions, empty and oversized files", () => {
    expect(validateXmlFile({ name: "cert.p12", size: 10 })).toMatch(/\.xml/);
    expect(validateXmlFile({ name: "a.xml", size: 0 })).toMatch(/vacío/);
    expect(validateXmlFile({ name: "a.xml", size: ECF_SIGN_MAX_BYTES + 1 })).toMatch(/grande/);
  });
});

describe("buildSignRequest", () => {
  it("includes tenantId only when present", () => {
    const base = { environment: "certification", documentType: "postulacion", xml: "<a/>" } as const;
    expect(buildSignRequest(base)).toEqual(base);
    expect(buildSignRequest({ ...base, tenantId: "t-1" })).toEqual({ ...base, tenantId: "t-1" });
  });
});

describe("interpretSignResponse", () => {
  it("returns the signed document on success", () => {
    expect(interpretSignResponse({ signedXml: "<a>signed</a>", fileName: "1_postulacion_signed.xml", sha256: "ab" })).toEqual({
      ok: true,
      signedXml: "<a>signed</a>",
      fileName: "1_postulacion_signed.xml",
      sha256: "ab",
    });
  });

  it("falls back to a default file name", () => {
    const outcome = interpretSignResponse({ signedXml: "<a/>" });
    expect(outcome.ok && outcome.fileName).toBe("documento_firmado.xml");
  });

  it("maps known codes to Spanish messages and keeps the code", () => {
    const outcome = interpretSignResponse({ error: "The document RNC does not match the tenant.", code: "RNC_MISMATCH" });
    expect(outcome).toMatchObject({ ok: false, code: "RNC_MISMATCH" });
    expect(!outcome.ok && outcome.message).toMatch(/RNC/);
  });

  it("never reports success without signedXml", () => {
    expect(interpretSignResponse(null)).toMatchObject({ ok: false });
    expect(interpretSignResponse({ signedXml: "  " })).toMatchObject({ ok: false });
  });
});

describe("describeSigningError", () => {
  it("covers every server error code", () => {
    for (const code of ["UNAUTHENTICATED", "FORBIDDEN", "PAYLOAD_TOO_LARGE", "UNSUPPORTED_DOCUMENT", "ALREADY_SIGNED", "RNC_MISMATCH", "CERTIFICATE_NOT_READY", "NOT_CONFIGURED", "INVALID_REQUEST", "INTERNAL"]) {
      expect(describeSigningError(code, "server text")).not.toBe("server text");
    }
  });

  it("uses the server text or a generic message for unknown codes", () => {
    expect(describeSigningError("WEIRD", "server text")).toBe("server text");
    expect(describeSigningError(undefined)).toMatch(/No se pudo firmar/);
  });
});

describe("extractSignInvokeError", () => {
  it("reads code and message from the raw response of a FunctionsHttpError", async () => {
    const error = { context: new Response(JSON.stringify({ error: "x", code: "CERTIFICATE_NOT_READY" }), { status: 409 }) };
    const outcome = await extractSignInvokeError(error);
    expect(outcome.code).toBe("CERTIFICATE_NOT_READY");
    expect(outcome.message).toMatch(/certificado/);
  });

  it("falls back when the body is unreadable", async () => {
    expect((await extractSignInvokeError(new Error("network"))).message).toMatch(/No se pudo firmar/);
    expect((await extractSignInvokeError({ context: new Response("not json") })).message).toMatch(/No se pudo firmar/);
  });
});

describe("resolveSignedFileName", () => {
  it("keeps a safe server name", () => {
    expect(resolveSignedFileName("133488485_postulacion_signed.xml", "x.xml")).toBe("133488485_postulacion_signed.xml");
  });

  it("derives a name from the original file otherwise", () => {
    expect(resolveSignedFileName("../evil", "Mi postulación.xml")).toBe("Mi_postulaci_n_firmado.xml");
    expect(resolveSignedFileName("", ".xml")).toBe("documento_firmado.xml");
  });
});
