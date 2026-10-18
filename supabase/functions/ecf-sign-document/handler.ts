// ecf-sign-document: signs DGII-generated XML (postulacion, declaracion jurada) with the tenant's
// cloud-custodied certificate. Pure logic with injected dependencies (tested from vitest).
// Never log or return payloads, certificate material or secrets.
import { NotConfiguredError, decryptPassphrase } from "./custody.ts";
import { analyzeDocument, digitsOnly, isDocumentType } from "./document.ts";

export const MAX_BODY_BYTES = 512 * 1024;
const ADMIN_ROLES = ["admin", "super_admin"];
const ENVIRONMENTS = ["test", "certification", "production"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface Membership {
  tenantId: string;
  rol: string;
}

export interface StoredCertificate {
  p12Bytes: Uint8Array;
  passphraseEncrypted: string;
}

export interface SigningMaterial {
  key: string;
  cert: string;
}

export interface AuditRow {
  tenantId: string;
  environment: string;
  documentType: string;
  rootElement: string;
  inputSha256: string;
  outputSha256: string;
  signedBy: string;
}

export interface SignStore {
  /** Verified user id for a bearer token, or null. */
  authenticate(token: string): Promise<string | null>;
  /** Active memberships of the user. */
  memberships(userId: string): Promise<Membership[]>;
  tenantRnc(tenantId: string): Promise<string | null>;
  /** Ready certificate for (tenant, environment), or null. */
  loadCertificate(tenantId: string, environment: string): Promise<StoredCertificate | null>;
  recordSigned(row: AuditRow): Promise<void>;
}

export interface SignDeps {
  store: SignStore;
  readSigningMaterial(p12Bytes: Uint8Array, passphrase: string): SigningMaterial;
  sign(material: SigningMaterial, xml: string, rootElement: string): string;
  encryptionKey(): string | undefined;
  log(event: string, detail?: Record<string, unknown>): void;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
}

function fail(status: number, code: string, error: string): Response {
  return json(status, { error, code });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

export async function handleRequest(req: Request, deps: SignDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return fail(401, "UNAUTHENTICATED", "Authentication is required.");
    const userId = await deps.store.authenticate(token);
    if (!userId) return fail(401, "UNAUTHENTICATED", "Invalid authentication token.");

    const raw = await readBody(req);
    if (raw === null) return fail(413, "PAYLOAD_TOO_LARGE", "The document is too large.");
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
      payload = parsed as Record<string, unknown>;
    } catch {
      return fail(400, "INVALID_REQUEST", "Invalid request body.");
    }
    const { environment, documentType, xml, tenantId: requestedTenant } = payload;
    if (typeof environment !== "string" || !ENVIRONMENTS.includes(environment)) {
      return fail(400, "INVALID_REQUEST", "environment is invalid.");
    }
    if (!isDocumentType(documentType)) return fail(400, "UNSUPPORTED_DOCUMENT", "documentType is not supported.");
    if (typeof xml !== "string" || !xml.trim()) return fail(400, "INVALID_REQUEST", "xml is required.");
    if (new TextEncoder().encode(xml).byteLength > MAX_BODY_BYTES) {
      return fail(413, "PAYLOAD_TOO_LARGE", "The document is too large.");
    }
    if (requestedTenant !== undefined && (typeof requestedTenant !== "string" || !UUID.test(requestedTenant))) {
      return fail(400, "INVALID_REQUEST", "tenantId is invalid.");
    }

    const admins = (await deps.store.memberships(userId)).filter((m) => ADMIN_ROLES.includes(m.rol));
    const candidates = typeof requestedTenant === "string"
      ? admins.filter((m) => m.tenantId.toLowerCase() === requestedTenant.toLowerCase())
      : admins;
    if (candidates.length === 0) {
      deps.log("forbidden");
      return fail(403, "FORBIDDEN", "You are not authorized to sign documents for this tenant.");
    }
    if (candidates.length > 1) return fail(400, "INVALID_REQUEST", "tenantId is required.");
    const tenantId = candidates[0].tenantId;

    const tenantRnc = await deps.store.tenantRnc(tenantId);
    const analysis = analyzeDocument(xml, documentType, tenantRnc ?? "");
    if (!analysis.ok) {
      deps.log("rejected", { failure: analysis.failure });
      switch (analysis.failure) {
        case "ALREADY_SIGNED":
          return fail(422, "ALREADY_SIGNED", "The document is already signed.");
        case "RNC_MISMATCH":
          return fail(422, "RNC_MISMATCH", "The document RNC does not match the tenant.");
        case "WRONG_ROOT":
          return fail(422, "UNSUPPORTED_DOCUMENT", "The document root element is not allowed.");
        default:
          return fail(422, "UNSUPPORTED_DOCUMENT", "The document is not valid or contains forbidden constructs.");
      }
    }

    const certificate = await deps.store.loadCertificate(tenantId, environment);
    if (!certificate) return fail(409, "CERTIFICATE_NOT_READY", "No ready certificate for this environment.");

    let material: SigningMaterial;
    try {
      const passphrase = await decryptPassphrase(certificate.passphraseEncrypted, deps.encryptionKey());
      material = deps.readSigningMaterial(certificate.p12Bytes, passphrase);
    } catch (error) {
      if (error instanceof NotConfiguredError) throw error;
      deps.log("certificate_unreadable");
      return fail(409, "CERTIFICATE_NOT_READY", "The stored certificate could not be read.");
    }

    const signedXml = deps.sign(material, xml, analysis.rootElement);
    const outputSha256 = await sha256Hex(signedXml);
    // Audit is mandatory: if it cannot be recorded the signed document is not released.
    await deps.store.recordSigned({
      tenantId,
      environment,
      documentType,
      rootElement: analysis.rootElement,
      inputSha256: await sha256Hex(xml),
      outputSha256,
      signedBy: userId,
    });

    deps.log("signed", { documentType });
    return json(200, { signedXml, fileName: `${digitsOnly(tenantRnc)}_${documentType}_signed.xml`, sha256: outputSha256 });
  } catch (error) {
    if (error instanceof NotConfiguredError) {
      deps.log("not_configured");
      return fail(503, "NOT_CONFIGURED", "Certificate custody is not configured.");
    }
    deps.log("internal_error");
    return fail(500, "INTERNAL", "Signing failed.");
  }
}
