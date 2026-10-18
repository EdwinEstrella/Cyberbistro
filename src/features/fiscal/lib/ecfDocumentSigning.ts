/**
 * Pure helpers for signing DGII-generated XML (postulacion, declaracion jurada) with the tenant
 * certificate through the `ecf-sign-document` edge function. Nothing here touches the DOM, the
 * network or any secret; the XML itself is never logged.
 */

export const ECF_SIGN_FUNCTION = "ecf-sign-document";
export const ECF_SIGN_MAX_BYTES = 512 * 1024;

export type EcfSignEnvironment = "test" | "certification" | "production";
export type EcfSignDocumentType = "postulacion" | "declaracion_jurada";

export interface SignDocumentRequest {
  environment: EcfSignEnvironment;
  documentType: EcfSignDocumentType;
  xml: string;
  tenantId?: string;
}

export type SignOutcome =
  | { ok: true; signedXml: string; fileName: string; sha256: string }
  | { ok: false; message: string; code?: string };

/** Returns a user-facing error (Spanish) or null when the selected file looks acceptable. */
export function validateXmlFile(file: { name: string; size: number }): string | null {
  if (!/\.xml$/i.test(file.name)) return "Seleccioná un archivo .xml.";
  if (file.size <= 0) return "El archivo está vacío.";
  if (file.size > ECF_SIGN_MAX_BYTES) return "El archivo es demasiado grande (máximo 512 KB).";
  return null;
}

export function buildSignRequest(input: SignDocumentRequest): SignDocumentRequest {
  return {
    environment: input.environment,
    documentType: input.documentType,
    xml: input.xml,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Tu sesión venció. Iniciá sesión de nuevo e intentá otra vez.",
  FORBIDDEN: "Solo un administrador del negocio puede firmar documentos.",
  PAYLOAD_TOO_LARGE: "El archivo es demasiado grande (máximo 512 KB).",
  UNSUPPORTED_DOCUMENT: "El XML no es el documento esperado. Descargalo de nuevo desde el portal de la DGII y no lo modifiques.",
  ALREADY_SIGNED: "Este XML ya está firmado. Subí el archivo original que descargaste del portal.",
  RNC_MISMATCH: "El RNC del documento no coincide con el RNC de tu negocio. Revisá que descargaste el XML de la empresa correcta.",
  CERTIFICATE_NOT_READY: "No hay un certificado digital validado para este ambiente. Cargalo y validalo en el paso Ambiente y certificado.",
  NOT_CONFIGURED: "El servicio de firma no está configurado todavía. Contactá a soporte.",
  INVALID_REQUEST: "La solicitud de firma no es válida. Intentá de nuevo.",
  INTERNAL: "No se pudo firmar el documento. Intentá de nuevo en unos minutos.",
};

const FALLBACK_MESSAGE = "No se pudo firmar el documento.";

export function describeSigningError(code: string | undefined, fallbackMessage?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallbackMessage || FALLBACK_MESSAGE;
}

/** Interprets the edge function JSON body. Success requires a non-empty `signedXml`. */
export function interpretSignResponse(data: unknown): SignOutcome {
  const body = (data ?? {}) as { signedXml?: unknown; fileName?: unknown; sha256?: unknown; error?: unknown; code?: unknown };
  if (typeof body.signedXml === "string" && body.signedXml.trim()) {
    return {
      ok: true,
      signedXml: body.signedXml,
      fileName: typeof body.fileName === "string" && body.fileName ? body.fileName : "documento_firmado.xml",
      sha256: typeof body.sha256 === "string" ? body.sha256 : "",
    };
  }
  const code = typeof body.code === "string" && body.code ? body.code : undefined;
  const detail = typeof body.error === "string" && body.error ? body.error : undefined;
  return { ok: false, message: describeSigningError(code, detail), ...(code ? { code } : {}) };
}

/** Maps a supabase-js `functions.invoke` error (FunctionsHttpError carries the raw Response) to an outcome. */
export async function extractSignInvokeError(error: unknown): Promise<{ ok: false; message: string; code?: string }> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === "function") {
    try {
      const body = (await (context as Response).json()) as { error?: unknown; code?: unknown };
      const code = typeof body?.code === "string" && body.code ? body.code : undefined;
      const detail = typeof body?.error === "string" && body.error ? body.error : undefined;
      return { ok: false, message: describeSigningError(code, detail), ...(code ? { code } : {}) };
    } catch {
      // fall through to the generic message
    }
  }
  return { ok: false, message: FALLBACK_MESSAGE };
}

/** Keeps the server-provided name when it is a safe .xml name; otherwise derives one from the input file. */
export function resolveSignedFileName(serverName: string, originalName: string): string {
  if (/^[\w.-]+\.xml$/i.test(serverName)) return serverName;
  const base = originalName.replace(/\.xml$/i, "").replace(/[^\w.-]+/g, "_") || "documento";
  return `${base}_firmado.xml`;
}
