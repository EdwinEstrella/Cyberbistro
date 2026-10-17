import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { Signature } from "dgii-ecf";
import { handleRequest, type ReceivedApprovalRow, type ReceivedDocumentRow, type ReceptorDeps, type ReceptorStore } from "../supabase/functions/ecf-receptor/handler";
import { sha256Hex } from "../supabase/functions/ecf-receptor/protocol";
import { xmlSecurity } from "../supabase/functions/ecf-receptor/security";
import { createTestCertificate, type TestCertificate } from "./helpers/ecfTestCertificate";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_RNC = "130862346"; // RNCComprador of the dgii-ecf sample invoice
const BASE = "https://cloudix-ecf.azokia.com";
// The dgii-ecf sample is already signed by its emitter; strip that signature so tests sign it themselves.
const sampleEcf = readFileSync("modulo-ecf/src/senderReceiver/__tests__/sample/invoice_received.xml", "utf8").replace(/<Signature[\s\S]*<\/Signature>/, "").trim();

function newKey(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return "ecf-v1:" + btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function encryptPassphrase(passphrase: string, keyText: string): Promise<string> {
  const b64 = keyText.slice(7).replace(/-/g, "+").replace(/_/g, "/") + "=";
  const keyBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(passphrase)));
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `aes256gcm:${hex(iv)}:${hex(out.slice(-16))}:${hex(out.slice(0, -16))}`;
}

class MemoryStore implements ReceptorStore {
  seeds = new Map<string, { expiresAt: Date; consumed: boolean }>();
  tokens = new Map<string, Date>();
  documents: ReceivedDocumentRow[] = [];
  approvals: ReceivedApprovalRow[] = [];
  certificate: { p12Bytes: Uint8Array; passphraseEncrypted: string } | null = null;
  forceDuplicateOnce = false;
  async resolveTenant(rnc: string) {
    return rnc === TENANT_RNC ? TENANT_ID : null;
  }
  async createSeed(_t: string, hash: string, expiresAt: Date) {
    this.seeds.set(hash, { expiresAt, consumed: false });
  }
  async consumeSeed(_t: string, hash: string, now: Date) {
    const seed = this.seeds.get(hash);
    if (!seed || seed.consumed || seed.expiresAt <= now) return false;
    seed.consumed = true;
    return true;
  }
  async createToken(_t: string, hash: string, expiresAt: Date) {
    this.tokens.set(hash, expiresAt);
  }
  async findTokenTenant(hash: string, now: Date) {
    const expires = this.tokens.get(hash);
    return expires && expires > now ? TENANT_ID : null;
  }
  async hasAcceptedDocument(_t: string, emisor: string, encf: string) {
    return this.documents.some((d) => d.estado === 0 && d.emisorRnc === emisor && d.encf === encf);
  }
  async insertDocument(row: ReceivedDocumentRow) {
    if (this.forceDuplicateOnce && row.estado === 0) {
      this.forceDuplicateOnce = false;
      return "duplicate" as const;
    }
    this.documents.push(row);
    return "inserted" as const;
  }
  async insertApproval(row: ReceivedApprovalRow) {
    this.approvals.push(row);
  }
  async loadCertificate() {
    return this.certificate;
  }
}

let cert: TestCertificate;
let remoteCert: TestCertificate; // the "other" taxpayer (DGII or an emitter)
let keyText: string;
let clock: Date;

beforeAll(() => {
  cert = createTestCertificate();
  remoteCert = createTestCertificate({ passphrase: "other" });
  keyText = newKey();
}, 60_000);

function makeDeps(store: MemoryStore, overrides: Partial<ReceptorDeps> = {}): ReceptorDeps {
  return {
    store,
    security: xmlSecurity,
    now: () => clock,
    encryptionKey: () => keyText,
    log: () => undefined,
    ...overrides,
  };
}

function sign(xml: string, root: string, from: TestCertificate = remoteCert): string {
  return new Signature(from.keyPem, from.certPem).signXml(xml, root);
}

function multipart(xml: string, filename = "payload.xml"): { body: FormData } {
  const form = new FormData();
  form.append("xml", new Blob([xml], { type: "text/xml" }), filename);
  return { body: form };
}

async function login(store: MemoryStore): Promise<string> {
  const seedRes = await handleRequest(new Request(`${BASE}/ecf-receptor/${TENANT_RNC}/fe/autenticacion/api/semilla`), makeDeps(store));
  const signedSeed = sign(await seedRes.text(), "SemillaModel");
  const tokenRes = await handleRequest(
    new Request(`${BASE}/ecf-receptor/${TENANT_RNC}/fe/autenticacion/api/ValidacionCertificado`, { method: "POST", ...multipart(signedSeed, "seed.xml") }),
    makeDeps(store),
  );
  expect(tokenRes.status).toBe(200);
  return (await tokenRes.json()).token;
}

async function freshStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  store.certificate = { p12Bytes: cert.p12Bytes, passphraseEncrypted: await encryptPassphrase(cert.passphrase, keyText) };
  clock = new Date();
  return store;
}

const receive = (token: string | null, xml: string) =>
  new Request(`${BASE}/ecf-receptor/${TENANT_RNC}/fe/recepcion/api/ecf`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...multipart(xml, "131880738E310000000007.xml"),
  });

describe("authentication flow", () => {
  it("serves a SemillaModel seed and exchanges a signed seed for a token exactly once", async () => {
    const store = await freshStore();
    const seedRes = await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/semilla`), makeDeps(store));
    expect(seedRes.status).toBe(200);
    expect(seedRes.headers.get("content-type")).toContain("application/xml");
    const seedXml = await seedRes.text();
    expect(seedXml).toContain("<SemillaModel");
    const signedSeed = sign(seedXml, "SemillaModel");

    const post = () =>
      handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/validacioncertificado`, { method: "POST", ...multipart(signedSeed) }), makeDeps(store));
    const first = await post();
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(Object.keys(body).sort()).toEqual(["expedido", "expira", "token"]);
    expect([...store.tokens.keys()]).toEqual([await sha256Hex(body.token)]);

    const replay = await post();
    expect(replay.status).toBe(401);
    expect((await replay.json()).code).toBe("INVALID_SEED");
  });

  it("also accepts a raw XML body", async () => {
    const store = await freshStore();
    const seedXml = await (await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/semilla`), makeDeps(store))).text();
    const res = await handleRequest(
      new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/validacioncertificado`, { method: "POST", headers: { "content-type": "application/xml" }, body: sign(seedXml, "SemillaModel") }),
      makeDeps(store),
    );
    expect(res.status).toBe(200);
  });

  it("rejects an unknown seed, a tampered seed, an unsigned seed and an expired seed", async () => {
    const store = await freshStore();
    const seedXml = await (await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/semilla`), makeDeps(store))).text();
    const call = (xml: string) =>
      handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/validacioncertificado`, { method: "POST", ...multipart(xml) }), makeDeps(store));

    const foreign = sign(seedXml.replace(/<valor>[^<]*/, "<valor>" + "Z".repeat(40)), "SemillaModel");
    expect((await call(foreign)).status).toBe(401);
    expect((await call(seedXml)).status).toBe(401); // unsigned
    const tampered = sign(seedXml, "SemillaModel").replace(/<fecha>[^<]*/, "<fecha>tampered");
    expect((await call(tampered)).status).toBe(401);

    const signed = sign(seedXml, "SemillaModel");
    clock = new Date(clock.getTime() + 6 * 60 * 1000);
    const expired = await call(signed);
    expect(expired.status).toBe(401);
    expect(store.tokens.size).toBe(0);
  });

  it("rejects a signer whose certificate is expired", async () => {
    const store = await freshStore();
    const old = createTestCertificate({ notBefore: new Date("2020-01-01"), notAfter: new Date("2021-01-01") });
    const seedXml = await (await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/semilla`), makeDeps(store))).text();
    const res = await handleRequest(
      new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/validacioncertificado`, { method: "POST", ...multipart(sign(seedXml, "SemillaModel", old)) }),
      makeDeps(store),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown taxpayers and paths, and 405 for wrong methods", async () => {
    const store = await freshStore();
    expect((await handleRequest(new Request(`${BASE}/999999999/fe/autenticacion/api/semilla`), makeDeps(store))).status).toBe(404);
    expect((await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/other`), makeDeps(store))).status).toBe(404);
    expect((await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/semilla`, { method: "POST" }), makeDeps(store))).status).toBe(405);
  });
});

describe("reception", () => {
  it("requires the bearer token", async () => {
    const store = await freshStore();
    expect((await handleRequest(receive(null, sign(sampleEcf, "ECF")), makeDeps(store))).status).toBe(401);
    expect((await handleRequest(receive("x".repeat(43), sign(sampleEcf, "ECF")), makeDeps(store))).status).toBe(401);
  });

  it("accepts a signed e-CF, returns an ARECF signed by the tenant certificate and stores it", async () => {
    const store = await freshStore();
    const token = await login(store);
    const res = await handleRequest(receive(token, sign(sampleEcf, "ECF")), makeDeps(store));
    expect(res.status).toBe(200);
    const arecf = await res.text();
    expect(arecf).toContain("<Estado>0</Estado>");
    expect(arecf).toContain("<RNCEmisor>131880738</RNCEmisor>");
    expect(arecf).toContain(`<RNCComprador>${TENANT_RNC}</RNCComprador>`);
    expect(arecf).toContain("<eNCF>E310000000007</eNCF>");
    expect(arecf).not.toContain("CodigoMotivoNoRecibido");
    // Signed by the tenant certificate (not the emitter's), and the signature verifies.
    expect(xmlSecurity.verify(arecf, clock)).toEqual({ valid: true });
    expect(arecf).toContain(cert.certPem.replace(/-----[A-Z ]+-----|\s/g, "").slice(0, 60));
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0]).toMatchObject({ estado: 0, motivoNoRecibido: null, emisorRnc: "131880738", encf: "E310000000007", tipoEcf: "31" });
  });

  it("answers code 3 (duplicate) on resubmission and keeps one accepted document", async () => {
    const store = await freshStore();
    const token = await login(store);
    const signed = sign(sampleEcf, "ECF");
    await handleRequest(receive(token, signed), makeDeps(store));
    const second = await (await handleRequest(receive(token, signed), makeDeps(store))).text();
    expect(second).toContain("<Estado>1</Estado>");
    expect(second).toContain("<CodigoMotivoNoRecibido>3</CodigoMotivoNoRecibido>");
    expect(store.documents.filter((d) => d.estado === 0)).toHaveLength(1);
  });

  it("handles a unique-violation race by answering duplicate", async () => {
    const store = await freshStore();
    const token = await login(store);
    store.forceDuplicateOnce = true;
    const body = await (await handleRequest(receive(token, sign(sampleEcf, "ECF")), makeDeps(store))).text();
    expect(body).toContain("<CodigoMotivoNoRecibido>3</CodigoMotivoNoRecibido>");
    expect(store.documents.map((d) => d.estado)).toEqual([1]);
  });

  it("answers code 2 for a broken signature and code 1 for an unsigned or malformed document", async () => {
    const store = await freshStore();
    const token = await login(store);
    const broken = sign(sampleEcf, "ECF").replace("<MontoTotal>7080.00", "<MontoTotal>1.00");
    expect(await (await handleRequest(receive(token, broken), makeDeps(store))).text()).toContain("<CodigoMotivoNoRecibido>2</CodigoMotivoNoRecibido>");
    expect(await (await handleRequest(receive(token, sampleEcf), makeDeps(store))).text()).toContain("<CodigoMotivoNoRecibido>2</CodigoMotivoNoRecibido>");
    expect(await (await handleRequest(receive(token, "<ECF><nope/></ECF>"), makeDeps(store))).text()).toContain("<CodigoMotivoNoRecibido>1</CodigoMotivoNoRecibido>");
    expect(store.documents.every((d) => d.estado === 1)).toBe(true);
  });

  it("answers code 4 when RNCComprador is another taxpayer", async () => {
    const store = await freshStore();
    const token = await login(store);
    const other = sign(sampleEcf.replace("<RNCComprador>130862346", "<RNCComprador>101010101"), "ECF");
    expect(await (await handleRequest(receive(token, other), makeDeps(store))).text()).toContain("<CodigoMotivoNoRecibido>4</CodigoMotivoNoRecibido>");
  });

  it("fails closed without storing when the certificate or encryption key is unavailable", async () => {
    const store = await freshStore();
    const token = await login(store);
    const signed = sign(sampleEcf, "ECF");

    const noKey = await handleRequest(receive(token, signed), makeDeps(store, { encryptionKey: () => undefined }));
    expect(noKey.status).toBe(503);
    const noKeyBody = await noKey.json();
    expect(noKeyBody.code).toBe("NOT_CONFIGURED");
    expect(JSON.stringify(noKeyBody)).not.toContain("ecf-v1");

    store.certificate = null;
    const noCert = await handleRequest(receive(token, signed), makeDeps(store));
    expect(noCert.status).toBe(503);
    expect((await noCert.json()).code).toBe("CERTIFICATE_UNAVAILABLE");
    expect(store.documents).toHaveLength(0);
  });

  it("does not leak internals on unexpected failures", async () => {
    const store = await freshStore();
    store.resolveTenant = async () => {
      throw new Error("secret connection string");
    };
    const res = await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/semilla`), makeDeps(store));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });

  it("rejects oversized payloads", async () => {
    const store = await freshStore();
    const token = await login(store);
    const res = await handleRequest(
      new Request(`${BASE}/${TENANT_RNC}/fe/recepcion/api/ecf`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/xml", "content-length": String(6 * 1024 * 1024) }, body: "<ECF/>" }),
      makeDeps(store),
    );
    expect(res.status).toBe(413);
  });
});

describe("commercial approval", () => {
  const acecf = (emisor = TENANT_RNC, estado = "1") =>
    `<ACECF><DetalleAprobacionComercial><Version>1.0</Version><RNCEmisor>${emisor}</RNCEmisor><eNCF>E310000000007</eNCF><FechaEmision>01-01-2026</FechaEmision><MontoTotal>100.00</MontoTotal><RNCComprador>131880738</RNCComprador><Estado>${estado}</Estado><FechaHoraAprobacionComercial>01-01-2026 10:00:00</FechaHoraAprobacionComercial></DetalleAprobacionComercial></ACECF>`;
  const approve = (token: string | null, xml: string) =>
    new Request(`${BASE}/ecf-receptor/${TENANT_RNC}/fe/aprobacioncomercial/api/ecf`, { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, ...multipart(xml) });

  it("stores a signed approval for an e-CF the tenant issued", async () => {
    const store = await freshStore();
    const token = await login(store);
    const res = await handleRequest(approve(token, sign(acecf(), "ACECF")), makeDeps(store));
    expect(res.status).toBe(200);
    expect(store.approvals).toEqual([expect.objectContaining({ emisorRnc: TENANT_RNC, encf: "E310000000007", estado: 1 })]);
  });

  it("rejects unauthenticated, unsigned and foreign approvals", async () => {
    const store = await freshStore();
    const token = await login(store);
    expect((await handleRequest(approve(null, sign(acecf(), "ACECF")), makeDeps(store))).status).toBe(401);
    const unsigned = await handleRequest(approve(token, acecf()), makeDeps(store));
    expect((await unsigned.json()).code).toBe("SIGNATURE");
    const foreign = await handleRequest(approve(token, sign(acecf("111111111"), "ACECF")), makeDeps(store));
    expect((await foreign.json()).code).toBe("RNC_MISMATCH");
    expect(store.approvals).toHaveLength(0);
  });
});
