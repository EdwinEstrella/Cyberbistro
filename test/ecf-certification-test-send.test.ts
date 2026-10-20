import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { DgiiError, type DgiiClient } from "../supabase/functions/ecf-certification/dgiiClient";
import { handleRequest, type CertificationDeps, type CertificationStore } from "../supabase/functions/ecf-certification/handler";
import { readSigningMaterial, sign } from "../supabase/functions/ecf-certification/signer";
import {
  DEFAULT_BUYER,
  buildTestInvoiceXml,
  missingIssuerFields,
  testEncf,
  type IssuerProfile,
} from "../supabase/functions/ecf-certification/testSend";
import { createTestCertificate, type TestCertificate } from "./helpers/ecfTestCertificate";
import { verifyXmlSignature } from "./helpers/xmlSignature";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const RNC = "133488485";
const KEY = `ecf-v1:${randomBytes(32).toString("base64url")}`;
const SEED = '<?xml version="1.0" encoding="utf-8"?><SemillaModel><valor>seed</valor><fecha>2026-10-20T10:00:00</fecha></SemillaModel>';
// 2026-10-20 14:30:00 UTC = 10:30:00 in Santo Domingo.
const NOW = Date.UTC(2026, 9, 20, 14, 30, 0);

const ISSUER: IssuerProfile = {
  rnc: "1-33-48848-5",
  razonSocial: "SALPIMENTAO RESTAURANT CAFE & GRILL SRL",
  direccion: "Av. Principal #1",
  sucursal: "Principal",
  municipio: "010100",
  provincia: "Distrito Nacional",
  correoEmisor: "fiscal@example.test",
  actividadEconomica: "Restaurante",
};

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

interface Sent {
  fileName: string;
  xml: string;
  token: string;
}

function fakeDgii(over: Partial<DgiiClient> = {}) {
  const sent: Sent[] = [];
  const tracked: string[] = [];
  const client: DgiiClient = {
    authenticate: async (signSeed) => {
      await signSeed(SEED);
      return { token: "SECRET-TOKEN", expiresAt: null, issuedAt: null };
    },
    sendEcf: async (token, fileName, xml) => {
      sent.push({ token, fileName, xml });
      return { httpStatus: 200, trackId: "track-123", estado: null, codigo: null, messages: [] };
    },
    sendRfce: async () => {
      throw new Error("not used");
    },
    sendCommercialApproval: async () => {
      throw new Error("not used");
    },
    trackStatus: async (_token, trackId) => {
      tracked.push(trackId);
      return { trackId, estado: "En Proceso", codigo: 3, encf: null, messages: [] };
    },
    ...over,
  };
  return { client, sent, tracked };
}

function harness(over: Partial<CertificationStore> = {}, dgii = fakeDgii()) {
  const logs: string[] = [];
  const environments: string[] = [];
  const store = {
    authenticate: async (token: string) => (token === "good" ? USER : null),
    memberships: async () => [{ tenantId: TENANT, rol: "admin" }],
    tenantIssuerProfile: async () => ISSUER,
    loadCertificate: async () => ({ p12Bytes: cert.p12Bytes, passphraseEncrypted }),
    ...over,
  } as unknown as CertificationStore;
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
    now: () => NOW,
  };
  return { deps, logs, environments, dgii };
}

function request(body: unknown): Request {
  return new Request("https://example.test/ecf-certification", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer good" },
    body: JSON.stringify(body),
  });
}

const sendTest = { action: "send-test", environment: "test" };

describe("test invoice XML", () => {
  const xml = buildTestInvoiceXml({ issuer: ISSUER, encf: "E310000000042", buyer: { ...DEFAULT_BUYER }, issuedAt: new Date(NOW) });
  const value = (name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];

  it("is an E31 with a valid eNCF and the issuer data", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado><Version>1.0</Version><IdDoc><TipoeCF>31</TipoeCF><eNCF>E310000000042</eNCF>')).toBe(true);
    expect(xml.endsWith("</DetallesItems></ECF>")).toBe(true);
    expect(value("eNCF")).toMatch(/^E31\d{10}$/);
    expect(value("FechaVencimientoSecuencia")).toBe("31-12-2028");
    expect(value("FechaEmision")).toBe("20-10-2026");
    expect(value("RNCEmisor")).toBe(RNC);
    expect(xml).toContain("<RazonSocialEmisor>SALPIMENTAO RESTAURANT CAFE &amp; GRILL SRL</RazonSocialEmisor>");
    expect(value("RNCComprador")).toBe(DEFAULT_BUYER.rnc);
    expect(value("TipoIngresos")).toBe("01");
    expect(value("TipoPago")).toBe("1");
    expect(value("IndicadorMontoGravado")).toBe("0");
    // Free-text provincia is not a DGII code: omitted; the municipio code is kept.
    expect(value("Municipio")).toBe("010100");
    expect(xml).not.toContain("<Provincia>");
  });

  it("has totals that add up (ITBIS 18%)", () => {
    const n = (name: string) => Number(value(name));
    expect(n("MontoItem")).toBe(n("MontoGravadoTotal"));
    expect(n("MontoGravadoI1")).toBe(n("MontoGravadoTotal"));
    expect(n("ITBIS1")).toBe(18);
    expect(n("TotalITBIS")).toBeCloseTo(n("MontoGravadoTotal") * 0.18, 2);
    expect(n("TotalITBIS1")).toBe(n("TotalITBIS"));
    expect(n("MontoTotal")).toBeCloseTo(n("MontoGravadoTotal") + n("TotalITBIS"), 2);
    expect(n("MontoPago")).toBe(n("MontoTotal"));
  });

  it("derives the eNCF from secuencia or the clock and validates it", () => {
    expect(testEncf(7, NOW)).toBe("E310000000007");
    expect(testEncf(undefined, NOW)).toBe(`E31${String(NOW / 1000).padStart(10, "0")}`);
    expect(() => testEncf(0, NOW)).toThrow();
    expect(() => testEncf("5", NOW)).toThrow();
  });

  it("reports missing issuer fields", () => {
    expect(missingIssuerFields(ISSUER)).toEqual([]);
    expect(missingIssuerFields({ ...ISSUER, rnc: "12", razonSocial: " ", direccion: null })).toEqual(["rnc", "razonSocial", "direccion"]);
  });
});

describe("send-test", () => {
  it("rejects every environment but test, before touching DGII or the certificate", async () => {
    for (const environment of ["certification", "production", undefined, "TEST"]) {
      const h = harness({ loadCertificate: async () => { throw new Error("must not load"); } });
      for (const action of ["send-test", "test-status"]) {
        const res = await handleRequest(request({ action, environment, trackId: "t-1" }), h.deps);
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("TEST_ENVIRONMENT_ONLY");
      }
      expect(h.environments).toEqual([]);
    }
  });

  it("signs and sends one E31 to TesteCF and returns the DGII answer", async () => {
    const h = harness();
    const res = await handleRequest(request({ ...sendTest, secuencia: 42 }), h.deps);
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body).toMatchObject({ encf: "E310000000042", trackId: "track-123", estado: "En Proceso", mensajes: [], fechaFirma: "20-10-2026 10:30:00" });
    expect(body.codigoSeguridad).toMatch(/^.{6}$/);
    expect(h.environments.every((env) => env === "test")).toBe(true);
    expect(h.dgii.sent).toHaveLength(1);
    const [sent] = h.dgii.sent;
    expect(sent.fileName).toBe(`${RNC}E310000000042.xml`);
    expect(sent.xml).toContain("<FechaHoraFirma>20-10-2026 10:30:00</FechaHoraFirma>");
    expect(sent.xml).toContain("<SignatureValue>");
    expect(verifyXmlSignature(sent.xml, cert.certPem)).toBe(true);
    expect(h.dgii.tracked).toEqual(["track-123"]);
    // Never leaks the token or the XML.
    expect(text).not.toContain("SECRET-TOKEN");
    expect(text).not.toContain("<ECF");
    expect(h.logs.join("\n")).not.toMatch(/SECRET-TOKEN|<ECF/);
  });

  it("uses a requested buyer and validates it", async () => {
    const h = harness();
    await handleRequest(request({ ...sendTest, compradorRnc: "401-00000-1", compradorRazonSocial: "OTRO CLIENTE" }), h.deps);
    expect(h.dgii.sent[0].xml).toContain("<RNCComprador>401000001</RNCComprador><RazonSocialComprador>OTRO CLIENTE</RazonSocialComprador>");
    const bad = await handleRequest(request({ ...sendTest, compradorRnc: "12" }), harness().deps);
    expect(bad.status).toBe(400);
  });

  it("answers CERTIFICATE_NOT_READY without a TesteCF certificate", async () => {
    const h = harness({ loadCertificate: async () => null });
    const res = await handleRequest(request(sendTest), h.deps);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CERTIFICATE_NOT_READY");
    expect(h.dgii.sent).toEqual([]);
  });

  it("answers ISSUER_INCOMPLETE when the tenant lacks issuer data", async () => {
    const h = harness({ tenantIssuerProfile: async () => ({ ...ISSUER, direccion: "" }) });
    const res = await handleRequest(request(sendTest), h.deps);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "ISSUER_INCOMPLETE", missing: ["direccion"] });
  });

  it("maps a DGII rejection without trackId to DGII_REJECTED with its messages", async () => {
    const dgii = fakeDgii({
      sendEcf: async () => ({ httpStatus: 400, trackId: null, estado: null, codigo: null, messages: [{ codigo: "10", valor: "RNC comprador inválido" }] }),
    });
    const res = await handleRequest(request(sendTest), harness({}, dgii).deps);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ code: "DGII_REJECTED", httpStatus: 400, mensajes: [{ codigo: "10", valor: "RNC comprador inválido" }] });
    expect(body.encf).toMatch(/^E31\d{10}$/);
  });

  it("maps DGII client failures to stable codes", async () => {
    const auth = fakeDgii({ authenticate: async () => { throw new DgiiError("unauthorized", "no", 401); } });
    expect((await (await handleRequest(request(sendTest), harness({}, auth).deps)).json()).code).toBe("DGII_AUTH_REJECTED");
    const down = fakeDgii({ sendEcf: async () => { throw new DgiiError("http", "down", 503, [{ codigo: null, valor: "Servicio no disponible" }]); } });
    const res = await handleRequest(request(sendTest), harness({}, down).deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "DGII_ERROR", messages: [{ valor: "Servicio no disponible" }] });
  });

  it("still returns the trackId when the immediate status check fails", async () => {
    const dgii = fakeDgii({ trackStatus: async () => { throw new DgiiError("timeout", "slow"); } });
    const res = await handleRequest(request(sendTest), harness({}, dgii).deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ trackId: "track-123", estado: null });
  });
});

describe("test-status", () => {
  it("queries the TesteCF status of a trackId", async () => {
    const dgii = fakeDgii({
      trackStatus: async (_token, trackId) => ({ trackId, estado: "Aceptado", codigo: 1, encf: "E310000000042", messages: [{ codigo: "0", valor: "OK" }] }),
    });
    const h = harness({}, dgii);
    const res = await handleRequest(request({ action: "test-status", environment: "test", trackId: "track-123" }), h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trackId: "track-123", estado: "Aceptado", codigo: 1, encf: "E310000000042", mensajes: [{ codigo: "0", valor: "OK" }] });
    expect(h.environments).toEqual(["test"]);
  });

  it("validates the trackId", async () => {
    for (const trackId of [undefined, "", "a b", "x".repeat(101)]) {
      const res = await handleRequest(request({ action: "test-status", environment: "test", trackId }), harness().deps);
      expect(res.status).toBe(400);
    }
  });
});
