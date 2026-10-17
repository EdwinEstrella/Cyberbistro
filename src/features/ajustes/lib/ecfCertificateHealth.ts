/**
 * Pure e-CF certificate health: turns certificate metadata (and upload / worker error codes)
 * into a reason, a user-facing Spanish message and a recommended action.
 *
 * Metadata columns used (real names of public.ecf_certificate_metadata): subject, valid_until,
 * is_ready, last_validation_error, environment. Nothing here touches certificate bytes or passwords.
 */

export type CertificateHealthStatus = "ok" | "warning" | "error";

export type CertificateHealthAction =
  | "none"
  | "request_new"
  | "reenter_password"
  | "upload_again"
  | "contact_support";

export type CertificateHealthReason =
  | "OK"
  | "NOT_UPLOADED"
  | "NOT_READY"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "WRONG_PASSWORD"
  | "RNC_MISMATCH"
  | "INVALID_FILE"
  | "ENVIRONMENT_MISMATCH"
  | "CERTIFICATE_NOT_FOUND"
  | "DECRYPT_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "NOT_AUTHORIZED"
  | "SERVICE_ERROR"
  | "UNKNOWN_ERROR";

export interface CertificateHealth {
  status: CertificateHealthStatus;
  reason: CertificateHealthReason;
  message: string;
  action: CertificateHealthAction;
}

export interface CertificateHealthMetadata {
  subject?: string | null;
  valid_until?: string | null;
  is_ready?: boolean | null;
  environment?: string | null;
  last_validation_error?: string | null;
}

export interface CertificateHealthInput {
  metadata: CertificateHealthMetadata | null | undefined;
  tenantRnc?: string | null;
  selectedEnvironment: string;
  now?: Date;
  /** Optional explicit error code (edge function or worker); overrides last_validation_error. */
  lastErrorCode?: string | null;
}

export const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ACTION_HINTS: Record<CertificateHealthAction, string> = {
  none: "",
  request_new: "Solicitá un certificado nuevo a la entidad certificadora y cargalo aquí.",
  reenter_password: "Volvé a escribir la contraseña del certificado y subilo de nuevo.",
  upload_again: "Subí el archivo .p12 otra vez.",
  contact_support: "Contactá a soporte e indicá este mensaje.",
};

/** dd/mm/yyyy in UTC so the date does not shift with the device time zone. */
export function formatCertificateDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "fecha desconocida";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** RNC (9 digits) or cédula (11 digits) tokens found in a certificate subject. */
export function extractSubjectRncCandidates(subject: string | null | undefined): string[] {
  if (!subject) return [];
  const tokens = subject.match(/\d[\d-]*\d|\d/g) ?? [];
  const found = new Set<string>();
  for (const token of tokens) {
    const digits = token.replace(/\D/g, "");
    if (digits.length === 9 || digits.length === 11) found.add(digits);
  }
  return [...found];
}

/**
 * True only when the subject carries RNC-like numbers AND none match the tenant RNC.
 * Unknown (no tenant RNC or no number in the subject) is never a mismatch.
 */
export function isRncMismatch(subject: string | null | undefined, tenantRnc: string | null | undefined): boolean {
  const tenant = digitsOnly(tenantRnc);
  if (!tenant) return false;
  const candidates = extractSubjectRncCandidates(subject);
  if (candidates.length === 0) return false;
  return !candidates.includes(tenant);
}

function build(
  status: CertificateHealthStatus,
  reason: CertificateHealthReason,
  message: string,
  action: CertificateHealthAction,
): CertificateHealth {
  return { status, reason, message, action };
}

/** Normalizes any known code (or free text containing one) to a canonical code. */
export function normalizeCertificateErrorCode(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  const known = [
    "WRONG_PASSWORD", "INVALID_FILE", "CERTIFICATE_EXPIRED", "CERTIFICATE_NOT_VALID_NOW", "RNC_MISMATCH",
    "ENVIRONMENT_MISMATCH", "CERTIFICATE_NOT_FOUND", "CERTIFICATE_NOT_READY", "CERTIFICATE_METADATA_REQUIRED",
    "CERTIFICATE_PASSPHRASE_REQUIRED", "STORAGE_DOWNLOAD_FAILED", "CERTIFICATE_FETCH_ERROR",
    "CERTIFICATE_CUSTODY_NOT_CONFIGURED", "CERTIFICATE_PARSER_NOT_CONFIGURED", "CERTIFICATE_VALIDATION_FAILED",
    "DECRYPT_FAILED", "FORBIDDEN", "UNAUTHENTICATED", "DOWNLOAD_FAILED", "SAVE_FAILED", "INVALID_REQUEST", "INTERNAL",
  ];
  for (const code of known) if (upper.includes(code)) return code;
  if (/decrypt|unable to authenticate data|invalid encrypted passphrase|ECF_ENCRYPTION_KEY/i.test(text)) return "DECRYPT_FAILED";
  if (/mac could not be verified|invalid password|passphrase|contrase/i.test(text)) return "WRONG_PASSWORD";
  if (/vencid|expired/i.test(text)) return "CERTIFICATE_EXPIRED";
  return null;
}

/** Maps an error code (edge function or fiscal worker) to a health result. */
export function describeCertificateErrorCode(
  rawCode: string | null | undefined,
  context: { validUntil?: string | null; fallbackMessage?: string | null } = {},
): CertificateHealth {
  const code = normalizeCertificateErrorCode(rawCode);
  const expiryText = context.validUntil ? ` el ${formatCertificateDate(context.validUntil)}` : "";
  switch (code) {
    case "WRONG_PASSWORD":
      return build("error", "WRONG_PASSWORD", "La contraseña del certificado es incorrecta.", "reenter_password");
    case "INVALID_FILE":
      return build("error", "INVALID_FILE", "El archivo no es un certificado .p12 válido o está dañado.", "upload_again");
    case "CERTIFICATE_EXPIRED":
    case "CERTIFICATE_NOT_VALID_NOW":
      return build("error", "EXPIRED", `El certificado digital está vencido${expiryText}.`, "request_new");
    case "RNC_MISMATCH":
      return build("error", "RNC_MISMATCH", "El certificado pertenece a otro RNC distinto al de este negocio.", "request_new");
    case "ENVIRONMENT_MISMATCH":
      return build("error", "ENVIRONMENT_MISMATCH", "El certificado cargado es de otro ambiente distinto al seleccionado.", "upload_again");
    case "CERTIFICATE_NOT_FOUND":
    case "CERTIFICATE_NOT_READY":
    case "CERTIFICATE_METADATA_REQUIRED":
      return build("error", "CERTIFICATE_NOT_FOUND", "No se encontró un certificado listo para este ambiente.", "upload_again");
    case "DECRYPT_FAILED":
    case "CERTIFICATE_PASSPHRASE_REQUIRED":
      return build("error", "DECRYPT_FAILED", "No se pudo abrir el certificado guardado. Hay que cargarlo de nuevo.", "upload_again");
    case "STORAGE_DOWNLOAD_FAILED":
    case "DOWNLOAD_FAILED":
    case "CERTIFICATE_FETCH_ERROR":
      return build("error", "STORAGE_UNAVAILABLE", "No se pudo leer el certificado guardado en la nube.", "contact_support");
    case "FORBIDDEN":
    case "UNAUTHENTICATED":
      return build("error", "NOT_AUTHORIZED", "Tu usuario no tiene permiso para administrar el certificado.", "contact_support");
    case "CERTIFICATE_CUSTODY_NOT_CONFIGURED":
    case "CERTIFICATE_PARSER_NOT_CONFIGURED":
    case "CERTIFICATE_VALIDATION_FAILED":
    case "SAVE_FAILED":
    case "INTERNAL":
      return build("error", "SERVICE_ERROR", "El servicio de certificados no pudo completar la operación.", "contact_support");
    case "INVALID_REQUEST":
      return build("error", "INVALID_FILE", "La solicitud del certificado no es válida.", "upload_again");
    default:
      return build(
        "error",
        "UNKNOWN_ERROR",
        context.fallbackMessage?.trim() || "No se pudo validar el certificado.",
        "contact_support",
      );
  }
}

/** Overall health of the stored certificate for the selected environment. */
export function evaluateCertificateHealth(input: CertificateHealthInput): CertificateHealth {
  const { metadata, tenantRnc, selectedEnvironment } = input;
  const now = input.now ?? new Date();

  if (!metadata) {
    return build("warning", "NOT_UPLOADED", "Todavía no hay un certificado cargado para este ambiente.", "upload_again");
  }

  if (metadata.environment && metadata.environment !== selectedEnvironment) {
    return describeCertificateErrorCode("ENVIRONMENT_MISMATCH");
  }

  const errorCode = normalizeCertificateErrorCode(input.lastErrorCode ?? metadata.last_validation_error);
  if (errorCode) {
    return describeCertificateErrorCode(errorCode, { validUntil: metadata.valid_until });
  }

  if (metadata.is_ready !== true) {
    return build("error", "NOT_READY", "El certificado no terminó de validarse.", "upload_again");
  }

  const validUntil = metadata.valid_until ? new Date(metadata.valid_until) : null;
  if (validUntil && !Number.isNaN(validUntil.getTime()) && now.getTime() >= validUntil.getTime()) {
    return describeCertificateErrorCode("CERTIFICATE_EXPIRED", { validUntil: metadata.valid_until });
  }

  if (isRncMismatch(metadata.subject, tenantRnc)) {
    return describeCertificateErrorCode("RNC_MISMATCH");
  }

  if (validUntil && !Number.isNaN(validUntil.getTime()) && validUntil.getTime() - now.getTime() <= EXPIRING_SOON_DAYS * DAY_MS) {
    const days = Math.max(1, Math.ceil((validUntil.getTime() - now.getTime()) / DAY_MS));
    return build(
      "warning",
      "EXPIRING_SOON",
      `El certificado vence el ${formatCertificateDate(validUntil)} (en ${days} ${days === 1 ? "día" : "días"}).`,
      "request_new",
    );
  }

  return build("ok", "OK", "Certificado configurado y listo para firmar.", "none");
}

/** Banner text: message plus the action hint (when any). */
export function formatCertificateHealth(health: CertificateHealth): string {
  const hint = ACTION_HINTS[health.action];
  return hint ? `${health.message} ${hint}` : health.message;
}
