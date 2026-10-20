// Client helpers for the ecf-certification `send-test` / `test-status` actions: one E31 sent to
// DGII TesteCF with the tenant's test certificate. Requests always pin environment "test".
import type { DgiiMessageView, StatusTone } from "./ecfCertificationRun";

export interface TestSendResult {
  encf: string | null;
  trackId: string;
  estado: string | null;
  mensajes: DgiiMessageView[];
  codigoSeguridad: string | null;
  fechaFirma: string | null;
}

export interface TestSendFailure {
  message: string;
  code?: string;
  encf?: string;
  mensajes: DgiiMessageView[];
}

const withTenant = (tenantId?: string | null) => (tenantId ? { tenantId } : {});

export function buildSendTestRequest(tenantId?: string | null) {
  return { action: "send-test", environment: "test", ...withTenant(tenantId) };
}

export function buildTestStatusRequest(trackId: string, tenantId?: string | null) {
  return { action: "test-status", environment: "test", trackId, ...withTenant(tenantId) };
}

export const NO_TEST_CERTIFICATE_MESSAGE = "Cargá tu certificado en el ambiente Pruebas (TesteCF) primero.";

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Tu sesión venció. Iniciá sesión de nuevo e intentá otra vez.",
  FORBIDDEN: "Solo un administrador del negocio puede enviar la factura de prueba.",
  CERTIFICATE_NOT_READY: NO_TEST_CERTIFICATE_MESSAGE,
  ISSUER_INCOMPLETE: "Faltan datos del emisor (RNC, razón social o dirección fiscal). Completalos en el Paso 1.",
  TEST_ENVIRONMENT_ONLY: "La factura de prueba solo se puede enviar al ambiente Pruebas (TesteCF).",
  NOT_CONFIGURED: "El servicio de certificación no está configurado todavía. Contactá a soporte.",
  DGII_REJECTED: "La DGII rechazó la factura de prueba. Revisá los mensajes de la DGII.",
  DGII_AUTH_REJECTED: "La DGII no aceptó la autenticación con tu certificado. Verificá que sea el certificado registrado en el portal.",
  DGII_TIMEOUT: "La DGII no respondió a tiempo. Intentá de nuevo en unos minutos.",
  DGII_UNAVAILABLE: "No se pudo conectar con la DGII. Intentá de nuevo en unos minutos.",
  DGII_ERROR: "La DGII respondió con un error. Intentá de nuevo en unos minutos.",
  INVALID_REQUEST: "La solicitud no es válida. Intentá de nuevo.",
};

export const TEST_SEND_FALLBACK = "No se pudo enviar la factura de prueba. Intentá de nuevo en unos minutos.";

export function describeTestSendError(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || TEST_SEND_FALLBACK;
}

function toMessages(value: unknown): DgiiMessageView[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is { codigo?: unknown; valor?: unknown } => !!entry && typeof entry === "object")
    .map((entry) => ({ codigo: typeof entry.codigo === "string" ? entry.codigo : null, valor: typeof entry.valor === "string" ? entry.valor : "" }))
    .filter((entry) => entry.valor || entry.codigo);
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

/** Maps a send-test or test-status body; null when it carries no trackId. */
export function toTestSendResult(data: unknown, previous?: TestSendResult | null): TestSendResult | null {
  const body = (data ?? {}) as Record<string, unknown>;
  const trackId = text(body.trackId);
  if (!trackId) return null;
  return {
    encf: text(body.encf) ?? previous?.encf ?? null,
    trackId,
    estado: text(body.estado),
    mensajes: toMessages(body.mensajes ?? body.messages),
    codigoSeguridad: text(body.codigoSeguridad) ?? previous?.codigoSeguridad ?? null,
    fechaFirma: text(body.fechaFirma) ?? previous?.fechaFirma ?? null,
  };
}

/** Error body of the edge function (DGII messages come as `mensajes` or, for client failures, `messages`). */
export function toTestSendFailure(body: unknown): TestSendFailure {
  const record = (body ?? {}) as Record<string, unknown>;
  const code = text(record.code) ?? undefined;
  const encf = text(record.encf) ?? undefined;
  return {
    message: describeTestSendError(code),
    ...(code ? { code } : {}),
    ...(encf ? { encf } : {}),
    mensajes: toMessages(record.mensajes ?? record.messages),
  };
}

/** Maps a supabase-js `functions.invoke` error (FunctionsHttpError carries the raw Response). */
export async function extractTestSendInvokeError(error: unknown): Promise<TestSendFailure> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === "function") {
    try {
      return toTestSendFailure(await (context as Response).json());
    } catch {
      // fall through to the generic message
    }
  }
  return { message: TEST_SEND_FALLBACK, mensajes: [] };
}

/** Spanish label and tone for the DGII `estado` of a TesteCF submission. */
export function testEstadoView(estado: string | null): { label: string; tone: StatusTone; final: boolean } {
  const normalized = (estado ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (normalized === "aceptado") return { label: "Aceptado", tone: "success", final: true };
  if (normalized === "aceptado condicional") return { label: "Aceptado condicional", tone: "warning", final: true };
  if (normalized === "rechazado") return { label: "Rechazado", tone: "danger", final: true };
  if (normalized === "no encontrado") return { label: "No encontrado", tone: "neutral", final: false };
  return { label: "En proceso", tone: "progress", final: false };
}
