import { buildEmail, type EmailPayload } from "./buildEmail.ts";
import { parseBody } from "./parseBody.ts";
import { resolveRecipient } from "./resolveRecipient.ts";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface SuggestionRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  mesa_numero: number | null;
  message: string;
  contact: string | null;
  created_at: string;
  email_status: "pending" | "sent" | "failed" | "skipped";
  email_error: string | null;
}

export interface TenantInfo {
  businessName: string | null;
  ownerEmail: string | null;
}

export interface SuggestionEmailStore {
  /**
   * Atomically claims a pending suggestion row by moving it from 'pending' to 'sent'
   * as an in-flight guard. Returns the claimed row, or null if not found or already claimed.
   * The handler is responsible for correcting it to 'failed' or 'skipped' when sending does not complete.
   */
  claimSuggestion(suggestionId: string): Promise<SuggestionRow | null>;

  /**
   * Resolves the business name from tenants and the owner email from active admin tenant_users.
   */
  resolveTenantInfo(tenantId: string): Promise<TenantInfo>;

  /**
   * Reads digital_menu_settings.public_contact->>'suggestion_email' for the tenant/sucursal.
   */
  getPublicContactEmail(tenantId: string, sucursalId: string | null): Promise<string | null>;

  /**
   * Marks the suggestion row as successfully sent.
   */
  markSent(suggestionId: string): Promise<void>;

  /**
   * Marks the suggestion row as failed, retaining the error message for owner inspection.
   */
  markFailed(suggestionId: string, error: string): Promise<void>;

  /**
   * Marks the suggestion row as skipped (e.g. no recipient configured).
   */
  markSkipped(suggestionId: string, reason: string): Promise<void>;
}

export interface SendResendEmailParams {
  apiKey: string;
  idempotencyKey: string;
  email: EmailPayload;
}

export interface ResendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface SuggestionEmailDeps {
  store: SuggestionEmailStore;
  getResendApiKey: () => string | undefined;
  sendResendEmail?: (params: SendResendEmailParams) => Promise<ResendResult>;
  log?: (level: "info" | "warn" | "error", message: string, detail?: Record<string, unknown>) => void;
}

/**
 * Default network transport to Resend REST API (https://api.resend.com/emails).
 */
export async function defaultSendResendEmail(params: SendResendEmailParams): Promise<ResendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": params.idempotencyKey,
      },
      body: JSON.stringify(params.email),
    });

    if (!res.ok) {
      let errorMessage = `Resend HTTP ${res.status}`;
      try {
        const json = await res.json();
        if (json && typeof json === "object" && json.message) {
          errorMessage = String(json.message);
        }
      } catch {
        // Non-JSON response
      }
      return { ok: false, error: errorMessage };
    }

    const data = await res.json();
    return { ok: true, id: data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error communicating with Resend",
    };
  }
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

/**
 * Pure request handler for the menu-suggestion-email edge function.
 */
export async function handleRequest(req: Request, deps: SuggestionEmailDeps): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  let claimed: SuggestionRow | null = null;
  let finalized = false;

  try {
    let payload;
    try {
      const rawBody = await req.json();
      payload = parseBody(rawBody);
    } catch {
      return jsonResponse(400, { ok: false, error: "Invalid request payload" });
    }

    // 1. Atomically claim the pending suggestion row
    claimed = await deps.store.claimSuggestion(payload.suggestion_id);
    if (!claimed) {
      // Return neutral 200 { ok: true } without revealing row existence or non-pending state
      return jsonResponse(200, { ok: true });
    }

    // 2. Check for Resend API key (fail closed gracefully if missing)
    const resendApiKey = deps.getResendApiKey()?.trim();
    if (!resendApiKey) {
      deps.log?.("warn", "Missing RESEND_API_KEY; marking suggestion as failed", {
        suggestionId: claimed.id,
      });
      await deps.store.markFailed(claimed.id, "RESEND_API_KEY is not configured");
      finalized = true;
      return jsonResponse(500, { ok: false, error: "Email delivery service unavailable" });
    }

    // 3. Resolve recipient: settings email > owner email > none
    const [settingsEmail, tenantInfo] = await Promise.all([
      deps.store.getPublicContactEmail(claimed.tenant_id, claimed.sucursal_id),
      deps.store.resolveTenantInfo(claimed.tenant_id),
    ]);

    const recipient = resolveRecipient({
      settingsEmail,
      ownerEmail: tenantInfo.ownerEmail,
    });

    if (!recipient) {
      deps.log?.("info", "No recipient email configured; marking suggestion skipped", {
        suggestionId: claimed.id,
      });
      await deps.store.markSkipped(claimed.id, "No recipient email configured");
      finalized = true;
      return jsonResponse(200, { ok: true });
    }

    // 4. Build email payload
    const email = buildEmail({
      businessName: tenantInfo.businessName,
      recipient,
      message: claimed.message,
      contact: claimed.contact,
      mesaNumero: claimed.mesa_numero,
      createdAt: claimed.created_at,
    });

    // 5. Send via Resend REST with idempotency key
    const sendFn = deps.sendResendEmail ?? defaultSendResendEmail;
    const idempotencyKey = `suggestion-${claimed.id}`;
    const resendResult = await sendFn({
      apiKey: resendApiKey,
      idempotencyKey,
      email,
    });

    if (resendResult.ok) {
      try {
        await deps.store.markSent(claimed.id);
      } catch (markErr) {
        deps.log?.("warn", "Failed to mark suggestion as sent after successful delivery", {
          suggestionId: claimed.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
      finalized = true;
      return jsonResponse(200, { ok: true });
    }

    // Resend or network delivery failure
    const errorDetail = resendResult.error ? resendResult.error.slice(0, 500) : "Resend delivery failed";
    deps.log?.("error", "Resend delivery failed", {
      suggestionId: claimed.id,
      error: errorDetail,
    });
    await deps.store.markFailed(claimed.id, errorDetail);
    finalized = true;

    return jsonResponse(500, { ok: false, error: "Failed to send email" });
  } catch {
    if (claimed && !finalized) {
      try {
        await deps.store.markFailed(claimed.id, "Unexpected error while sending the suggestion email");
      } catch (markErr) {
        deps.log?.("warn", "Failed to mark suggestion as failed during unhandled error recovery", {
          suggestionId: claimed.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
    }
    deps.log?.("error", "Unhandled error processing suggestion email");
    return jsonResponse(500, { ok: false, error: "An unexpected error occurred" });
  }
}
