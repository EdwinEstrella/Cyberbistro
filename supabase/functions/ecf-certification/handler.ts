// ecf-certification: runs the DGII certification test set ("Set de Pruebas") with the tenant's
// cloud-custodied certificate. Pure logic with injected dependencies (tested from vitest).
// Never log or return certificates, passphrases, DGII tokens or XML payloads (except the signed
// test documents an admin downloads for the portal upload).
import { NotConfiguredError } from "./custody.ts";
import {
  CORS,
  DgiiError,
  HttpError,
  dgiiHttpError,
  json,
  type ActionHandler,
  type CertificationDeps,
} from "./context.ts";
import { authCheck } from "./actions.ts";
import { downloadSigned, latestRun, pollStatus, sendNext, startRun } from "./run.ts";

export const MAX_BODY_BYTES = 4 * 1024 * 1024;
const ADMIN_ROLES = ["admin", "super_admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type { CertificationDeps, CertificationStore, Membership, SigningMaterial, StoredCertificate } from "./context.ts";

function fail(status: number, code: string, error: string, extra: Record<string, unknown> = {}): Response {
  return json(status, { error, code, ...extra });
}

/** Reads the body up to the cap; null when it is larger. */
async function readBody(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

const ACTIONS: Record<string, ActionHandler> = {
  "auth-check": authCheck,
  start: startRun,
  "send-next": sendNext,
  status: pollStatus,
  latest: latestRun,
  download: downloadSigned,
};

export async function handleRequest(req: Request, deps: CertificationDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(401, "UNAUTHENTICATED", "Authentication is required.");
    const userId = await deps.store.authenticate(token);
    if (!userId) return fail(401, "UNAUTHENTICATED", "Invalid authentication token.");

    const raw = await readBody(req);
    if (raw === null) return fail(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
      payload = parsed as Record<string, unknown>;
    } catch {
      return fail(400, "INVALID_REQUEST", "Invalid request body.");
    }
    const name = payload.action;
    const action = typeof name === "string" && Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : undefined;
    if (!action) return fail(400, "INVALID_REQUEST", "action is not supported.");
    const requestedTenant = payload.tenantId;
    if (requestedTenant !== undefined && (typeof requestedTenant !== "string" || !UUID.test(requestedTenant))) {
      return fail(400, "INVALID_REQUEST", "tenantId is invalid.");
    }

    const admins = (await deps.store.memberships(userId)).filter((m) => ADMIN_ROLES.includes(m.rol));
    const candidates = typeof requestedTenant === "string"
      ? admins.filter((m) => m.tenantId.toLowerCase() === requestedTenant.toLowerCase())
      : admins;
    if (candidates.length === 0) {
      deps.log("forbidden");
      return fail(403, "FORBIDDEN", "You are not authorized to run the certification for this tenant.");
    }
    if (candidates.length > 1) return fail(400, "INVALID_REQUEST", "tenantId is required.");

    return await action({ userId, tenantId: candidates[0].tenantId, payload, deps });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.code, error.message, error.extra);
    if (error instanceof DgiiError) {
      const mapped = dgiiHttpError(error);
      deps.log("dgii_error", { kind: error.kind, status: error.status });
      return fail(mapped.status, mapped.code, mapped.message, mapped.extra);
    }
    if (error instanceof NotConfiguredError) {
      deps.log("not_configured");
      return fail(503, "NOT_CONFIGURED", "Certificate custody is not configured.");
    }
    deps.log("internal_error");
    return fail(500, "INTERNAL", "The certification request failed.");
  }
}
