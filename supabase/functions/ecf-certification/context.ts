// Shared types and helpers for the ecf-certification actions.
import { NotConfiguredError, decryptPassphrase } from "./custody.ts";
import { DgiiError, isDgiiEnvironment, type DgiiClient, type DgiiEnvironment } from "./dgiiClient.ts";
import type { RunStore } from "./run.ts";

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

export interface CertificationStore extends RunStore {
  /** Verified user id for a bearer token, or null. */
  authenticate(token: string): Promise<string | null>;
  /** Active memberships of the user. */
  memberships(userId: string): Promise<Membership[]>;
  tenantRnc(tenantId: string): Promise<string | null>;
  /** Legal name (tenants.nombre_negocio, "Razón social"), or null. */
  tenantLegalName(tenantId: string): Promise<string | null>;
  /** Ready certificate for (tenant, environment), or null. */
  loadCertificate(tenantId: string, environment: string): Promise<StoredCertificate | null>;
}

export interface CertificationDeps {
  store: CertificationStore;
  readSigningMaterial(p12Bytes: Uint8Array, passphrase: string): SigningMaterial;
  sign(material: SigningMaterial, xml: string, rootElement: string): string;
  encryptionKey(): string | undefined;
  /** A fresh client per call: tokens are never shared between calls or tenants. */
  dgii(environment: DgiiEnvironment): DgiiClient;
  log(event: string, detail?: Record<string, unknown>): void;
  /** Clock (ms) for signature timestamps and the batch time budget; defaults to Date.now. */
  now?(): number;
  /** Wall-clock budget of one send-next call; defaults to 40s. */
  budgetMs?: number;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8" } });
}

export interface ActionContext {
  userId: string;
  tenantId: string;
  payload: Record<string, unknown>;
  deps: CertificationDeps;
}

// DgiiError is re-exported for actions that catch client failures.
export { DgiiError };

/** Decrypts the tenant certificate for the environment and returns a signing function. */
export async function loadSigner(ctx: ActionContext, environment: DgiiEnvironment): Promise<(xml: string, root: string) => string> {
  const certificate = await ctx.deps.store.loadCertificate(ctx.tenantId, environment);
  if (!certificate) throw new HttpError(409, "CERTIFICATE_NOT_READY", "No ready certificate for this environment.");
  let material: SigningMaterial;
  try {
    const passphrase = await decryptPassphrase(certificate.passphraseEncrypted, ctx.deps.encryptionKey());
    material = ctx.deps.readSigningMaterial(certificate.p12Bytes, passphrase);
  } catch (error) {
    if (error instanceof NotConfiguredError) throw error;
    ctx.deps.log("certificate_unreadable");
    throw new HttpError(409, "CERTIFICATE_NOT_READY", "The stored certificate could not be read.");
  }
  return (xml, root) => ctx.deps.sign(material, xml, root);
}

/** Maps DGII client failures to stable response codes (no DGII payloads besides its messages). */
export function dgiiHttpError(error: DgiiError): HttpError {
  switch (error.kind) {
    case "unauthorized":
      return new HttpError(502, "DGII_AUTH_REJECTED", "DGII did not accept the certificate authentication.", { messages: error.messages });
    case "timeout":
      return new HttpError(504, "DGII_TIMEOUT", "DGII did not answer in time.");
    case "network":
      return new HttpError(502, "DGII_UNAVAILABLE", "DGII could not be reached.");
    default:
      return new HttpError(502, "DGII_ERROR", "DGII answered with an error.", { messages: error.messages });
  }
}

export function environmentOf(payload: Record<string, unknown>): DgiiEnvironment {
  const { environment } = payload;
  if (!isDgiiEnvironment(environment)) throw new HttpError(400, "INVALID_REQUEST", "environment is invalid.");
  return environment;
}

export type ActionHandler = (ctx: ActionContext) => Promise<Response>;
