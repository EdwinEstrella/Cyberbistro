/**
 * Pure helpers for running the DGII test set ("Set de Pruebas") through the `ecf-certification`
 * edge function: request building, response mapping, Spanish messages and summary counts.
 * Nothing here touches the DOM, the network or any secret.
 */

export const ECF_CERTIFICATION_FUNCTION = "ecf-certification";
export const TEST_SET_MAX_BYTES = 2 * 1024 * 1024;
export const SEND_BATCH_LIMIT = 5;

export type TestSetEnvironment = "test" | "certification";
export type SubmissionKind = "ecf" | "rfce" | "portal_upload" | "acecf";
/** Step 2 runs the test set; step 3 the commercial approval set (ACECF); step 4 the simulation. */
export type RunType = "test_set" | "commercial_approval" | "simulation";
export type SubmissionStatus = "pending" | "sent" | "accepted" | "accepted_conditional" | "rejected" | "error" | "ready_for_portal";

export interface DgiiMessageView {
  codigo: string | null;
  valor: string;
}

export interface SubmissionItem {
  caseId: string;
  encf: string;
  tipoEcf: string;
  kind: SubmissionKind;
  sequenceOrder: number;
  status: SubmissionStatus;
  trackId: string | null;
  messages: DgiiMessageView[];
  /** Simulation only: the step-2 test case this document re-issues. */
  sourceCaseId: string | null;
  /** A signed copy is stored on the server. */
  signed: boolean;
}

export interface RunView {
  runId: string;
  environment: TestSetEnvironment;
  runType: RunType;
  status: string;
  createdAt: string;
  counts: Record<SubmissionStatus, number>;
  sendComplete: boolean;
  done: boolean;
  items: SubmissionItem[];
  waitingFor: string | null;
  stoppedReason: string | null;
}

export type RunOutcome = { ok: true; run: RunView } | { ok: false; message: string; code?: string };

export function isTestSetEnvironment(value: string): value is TestSetEnvironment {
  return value === "test" || value === "certification";
}

/** User-facing wording (Spanish) of each run type. */
export interface RunCopy {
  title: string;
  description: string;
  /** Name used inside sentences, e.g. "Set de Pruebas". */
  setName: string;
  unsupportedEnvironment: string;
  sentAll: string;
  loaded: (count: number) => string;
}

export const RUN_COPY: Record<RunType, RunCopy> = {
  test_set: {
    title: "Set de Pruebas de la DGII (.xlsx)",
    description:
      "Descargá el Excel del Set de Pruebas desde el portal de la DGII y cargalo aquí. Cloudix arma cada e-CF y RFCE, los firma con tu certificado y los envía a la DGII en el orden correcto.",
    setName: "Set de Pruebas",
    unsupportedEnvironment:
      "El Set de Pruebas se ejecuta en los ambientes de Pruebas (TesteCF) o Certificación (CerteCF). Cambiá el ambiente en el paso Ambiente y certificado.",
    sentAll: "Todos los documentos fueron enviados. Consultá el estado hasta que la DGII termine de procesarlos.",
    loaded: (count) => `Set de Pruebas cargado: ${count} documentos listos para enviar.`,
  },
  commercial_approval: {
    title: "Set de Aprobaciones Comerciales de la DGII (.xlsx)",
    description:
      "Descargá el set de datos del Paso 3 en el portal de la DGII y cargalo aquí. Cloudix genera cada aprobación comercial (ACECF), la firma con tu certificado y la envía a la DGII.",
    setName: "Set de Aprobaciones Comerciales",
    unsupportedEnvironment:
      "Las Aprobaciones Comerciales se envían en los ambientes de Pruebas (TesteCF) o Certificación (CerteCF). Cambiá el ambiente en el paso Ambiente y certificado.",
    sentAll: "Todas las aprobaciones comerciales fueron enviadas. Revisá el estado de cada una en la tabla.",
    loaded: (count) => `Set de Aprobaciones Comerciales cargado: ${count} aprobaciones listas para enviar.`,
  },
  simulation: {
    title: "Simulación e-CF (Paso 4 de la DGII)",
    description:
      "Cargá el mismo Excel del Set de Pruebas (Paso 2). Cloudix genera la simulación con secuencias nuevas y la fecha de hoy (excepto documentos con impuestos adicionales, que conservan la fecha del Excel para que la DGII acepte sus tasas), la firma con tu certificado y la envía a la DGII. Las facturas de consumo menores a 250 mil se descargan para subirlas al portal.",
    setName: "Set de Pruebas",
    unsupportedEnvironment:
      "La Simulación e-CF se ejecuta en los ambientes de Pruebas (TesteCF) o Certificación (CerteCF). Cambiá el ambiente en el paso Ambiente y certificado.",
    sentAll: "Todos los documentos de la simulación fueron enviados. Consultá el estado hasta que la DGII termine de procesarlos.",
    loaded: (count) => `Simulación generada: ${count} documentos con secuencias nuevas listos para enviar.`,
  },
};

export function isRunType(value: unknown): value is RunType {
  return value === "test_set" || value === "commercial_approval" || value === "simulation";
}

/** Returns a user-facing error (Spanish) or null when the selected file looks acceptable. */
export function validateTestSetFile(file: { name: string; size: number }, runType: RunType = "test_set"): string | null {
  if (!/\.xlsx$/i.test(file.name)) return `Seleccioná el archivo .xlsx del ${RUN_COPY[runType].setName}.`;
  if (file.size <= 0) return "El archivo está vacío.";
  if (file.size > TEST_SET_MAX_BYTES) return "El archivo es demasiado grande (máximo 2 MB).";
  return null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

const withTenant = (tenantId: string | null | undefined) => (tenantId ? { tenantId } : {});

const withRunType = (runType: RunType | undefined) => (runType ? { runType } : {});

/** `runType` is the type the screen expects: the function rejects a workbook of the other type. */
export function buildStartRequest(input: { environment: TestSetEnvironment; xlsxBase64: string; tenantId?: string | null; runType?: RunType }) {
  return { action: "start", environment: input.environment, xlsxBase64: input.xlsxBase64, ...withRunType(input.runType), ...withTenant(input.tenantId) };
}

export function buildLatestRequest(environment: TestSetEnvironment, tenantId?: string | null, runType?: RunType) {
  return { action: "latest", environment, ...withRunType(runType), ...withTenant(tenantId) };
}

export function buildSendNextRequest(runId: string, tenantId?: string | null, limit = SEND_BATCH_LIMIT) {
  return { action: "send-next", runId, limit: Math.min(Math.max(1, Math.trunc(limit)), SEND_BATCH_LIMIT), ...withTenant(tenantId) };
}

export function buildStatusRequest(runId: string, tenantId?: string | null) {
  return { action: "status", runId, ...withTenant(tenantId) };
}

/** `kind: "rfce"` downloads the summary of a consumo E32 (simulation runs only). */
export function buildDownloadRequest(runId: string, caseId: string, tenantId?: string | null, kind?: "rfce") {
  return { action: "download", runId, caseId, ...(kind ? { kind } : {}), ...withTenant(tenantId) };
}

/** Authenticates the tenant certificate against DGII only; sends no document. */
export function buildAuthCheckRequest(environment: TestSetEnvironment, tenantId?: string | null) {
  return { action: "auth-check", environment, ...withTenant(tenantId) };
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Tu sesión venció. Iniciá sesión de nuevo e intentá otra vez.",
  FORBIDDEN: "Solo un administrador del negocio puede ejecutar el Set de Pruebas.",
  PAYLOAD_TOO_LARGE: "El archivo es demasiado grande (máximo 2 MB).",
  INVALID_TEST_SET: "El archivo no es un Set de Pruebas válido de la DGII.",
  RNC_MISMATCH: "El RNC del Set de Pruebas no coincide con el RNC de tu negocio. Descargá el archivo de la empresa correcta.",
  CERTIFICATE_NOT_READY: "No hay un certificado digital validado para este ambiente. Cargalo y validalo en el paso Ambiente y certificado.",
  NOT_CONFIGURED: "El servicio de certificación no está configurado todavía. Contactá a soporte.",
  RUN_NOT_FOUND: "No encontramos esa ejecución del Set de Pruebas. Cargá el archivo de nuevo.",
  NOT_READY: "Ese documento todavía no está firmado.",
  DGII_AUTH_REJECTED: "La DGII no aceptó la autenticación con tu certificado. Verificá que sea el certificado registrado en el portal.",
  DGII_TIMEOUT: "La DGII no respondió a tiempo. Intentá de nuevo en unos minutos.",
  DGII_UNAVAILABLE: "No se pudo conectar con la DGII. Intentá de nuevo en unos minutos.",
  DGII_ERROR: "La DGII respondió con un error. Intentá de nuevo en unos minutos.",
  CONCURRENT_BATCH: "Otro envío del Set de Pruebas está en curso. Esperá a que termine.",
  SEQUENCE_CONFLICT: "Una de las secuencias e-NCF ya fue usada. Cargá el archivo de nuevo para asignar secuencias nuevas.",
  INVALID_REQUEST: "La solicitud no es válida. Intentá de nuevo.",
  INTERNAL: "No se pudo procesar el Set de Pruebas. Intentá de nuevo en unos minutos.",
};

const FALLBACK_MESSAGE = "No se pudo procesar el Set de Pruebas.";

/** Messages that name the set differ for the commercial approval set. */
const COMMERCIAL_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Solo un administrador del negocio puede ejecutar las Aprobaciones Comerciales.",
  INVALID_TEST_SET: "El archivo no es un Set de Aprobaciones Comerciales válido de la DGII.",
  RNC_MISMATCH: "El RNC comprador del set no coincide con el RNC de tu negocio. Descargá el archivo de la empresa correcta.",
  RUN_NOT_FOUND: "No encontramos esa ejecución de Aprobaciones Comerciales. Cargá el archivo de nuevo.",
  CONCURRENT_BATCH: "Otro envío de Aprobaciones Comerciales está en curso. Esperá a que termine.",
  INTERNAL: "No se pudo procesar el Set de Aprobaciones Comerciales. Intentá de nuevo en unos minutos.",
};
const COMMERCIAL_FALLBACK = "No se pudo procesar el Set de Aprobaciones Comerciales.";

/** The simulation takes the step-2 workbook; messages name the simulation instead. */
const SIMULATION_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Solo un administrador del negocio puede ejecutar la Simulación e-CF.",
  INVALID_TEST_SET: "El archivo no es el Set de Pruebas (Paso 2) de la DGII.",
  RUN_NOT_FOUND: "No encontramos esa Simulación e-CF. Cargá el archivo de nuevo.",
  CONCURRENT_BATCH: "Otro envío de la Simulación e-CF está en curso. Esperá a que termine.",
  INTERNAL: "No se pudo procesar la Simulación e-CF. Intentá de nuevo en unos minutos.",
};
const SIMULATION_FALLBACK = "No se pudo procesar la Simulación e-CF.";

function fallbackMessage(runType: RunType): string {
  if (runType === "commercial_approval") return COMMERCIAL_FALLBACK;
  return runType === "simulation" ? SIMULATION_FALLBACK : FALLBACK_MESSAGE;
}

/** Spanish message for an edge function code; INVALID_TEST_SET keeps the technical detail. */
export function describeRunError(code: string | undefined, detail?: string, runType: RunType = "test_set"): string {
  const messages =
    runType === "commercial_approval"
      ? { ...ERROR_MESSAGES, ...COMMERCIAL_MESSAGES }
      : runType === "simulation"
        ? { ...ERROR_MESSAGES, ...SIMULATION_MESSAGES }
        : ERROR_MESSAGES;
  if (code === "INVALID_TEST_SET" && detail) return `${messages.INVALID_TEST_SET} Detalle: ${detail}`;
  if (code && messages[code]) return messages[code];
  return fallbackMessage(runType);
}

const STATUSES: SubmissionStatus[] = ["pending", "sent", "accepted", "accepted_conditional", "rejected", "error", "ready_for_portal"];
const KINDS: SubmissionKind[] = ["ecf", "rfce", "portal_upload", "acecf"];

function toMessages(value: unknown): DgiiMessageView[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is { codigo?: unknown; valor?: unknown } => !!entry && typeof entry === "object")
    .map((entry) => ({ codigo: typeof entry.codigo === "string" ? entry.codigo : null, valor: typeof entry.valor === "string" ? entry.valor : "" }))
    .filter((entry) => entry.valor || entry.codigo);
}

function toItem(value: unknown): SubmissionItem | null {
  const item = (value ?? {}) as Record<string, unknown>;
  if (typeof item.caseId !== "string" || typeof item.encf !== "string") return null;
  if (!KINDS.includes(item.kind as SubmissionKind) || !STATUSES.includes(item.status as SubmissionStatus)) return null;
  return {
    caseId: item.caseId,
    encf: item.encf,
    tipoEcf: typeof item.tipoEcf === "string" ? item.tipoEcf : item.encf.slice(1, 3),
    kind: item.kind as SubmissionKind,
    sequenceOrder: typeof item.sequenceOrder === "number" ? item.sequenceOrder : 0,
    status: item.status as SubmissionStatus,
    trackId: typeof item.trackId === "string" ? item.trackId : null,
    messages: toMessages(item.messages),
    sourceCaseId: typeof item.sourceCaseId === "string" ? item.sourceCaseId : null,
    signed: item.signed === true,
  };
}

/** Maps a run summary body (start, send-next, status, latest.run) to a view; null when malformed. */
export function toRunView(data: unknown): RunView | null {
  const body = (data ?? {}) as Record<string, unknown>;
  if (typeof body.runId !== "string" || !Array.isArray(body.items)) return null;
  const items = body.items.map(toItem).filter((item): item is SubmissionItem => item !== null).sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  return {
    runId: body.runId,
    environment: body.environment === "test" ? "test" : "certification",
    runType: isRunType(body.runType) ? body.runType : "test_set",
    status: typeof body.status === "string" ? body.status : "pending",
    createdAt: typeof body.createdAt === "string" ? body.createdAt : "",
    counts: countByStatus(items),
    sendComplete: body.sendComplete === true,
    done: body.done === true,
    items,
    waitingFor: typeof body.waitingFor === "string" ? body.waitingFor : null,
    stoppedReason: typeof body.stoppedReason === "string" ? body.stoppedReason : null,
  };
}

export function interpretRunResponse(data: unknown, runType: RunType = "test_set"): RunOutcome {
  const run = toRunView(data);
  if (run) return { ok: true, run };
  const body = (data ?? {}) as { code?: unknown; error?: unknown };
  const code = typeof body.code === "string" && body.code ? body.code : undefined;
  const detail = typeof body.error === "string" ? body.error : undefined;
  return { ok: false, message: describeRunError(code, detail, runType), ...(code ? { code } : {}) };
}

/** Maps a supabase-js `functions.invoke` error (FunctionsHttpError carries the raw Response). */
export async function extractRunInvokeError(error: unknown, runType: RunType = "test_set"): Promise<{ ok: false; message: string; code?: string }> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === "function") {
    try {
      const body = (await (context as Response).json()) as { error?: unknown; code?: unknown };
      const code = typeof body?.code === "string" && body.code ? body.code : undefined;
      const detail = typeof body?.error === "string" ? body.error : undefined;
      return { ok: false, message: describeRunError(code, detail, runType), ...(code ? { code } : {}) };
    } catch {
      // fall through to the generic message
    }
  }
  return { ok: false, message: fallbackMessage(runType) };
}

export function countByStatus(items: SubmissionItem[]): Record<SubmissionStatus, number> {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<SubmissionStatus, number>;
  for (const item of items) counts[item.status]++;
  return counts;
}

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "Pendiente",
  sent: "Enviado (en proceso)",
  accepted: "Aceptado",
  accepted_conditional: "Aceptado condicional",
  rejected: "Rechazado",
  error: "Error",
  ready_for_portal: "Firmado para el portal",
};

export const KIND_LABELS: Record<SubmissionKind, string> = {
  ecf: "e-CF (recepción)",
  rfce: "Resumen RFCE",
  portal_upload: "e-CF consumo < 250 mil (portal)",
  acecf: "Aprobación comercial",
};

export type StatusTone = "neutral" | "progress" | "success" | "warning" | "danger";

export function statusTone(status: SubmissionStatus): StatusTone {
  switch (status) {
    case "accepted":
    case "ready_for_portal":
      return "success";
    case "accepted_conditional":
      return "warning";
    case "rejected":
    case "error":
      return "danger";
    case "sent":
      return "progress";
    default:
      return "neutral";
  }
}

export interface RunProgress {
  total: number;
  finished: number;
  accepted: number;
  failed: number;
  inProcess: number;
  pending: number;
  /** One-line Spanish summary. */
  label: string;
}

export function describeProgress(run: RunView): RunProgress {
  const c = run.counts;
  const total = run.items.length;
  const accepted = c.accepted + c.accepted_conditional + c.ready_for_portal;
  const failed = c.rejected + c.error;
  const finished = accepted + failed;
  const label =
    run.runType === "commercial_approval"
      ? `${finished} de ${total} terminadas · ${accepted} aceptadas · ${failed} con error · ${c.pending} pendientes`
      : `${finished} de ${total} terminados · ${accepted} aceptados o firmados · ${failed} con error · ${c.sent} en proceso · ${c.pending} pendientes`;
  return { total, finished, accepted, failed, inProcess: c.sent, pending: c.pending, label };
}

/** Signed consumo (< 250k) e-CF that the user uploads in the DGII portal. */
export function portalDownloads(run: RunView): SubmissionItem[] {
  return run.items.filter((item) => item.kind === "portal_upload" && item.status === "ready_for_portal");
}

/**
 * Whether the runner offers the consumo < 250k portal downloads block.
 * Both the test set (step 2) and the simulation (step 4) require uploading these signed files
 * to the DGII portal; commercial approval (step 3) does not offer them.
 */
export function shouldOfferConsumoPortalDownloads(runType: RunType, downloadsCount: number): boolean {
  return (runType === "test_set" || runType === "simulation") && downloadsCount > 0;
}

/** True when every RFCE of the run was accepted (the portal upload can be done). */
export function summariesAccepted(run: RunView): boolean {
  const summaries = run.items.filter((item) => item.kind === "rfce");
  return summaries.length > 0 && summaries.every((item) => item.status === "accepted" || item.status === "accepted_conditional");
}

export type LoopAction = "continue" | "poll" | "done" | "stop";

/** What the send loop does after a send-next answer. */
export function nextLoopAction(run: RunView): LoopAction {
  if (run.stoppedReason) return "stop";
  if (run.waitingFor) return "poll";
  if (run.sendComplete) return "done";
  return "continue";
}

/**
 * Pure helper deciding if a loaded run still has documents in "sent" status
 * waiting for DGII resolution, unless stopped or the round budget is exhausted.
 */
export function shouldAutoPoll(run: RunView, pollRounds: number, maxRounds: number): boolean {
  return run.counts.sent > 0 && !run.stoppedReason && pollRounds < maxRounds;
}

export function safeDownloadName(fileName: string, caseId: string): string {
  return /^[\w.-]+\.xml$/i.test(fileName) ? fileName : `${caseId.replace(/[^\w.-]+/g, "_") || "documento"}.xml`;
}

/** One line of the DGII step-4 portal list: documents expected vs accepted by DGII. */
export interface SimulationQuota {
  label: string;
  expected: number;
  accepted: number;
  /** Documents of the run in this line (any status). */
  inRun: number;
}

/**
 * Quotas of the DGII portal list for step 4. E32 >= 250k are e-CF sent to reception; consumo E32
 * (< 250k) count through their RFCE summaries.
 */
export const SIMULATION_QUOTAS: { label: string; expected: number; matches: (item: SubmissionItem) => boolean }[] = [
  ...["31"].map((tipo) => ({ label: `E${tipo}`, expected: 4, matches: (item: SubmissionItem) => item.kind === "ecf" && item.tipoEcf === tipo })),
  { label: "E32 ≥ 250 mil", expected: 2, matches: (item) => item.kind === "ecf" && item.tipoEcf === "32" },
  { label: "E33", expected: 1, matches: (item) => item.kind === "ecf" && item.tipoEcf === "33" },
  ...["34", "41", "43", "44", "45", "46", "47"].map((tipo) => ({
    label: `E${tipo}`,
    expected: 2,
    matches: (item: SubmissionItem) => item.kind === "ecf" && item.tipoEcf === tipo,
  })),
  { label: "RFCE (E32 < 250 mil)", expected: 4, matches: (item) => item.kind === "rfce" },
];

export function simulationQuotaSummary(run: RunView): SimulationQuota[] {
  return SIMULATION_QUOTAS.map((quota) => {
    const items = run.items.filter(quota.matches);
    return {
      label: quota.label,
      expected: quota.expected,
      accepted: items.filter((item) => item.status === "accepted" || item.status === "accepted_conditional").length,
      inRun: items.length,
    };
  });
}
