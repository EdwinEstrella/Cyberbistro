/**
 * Pure helpers for running the DGII test set ("Set de Pruebas") through the `ecf-certification`
 * edge function: request building, response mapping, Spanish messages and summary counts.
 * Nothing here touches the DOM, the network or any secret.
 */

export const ECF_CERTIFICATION_FUNCTION = "ecf-certification";
export const TEST_SET_MAX_BYTES = 2 * 1024 * 1024;
export const SEND_BATCH_LIMIT = 5;

export type TestSetEnvironment = "test" | "certification";
export type SubmissionKind = "ecf" | "rfce" | "portal_upload";
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
}

export interface RunView {
  runId: string;
  environment: TestSetEnvironment;
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

/** Returns a user-facing error (Spanish) or null when the selected file looks acceptable. */
export function validateTestSetFile(file: { name: string; size: number }): string | null {
  if (!/\.xlsx$/i.test(file.name)) return "Seleccioná el archivo .xlsx del Set de Pruebas.";
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

export function buildStartRequest(input: { environment: TestSetEnvironment; xlsxBase64: string; tenantId?: string | null }) {
  return { action: "start", environment: input.environment, xlsxBase64: input.xlsxBase64, ...withTenant(input.tenantId) };
}

export function buildLatestRequest(environment: TestSetEnvironment, tenantId?: string | null) {
  return { action: "latest", environment, ...withTenant(tenantId) };
}

export function buildSendNextRequest(runId: string, tenantId?: string | null, limit = SEND_BATCH_LIMIT) {
  return { action: "send-next", runId, limit: Math.min(Math.max(1, Math.trunc(limit)), SEND_BATCH_LIMIT), ...withTenant(tenantId) };
}

export function buildStatusRequest(runId: string, tenantId?: string | null) {
  return { action: "status", runId, ...withTenant(tenantId) };
}

export function buildDownloadRequest(runId: string, caseId: string, tenantId?: string | null) {
  return { action: "download", runId, caseId, ...withTenant(tenantId) };
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
  INVALID_REQUEST: "La solicitud no es válida. Intentá de nuevo.",
  INTERNAL: "No se pudo procesar el Set de Pruebas. Intentá de nuevo en unos minutos.",
};

const FALLBACK_MESSAGE = "No se pudo procesar el Set de Pruebas.";

/** Spanish message for an edge function code; INVALID_TEST_SET keeps the technical detail. */
export function describeRunError(code: string | undefined, detail?: string): string {
  if (code === "INVALID_TEST_SET" && detail) return `${ERROR_MESSAGES.INVALID_TEST_SET} Detalle: ${detail}`;
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return FALLBACK_MESSAGE;
}

const STATUSES: SubmissionStatus[] = ["pending", "sent", "accepted", "accepted_conditional", "rejected", "error", "ready_for_portal"];
const KINDS: SubmissionKind[] = ["ecf", "rfce", "portal_upload"];

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

export function interpretRunResponse(data: unknown): RunOutcome {
  const run = toRunView(data);
  if (run) return { ok: true, run };
  const body = (data ?? {}) as { code?: unknown; error?: unknown };
  const code = typeof body.code === "string" && body.code ? body.code : undefined;
  const detail = typeof body.error === "string" ? body.error : undefined;
  return { ok: false, message: describeRunError(code, detail), ...(code ? { code } : {}) };
}

/** Maps a supabase-js `functions.invoke` error (FunctionsHttpError carries the raw Response). */
export async function extractRunInvokeError(error: unknown): Promise<{ ok: false; message: string; code?: string }> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === "function") {
    try {
      const body = (await (context as Response).json()) as { error?: unknown; code?: unknown };
      const code = typeof body?.code === "string" && body.code ? body.code : undefined;
      const detail = typeof body?.error === "string" ? body.error : undefined;
      return { ok: false, message: describeRunError(code, detail), ...(code ? { code } : {}) };
    } catch {
      // fall through to the generic message
    }
  }
  return { ok: false, message: FALLBACK_MESSAGE };
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
  const label = `${finished} de ${total} terminados · ${accepted} aceptados o firmados · ${failed} con error · ${c.sent} en proceso · ${c.pending} pendientes`;
  return { total, finished, accepted, failed, inProcess: c.sent, pending: c.pending, label };
}

/** Signed consumo (< 250k) e-CF that the user uploads in the DGII portal. */
export function portalDownloads(run: RunView): SubmissionItem[] {
  return run.items.filter((item) => item.kind === "portal_upload" && item.status === "ready_for_portal");
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

export function safeDownloadName(fileName: string, caseId: string): string {
  return /^[\w.-]+\.xml$/i.test(fileName) ? fileName : `${caseId.replace(/[^\w.-]+/g, "_") || "documento"}.xml`;
}
