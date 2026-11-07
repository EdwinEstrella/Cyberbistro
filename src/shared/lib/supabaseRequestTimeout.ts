export const SUPABASE_READ_TIMEOUT_MS = 6_000;
export const SUPABASE_WRITE_TIMEOUT_MS = 20_000;
export const SUPABASE_AUTH_TIMEOUT_MS = 20_000;

/**
 * Resolves the request timeout in milliseconds based on URL path and HTTP method:
 * - Any URL whose path contains '/auth/v1/' -> SUPABASE_AUTH_TIMEOUT_MS (20s)
 * - Method GET/HEAD (or undefined, case-insensitive) -> SUPABASE_READ_TIMEOUT_MS (6s)
 * - Any other method (POST/PATCH/PUT/DELETE, including '/rest/v1/rpc/...') -> SUPABASE_WRITE_TIMEOUT_MS (20s)
 */
export function resolveSupabaseRequestTimeoutMs(
  url: string,
  method: string | undefined
): number {
  let pathname = '';
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    pathname = url.split('?')[0].split('#')[0];
  }

  if (pathname.includes('/auth/v1/')) {
    return SUPABASE_AUTH_TIMEOUT_MS;
  }

  const normalizedMethod = (method ?? 'GET').trim().toUpperCase();
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') {
    return SUPABASE_READ_TIMEOUT_MS;
  }

  return SUPABASE_WRITE_TIMEOUT_MS;
}

/**
 * Error thrown when a Supabase network request exceeds its allocated timeout.
 * MUST have name = "AbortError" so postgrest-js fetchWithRetry does not retry
 * the request (retries only skip when name === "AbortError" or code === "ABORT_ERR").
 */
export class SupabaseRequestTimeoutError extends Error {
  readonly code = 'SUPABASE_REQUEST_TIMEOUT' as const;
  readonly timeoutMs: number;

  constructor(ms: number) {
    super(`Supabase request timed out after ${ms} ms`);
    this.name = 'AbortError';
    this.timeoutMs = ms;
    Object.setPrototypeOf(this, SupabaseRequestTimeoutError.prototype);
  }
}

/**
 * Type guard checking whether an unknown error is a SupabaseRequestTimeoutError.
 * Checks the stable code field rather than relying on instanceof alone.
 */
export function isSupabaseRequestTimeoutError(
  error: unknown
): error is SupabaseRequestTimeoutError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'SUPABASE_REQUEST_TIMEOUT'
  );
}
