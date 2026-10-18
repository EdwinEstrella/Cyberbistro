import { createHash, randomBytes } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, handleRequest, type AuditRow, type SignDeps, type SignStore } from "../supabase/functions/ecf-sign-document/handler";
import { readSigningMaterial, sign } from "../supabase/functions/ecf-sign-document/signer";
import { createTestCertificate, type TestCertificate } from "./helpers/ecfTestCertificate";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const RNC = "133488485";
const KEY = `ecf-v1:${randomBytes(32).toString("base64url")}`;

const postulacion = (rnc = "133-488-485") =>
  `<?xml version="1.0" encoding="utf-8"?><Postulacion><PostulacionID>1</PostulacionID><Contribuyente><RNCContribuyente>${rnc}</RNCContribuyente></Contribuyente><Representante><RNCRepresentante>00112345678</RNCRepresentante></Representante></Postulacion>`;

async function encrypt(passphrase: string): Promise<string> {
  const keyBytes = Buffer.from(KEY.slice("ecf-v1:".length), "base64url");
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(passphrase)));
  const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
  return `aes256gcm:${hex(iv)}:${hex(out.slice(-16))}:${hex(out.slice(0, -16))}`;
}

let cert: TestCertificate;
let passphraseEncrypted: string;

beforeAll(async () => {
  cert = createTestCertificate({ rnc: RNC });
  passphraseEncrypted = await encrypt(cert.passphrase);
}, 60_000);

interface Harness {
  deps: SignDeps;
  audits: AuditRow[];
  logs: string[];
}

function harness(over: Partial<SignStore> = {}, depsOver: Partial<SignDeps> = {}): Harness {
  const audits: AuditRow[] = [];
  const logs: string[] = [];
  const store: SignStore = {
    authenticate: async (token) => (token === "good" ? USER : null),
    memberships: async () => [{ tenantId: TENANT, rol: "admin" }],
    tenantRnc: async () => RNC,
    loadCertificate: async () => ({ p12Bytes: cert.p12Bytes, passphraseEncrypted }),
    recordSigned: async (row) => {
      audits.push(row);
    },
    ...over,
  };
  const deps: SignDeps = {
    store,
    readSigningMaterial,
    sign,
    encryptionKey: () => KEY,
    log: (event, detail) => logs.push(`${event} ${JSON.stringify(detail ?? {})}`),
    ...depsOver,
  };
  return { deps, audits, logs };
}

function request(body: unknown, opts: { token?: string | null; method?: string; raw?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? "good"}`;
  return new Request("https://example.test/ecf-sign-document", {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "GET" ? undefined : (opts.raw ?? JSON.stringify(body)),
  });
}

const valid = (xml = postulacion()) => ({ environment: "certification", documentType: "postulacion", xml });
const codeOf = async (res: Response) => (await res.json()).code;

describe("ecf-sign-document authorization", () => {
  it("answers CORS preflight and rejects other methods", async () => {
    const h = harness();
    expect((await handleRequest(new Request("https://x.test", { method: "OPTIONS" }), h.deps)).status).toBe(200);
    expect((await handleRequest(request(null, { method: "GET", raw: undefined }), h.deps)).status).toBe(405);
  });

  it("requires a bearer token and a valid user", async () => {
    const h = harness();
    const none = await handleRequest(request(valid(), { token: null }), h.deps);
    expect(none.status).toBe(401);
    expect(await codeOf(none)).toBe("UNAUTHENTICATED");
    const bad = await handleRequest(request(valid(), { token: "bad" }), h.deps);
    expect(bad.status).toBe(401);
  });

  it("rejects users that are not tenant admins", async () => {
    const h = harness({ memberships: async () => [{ tenantId: TENANT, rol: "cajero" }] });
    const res = await handleRequest(request(valid()), h.deps);
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe("FORBIDDEN");
    expect(h.audits).toHaveLength(0);
  });

  it("does not let an admin of another tenant sign for the requested tenant", async () => {
    const h = harness({ memberships: async () => [{ tenantId: OTHER_TENANT, rol: "admin" }] });
    const res = await handleRequest(request({ ...valid(), tenantId: TENANT }), h.deps);
    expect(res.status).toBe(403);
  });

  it("asks for tenantId when the admin belongs to several tenants", async () => {
    const h = harness({
      memberships: async () => [
        { tenantId: TENANT, rol: "admin" },
        { tenantId: OTHER_TENANT, rol: "super_admin" },
      ],
    });
    const res = await handleRequest(request(valid()), h.deps);
    expect(res.status).toBe(400);
    expect((await handleRequest(request({ ...valid(), tenantId: TENANT }), h.deps)).status).toBe(200);
  });
});

describe("ecf-sign-document input safety", () => {
  it("rejects invalid JSON, environment and document type", async () => {
    const h = harness();
    expect(await codeOf(await handleRequest(request(null, { raw: "{nope" }), h.deps))).toBe("INVALID_REQUEST");
    expect(await codeOf(await handleRequest(request({ ...valid(), environment: "staging" }), h.deps))).toBe("INVALID_REQUEST");
    expect(await codeOf(await handleRequest(request({ ...valid(), documentType: "ecf" }), h.deps))).toBe("UNSUPPORTED_DOCUMENT");
  });

  it("enforces the body size cap", async () => {
    const h = harness();
    const big = "x".repeat(MAX_BODY_BYTES + 10);
    const res = await handleRequest(request(valid(`<Postulacion>${big}</Postulacion>`)), h.deps);
    expect(res.status).toBe(413);
    expect(await codeOf(res)).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects DOCTYPE, entities and processing instructions", async () => {
    const h = harness();
    for (const xml of [
      `<?xml version="1.0"?><!DOCTYPE Postulacion [<!ENTITY e SYSTEM "file:///etc/passwd">]><Postulacion>&e;</Postulacion>`,
      `<Postulacion><!ENTITY x "y"></Postulacion>`,
      `<?xml-stylesheet href="x"?><Postulacion/>`,
    ]) {
      const res = await handleRequest(request(valid(xml)), h.deps);
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe("UNSUPPORTED_DOCUMENT");
    }
    expect(h.audits).toHaveLength(0);
  });

  it("rejects malformed XML and roots outside the allow-list", async () => {
    const h = harness();
    expect(await codeOf(await handleRequest(request(valid("<Postulacion><a></Postulacion>")), h.deps))).toBe("UNSUPPORTED_DOCUMENT");
    expect(await codeOf(await handleRequest(request(valid("<ECF><RNC>133488485</RNC></ECF>")), h.deps))).toBe("UNSUPPORTED_DOCUMENT");
    const swapped = await handleRequest(request({ ...valid(), documentType: "declaracion_jurada" }), h.deps);
    expect(await codeOf(swapped)).toBe("UNSUPPORTED_DOCUMENT");
  });

  it("rejects documents that already carry a signature", async () => {
    const h = harness();
    const signed = sign(readSigningMaterial(cert.p12Bytes, cert.passphrase), postulacion(), "Postulacion");
    const res = await handleRequest(request(valid(signed)), h.deps);
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe("ALREADY_SIGNED");
  });

  it("requires the contribuyente RNC to equal the tenant RNC", async () => {
    const h = harness();
    const wrong = await handleRequest(request(valid(postulacion("101-00000-1"))), h.deps);
    expect(wrong.status).toBe(422);
    expect(await codeOf(wrong)).toBe("RNC_MISMATCH");
    const missing = await handleRequest(request(valid("<Postulacion><PostulacionID>1</PostulacionID></Postulacion>")), h.deps);
    expect(await codeOf(missing)).toBe("RNC_MISMATCH");
    const unknownTenantRnc = harness({ tenantRnc: async () => null });
    expect(await codeOf(await handleRequest(request(valid()), unknownTenantRnc.deps))).toBe("RNC_MISMATCH");
  });
});

describe("ecf-sign-document signing", () => {
  it("reports a missing certificate and an unreadable one as CERTIFICATE_NOT_READY", async () => {
    const none = harness({ loadCertificate: async () => null });
    const res = await handleRequest(request(valid()), none.deps);
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("CERTIFICATE_NOT_READY");

    const wrongPass = harness({ loadCertificate: async () => ({ p12Bytes: cert.p12Bytes, passphraseEncrypted: await encrypt("other") }) });
    expect(await codeOf(await handleRequest(request(valid()), wrongPass.deps))).toBe("CERTIFICATE_NOT_READY");
  });

  it("answers 503 NOT_CONFIGURED without the encryption key", async () => {
    const h = harness({}, { encryptionKey: () => undefined });
    const res = await handleRequest(request(valid()), h.deps);
    expect(res.status).toBe(503);
    expect(await codeOf(res)).toBe("NOT_CONFIGURED");
  });

  it("returns a valid enveloped signature, the file name, hash and an audit row without XML", async () => {
    const h = harness();
    const input = postulacion();
    const res = await handleRequest(request(valid(input)), h.deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileName).toBe(`${RNC}_postulacion_signed.xml`);
    expect(body.sha256).toBe(createHash("sha256").update(body.signedXml).digest("hex"));

    const doc = new DOMParser().parseFromString(body.signedXml, "text/xml");
    const signatures = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
    expect(signatures).toHaveLength(1);
    const verifier = new SignedXml({ publicCert: cert.certPem });
    verifier.loadSignature(signatures[0] as unknown as Node);
    expect(verifier.checkSignature(body.signedXml)).toBe(true);

    expect(h.audits).toEqual([
      {
        tenantId: TENANT,
        environment: "certification",
        documentType: "postulacion",
        rootElement: "Postulacion",
        inputSha256: createHash("sha256").update(input).digest("hex"),
        outputSha256: body.sha256,
        signedBy: USER,
      },
    ]);
    expect(JSON.stringify(h.audits)).not.toContain("<Postulacion");
    expect(h.logs.join("\n")).not.toMatch(/Postulacion>|BEGIN|test-pass/);
  });

  it("does not release the signed document when the audit insert fails", async () => {
    const h = harness({
      recordSigned: async () => {
        throw new Error("db down");
      },
    });
    const res = await handleRequest(request(valid()), h.deps);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("INTERNAL");
    expect(text).not.toContain("SignatureValue");
  });
});
