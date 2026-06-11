import type { FiscalWorkerError } from "./types";

export function fiscalWorkerError(code: string, message: string, retryable = false): FiscalWorkerError {
  return { code, message, retryable };
}

export function unknownToWorkerError(error: unknown, fallbackCode: string, retryable: boolean): FiscalWorkerError {
  if (error && typeof error === "object" && "code" in error && "message" in error && "retryable" in error) {
    return error as FiscalWorkerError;
  }
  const message = error instanceof Error ? error.message : String(error ?? "Unknown fiscal worker error");
  return fiscalWorkerError(fallbackCode, message, retryable);
}
