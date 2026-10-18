import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { BuiltDocument } from "../supabase/functions/ecf-certification/builder";
import { DgiiError, type DgiiClient, type DgiiSendResult, type DgiiTrackResult } from "../supabase/functions/ecf-certification/dgiiClient";
import { handleRequest, type CertificationDeps, type CertificationStore } from "../supabase/functions/ecf-certification/handler";
import {
  MAX_ATTEMPTS,
  mapDgiiStatus,
  planSubmissions,
  type PlannedSubmission,
  type Run,
  type Submission,
  type SubmissionPatch,
} from "../supabase/functions/ecf-certification/run";
import { readSigningMaterial, sign } from "../supabase/functions/ecf-certification/signer";
import { createTestCertificate, type TestCertificate } from "./helpers/ecfTestCertificate";
import { makeXlsx } from "./helpers/xlsxFixture";
import { verifyXmlSignature } from "./helpers/xmlSignature";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const RNC = "133488485";
const KEY = `ecf-v1:${randomBytes(32).toString("base64url")}`;
const SEED = "<SemillaModel><valor>s</valor></SemillaModel>";
const E = "#e";

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

// ---- workbook fixture: E31, E32 < 250k (with RFCE), a note E34 that modifies the E31 -------------
const HEADER = ["CasoPrueba", "Version", "TipoeCF", "ENCF", "RNCEmisor", "FechaEmision", "MontoTotal", "NumeroLinea[1]", "NombreItem[1]", "MontoItem[1]", "NCFModificado"];
const ecfRow = (encf: string, ref = E) => [`${RNC}${encf}`, "1.0", encf.slice(1, 3), encf, RNC, "01-04-2020", "100.00", "1", "PAN", "100.00", ref];
const RFCE_HEADER = ["CasoPrueba", "Version", "TipoeCF", "ENCF", "RNCEmisor", "FechaEmision", "MontoTotal", "CodigoSeguridadeCF"];
const rfceRow = (encf: string) => [`${RNC}${encf}`, "1.0", "32", encf, RNC, "01-04-2020", "100.00", E];

function workbook(rnc = RNC): string {
  const fix = (row: string[]) => row.map((value) => value.replaceAll(RNC, rnc));
  const bytes = makeXlsx([
    { name: "ECF", rows: [HEADER, fix(ecfRow("E340000000001", "E310000000001")), fix(ecfRow("E310000000001")), fix(ecfRow("E320000000012"))] },
    { name: "RFCE", rows: [RFCE_HEADER, fix(rfceRow("E320000000012"))] },
  ]);
  return Buffer.from(bytes).toString("base64");
}

// ---- in-memory store -------------------------------------------------------------------------------
interface Memory {
  runs: (Run & { createdBy: string; sourceSha256: string })[];
  subs: (Submission & { runId: string; signedSha256: string | null })[];
}

function memoryStore(memory: Memory, over: Partial<CertificationStore> = {}): CertificationStore {
  const copy = (sub: Memory["subs"][number]): Submission => ({ ...sub, messages: [...sub.messages] });
  return {
    authenticate: async (token) => (token === "good" ? USER : null),
    memberships: async () => [{ tenantId: TENANT, rol: "admin" }],
    tenantRnc: async () => "133-488-485",
    loadCertificate: async () => ({ p12Bytes: cert.p12Bytes, passphraseEncrypted }),
    async createRun(input) {
      const run = { id: randomUUID(), tenantId: input.tenantId, environment: input.environment, status: "pending" as const, createdAt: new Date().toISOString(), createdBy: input.createdBy, sourceSha256: input.sourceSha256 };
      memory.runs.push(run);
      for (const sub of input.submissions) {
        memory.subs.push({ ...sub, id: randomUUID(), runId: run.id, status: "pending", trackId: null, messages: [], signedXml: null, signedSha256: null, securityCode: null, attempts: 0 });
      }
      return run;
    },
    async getRun(tenantId, runId) {
      return memory.runs.find((run) => run.id === runId && run.tenantId === tenantId) ?? null;
    },
    async latestRun(tenantId, environment) {
      return [...memory.runs].reverse().find((run) => run.tenantId === tenantId && run.environment === environment) ?? null;
    },
    async listSubmissions(runId) {
      return memory.subs.filter((sub) => sub.runId === runId).sort((a, b) => a.sequenceOrder - b.sequenceOrder).map(copy);
    },
    async updateSubmission(id, patch: SubmissionPatch, expected) {
      const row = memory.subs.find((sub) => sub.id === id);
      if (!row) return false;
      if (expected && (row.status !== expected.status || row.attempts !== expected.attempts)) return false;
      Object.assign(row, patch);
      return true;
    },
    async setRunStatus(runId, status) {
      memory.runs.find((run) => run.id === runId)!.status = status;
    },
    ...over,
  };
}

// ---- fake DGII ---------------------------------------------------------------------------------------
interface FakeDgii {
  client: DgiiClient;
  sent: { kind: "ecf" | "rfce"; fileName: string; xml: string; token: string }[];
  authentications: number;
  sendEcf: (fileName: string, xml: string) => Promise<DgiiSendResult>;
  sendRfce: (fileName: string, xml: string) => Promise<DgiiSendResult>;
  track: (trackId: string) => Promise<DgiiTrackResult>;
  authenticate: () => Promise<void>;
}

function fakeDgii(): FakeDgii {
  const fake: FakeDgii = {
    sent: [],
    authentications: 0,
    sendEcf: async (fileName) => ({ httpStatus: 200, trackId: `track-${fileName}`, estado: null, codigo: null, messages: [] }),
    sendRfce: async () => ({ httpStatus: 200, trackId: null, estado: "Aceptado", codigo: 1, messages: [] }),
    track: async (trackId) => ({ trackId, estado: "Aceptado", codigo: 1, encf: null, messages: [] }),
    authenticate: async () => {},
    client: null as unknown as DgiiClient,
  };
  fake.client = {
    async authenticate(signSeed) {
      await fake.authenticate();
      fake.authentications++;
      const signed = await signSeed(SEED);
      if (!signed.includes("<SignatureValue>")) throw new Error("seed not signed");
      return { token: `token-${fake.authentications}`, expiresAt: null, issuedAt: null };
    },
    async sendEcf(token, fileName, xml) {
      fake.sent.push({ kind: "ecf", fileName, xml, token });
      return fake.sendEcf(fileName, xml);
    },
    async sendRfce(token, fileName, xml) {
      fake.sent.push({ kind: "rfce", fileName, xml, token });
      return fake.sendRfce(fileName, xml);
    },
    trackStatus: async (_token, trackId) => fake.track(trackId),
  };
  return fake;
}

function harness(over: Partial<CertificationStore> = {}) {
  const memory: Memory = { runs: [], subs: [] };
  const dgii = fakeDgii();
  const logs: string[] = [];
  let clock = Date.parse("2026-10-18T14:00:00Z");
  const deps: CertificationDeps = {
    store: memoryStore(memory, over),
    readSigningMaterial,
    sign,
    encryptionKey: () => KEY,
    dgii: () => dgii.client,
    log: (event, detail) => logs.push(`${event} ${JSON.stringify(detail ?? {})}`),
    now: () => (clock += 10),
  };
  const call = async (body: Record<string, unknown>) => {
    const res = await handleRequest(
      new Request("https://x.test/ecf-certification", { method: "POST", headers: { authorization: "Bearer good" }, body: JSON.stringify(body) }),
      deps,
    );
    return { status: res.status, body: await res.json() };
  };
  return { memory, dgii, logs, deps, call, advance: (ms: number) => (clock += ms) };
}

const statuses = (body: { items: { caseId: string; kind: string; status: string }[] }) =>
  body.items.map((item) => `${item.kind}:${item.caseId.slice(RNC.length)}:${item.status}`);

// ---- tests -------------------------------------------------------------------------------------------
describe("planSubmissions", () => {
  const doc = (encf: string, references: string | null = null, kind: "ecf" | "rfce" = "ecf"): BuiltDocument => ({
    kind,
    caseId: `${RNC}${encf}`,
    encf,
    tipoEcf: encf.slice(1, 3),
    rncEmisor: RNC,
    references,
    xml: `<x>${encf}</x>`,
  });
  const order = (plan: PlannedSubmission[]) => plan.map((p) => `${p.kind}:${p.encf}${p.dependsOnCaseId ? `<-${p.dependsOnCaseId.slice(RNC.length)}` : ""}`);

  it("signs consumo E32 first, then their RFCE, then the rest with referenced documents before their notes", () => {
    const plan = planSubmissions({
      ecf: [
        doc("E330000000001", "E320000000006"),
        doc("E320000000006"),
        doc("E340000000016", "E410000000010"),
        doc("E410000000010"),
        doc("E310000000001"),
        doc("E320000000012"),
        doc("E340000000002", "E320000000012"),
        doc("E340000000003", "E390000000001"),
      ],
      rfce: [doc("E320000000012", null, "rfce")],
    });
    expect(order(plan)).toEqual([
      "portal_upload:E320000000012",
      "rfce:E320000000012<-E320000000012",
      "ecf:E320000000006",
      "ecf:E330000000001<-E320000000006",
      "ecf:E410000000010",
      "ecf:E340000000016<-E410000000010",
      "ecf:E310000000001",
      "ecf:E340000000002<-E320000000012",
      "ecf:E340000000003",
    ]);
    expect(plan.map((p) => p.sequenceOrder)).toEqual(plan.map((_, i) => i));
  });

  it("does not loop on circular references", () => {
    const plan = planSubmissions({ ecf: [doc("E330000000001", "E340000000001"), doc("E340000000001", "E330000000001")], rfce: [] });
    expect(plan.map((p) => p.encf).sort()).toEqual(["E330000000001", "E340000000001"]);
  });
});

describe("mapDgiiStatus", () => {
  it.each([
    ["Aceptado", null, "accepted"],
    ["Aceptado Condicional", null, "accepted_conditional"],
    ["Rechazado", null, "rejected"],
    ["En Proceso", 3, null],
    ["No encontrado", 0, null],
    [null, 1, "accepted"],
    [null, 2, "rejected"],
    [null, 4, "accepted_conditional"],
    [null, 3, null],
  ])("%s / %s -> %s", (estado, codigo, expected) => {
    expect(mapDgiiStatus(estado, codigo)).toBe(expected);
  });
});

describe("start", () => {
  it("parses the workbook and persists the ordered run without calling DGII", async () => {
    const h = harness();
    const res = await h.call({ action: "start", environment: "certification", xlsxBase64: workbook() });
    expect(res.status).toBe(200);
    expect(statuses(res.body)).toEqual([
      "portal_upload:E320000000012:pending",
      "rfce:E320000000012:pending",
      "ecf:E310000000001:pending",
      "ecf:E340000000001:pending",
    ]);
    expect(res.body.counts.pending).toBe(4);
    expect(h.dgii.authentications).toBe(0);
    expect(h.memory.runs[0]).toMatchObject({ tenantId: TENANT, environment: "certification", createdBy: USER });
    expect(h.memory.runs[0].sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(res.body)).not.toContain("<ECF>");
  });

  it("rejects test sets of another RNC, invalid files and production", async () => {
    const h = harness();
    expect((await h.call({ action: "start", environment: "certification", xlsxBase64: workbook("101010101") })).body.code).toBe("RNC_MISMATCH");
    const invalid = await h.call({ action: "start", environment: "certification", xlsxBase64: Buffer.from("hola").toString("base64") });
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe("INVALID_TEST_SET");
    expect((await h.call({ action: "start", environment: "certification", xlsxBase64: "%%%" })).status).toBe(400);
    expect((await h.call({ action: "start", environment: "production", xlsxBase64: workbook() })).status).toBe(400);
    expect(h.memory.runs).toHaveLength(0);
  });

  it("requires a ready certificate", async () => {
    const h = harness({ loadCertificate: async () => null });
    const res = await h.call({ action: "start", environment: "certification", xlsxBase64: workbook() });
    expect(res.status).toBe(409);
    expect(h.memory.runs).toHaveLength(0);
  });
});

describe("send-next and status", () => {
  async function started(h: ReturnType<typeof harness>) {
    const res = await h.call({ action: "start", environment: "certification", xlsxBase64: workbook() });
    return res.body.runId as string;
  }

  it("signs the consumo E32 for the portal, sends its RFCE with the security code, and waits before the note", async () => {
    const h = harness();
    const runId = await started(h);
    const first = await h.call({ action: "send-next", runId, limit: 5 });
    expect(first.status).toBe(200);
    expect(statuses(first.body)).toEqual([
      "portal_upload:E320000000012:ready_for_portal",
      "rfce:E320000000012:accepted",
      "ecf:E310000000001:sent",
      "ecf:E340000000001:pending",
    ]);
    expect(first.body.waitingFor).toBe(`${RNC}E310000000001`);
    expect(first.body.processed).toBe(3);
    expect(h.dgii.authentications).toBe(1);
    expect(new Set(h.dgii.sent.map((s) => s.token))).toEqual(new Set(["token-1"]));

    const portal = h.memory.subs.find((s) => s.kind === "portal_upload")!;
    expect(verifyXmlSignature(portal.signedXml!, cert.certPem)).toBe(true);
    expect(portal.signedXml).toContain("<FechaHoraFirma>18-10-2026 10:00:00</FechaHoraFirma>");
    const signatureValue = portal.signedXml!.match(/<SignatureValue>([^<]+)</)![1].replace(/\s+/g, "");
    expect(portal.securityCode).toBe(signatureValue.slice(0, 6));
    expect(h.dgii.sent.map((s) => `${s.kind}:${s.fileName}`)).toEqual([`rfce:${RNC}E320000000012.xml`, `ecf:${RNC}E310000000001.xml`]);
    const rfce = h.dgii.sent[0].xml;
    expect(rfce).toContain(`<CodigoSeguridadeCF>${portal.securityCode}</CodigoSeguridadeCF>`);
    expect(verifyXmlSignature(rfce, cert.certPem)).toBe(true);
    expect(verifyXmlSignature(h.dgii.sent[1].xml, cert.certPem)).toBe(true);

    // Still waiting while DGII processes the referenced invoice.
    h.dgii.track = async (trackId) => ({ trackId, estado: "En Proceso", codigo: 3, encf: null, messages: [] });
    const processing = await h.call({ action: "status", runId });
    expect(processing.body.polled).toBe(1);
    expect(statuses(processing.body)[2]).toBe("ecf:E310000000001:sent");
    expect((await h.call({ action: "send-next", runId })).body.waitingFor).toBe(`${RNC}E310000000001`);

    h.dgii.track = async (trackId) => ({ trackId, estado: "Aceptado", codigo: 1, encf: null, messages: [{ codigo: "0", valor: "ok" }] });
    const accepted = await h.call({ action: "status", runId });
    expect(statuses(accepted.body)[2]).toBe("ecf:E310000000001:accepted");

    const second = await h.call({ action: "send-next", runId });
    expect(second.body.waitingFor).toBeNull();
    expect(statuses(second.body)[3]).toBe("ecf:E340000000001:sent");
    expect(second.body.sendComplete).toBe(true);
    expect(second.body.done).toBe(false);
    // A new call authenticates again: tokens are never reused across calls.
    expect(h.dgii.sent.at(-1)!.token).toBe("token-4");

    const final = await h.call({ action: "status", runId });
    expect(final.body.done).toBe(true);
    expect(final.body.status).toBe("completed");
    expect(final.body.counts).toMatchObject({ ready_for_portal: 1, accepted: 3 });
    expect(h.logs.join("\n")).not.toMatch(/token-\d|<ECF>|SignatureValue/);
  });

  it("respects the batch limit and validates it", async () => {
    const h = harness();
    const runId = await started(h);
    const res = await h.call({ action: "send-next", runId, limit: 1 });
    expect(res.body.processed).toBe(1);
    expect(h.dgii.authentications).toBe(0);
    expect(statuses(res.body)[0]).toBe("portal_upload:E320000000012:ready_for_portal");
    for (const limit of [0, 6, 1.5, "2"]) expect((await h.call({ action: "send-next", runId, limit })).status).toBe(400);
  });

  it("stops at the time budget", async () => {
    const h = harness();
    h.deps.budgetMs = 25;
    const runId = await started(h);
    const res = await h.call({ action: "send-next", runId });
    expect(res.body.processed).toBe(1);
  });

  it("keeps a document pending after a DGII failure and resumes it on the next call", async () => {
    const h = harness();
    const runId = await started(h);
    h.dgii.sendRfce = async () => {
      throw new DgiiError("timeout", "slow");
    };
    const failed = await h.call({ action: "send-next", runId });
    expect(failed.body.stoppedReason).toBe("DGII_UNAVAILABLE");
    expect(statuses(failed.body)).toEqual([
      "portal_upload:E320000000012:ready_for_portal",
      "rfce:E320000000012:pending",
      "ecf:E310000000001:pending",
      "ecf:E340000000001:pending",
    ]);
    expect(failed.body.items[1].messages[0].valor).toBe("DGII: timeout");
    expect(h.dgii.sent).toHaveLength(1);

    h.dgii.sendRfce = async () => ({ httpStatus: 200, trackId: null, estado: "Aceptado Condicional", codigo: 4, messages: [{ codigo: "1", valor: "obs" }] });
    const resumed = await h.call({ action: "send-next", runId });
    expect(statuses(resumed.body).slice(0, 3)).toEqual([
      "portal_upload:E320000000012:ready_for_portal",
      "rfce:E320000000012:accepted_conditional",
      "ecf:E310000000001:sent",
    ]);
    // The portal E32 was signed once; its security code did not change.
    const rfceXmls = h.dgii.sent.filter((s) => s.kind === "rfce").map((s) => s.xml.match(/<CodigoSeguridadeCF>(\w+)</)![1]);
    expect(new Set(rfceXmls).size).toBe(1);
  });

  it("marks a document as error after the maximum attempts", async () => {
    const h = harness();
    const runId = await started(h);
    h.dgii.sendRfce = async () => {
      throw new DgiiError("http", "down", 503);
    };
    for (let i = 0; i < MAX_ATTEMPTS; i++) await h.call({ action: "send-next", runId });
    const res = await h.call({ action: "send-next", runId });
    expect(statuses(res.body)[1]).toBe("rfce:E320000000012:error");
    expect(h.dgii.sent.filter((s) => s.kind === "rfce")).toHaveLength(MAX_ATTEMPTS);
  });

  it("does not consume attempts when DGII authentication fails", async () => {
    const h = harness();
    const runId = await started(h);
    h.dgii.authenticate = async () => {
      throw new DgiiError("network", "down");
    };
    const res = await h.call({ action: "send-next", runId });
    expect(res.body.stoppedReason).toBe("DGII_UNAVAILABLE");
    expect(h.memory.subs.find((s) => s.kind === "rfce")!.attempts).toBe(0);
  });

  it("records rejections and fails notes whose referenced document was rejected", async () => {
    const h = harness();
    const runId = await started(h);
    h.dgii.sendEcf = async () => ({ httpStatus: 400, trackId: null, estado: null, codigo: null, messages: [{ codigo: "9", valor: "Monto invalido" }] });
    const res = await h.call({ action: "send-next", runId });
    expect(statuses(res.body)).toEqual([
      "portal_upload:E320000000012:ready_for_portal",
      "rfce:E320000000012:accepted",
      "ecf:E310000000001:rejected",
      "ecf:E340000000001:error",
    ]);
    expect(res.body.items[2].messages).toEqual([{ codigo: "9", valor: "Monto invalido" }]);
    expect(res.body.items[3].messages[0].valor).toContain("E310000000001");
    expect(res.body.done).toBe(true);
  });

  it("maps rejected status polls", async () => {
    const h = harness();
    const runId = await started(h);
    await h.call({ action: "send-next", runId });
    h.dgii.track = async (trackId) => ({ trackId, estado: "Rechazado", codigo: 2, encf: null, messages: [{ codigo: "3", valor: "Firma" }] });
    const res = await h.call({ action: "status", runId });
    expect(res.body.items[2]).toMatchObject({ status: "rejected", messages: [{ codigo: "3", valor: "Firma" }] });
  });

  it("reports status polling failures without changing the documents", async () => {
    const h = harness();
    const runId = await started(h);
    await h.call({ action: "send-next", runId });
    h.dgii.track = async () => {
      throw new DgiiError("network", "x");
    };
    const res = await h.call({ action: "status", runId });
    expect(res.status).toBe(200);
    expect(res.body.stoppedReason).toBe("DGII_UNAVAILABLE");
    expect(statuses(res.body)[2]).toBe("ecf:E310000000001:sent");
  });

  it("does not send a document claimed by a concurrent batch", async () => {
    const h = harness({
      updateSubmission: async () => false,
    });
    const runId = await started(h);
    const res = await h.call({ action: "send-next", runId });
    expect(res.body.stoppedReason).toBe("CONCURRENT_BATCH");
    expect(res.body.processed).toBe(0);
    expect(h.dgii.sent).toHaveLength(0);
  });

  it("downloads only signed portal documents", async () => {
    const h = harness();
    const runId = await started(h);
    const caseId = `${RNC}E320000000012`;
    expect((await h.call({ action: "download", runId, caseId })).status).toBe(404);
    await h.call({ action: "send-next", runId, limit: 1 });
    const res = await h.call({ action: "download", runId, caseId });
    expect(res.status).toBe(200);
    expect(res.body.fileName).toBe(`${caseId}.xml`);
    expect(verifyXmlSignature(res.body.signedXml, cert.certPem)).toBe(true);
    expect((await h.call({ action: "download", runId, caseId: `${RNC}E310000000001` })).status).toBe(404);
  });

  it("returns the latest run for resuming", async () => {
    const h = harness();
    expect((await h.call({ action: "latest", environment: "certification" })).body).toEqual({ run: null });
    const runId = await started(h);
    const res = await h.call({ action: "latest", environment: "certification" });
    expect(res.body.run.runId).toBe(runId);
    expect(res.body.run.items).toHaveLength(4);
  });

  it("never exposes runs of another tenant", async () => {
    const h = harness();
    const runId = await started(h);
    h.memory.runs[0].tenantId = OTHER_TENANT;
    for (const action of ["send-next", "status", "download"]) {
      const res = await h.call({ action, runId, caseId: `${RNC}E320000000012` });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("RUN_NOT_FOUND");
    }
    expect((await h.call({ action: "status", runId: "nope" })).status).toBe(400);
  });

  it("rejects non-admin users for every run action", async () => {
    const h = harness({ memberships: async () => [{ tenantId: TENANT, rol: "cajero" }] });
    for (const action of ["start", "send-next", "status", "download", "latest"]) {
      expect((await h.call({ action, environment: "certification", runId: randomUUID() })).status).toBe(403);
    }
  });
});
