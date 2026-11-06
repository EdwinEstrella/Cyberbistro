/**
 * Pure fiscal sync payload adjustments shared between browser and Electron environments.
 * Contains no browser, Supabase client, or filesystem dependencies.
 */

export function buildEcfDocumentPayloadForServer(payload: Record<string, unknown>): { payload: Record<string, unknown>; adjusted: boolean } {
  if (payload["status"] !== "pending_offline") return { payload, adjusted: false };
  return { payload: { ...payload, status: "queued" }, adjusted: true };
}

export function buildFiscalOutboxPayloadForServer(payload: Record<string, unknown>): { payload: Record<string, unknown>; adjusted: boolean } {
  if (payload["status"] !== "pending_sync") return { payload, adjusted: false };
  return { payload: { ...payload, status: "queued" }, adjusted: true };
}
