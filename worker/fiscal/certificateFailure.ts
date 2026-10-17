import type { FiscalWorkerError } from "./types";

/**
 * Codes written to public.ecf_certificate_metadata.last_validation_error. They are a subset of the
 * codes understood by src/features/ajustes/lib/ecfCertificateHealth.ts (normalizeCertificateErrorCode).
 */
export type CertificateFailureCode =
  | "CERTIFICATE_NOT_FOUND"
  | "CERTIFICATE_NOT_READY"
  | "CERTIFICATE_EXPIRED"
  | "CERTIFICATE_NOT_VALID_NOW"
  | "CERTIFICATE_METADATA_REQUIRED"
  | "CERTIFICATE_PASSPHRASE_REQUIRED"
  | "STORAGE_DOWNLOAD_FAILED"
  | "CERTIFICATE_FETCH_ERROR"
  | "DECRYPT_FAILED"
  | "INVALID_FILE";

const DIRECT_CODES: ReadonlySet<string> = new Set<CertificateFailureCode>([
  "CERTIFICATE_NOT_FOUND",
  "CERTIFICATE_NOT_READY",
  "CERTIFICATE_EXPIRED",
  "CERTIFICATE_NOT_VALID_NOW",
  "CERTIFICATE_METADATA_REQUIRED",
  "CERTIFICATE_PASSPHRASE_REQUIRED",
  "STORAGE_DOWNLOAD_FAILED",
]);

const DECRYPT_PATTERN = /decrypt|unable to authenticate data|invalid encrypted passphrase|ECF_ENCRYPTION_KEY/i;

/**
 * Returns the certificate-class failure code for a worker error, or null when the error is not
 * about the certificate itself (DGII network/validation, invoice data, tenant mismatch, ...).
 * Only a short code is returned: never the raw message, which could carry sensitive detail.
 */
export function classifyCertificateFailure(error: Pick<FiscalWorkerError, "code" | "message">): CertificateFailureCode | null {
  if (DIRECT_CODES.has(error.code)) return error.code as CertificateFailureCode;
  if (error.code === "CERTIFICATE_FETCH_ERROR") {
    return DECRYPT_PATTERN.test(error.message) ? "DECRYPT_FAILED" : "CERTIFICATE_FETCH_ERROR";
  }
  if (error.code === "SIGN_ERROR" && /invalid certificate/i.test(error.message)) return "INVALID_FILE";
  return null;
}
