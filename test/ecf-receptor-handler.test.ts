import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { Signature } from "dgii-ecf";
import {
  handleRequest,
  type ReceivedApprovalRow,
  type ReceivedDocumentRow,
  type ReceptorDeps,
  type ReceptorStore,
  type TokenInfo,
} from "../supabase/functions/ecf-receptor/handler";
import { sha256Hex } from "../supabase/functions/ecf-receptor/protocol";
import { createXmlSecurity } from "../supabase/functions/ecf-receptor/security";
import { createTestCa, createTestCertificate, type TestCa, type TestCertificate } from "./helpers/ecfTestCertificate";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_RNC = "130862346"; // RNCComprador of the dgii-ecf sample invoice
const EMITTER_RNC = "131880738"; // RNCEmisor of the sample invoice (and buyer in the sample ACECF)
const BASE = "https://cloudix-ecf.azokia.com";
// The dgii-ecf sample is already signed by its emitter; strip that signature so tests sign it themselves.
const sampleEcf = readFileSync("modulo-ecf/src/senderReceiver/__tests__/sample/invoice_received.xml", "utf8")
  .replace(/<Signature[\s\S]*<\/Signature>/, "")
  .trim();

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
  calls: string[] = [];
  consumed = new Set<string>();
  tokens = new Map<string, { expires: Date; subjectIds: string[]; tenantId: string }>();
  documents: ReceivedDocumentRow[] = [];
  approvals = new Map<string, ReceivedApprovalRow>();
  certificate: { p12Bytes: Uint8Array; passphraseEncrypted: string } | null = null;
  forceDuplicateOnce = false;
  async resolveTenant(rnc: string) {
    this.calls.push("resolveTenant");
    return rnc === TENANT_RNC ? TENANT_ID : null;
  }
  async consumeSeed(_t: string, hash: string) {
    this.calls.push("consumeSeed");
    if (this.consumed.has(hash)) return false;
    this.consumed.add(hash);
    return true;
  }
  async createToken(tenantId: string, hash: string, expires: Date, subjectIds: string[]) {
    this.calls.push("createToken");
    this.tokens.set(hash, { expires, subjectIds, tenantId });
  }
  async findToken(hash: string, now: Date): Promise<TokenInfo | null> {
    const token = this.tokens.get(hash);
    return token && token.expires > now ? { tenantId: token.tenantId, subjectIds: token.subjectIds } : null;
  }
  async hasAcceptedDocument(_t: string, emisor: string, encf: string) {
    return this.documents.some((d) => d.estado === 0 && d.emisorRnc === emisor && d.encf === encf);
  }
  async insertDocument(row: ReceivedDocumentRow) {
    if (this.forceDuplicateOnce && row.estado === 0) {
      this.forceDuplicateOnce = false;
      return "duplicate" as const;
    }
    // Mirrors ecf_received_documents_rejected_uidx.
    if (row.estado === 1 && this.documents.some((d) => d.estado === 1 && d.xmlSha256 === row.xmlSha256 && d.motivoNoRecibido === row.motivoNoRecibido)) {
      return "duplicate" as const;
    }
    this.documents.push(row);
    return "inserted" as const;
  }
  async upsertApproval(row: ReceivedApprovalRow) {
    this.approvals.set(`${row.emisorRnc}|${row.encf}`, row);
  }
  async loadCertificate() {
    return this.certificate;
  }
}

let ca: TestCa;
let otherCa: TestCa;
let emitter: TestCertificate; // trusted chain, asserts EMITTER_RNC
let tenantCert: TestCertificate; // the tenant's own custodied certificate
let keyText: string;
let clock: Date;
let security: ReturnType<typeof createXmlSecurity>;

beforeAll(() => {
  ca = createTestCa("Test Root A");
  otherCa = createTestCa("Test Root B");
  emitter = createTestCertificate({ ca, rnc: EMITTER_RNC });
  tenantCert = createTestCertificate({ rnc: TENANT_RNC });
  keyText = newKey();
  security = createXmlSecurity({ trustedCaPems: [ca.certPem] });
}, 90_000);

function makeDeps(store: MemoryStore, overrides: Partial<ReceptorDeps> = {}): ReceptorDeps {
  return {
    store,
    security,
    now: () => clock,
    encryptionKey: () => keyText,
    seedSecret: () => "test-seed-secret",
    log: () => undefined,
    ...overrides,
  };
}

function sign(xml: string, root: string, from: TestCertificate = emitter): string {
  return new Signature(from.keyPem, from.certPem).signXml(xml, root);
}

function multipart(xml: string, filename = "payload.xml"): { body: FormData } {
  const form = new FormData();
  form.append("xml", new Blob([xml], { type: "text/xml" }), filename);
  return { body: form };
}

const seedUrl = (rnc = TENANT_RNC) => `${BASE}/ecf-receptor/${rnc}/fe/autenticacion/api/semilla`;
const validateUrl = (rnc = TENANT_RNC) => `${BASE}/ecf-receptor/${rnc}/fe/autenticacion/api/ValidacionCertificado`;

async function fetchSeed(store: MemoryStore, rnc = TENANT_RNC): Promise<string> {
  return await (await handleRequest(new Request(seedUrl(rnc)), makeDeps(store))).text();
}

async function exchange(store: MemoryStore, signedSeed: string, rnc = TENANT_RNC): Promise<Response> {
  return handleRequest(new Request(validateUrl(rnc), { method: "POST", ...multipart(signedSeed, "seed.xml") }), makeDeps(store));
}

async function login(store: MemoryStore, from: TestCertificate = emitter): Promise<string> {
  const res = await exchange(store, sign(await fetchSeed(store), "SemillaModel", from));
  expect(res.status).toBe(200);
  return (await res.json()).token;
}

async function freshStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  store.certificate = { p12Bytes: tenantCert.p12Bytes, passphraseEncrypted: await encryptPassphrase(tenantCert.passphrase, keyText) };
  clock = new Date();
  return store;
}

const receive = (token: string | null, xml: string, rnc = TENANT_RNC) =>
  new Request(`${BASE}/ecf-receptor/${rnc}/fe/recepcion/api/ecf`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...multipart(xml, "131880738E310000000007.xml"),
  });

describe("authentication flow", () => {
  it("serves a stateless SemillaModel seed (no storage touched) and exchanges a signed seed for a token exactly once", async () => {
    const store = await freshStore();
    const seedRes = await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/autenticacion/api/semilla`), makeDeps(store));
    expect(seedRes.status).toBe(200);
    expect(seedRes.headers.get("content-type")).toContain("application/xml");
    const seedXml = await seedRes.text();
    expect(seedXml).toContain("<SemillaModel");
    expect(store.calls).toEqual([]);

    const signedSeed = sign(seedXml, "SemillaModel");
    const first = await exchange(store, signedSeed);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(Object.keys(body).sort()).toEqual(["expedido", "expira", "token"]);
    const stored = store.tokens.get(await sha256Hex(body.token));
    expect(stored?.subjectIds).toEqual([EMITTER_RNC]);

    const replay = await exchange(store, signedSeed);
    expect(replay.status).toBe(401);
    expect((await replay.json()).code).toBe("UNAUTHENTICATED");
  });

  it("also accepts a raw XML body", async () => {
    const store = await freshStore();
    const signed = sign(await fetchSeed(store), "SemillaModel");
    const res = await handleRequest(
      new Request(validateUrl(), { method: "POST", headers: { "content-type": "application/xml" }, body: signed }),
      makeDeps(store),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a self-signed certificate (the forged-token attack)", async () => {
    const store = await freshStore();
    const attacker = createTestCertificate({ rnc: EMITTER_RNC }); // claims the right RNC, but nobody vouches for it
    const res = await exchange(store, sign(await fetchSeed(store), "SemillaModel", attacker));
    expect(res.status).toBe(401);
    expect(store.tokens.size).toBe(0);
  });

  it("rejects a certificate issued by an untrusted CA, and one with no RNC", async () => {
    const store = await freshStore();
    const untrusted = createTestCertificate({ ca: otherCa, rnc: EMITTER_RNC });
    expect((await exchange(store, sign(await fetchSeed(store), "SemillaModel", untrusted))).status).toBe(401);
    const noRnc = createTestCertificate({ ca });
    expect((await exchange(store, sign(await fetchSeed(store), "SemillaModel", noRnc))).status).toBe(401);
    expect(store.tokens.size).toBe(0);
  });

  it("fails closed when the trust store is empty", async () => {
    const store = await freshStore();
    const res = await exchange(store, sign(await fetchSeed(store), "SemillaModel"));
    const empty = await handleRequest(
      new Request(validateUrl(), { method: "POST", ...multipart(sign(await fetchSeed(store), "SemillaModel")) }),
      makeDeps(store, { security: createXmlSecurity({ trustedCaPems: [] }) }),
    );
    expect(res.status).toBe(200);
    expect(empty.status).toBe(401);
  });

  it("rejects unknown, tampered, unsigned, expired and cross-taxpayer seeds", async () => {
    const store = await freshStore();
    const seedXml = await fetchSeed(store);

    const foreign = sign(seedXml.replace(/<valor>[^<]*/, "<valor>" + "Z".repeat(40)), "SemillaModel");
    expect((await exchange(store, foreign)).status).toBe(401);
    expect((await exchange(store, seedXml)).status).toBe(401); // unsigned
    const tampered = sign(seedXml, "SemillaModel").replace(/<fecha>[^<]*/, "<fecha>tampered");
    expect((await exchange(store, tampered)).status).toBe(401);

    const signed = sign(seedXml, "SemillaModel");
    // A seed issued for another RNC cannot be redeemed here.
    const otherSeed = sign(await fetchSeed(store, "999999999"), "SemillaModel");
    expect((await exchange(store, otherSeed)).status).toBe(401);

    clock = new Date(clock.getTime() + 6 * 60 * 1000);
    expect((await exchange(store, signed)).status).toBe(401);
    expect(store.tokens.size).toBe(0);
  });

  it("rejects a signer whose certificate is expired", async () => {
    const store = await freshStore();
    const old = createTestCertificate({ ca, rnc: EMITTER_RNC, notBefore: new Date("2020-01-01"), notAfter: new Date("2021-01-01") });
    expect((await exchange(store, sign(await fetchSeed(store), "SemillaModel", old))).status).toBe(401);
  });

  it("does not reveal whether a taxpayer exists", async () => {
    const store = await freshStore();
    // Unknown RNC still gets a seed...
    const unknownSeed = await handleRequest(new Request(seedUrl("999999999")), makeDeps(store));
    expect(unknownSeed.status).toBe(200);
    // ...which can never be exchanged, with the exact same answer as any other failed login.
    const unknown = await exchange(store, sign(await unknownSeed.text(), "SemillaModel"), "999999999");
    const bad = await exchange(store, sign(await fetchSeed(store), "SemillaModel", createTestCertificate()));
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await bad.json());
    // Authenticated endpoints: unknown RNC and missing token answer identically.
    const token = await login(store);
    const unknownRec = await handleRequest(receive(token, sign(sampleEcf, "ECF"), "999999999"), makeDeps(store));
    const noToken = await handleRequest(receive(null, sign(sampleEcf, "ECF")), makeDeps(store));
    expect(unknownRec.status).toBe(401);
    expect(await unknownRec.json()).toEqual(await noToken.json());
  });

  it("returns 404 for unknown paths and 405 for wrong methods before any lookup", async () => {
    const store = await freshStore();
    expect((await handleRequest(new Request(`${BASE}/${TENANT_RNC}/fe/other`), makeDeps(store))).status).toBe(404);
    expect((await handleRequest(new Request(seedUrl(), { method: "POST" }), makeDeps(store))).status).toBe(405);
    expect((await handleRequest(new Request(seedUrl("999999999"), { method: "POST" }), makeDeps(store))).status).toBe(405);
    expect(store.calls).toEqual([]);
  });

  it("answers 503 without a seed secret and never leaks internals", async () => {
    const store = await freshStore();
    const res = await handleRequest(new Request(seedUrl()), makeDeps(store, { seedSecret: () => undefined }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("NOT_CONFIGURED");
    store.resolveTenant = async () => {
      throw new Error("secret connection string");
    };
    const token = "t".repeat(43);
    const boom = await handleRequest(receive(token, "<ECF/>"), makeDeps(store));
    expect(boom.status).toBe(500);
    expect(JSON.stringify(await boom.json())).not.toContain("secret");
  });
});

describe("request size", () => {
  const streamOf = (bytes: number) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new Uint8Array(64 * 1024).fill(32);
        for (let sent = 0; sent < bytes; sent += chunk.length) controller.enqueue(chunk);
        controller.close();
      },
    });

  it("caps the body while streaming, without trusting content-length", async () => {
    const store = await freshStore();
    const token = await login(store);
    const res = await handleRequest(
      new Request(`${BASE}/ecf-receptor/${TENANT_RNC}/fe/recepcion/api/ecf`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/xml" },
        body: streamOf(6 * 1024 * 1024),
        duplex: "half",
      } as RequestInit),
      makeDeps(store),
    );
    expect(res.status).toBe(413);
  });

  it("limits the seed exchange to a few KB", async () => {
    const store = await freshStore();
    const res = await handleRequest(
      new Request(validateUrl(), { method: "POST", headers: { "content-type": "application/xml" }, body: "<SemillaModel>" + " ".repeat(20 * 1024) + "</SemillaModel>" }),
      makeDeps(store),
    );
    expect(res.status).toBe(413);
  });

  it("rejects an oversized declared content-length early", async () => {
    const store = await freshStore();
    const token = await login(store);
    const res = await handleRequest(
      new Request(`${BASE}/ecf-receptor/${TENANT_RNC}/fe/recepcion/api/ecf`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/xml", "content-length": String(6 * 1024 * 1024) },
        body: "<ECF/>",
      }),
      makeDeps(store),
    );
    expect(res.status).toBe(413);
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
    expect(arecf).toContain(`<RNCEmisor>${EMITTER_RNC}</RNCEmisor>`);
    expect(arecf).toContain(`<RNCComprador>${TENANT_RNC}</RNCComprador>`);
    expect(arecf).toContain("<eNCF>E310000000007</eNCF>");
    expect(arecf).not.toContain("CodigoMotivoNoRecibido");
    // Signed with the tenant's certificate (self-signed test cert -> only verifiable with it as trust anchor).
    const tenantTrust = createXmlSecurity({ trustedCaPems: [] });
    expect(tenantTrust.verify(arecf, clock).valid).toBe(false);
    expect(arecf).toContain(tenantCert.certPem.replace(/-----[A-Z ]+-----|\s/g, "").slice(0, 60));
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0]).toMatchObject({ estado: 0, motivoNoRecibido: null, emisorRnc: EMITTER_RNC, encf: "E310000000007", tipoEcf: "31" });
    expect(store.documents[0].xml).toContain("<ECF>");
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

  it("answers code 2 when the document is signed by a self-signed or untrusted certificate", async () => {
    const store = await freshStore();
    const token = await login(store);
    const selfSigned = sign(sampleEcf, "ECF", createTestCertificate({ rnc: EMITTER_RNC }));
    expect(await (await handleRequest(receive(token, selfSigned), makeDeps(store))).text()).toContain("<CodigoMotivoNoRecibido>2</CodigoMotivoNoRecibido>");
    const wrongCa = sign(sampleEcf, "ECF", createTestCertificate({ ca: otherCa, rnc: EMITTER_RNC }));
    expect(await (await handleRequest(receive(token, wrongCa), makeDeps(store))).text()).toContain("<CodigoMotivoNoRecibido>2</CodigoMotivoNoRecibido>");
    expect(store.documents.every((d) => d.estado === 1)).toBe(true);
  });

  it("answers code 2 when the signer is trusted but its certificate does not carry the issuer RNC", async () => {
    const store = await freshStore();
    const token = await login(store);
    const stranger = createTestCertificate({ ca, rnc: "101010101" });
    expect(await (await handleRequest(receive(token, sign(sampleEcf, "ECF", stranger)), makeDeps(store))).text()).toContain("<CodigoMotivoNoRecibido>2</CodigoMotivoNoRecibido>");
  });

  it("forbids delivering documents issued by someone else than the token holder", async () => {
    const store = await freshStore();
    const strangerCert = createTestCertificate({ ca, rnc: "101010101" });
    const token = await login(store, strangerCert);
    const res = await handleRequest(receive(token, sign(sampleEcf, "ECF")), makeDeps(store));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(store.documents).toHaveLength(0);
  });

  it("answers code 4 when RNCComprador is another taxpayer", async () => {
    const store = await freshStore();
    const token = await login(store);
    const other = sign(sampleEcf.replace("<RNCComprador>130862346", "<RNCComprador>101010101"), "ECF");
    expect(await (await handleRequest(receive(token, other), makeDeps(store))).text()).toContain("<CodigoMotivoNoRecibido>4</CodigoMotivoNoRecibido>");
  });

  it("stores only a hash for rejected documents and collapses identical repeats", async () => {
    const store = await freshStore();
    const token = await login(store);
    const broken = sign(sampleEcf, "ECF").replace("<MontoTotal>7080.00", "<MontoTotal>1.00");
    for (let i = 0; i < 3; i++) await handleRequest(receive(token, broken), makeDeps(store));
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0].xml).toBeNull();
    expect(store.documents[0].xmlSha256).toBe(await sha256Hex(broken));
  });

  it("matches RNCs written with separators", async () => {
    const store = await freshStore();
    const token = await login(store);
    const dashed = sign(sampleEcf.replace("<RNCComprador>130862346", "<RNCComprador>130-86234-6").replace("<RNCEmisor>131880738", "<RNCEmisor>131-88073-8"), "ECF");
    expect(await (await handleRequest(receive(token, dashed), makeDeps(store))).text()).toContain("<Estado>0</Estado>");
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
});

describe("commercial approval", () => {
  // The tenant issued the e-CF (RNCEmisor); EMITTER_RNC is the buyer approving it.
  const acecf = (emisor = TENANT_RNC, estado = "1", comprador = EMITTER_RNC) =>
    `<ACECF><DetalleAprobacionComercial><Version>1.0</Version><RNCEmisor>${emisor}</RNCEmisor><eNCF>E310000000007</eNCF><FechaEmision>01-01-2026</FechaEmision><MontoTotal>100.00</MontoTotal><RNCComprador>${comprador}</RNCComprador><Estado>${estado}</Estado><FechaHoraAprobacionComercial>01-01-2026 10:00:00</FechaHoraAprobacionComercial></DetalleAprobacionComercial></ACECF>`;
  const approve = (token: string | null, xml: string) =>
    new Request(`${BASE}/ecf-receptor/${TENANT_RNC}/fe/aprobacioncomercial/api/ecf`, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...multipart(xml),
    });

  it("stores a signed approval from the buyer, and the latest one wins", async () => {
    const store = await freshStore();
    const token = await login(store);
    expect((await handleRequest(approve(token, sign(acecf(), "ACECF")), makeDeps(store))).status).toBe(200);
    expect((await handleRequest(approve(token, sign(acecf(TENANT_RNC, "2"), "ACECF")), makeDeps(store))).status).toBe(200);
    expect(store.approvals.size).toBe(1);
    expect([...store.approvals.values()][0]).toMatchObject({ emisorRnc: TENANT_RNC, encf: "E310000000007", estado: 2 });
  });

  it("rejects unauthenticated, unsigned, self-signed and foreign approvals", async () => {
    const store = await freshStore();
    const token = await login(store);
    expect((await handleRequest(approve(null, sign(acecf(), "ACECF")), makeDeps(store))).status).toBe(401);
    expect((await (await handleRequest(approve(token, acecf()), makeDeps(store))).json()).code).toBe("SIGNATURE");
    const forged = sign(acecf(), "ACECF", createTestCertificate({ rnc: EMITTER_RNC }));
    expect((await (await handleRequest(approve(token, forged), makeDeps(store))).json()).code).toBe("SIGNATURE");
    const foreign = await handleRequest(approve(token, sign(acecf("111111111"), "ACECF")), makeDeps(store));
    expect((await foreign.json()).code).toBe("RNC_MISMATCH");
    expect(store.approvals.size).toBe(0);
  });

  it("forbids an approval whose buyer is not the token holder", async () => {
    const store = await freshStore();
    const token = await login(store);
    const res = await handleRequest(approve(token, sign(acecf(TENANT_RNC, "1", "202020202"), "ACECF")), makeDeps(store));
    expect(res.status).toBe(403);
    expect(store.approvals.size).toBe(0);
  });
});
