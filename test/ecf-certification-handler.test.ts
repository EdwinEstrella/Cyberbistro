import { randomBytes } from "node:crypto";
import { verifyXmlSignature } from "./helpers/xmlSignature";
import { beforeAll, describe, expect, it } from "vitest";
import { DgiiError, type DgiiClient } from "../supabase/functions/ecf-certification/dgiiClient";
import { handleRequest, type CertificationDeps, type CertificationStore } from "../supabase/functions/ecf-certification/handler";
import { readSigningMaterial, sign } from "../supabase/functions/ecf-certification/signer";
import { createTestCertificate, type TestCertificate } from "./helpers/ecfTestCertificate";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const KEY = `ecf-v1:${randomBytes(32).toString("base64url")}`;
const SEED = '<?xml version="1.0" encoding="utf-8"?><SemillaModel><valor>seed</valor><fecha>2026-10-18T10:00:00</fecha></SemillaModel>';

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
  cert = createTestCertificate({ rnc: "133488485" });
  passphraseEncrypted = await encrypt(cert.passphrase);
}, 60_000);

function fakeDgii(over: Partial<DgiiClient> = {}): { client: DgiiClient; signedSeeds: string[] } {
  const signedSeeds: string[] = [];
  const client: DgiiClient = {
    authenticate: async (signSeed) => {
      signedSeeds.push(await signSeed(SEED));
      return { token: "SECRET-TOKEN", expiresAt: "2026-10-18T11:00:00", issuedAt: "2026-10-18T10:00:00" };
    },
    sendEcf: async () => {
      throw new Error("not used");
    },
    sendRfce: async () => {
      throw new Error("not used");
    },
    trackStatus: async () => {
      throw new Error("not used");
    },
    ...over,
  };
  return { client, signedSeeds };
}

function harness(over: Partial<CertificationStore> = {}, dgii = fakeDgii()) {
  const logs: string[] = [];
  const environments: string[] = [];
  const store: CertificationStore = {
    authenticate: async (token) => (token === "good" ? USER : null),
    memberships: async () => [{ tenantId: TENANT, rol: "admin" }],
    tenantRnc: async () => "133488485",
    tenantLegalName: async () => "SALPIMENTAO RESTAURANT CAFE & GRILL SRL",
    loadCertificate: async () => ({ p12Bytes: cert.p12Bytes, passphraseEncrypted }),
    ...over,
  } as CertificationStore;
  const deps: CertificationDeps = {
    store,
    readSigningMaterial,
    sign,
    encryptionKey: () => KEY,
    dgii: (environment) => {
      environments.push(environment);
      return dgii.client;
    },
    log: (event, detail) => logs.push(`${event} ${JSON.stringify(detail ?? {})}`),
  };
  return { deps, logs, environments, dgii };
}

function request(body: unknown, token: string | null = "good"): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://example.test/ecf-certification", { method: "POST", headers, body: JSON.stringify(body) });
}

const authCheck = { action: "auth-check", environment: "certification" };

describe("ecf-certification request handling", () => {
  it("answers CORS preflight and rejects other methods", async () => {
    const h = harness();
    expect((await handleRequest(new Request("https://x.test", { method: "OPTIONS" }), h.deps)).status).toBe(200);
    expect((await handleRequest(new Request("https://x.test", { method: "GET" }), h.deps)).status).toBe(405);
  });

  it("requires a valid bearer token", async () => {
    const h = harness();
    expect((await handleRequest(request(authCheck, null), h.deps)).status).toBe(401);
    expect((await handleRequest(request(authCheck, "bad"), h.deps)).status).toBe(401);
  });

  it("rejects unknown actions, including prototype keys", async () => {
    const h = harness();
    for (const action of ["nope", "constructor", "__proto__", 5]) {
      const res = await handleRequest(request({ action, environment: "certification" }), h.deps);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_REQUEST");
    }
  });

  it("allows tenant admins only, scoped to the requested tenant", async () => {
    const cashier = harness({ memberships: async () => [{ tenantId: TENANT, rol: "cajero" }] });
    expect((await handleRequest(request(authCheck), cashier.deps)).status).toBe(403);
    const other = harness({ memberships: async () => [{ tenantId: OTHER_TENANT, rol: "admin" }] });
    expect((await handleRequest(request({ ...authCheck, tenantId: TENANT }), other.deps)).status).toBe(403);
    const multi = harness({
      memberships: async () => [
        { tenantId: TENANT, rol: "admin" },
        { tenantId: OTHER_TENANT, rol: "super_admin" },
      ],
    });
    expect((await handleRequest(request(authCheck), multi.deps)).status).toBe(400);
    expect((await handleRequest(request({ ...authCheck, tenantId: TENANT }), multi.deps)).status).toBe(200);
    expect((await handleRequest(request({ ...authCheck, tenantId: "not-a-uuid" }), multi.deps)).status).toBe(400);
  });
});

describe("auth-check", () => {
  it("signs the DGII seed with the tenant certificate and never returns the token", async () => {
    const h = harness();
    const res = await handleRequest(request(authCheck), h.deps);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, expiresAt: "2026-10-18T11:00:00" });
    expect(text).not.toContain("SECRET-TOKEN");
    expect(h.logs.join("\n")).not.toContain("SECRET-TOKEN");
    expect(h.environments).toEqual(["certification"]);
    const [signed] = h.dgii.signedSeeds;
    expect(signed).toContain("<SignatureValue>");
    expect(verifyXmlSignature(signed, cert.certPem)).toBe(true);
  });

  it("validates the environment", async () => {
    const h = harness();
    const res = await handleRequest(request({ action: "auth-check", environment: "staging" }), h.deps);
    expect(res.status).toBe(400);
  });

  it("reports a missing certificate", async () => {
    const h = harness({ loadCertificate: async () => null });
    const res = await handleRequest(request(authCheck), h.deps);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CERTIFICATE_NOT_READY");
  });

  it("reports missing custody configuration", async () => {
    const h = harness();
    h.deps.encryptionKey = () => undefined;
    const res = await handleRequest(request(authCheck), h.deps);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("NOT_CONFIGURED");
  });

  it.each([
    [new DgiiError("unauthorized", "x", 400, [{ codigo: "1", valor: "Certificado invalido" }]), 502, "DGII_AUTH_REJECTED"],
    [new DgiiError("timeout", "x"), 504, "DGII_TIMEOUT"],
    [new DgiiError("network", "x"), 502, "DGII_UNAVAILABLE"],
    [new DgiiError("http", "x", 503), 502, "DGII_ERROR"],
  ])("maps DGII failures (%s)", async (error, status, code) => {
    const h = harness(
      {},
      fakeDgii({
        authenticate: async () => {
          throw error;
        },
      }),
    );
    const res = await handleRequest(request(authCheck), h.deps);
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.code).toBe(code);
    if (code === "DGII_AUTH_REJECTED") expect(body.messages).toEqual([{ codigo: "1", valor: "Certificado invalido" }]);
  });
});
