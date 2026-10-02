/**
 * Turns any thrown value into a readable message. Supabase/PostgREST errors are
 * plain objects (not `Error` instances), so `String(error)` yields "[object Object]".
 */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error.trim() || fallback;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
