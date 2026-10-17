// Request handler for the DGII inbound services. Dependencies are injected so the whole flow is
// testable from vitest with an in-memory store; index.ts wires the real Supabase store.
import { decryptPassphrase, NotConfiguredError } from "./custody.ts";
import {
  buildArecfXml,
  createSeed,
  decideReception,
  extractAcecfFields,
  extractEcfFields,
  extractSeedValue,
  issueToken,
  MAX_XML_BYTES,
  NoReceivedCode,
  parseBearerToken,
  parseReceptorPath,
  sha256Hex,
  tagText,
  validateApproval,
  type ReceptionDecision,
} from "./protocol.ts";
import type { SigningMaterial, VerifyResult } from "./security.ts";

export interface StoredCertificate {
  p12Bytes: Uint8Array;
  passphraseEncrypted: string;
}

export interface ReceivedDocumentRow {
  tenantId: string;
  emisorRnc: string;
  compradorRnc: string;
  encf: string;
  tipoEcf: string | null;
  estado: 0 | 1;
  motivoNoRecibido: number | null;
  xml: string;
  arecfXml: string;
}

export interface ReceivedApprovalRow {
  tenantId: string;
  emisorRnc: string;
  compradorRnc: string;
  encf: string;
  estado: number;
  detalleMotivoRechazo: string | null;
  xml: string;
}

export interface ReceptorStore {
  /** Tenant id for an RNC, or null when unknown or shared by several tenants. */
  resolveTenant(rnc: string): Promise<string | null>;
  createSeed(tenantId: string, hash: string, expiresAt: Date): Promise<void>;
  /** Atomically marks an unused, unexpired seed as consumed. */
  consumeSeed(tenantId: string, hash: string, now: Date): Promise<boolean>;
  createToken(tenantId: string, hash: string, expiresAt: Date): Promise<void>;
  findTokenTenant(hash: string, now: Date): Promise<string | null>;
  hasAcceptedDocument(tenantId: string, emisorRnc: string, encf: string): Promise<boolean>;
  insertDocument(row: ReceivedDocumentRow): Promise<"inserted" | "duplicate">;
  insertApproval(row: ReceivedApprovalRow): Promise<void>;
  loadCertificate(tenantId: string): Promise<StoredCertificate | null>;
}

export interface ReceptorSecurity {
  readSigningMaterial(p12Bytes: Uint8Array, passphrase: string): SigningMaterial;
  sign(material: SigningMaterial, xml: string, rootElement: string): string;
  verify(xml: string, now: Date): VerifyResult;
}

export interface ReceptorDeps {
  store: ReceptorStore;
  security: ReceptorSecurity;
  now(): Date;
  encryptionKey(): string | undefined;
  log(event: string, detail?: Record<string, string | number>): void;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function xml(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/xml; charset=utf-8" } });
}

/** Multipart `xml` file (the DGII client contract) or a raw XML body. */
async function readXmlPayload(req: Request): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_XML_BYTES) throw new HttpError(413, "Payload too large.", "PAYLOAD_TOO_LARGE");
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  let text: string;
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const part = form.get("xml") ?? Array.from(form.values()).find((value) => typeof value !== "string");
      if (part === null || part === undefined) throw new HttpError(400, "Missing xml file.", "INVALID_REQUEST");
      text = typeof part === "string" ? part : await part.text();
    } else {
      text = await req.text();
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Could not read the request body.", "INVALID_REQUEST");
  }
  if (!text.trim()) throw new HttpError(400, "Empty XML payload.", "INVALID_REQUEST");
  if (new TextEncoder().encode(text).byteLength > MAX_XML_BYTES) {
    throw new HttpError(413, "Payload too large.", "PAYLOAD_TOO_LARGE");
  }
  return text.replace(/^﻿/, "");
}

async function requireToken(req: Request, tenantId: string, deps: ReceptorDeps): Promise<void> {
  const token = parseBearerToken(req.headers.get("authorization"));
  if (!token) throw new HttpError(401, "Bearer token required.", "UNAUTHENTICATED");
  const owner = await deps.store.findTokenTenant(await sha256Hex(token), deps.now());
  if (owner !== tenantId) throw new HttpError(401, "Invalid or expired token.", "UNAUTHENTICATED");
}

async function signWithTenantCertificate(deps: ReceptorDeps, tenantId: string, document: string, root: string): Promise<string> {
  const stored = await deps.store.loadCertificate(tenantId);
  if (!stored) throw new HttpError(503, "The taxpayer has no ready certificate.", "CERTIFICATE_UNAVAILABLE");
  const passphrase = await decryptPassphrase(stored.passphraseEncrypted, deps.encryptionKey());
  return deps.security.sign(deps.security.readSigningMaterial(stored.p12Bytes, passphrase), document, root);
}

async function handleSeed(req: Request, tenantId: string, deps: ReceptorDeps): Promise<Response> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed.", "METHOD_NOT_ALLOWED");
  const now = deps.now();
  const seed = await createSeed(now);
  await deps.store.createSeed(tenantId, seed.record.hash, seed.record.expiresAt);
  return xml(seed.xml);
}

async function handleValidateSeed(req: Request, tenantId: string, deps: ReceptorDeps): Promise<Response> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.", "METHOD_NOT_ALLOWED");
  const signedSeed = await readXmlPayload(req);
  const now = deps.now();
  const valor = extractSeedValue(signedSeed);
  if (!valor) throw new HttpError(400, "Signed seed has an unexpected format.", "INVALID_SEED");
  const verification = deps.security.verify(signedSeed, now);
  if (!verification.valid) {
    deps.log("seed_signature_rejected", { reason: verification.reason ?? "unknown" });
    throw new HttpError(401, "Seed signature is invalid.", "INVALID_SIGNATURE");
  }
  if (!(await deps.store.consumeSeed(tenantId, await sha256Hex(valor), now))) {
    throw new HttpError(401, "Seed is unknown, expired or already used.", "INVALID_SEED");
  }
  const issued = await issueToken(now);
  await deps.store.createToken(tenantId, issued.hash, issued.expiresAt);
  return json(issued.response);
}

async function handleReception(req: Request, tenantId: string, tenantRnc: string, deps: ReceptorDeps): Promise<Response> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.", "METHOD_NOT_ALLOWED");
  await requireToken(req, tenantId, deps);
  const document = await readXmlPayload(req);
  const now = deps.now();
  const fields = extractEcfFields(document);
  const signatureValid = fields !== null && deps.security.verify(document, now).valid;
  const emisorRnc = fields?.rncEmisor ?? tagText(document, "RNCEmisor") ?? "";
  const encf = fields?.encf ?? tagText(document, "eNCF") ?? "";
  const isDuplicate = fields !== null ? await deps.store.hasAcceptedDocument(tenantId, fields.rncEmisor, fields.encf) : false;

  const respond = async (decision: ReceptionDecision): Promise<{ arecf: string; row: ReceivedDocumentRow }> => {
    const unsigned = buildArecfXml({ rncEmisor: emisorRnc, rncComprador: tenantRnc, encf, decision, now });
    const arecf = await signWithTenantCertificate(deps, tenantId, unsigned, "ARECF");
    return {
      arecf,
      row: {
        tenantId,
        emisorRnc,
        compradorRnc: fields?.rncComprador ?? tagText(document, "RNCComprador") ?? "",
        encf,
        tipoEcf: fields?.tipoEcf ?? null,
        estado: decision.estado === "0" ? 0 : 1,
        motivoNoRecibido: decision.estado === "1" ? Number(decision.codigo) : null,
        xml: document,
        arecfXml: arecf,
      },
    };
  };

  let result = await respond(decideReception({ fields, signatureValid, tenantRnc, isDuplicate }));
  if ((await deps.store.insertDocument(result.row)) === "duplicate") {
    // Lost a race with a concurrent identical submission: answer "duplicate" and keep an audit row.
    result = await respond({ estado: "1", codigo: NoReceivedCode.Duplicate });
    await deps.store.insertDocument(result.row);
  }
  return xml(result.arecf);
}

async function handleApproval(req: Request, tenantId: string, tenantRnc: string, deps: ReceptorDeps): Promise<Response> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.", "METHOD_NOT_ALLOWED");
  await requireToken(req, tenantId, deps);
  const document = await readXmlPayload(req);
  const fields = extractAcecfFields(document);
  const signatureValid = fields !== null && deps.security.verify(document, deps.now()).valid;
  const validation = validateApproval(fields, signatureValid, tenantRnc);
  if (!validation.ok || !fields) {
    throw new HttpError(400, validation.ok ? "Invalid ACECF." : validation.message, validation.ok ? "SPECIFICATION" : validation.code);
  }
  await deps.store.insertApproval({
    tenantId,
    emisorRnc: fields.rncEmisor,
    compradorRnc: fields.rncComprador,
    encf: fields.encf,
    estado: fields.estado,
    detalleMotivoRechazo: fields.detalleMotivoRechazo,
    xml: document,
  });
  return json({ message: "Commercial approval received.", encf: fields.encf });
}

export async function handleRequest(req: Request, deps: ReceptorDeps): Promise<Response> {
  try {
    const route = parseReceptorPath(new URL(req.url).pathname);
    if (!route) throw new HttpError(404, "Not found.", "NOT_FOUND");
    const tenantId = await deps.store.resolveTenant(route.rnc);
    if (!tenantId) throw new HttpError(404, "Taxpayer not found.", "TENANT_NOT_FOUND");
    switch (route.service) {
      case "seed":
        return await handleSeed(req, tenantId, deps);
      case "validateSeed":
        return await handleValidateSeed(req, tenantId, deps);
      case "reception":
        return await handleReception(req, tenantId, route.rnc, deps);
      case "approval":
        return await handleApproval(req, tenantId, route.rnc, deps);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof NotConfiguredError) {
      deps.log("not_configured", { message: error.message });
      return json({ error: "The receptor is not configured.", code: "NOT_CONFIGURED" }, 503);
    }
    deps.log("unexpected_error", { name: error instanceof Error ? error.name : "unknown" });
    return json({ error: "Internal error.", code: "INTERNAL" }, 500);
  }
}
