/**
 * Pure helpers for the e-CF certificate cloud-custody upload.
 *
 * Flow: the client uploads the .p12 to the private `fiscal_certificates` bucket under
 * `<tenant_id>/<object>.p12`, then calls the `validate-ecf-certificate` edge function with
 * `{ environment, storage_path, passphrase }`. Only the edge function marks the metadata
 * row ready. Nothing here logs or returns certificate bytes or the passphrase.
 */

export const ECF_CERTIFICATE_BUCKET = "fiscal_certificates";
export const ECF_CERTIFICATE_FUNCTION = "validate-ecf-certificate";
export const ECF_CERTIFICATE_MAX_BYTES = 256 * 1024;

export interface ValidateCertificateRequest {
  environment: string;
  storage_path: string;
  passphrase: string;
}

export interface CertificateUploadOutcome {
  ok: boolean;
  message: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns a user-facing error (Spanish) or null when the selected file looks acceptable. */
export function validateCertificateFile(file: { name: string; size: number }): string | null {
  if (!/\.(p12|pfx)$/i.test(file.name)) return "Seleccioná un archivo de certificado .p12.";
  if (file.size <= 0) return "El archivo del certificado está vacío.";
  if (file.size > ECF_CERTIFICATE_MAX_BYTES) return "El archivo del certificado es demasiado grande.";
  return null;
}

/**
 * Builds the tenant-scoped object path accepted by the edge function
 * (`<uuid>/<name>.p12`). The name is unique per upload so no overwrite permission is needed.
 */
export function buildCertificateStoragePath(tenantId: string, environment: string, now: Date = new Date()): string {
  if (!UUID_PATTERN.test(tenantId)) throw new Error("Tenant inválido para guardar el certificado.");
  const safeEnvironment = environment.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "env";
  return `${tenantId.toLowerCase()}/${safeEnvironment}-${now.getTime()}.p12`;
}

export function buildValidateRequest(input: {
  environment: string;
  storagePath: string;
  passphrase: string;
}): ValidateCertificateRequest {
  return {
    environment: input.environment.trim(),
    storage_path: input.storagePath,
    passphrase: input.passphrase,
  };
}

/** Interprets the edge function JSON body. Success requires `success === true`. */
export function interpretValidateResponse(data: unknown): CertificateUploadOutcome {
  const body = (data ?? {}) as { success?: unknown; error?: unknown };
  if (body.success === true) {
    return { ok: true, message: "Certificado validado y guardado de forma segura en la nube." };
  }
  const detail = typeof body.error === "string" && body.error ? body.error : "No se pudo validar el certificado.";
  return { ok: false, message: detail };
}

/**
 * Extracts the message from a supabase-js `functions.invoke` error. Non-2xx responses come as
 * FunctionsHttpError whose `context` is the raw Response carrying `{ error }`.
 */
export async function extractInvokeErrorMessage(error: unknown): Promise<string> {
  const fallback = "No se pudo validar el certificado.";
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === "function") {
    try {
      const body = (await (context as Response).json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error) return body.error;
    } catch {
      // fall through to the generic message
    }
  }
  return fallback;
}

/** True when a stored metadata row can be treated as ready (cloud custody complete). */
export function isCertificateReadyInCloud(row: { is_ready?: boolean | null } | null | undefined): boolean {
  return row?.is_ready === true;
}
