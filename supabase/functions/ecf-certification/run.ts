// Test-set runs: plan, resumable submission batches, status polling and portal downloads.
//
// Submission order (sequence_order):
//  1. Every E32 listed in the RFCE sheet (consumo < RD$250k), in ECF-sheet order: first the full E32
//     is signed and kept for the portal upload (kind portal_upload, never sent through the API),
//     then its RFCE (kind rfce) is sent to the summaries service with the E32 security code.
//  2. Every other e-CF goes to the reception service in sheet order, except that a document
//     referenced by another one (InformacionReferencia/NCFModificado, e.g. the invoice an E33/E34
//     note modifies) is moved right before its first referrer. A referrer is only sent once the
//     referenced document is accepted by DGII, so send-next pauses (waitingFor) until status polling
//     records that acceptance.
// A simulation run (DGII step 4) re-issues the test-set workbook with fresh e-NCF and today's dates
// (see simulation.ts) and is sent exactly like a test set.
import {
  applySecurityCode,
  buildTestSet,
  securityCodeFromSignedXml,
  stampSignatureTime,
  TestSetError,
  type BuiltDocument,
  type TestSet,
} from "./builder.ts";
import { buildCommercialApprovals, detectWorkbookType, type BuiltApproval } from "./commercialApproval.ts";
import { DgiiError, type DgiiClient, type DgiiMessage, type DgiiSendResult } from "./dgiiClient.ts";
import { HttpError, json, loadSigner, type ActionContext } from "./context.ts";
import { buildSimulationSet } from "./simulation.ts";
import { readXlsx, XlsxError } from "./xlsx.ts";

export type SubmissionKind = "ecf" | "rfce" | "portal_upload" | "acecf";
export type RunType = "test_set" | "commercial_approval" | "simulation";
export type SubmissionStatus = "pending" | "sent" | "accepted" | "accepted_conditional" | "rejected" | "error" | "ready_for_portal";
export type RunEnvironment = "test" | "certification";
export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface PlannedSubmission {
  caseId: string;
  encf: string;
  tipoEcf: string;
  kind: SubmissionKind;
  sequenceOrder: number;
  dependsOnCaseId: string | null;
  unsignedXml: string;
  /** Simulation only: the step-2 test case this document re-issues. */
  sourceCaseId?: string | null;
}

export interface Submission extends PlannedSubmission {
  id: string;
  status: SubmissionStatus;
  trackId: string | null;
  messages: DgiiMessage[];
  signedXml: string | null;
  securityCode: string | null;
  attempts: number;
}

export interface SubmissionPatch {
  status?: SubmissionStatus;
  trackId?: string | null;
  messages?: DgiiMessage[];
  signedXml?: string | null;
  signedSha256?: string | null;
  securityCode?: string | null;
  attempts?: number;
}

export interface Run {
  id: string;
  tenantId: string;
  environment: RunEnvironment;
  runType: RunType;
  status: RunStatus;
  createdAt: string;
}

export interface RunStore {
  createRun(input: {
    tenantId: string;
    environment: RunEnvironment;
    runType: RunType;
    sourceSha256: string;
    createdBy: string;
    submissions: PlannedSubmission[];
  }): Promise<Run>;
  /** The run when it belongs to the tenant, else null. */
  getRun(tenantId: string, runId: string): Promise<Run | null>;
  latestRun(tenantId: string, environment: RunEnvironment, runType: RunType): Promise<Run | null>;
  /**
   * Every e-NCF the tenant issued in the environment: kinds ecf, rfce and portal_upload of test-set
   * and simulation runs (never commercial approvals, whose e-NCF belong to the DGII emitter).
   */
  issuedEncfs(tenantId: string, environment: RunEnvironment): Promise<string[]>;
  /** Ordered by sequence_order. */
  listSubmissions(runId: string): Promise<Submission[]>;
  /**
   * Applies the patch; with `expected`, only when the row still has that status and attempt count
   * (optimistic claim so two concurrent batches never send the same document). Returns whether a
   * row was updated.
   */
  updateSubmission(id: string, patch: SubmissionPatch, expected?: { status: SubmissionStatus; attempts: number }): Promise<boolean>;
  setRunStatus(runId: string, status: RunStatus): Promise<void>;
}

/** createRun refused a submission whose e-NCF the tenant already issued (database guard). */
export class SequenceConflictError extends Error {
  constructor() {
    super("An e-NCF of the run was already issued by this tenant.");
    this.name = "SequenceConflictError";
  }
}

export const MAX_XLSX_BYTES = 2 * 1024 * 1024;
export const MAX_SEND_LIMIT = 5;
export const MAX_STATUS_POLLS = 10;
export const MAX_ATTEMPTS = 3;
const DEFAULT_BUDGET_MS = 40_000;
const RUN_ENVIRONMENTS: RunEnvironment[] = ["test", "certification"];
const RUN_TYPES: RunType[] = ["test_set", "commercial_approval", "simulation"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCEPTED: SubmissionStatus[] = ["accepted", "accepted_conditional"];
const TERMINAL: SubmissionStatus[] = ["accepted", "accepted_conditional", "rejected", "error", "ready_for_portal"];

/** Orders the documents of a test set (see the rule at the top of this file). */
export function planSubmissions(set: TestSet): PlannedSubmission[] {
  const out: PlannedSubmission[] = [];
  const push = (doc: BuiltDocument, kind: SubmissionKind, dependsOnCaseId: string | null) =>
    out.push({
      caseId: doc.caseId,
      encf: doc.encf,
      tipoEcf: doc.tipoEcf,
      kind,
      sequenceOrder: out.length,
      dependsOnCaseId,
      unsignedXml: doc.xml,
      ...(doc.sourceCaseId ? { sourceCaseId: doc.sourceCaseId } : {}),
    });

  const summaries = new Map(set.rfce.map((doc) => [doc.encf, doc]));
  for (const doc of set.ecf) {
    const summary = summaries.get(doc.encf);
    if (!summary) continue;
    push(doc, "portal_upload", null);
    push(summary, "rfce", doc.caseId);
  }

  const byEncf = new Map(set.ecf.map((doc) => [doc.encf, doc]));
  const remaining = set.ecf.filter((doc) => !summaries.has(doc.encf));
  const placed = new Set<string>();
  const visiting = new Set<string>();
  const visit = (doc: BuiltDocument) => {
    if (placed.has(doc.encf) || visiting.has(doc.encf)) return;
    visiting.add(doc.encf);
    const referenced = doc.references && doc.references !== doc.encf ? byEncf.get(doc.references) : undefined;
    if (referenced && !summaries.has(referenced.encf)) visit(referenced);
    visiting.delete(doc.encf);
    placed.add(doc.encf);
    push(doc, "ecf", referenced ? referenced.caseId : null);
  };
  remaining.forEach(visit);
  return out;
}

/** Commercial approvals are independent: sent in sheet order, no dependencies. */
export function planApprovals(approvals: BuiltApproval[]): PlannedSubmission[] {
  return approvals.map((doc, sequenceOrder) => ({
    caseId: doc.caseId,
    encf: doc.encf,
    tipoEcf: doc.tipoEcf,
    kind: "acecf" as const,
    sequenceOrder,
    dependsOnCaseId: null,
    unsignedXml: doc.xml,
  }));
}

/**
 * Commercial approval answer -> status. The service answers synchronously: codigo 01 "Aprobacion
 * Comercial Aprobada", 02 "Aprobacion Comercial Rechazada". Answering "rechazada" to an approval that
 * itself declared Estado 2 is the expected outcome, so it counts as accepted.
 */
export function mapApprovalResult(result: DgiiSendResult, submittedEstado: string | null): SubmissionPatch {
  const estado = (result.estado ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const approved = result.codigo === 1 || (result.codigo === null && estado.includes("aprobada"));
  const rejected = result.codigo === 2 || (result.codigo === null && estado.includes("rechazada"));
  if (result.httpStatus < 400 && approved) return { status: "accepted", messages: result.messages };
  if (result.httpStatus < 400 && rejected && submittedEstado === "2") return { status: "accepted", messages: result.messages };
  return { status: result.httpStatus >= 400 || rejected ? "rejected" : "error", messages: result.messages };
}

/** The submission whose outcome gates this one, if any. */
function dependencyOf(sub: Submission, all: Submission[]): Submission | null {
  if (!sub.dependsOnCaseId) return null;
  const candidates = all.filter((other) => other.caseId === sub.dependsOnCaseId && other !== sub);
  if (sub.kind === "rfce") return candidates.find((other) => other.kind === "portal_upload") ?? null;
  // A reference to a consumo E32 is satisfied by the acceptance of its summary.
  return candidates.find((other) => other.kind === "ecf") ?? candidates.find((other) => other.kind === "rfce") ?? null;
}

/** DGII estado/codigo -> submission status (null when DGII is still processing). */
export function mapDgiiStatus(estado: string | null, codigo: number | null): SubmissionStatus | null {
  const normalized = (estado ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (normalized === "aceptado") return "accepted";
  if (normalized === "aceptado condicional") return "accepted_conditional";
  if (normalized === "rechazado") return "rejected";
  if (normalized === "en proceso" || normalized === "no encontrado") return null;
  if (codigo === 1) return "accepted";
  if (codigo === 2) return "rejected";
  if (codigo === 4) return "accepted_conditional";
  return null;
}

export interface SubmissionView {
  caseId: string;
  encf: string;
  tipoEcf: string;
  kind: SubmissionKind;
  sequenceOrder: number;
  status: SubmissionStatus;
  trackId: string | null;
  messages: DgiiMessage[];
  /** Simulation only: the step-2 test case this document re-issues. */
  sourceCaseId: string | null;
  /** A signed copy is stored (downloadable for simulation runs and portal uploads). */
  signed: boolean;
}

export interface RunSummary {
  runId: string;
  environment: RunEnvironment;
  runType: RunType;
  status: RunStatus;
  createdAt: string;
  counts: Record<SubmissionStatus, number>;
  /** No pending documents left (sent documents may still await their DGII status). */
  sendComplete: boolean;
  /** Every document reached a final state. */
  done: boolean;
  items: SubmissionView[];
}

export function summarize(run: Run, subs: Submission[]): RunSummary {
  const counts: Record<SubmissionStatus, number> = {
    pending: 0,
    sent: 0,
    accepted: 0,
    accepted_conditional: 0,
    rejected: 0,
    error: 0,
    ready_for_portal: 0,
  };
  for (const sub of subs) counts[sub.status]++;
  return {
    runId: run.id,
    environment: run.environment,
    runType: run.runType ?? "test_set",
    status: run.status,
    createdAt: run.createdAt,
    counts,
    sendComplete: counts.pending === 0,
    done: subs.every((sub) => TERMINAL.includes(sub.status)),
    items: subs.map((sub) => ({
      caseId: sub.caseId,
      encf: sub.encf,
      tipoEcf: sub.tipoEcf,
      kind: sub.kind,
      sequenceOrder: sub.sequenceOrder,
      status: sub.status,
      trackId: sub.trackId,
      messages: sub.messages,
      sourceCaseId: sub.sourceCaseId ?? null,
      signed: !!sub.signedXml,
    })),
  };
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || !value) throw new HttpError(400, "INVALID_REQUEST", "xlsxBase64 is required.");
  const clean = value.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) throw new HttpError(400, "INVALID_REQUEST", "xlsxBase64 is not valid base64.");
  if ((clean.length / 4) * 3 > MAX_XLSX_BYTES + 3) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The test set file is too large.");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length > MAX_XLSX_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The test set file is too large.");
  return bytes;
}

function runEnvironmentOf(payload: Record<string, unknown>): RunEnvironment {
  const { environment } = payload;
  if (typeof environment !== "string" || !RUN_ENVIRONMENTS.includes(environment as RunEnvironment)) {
    throw new HttpError(400, "INVALID_REQUEST", "environment must be test or certification.");
  }
  return environment as RunEnvironment;
}

async function requireRun(ctx: ActionContext): Promise<Run> {
  const { runId } = ctx.payload;
  if (typeof runId !== "string" || !UUID.test(runId)) throw new HttpError(400, "INVALID_REQUEST", "runId is invalid.");
  const run = await ctx.deps.store.getRun(ctx.tenantId, runId);
  if (!run) throw new HttpError(404, "RUN_NOT_FOUND", "The certification run does not exist.");
  return run;
}

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

/** Optional runType in a request (start: expected type; latest: wanted type, default test_set). */
function runTypeOf(payload: Record<string, unknown>): RunType | undefined {
  const { runType } = payload;
  if (runType === undefined) return undefined;
  if (typeof runType !== "string" || !RUN_TYPES.includes(runType as RunType)) {
    throw new HttpError(400, "INVALID_REQUEST", "runType must be test_set, commercial_approval or simulation.");
  }
  return runType as RunType;
}

const WORKBOOK_LABEL: Record<RunType, string> = {
  test_set: "a test set (ECF/RFCE)",
  commercial_approval: "a commercial approval set (ACEECF_Generadas)",
  simulation: "a test set (ECF/RFCE)",
};

export async function startRun(ctx: ActionContext): Promise<Response> {
  const environment = runEnvironmentOf(ctx.payload);
  const expectedType = runTypeOf(ctx.payload);
  const bytes = decodeBase64(ctx.payload.xlsxBase64);
  let runType: RunType;
  let set: TestSet | null = null;
  let approvals: BuiltApproval[] = [];
  const now = new Date((ctx.deps.now ?? Date.now)());
  try {
    const sheets = await readXlsx(bytes);
    const workbookType = detectWorkbookType(sheets);
    // The simulation (step 4) takes the step-2 test-set workbook.
    runType = expectedType === "simulation" && workbookType === "test_set" ? "simulation" : workbookType;
    if (expectedType && expectedType !== runType) {
      throw new TestSetError(`This workbook is ${WORKBOOK_LABEL[runType]}, but ${WORKBOOK_LABEL[expectedType]} was expected.`);
    }
    if (runType === "test_set") set = buildTestSet(sheets);
    else if (runType === "simulation") set = buildSimulationSet(sheets, { issued: await ctx.deps.store.issuedEncfs(ctx.tenantId, environment), now });
    else approvals = buildCommercialApprovals(sheets, now);
  } catch (error) {
    if (error instanceof XlsxError || error instanceof TestSetError) {
      ctx.deps.log("test_set_invalid");
      throw new HttpError(422, "INVALID_TEST_SET", error.message);
    }
    throw error;
  }
  const tenantRnc = digits(await ctx.deps.store.tenantRnc(ctx.tenantId));
  const rncs = set ? [...set.ecf, ...set.rfce].map((doc) => doc.rncEmisor) : approvals.map((doc) => doc.rncComprador);
  if (!tenantRnc || rncs.some((rnc) => rnc !== tenantRnc)) {
    throw new HttpError(
      422,
      "RNC_MISMATCH",
      set ? "The test set RNCEmisor does not match the tenant." : "The commercial approval set RNCComprador does not match the tenant.",
    );
  }
  if (!(await ctx.deps.store.loadCertificate(ctx.tenantId, environment))) {
    throw new HttpError(409, "CERTIFICATE_NOT_READY", "No ready certificate for this environment.");
  }
  let run: Run;
  try {
    run = await ctx.deps.store.createRun({
      tenantId: ctx.tenantId,
      environment,
      runType,
      sourceSha256: await sha256Hex(bytes),
      createdBy: ctx.userId,
      submissions: set ? planSubmissions(set) : planApprovals(approvals),
    });
  } catch (error) {
    // Fail closed: never renumber silently; a new start allocates from the updated history.
    if (error instanceof SequenceConflictError) {
      ctx.deps.log("sequence_conflict", { runType });
      throw new HttpError(409, "SEQUENCE_CONFLICT", "An e-NCF of this run was already issued. Start the run again to allocate new sequences.");
    }
    throw error;
  }
  ctx.deps.log("run_started", { runType, ...(set ? { ecf: set.ecf.length, rfce: set.rfce.length } : { acecf: approvals.length }) });
  return json(200, summarize(run, await ctx.deps.store.listSubmissions(run.id)));
}

async function refreshRunStatus(ctx: ActionContext, run: Run, subs: Submission[]): Promise<Run> {
  const status: RunStatus = subs.every((sub) => TERMINAL.includes(sub.status)) ? "completed" : "running";
  if (status !== run.status) await ctx.deps.store.setRunStatus(run.id, status);
  return { ...run, status };
}

function failureMessage(error: DgiiError): DgiiMessage[] {
  const base: DgiiMessage = { codigo: error.status === null ? null : String(error.status), valor: `DGII: ${error.kind}` };
  return [base, ...error.messages].slice(0, 20);
}

function mapSendResult(sub: Submission, result: DgiiSendResult): SubmissionPatch {
  if (sub.kind === "acecf") return mapApprovalResult(result, /<Estado>([12])<\/Estado>/.exec(sub.unsignedXml)?.[1] ?? null);
  if (sub.kind === "ecf") {
    if (result.trackId) return { status: "sent", trackId: result.trackId, messages: result.messages };
    return { status: result.httpStatus >= 400 ? "rejected" : "error", messages: result.messages };
  }
  const mapped = mapDgiiStatus(result.estado, result.codigo);
  if (mapped) return { status: mapped, messages: result.messages };
  return { status: result.httpStatus >= 400 ? "rejected" : "error", messages: result.messages };
}

export interface SendNextResult extends RunSummary {
  processed: number;
  /** caseId whose DGII acceptance is awaited before the next document can be sent. */
  waitingFor: string | null;
  /** Set when the batch stopped early because DGII failed; the documents stay pending. */
  stoppedReason: string | null;
}

export async function sendNext(ctx: ActionContext): Promise<Response> {
  const run = await requireRun(ctx);
  const rawLimit = ctx.payload.limit ?? MAX_SEND_LIMIT;
  if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_SEND_LIMIT) {
    throw new HttpError(400, "INVALID_REQUEST", `limit must be between 1 and ${MAX_SEND_LIMIT}.`);
  }
  const now = ctx.deps.now ?? Date.now;
  const started = now();
  const budget = ctx.deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const subs = await ctx.deps.store.listSubmissions(run.id);
  let sign: ((xml: string, root: string) => string) | null = null;
  let client: DgiiClient | null = null;
  // One DGII token per call (and tenant); it never leaves this function.
  let token: string | null = null;
  const signWith = async (xml: string, root: string) => {
    sign ??= await loadSigner(ctx, run.environment);
    return sign(xml, root);
  };
  const tokenFor = async (): Promise<{ client: DgiiClient; token: string }> => {
    client ??= ctx.deps.dgii(run.environment);
    token ??= (await client.authenticate((seed) => signWith(seed, "SemillaModel"))).token;
    return { client, token };
  };

  let processed = 0;
  let waitingFor: string | null = null;
  let stoppedReason: string | null = null;

  for (const sub of subs) {
    if (sub.status !== "pending") continue;
    if (processed >= rawLimit || now() - started > budget) break;

    const dependency = dependencyOf(sub, subs);
    if (sub.kind === "rfce" && (!dependency || dependency.status !== "ready_for_portal" || !dependency.securityCode)) {
      waitingFor = sub.dependsOnCaseId;
      break;
    }
    if (sub.kind === "ecf" && dependency && !ACCEPTED.includes(dependency.status)) {
      if (dependency.status === "rejected" || dependency.status === "error") {
        const patch: SubmissionPatch = {
          status: "error",
          messages: [{ codigo: null, valor: `The referenced document ${dependency.encf} was not accepted by DGII.` }],
        };
        if (await ctx.deps.store.updateSubmission(sub.id, patch, { status: "pending", attempts: sub.attempts })) Object.assign(sub, patch);
        continue;
      }
      waitingFor = dependency.caseId;
      break;
    }

    if (sub.kind !== "portal_upload") {
      // Authenticate before claiming, so a DGII outage does not consume attempts.
      try {
        await tokenFor();
      } catch (error) {
        if (!(error instanceof DgiiError)) throw error;
        ctx.deps.log("dgii_auth_failed", { kind: error.kind, status: error.status });
        stoppedReason = error.kind === "unauthorized" ? "DGII_AUTH_REJECTED" : "DGII_UNAVAILABLE";
        break;
      }
    }

    // Claim the row: a concurrent batch that already took it makes this update a no-op.
    if (!(await ctx.deps.store.updateSubmission(sub.id, { attempts: sub.attempts + 1 }, { status: "pending", attempts: sub.attempts }))) {
      stoppedReason = "CONCURRENT_BATCH";
      break;
    }
    sub.attempts += 1;
    processed++;

    if (sub.kind === "portal_upload") {
      const signedXml = await signWith(stampSignatureTime(sub.unsignedXml, new Date(now())), "ECF");
      const patch: SubmissionPatch = {
        status: "ready_for_portal",
        signedXml,
        signedSha256: await sha256Hex(signedXml),
        securityCode: securityCodeFromSignedXml(signedXml),
        messages: [],
      };
      await ctx.deps.store.updateSubmission(sub.id, patch);
      Object.assign(sub, patch);
      continue;
    }

    const signedXml =
      sub.kind === "acecf"
        ? await signWith(sub.unsignedXml, "ACECF")
        : sub.kind === "ecf"
          ? await signWith(stampSignatureTime(sub.unsignedXml, new Date(now())), "ECF")
          : await signWith(applySecurityCode(sub.unsignedXml, dependency!.securityCode!), "RFCE");
    const signedSha256 = await sha256Hex(signedXml);
    const fileName = `${sub.caseId}.xml`;
    let patch: SubmissionPatch;
    try {
      const dgii = await tokenFor();
      const result =
        sub.kind === "acecf"
          ? await dgii.client.sendCommercialApproval(dgii.token, fileName, signedXml)
          : sub.kind === "ecf"
            ? await dgii.client.sendEcf(dgii.token, fileName, signedXml)
            : await dgii.client.sendRfce(dgii.token, fileName, signedXml);
      patch = { ...mapSendResult(sub, result), signedXml, signedSha256 };
    } catch (error) {
      if (!(error instanceof DgiiError)) throw error;
      // Keep the document pending (up to MAX_ATTEMPTS) and stop the batch: no retry storms.
      ctx.deps.log("dgii_send_failed", { kind: error.kind, status: error.status });
      patch = { status: sub.attempts >= MAX_ATTEMPTS ? "error" : "pending", messages: failureMessage(error) };
      stoppedReason = error.kind === "unauthorized" ? "DGII_AUTH_REJECTED" : "DGII_UNAVAILABLE";
    }
    await ctx.deps.store.updateSubmission(sub.id, patch);
    Object.assign(sub, patch);
    if (stoppedReason) break;
  }

  const updated = await refreshRunStatus(ctx, run, subs);
  const result: SendNextResult = { ...summarize(updated, subs), processed, waitingFor, stoppedReason };
  ctx.deps.log("send_next", { processed, waiting: waitingFor !== null, stopped: stoppedReason });
  return json(200, result);
}

export async function pollStatus(ctx: ActionContext): Promise<Response> {
  const run = await requireRun(ctx);
  const subs = await ctx.deps.store.listSubmissions(run.id);
  const toPoll = subs.filter((sub) => sub.status === "sent" && sub.trackId).slice(0, MAX_STATUS_POLLS);
  let stoppedReason: string | null = null;
  if (toPoll.length > 0) {
    const sign = await loadSigner(ctx, run.environment);
    const client = ctx.deps.dgii(run.environment);
    try {
      const { token } = await client.authenticate((seed) => sign(seed, "SemillaModel"));
      for (const sub of toPoll) {
        const result = await client.trackStatus(token, sub.trackId!);
        const status = mapDgiiStatus(result.estado, result.codigo);
        const patch: SubmissionPatch = { messages: result.messages };
        if (status) patch.status = status;
        await ctx.deps.store.updateSubmission(sub.id, patch);
        Object.assign(sub, patch);
      }
    } catch (error) {
      if (!(error instanceof DgiiError)) throw error;
      ctx.deps.log("dgii_status_failed", { kind: error.kind, status: error.status });
      stoppedReason = error.kind === "unauthorized" ? "DGII_AUTH_REJECTED" : "DGII_UNAVAILABLE";
    }
  }
  const updated = await refreshRunStatus(ctx, run, subs);
  return json(200, { ...summarize(updated, subs), polled: toPoll.length, stoppedReason });
}

export async function latestRun(ctx: ActionContext): Promise<Response> {
  const environment = runEnvironmentOf(ctx.payload);
  const run = await ctx.deps.store.latestRun(ctx.tenantId, environment, runTypeOf(ctx.payload) ?? "test_set");
  if (!run) return json(200, { run: null });
  return json(200, { run: summarize(run, await ctx.deps.store.listSubmissions(run.id)) });
}

const DOWNLOAD_KINDS: SubmissionKind[] = ["ecf", "portal_upload", "rfce"];

/**
 * Signed document of a run. Test sets: only the consumo e-CF signed for the portal upload.
 * Simulations: any signed document (step 5 needs every e-CF); `kind: "rfce"` picks the summary of a
 * consumo E32, otherwise the e-CF of the case (portal_upload or ecf) is returned.
 */
export async function downloadSigned(ctx: ActionContext): Promise<Response> {
  const run = await requireRun(ctx);
  const { caseId, kind } = ctx.payload;
  if (typeof caseId !== "string" || !caseId) throw new HttpError(400, "INVALID_REQUEST", "caseId is required.");
  if (kind !== undefined && !DOWNLOAD_KINDS.includes(kind as SubmissionKind)) throw new HttpError(400, "INVALID_REQUEST", "kind is invalid.");
  const subs = (await ctx.deps.store.listSubmissions(run.id)).filter((item) => item.caseId === caseId);
  let sub: Submission | undefined;
  if (run.runType === "simulation") {
    const wanted: SubmissionKind[] = kind === "rfce" ? ["rfce"] : ["portal_upload", "ecf"];
    sub = wanted.map((k) => subs.find((item) => item.kind === k)).find((item) => !!item?.signedXml);
  } else {
    sub = subs.find((item) => item.kind === "portal_upload" && item.status === "ready_for_portal");
  }
  if (!sub || !sub.signedXml) {
    throw new HttpError(404, "NOT_READY", "The signed document is not available for download.");
  }
  ctx.deps.log("download", { tipoEcf: sub.tipoEcf, kind: sub.kind });
  const suffix = sub.kind === "rfce" ? "-RFCE" : "";
  return json(200, { fileName: `${sub.caseId}${suffix}.xml`, signedXml: sub.signedXml, kind: sub.kind, securityCode: sub.securityCode });
}
