// Request handler for the DGII inbound services. Dependencies are injected so the whole flow is
// testable from vitest with an in-memory store; index.ts wires the real Supabase store.
import { decryptPassphrase, NotConfiguredError } from "./custody.ts";
import {
  buildArecfXml,
  bindSigner,
  checkSeedValue,
  createSeedXml,
  decideReception,
  decodeSubjectIds,
  digitsOnly,
  encodeSubjectIds,
  extractAcecfFields,
  extractEcfFields,
  extractSeedValue,
  issueToken,
  MAX_SEED_BYTES,
  MAX_XML_BYTES,
  NoReceivedCode,
  parseBearerToken,
  parseReceptorPath,
  sha256Hex,
  singleTagText,
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
  /** Full XML is kept only for accepted documents; rejected submissions keep the hash only. */
  xml: string | null;
  xmlSha256: string;
  arecfXml: string;
  /** Identities the document's signer certificate asserts (`VATDO-`/`IDCDO-` prefixed) and its raw serial. */
  signerIds: string[];
  signerSerial: string | null;
  /** True when the signer certificate names no company and the document's RNC could not be tied to it. */
  signerRncMismatch: boolean;
}

export interface ReceivedApprovalRow {
  tenantId: string;
  emisorRnc: string;
  compradorRnc: string;
  encf: string;
  estado: number;
  detalleMotivoRechazo: string | null;
  xml: string;
  signerIds: string[];
  signerSerial: string | null;
  signerRncMismatch: boolean;
}

export interface TokenInfo {
  tenantId: string;
  /** Identities the token holder's certificate asserted when it authenticated (`VATDO-`/`IDCDO-` prefixed). */
  subjectIds: string[];
}

export interface ReceptorStore {
  /** Tenant id for an RNC, or null when unknown or shared by several tenants. */
  resolveTenant(rnc: string): Promise<string | null>;
  /** Records a seed as used (single use). Returns false when it was already consumed. */
  consumeSeed(tenantId: string, hash: string, expiresAt: Date, now: Date): Promise<boolean>;
  createToken(tenantId: string, hash: string, expiresAt: Date, subjectIds: string[]): Promise<void>;
  findToken(hash: string, now: Date): Promise<TokenInfo | null>;
  hasAcceptedDocument(tenantId: string, emisorRnc: string, encf: string): Promise<boolean>;
  insertDocument(row: ReceivedDocumentRow): Promise<"inserted" | "duplicate">;
  /** Latest approval wins per (tenant, emisor, eNCF). */
  upsertApproval(row: ReceivedApprovalRow): Promise<void>;
  loadCertificate(tenantId: string): Promise<StoredCertificate | null>;
  /** True only when the tenant is in the DGII test/certification environment (never throws; false when unknown). */
  allowsCertificationSigners(tenantId: string): Promise<boolean>;
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
  /** Keying material for stateless seeds (never logged or returned). */
  seedSecret(): string | undefined;
  log(event: string, detail?: Record<string, string | number>): void;
}

/** Verifies a signature, downgrading a pinned certification-environment signer unless the tenant is in that environment. */
async function verifyForTenant(deps: ReceptorDeps, tenantId: string, xmlText: string, now: Date): Promise<VerifyResult> {
  const verification = deps.security.verify(xmlText, now);
  if (!verification.valid || verification.trust !== "pinned") return verification;
  if (await deps.store.allowsCertificationSigners(tenantId).catch(() => false)) return verification;
  return { valid: false, reason: "pinned signer outside certification", companyIds: [], personIds: [], serial: null };
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

async function readLimited(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) throw new HttpError(413, "Payload too large.", "PAYLOAD_TOO_LARGE");
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, "Payload too large.", "PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Multipart `xml` file (the DGII client contract) or a raw XML body, capped while streaming. */
async function readXmlPayload(req: Request, max = MAX_XML_BYTES): Promise<string> {
  const bytes = await readLimited(req, max);
  const contentType = req.headers.get("content-type") ?? "";
  let text: string;
  try {
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
      const part = form.get("xml") ?? Array.from(form.values()).find((value) => typeof value !== "string");
      if (part === null || part === undefined) throw new HttpError(400, "Missing xml file.", "INVALID_REQUEST");
      text = typeof part === "string" ? part : await part.text();
    } else {
      text = new TextDecoder().decode(bytes);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Could not read the request body.", "INVALID_REQUEST");
  }
  if (!text.trim()) throw new HttpError(400, "Empty XML payload.", "INVALID_REQUEST");
  return text.replace(/^\uFEFF/, "");
}

const AUTH_FAILED = () => new HttpError(401, "Authentication failed.", "UNAUTHENTICATED");

/**
 * Bearer token must exist, be unexpired and belong to the tenant resolved from the path. Every failure
 * (including an unknown RNC) is the same 401, so the response does not reveal whether a taxpayer exists.
 */
async function requireToken(req: Request, rnc: string, deps: ReceptorDeps): Promise<TokenInfo> {
  const token = parseBearerToken(req.headers.get("authorization"));
  if (!token) throw AUTH_FAILED();
  const info = await deps.store.findToken(await sha256Hex(token), deps.now());
  const tenantId = await deps.store.resolveTenant(rnc);
  if (!info || !tenantId || info.tenantId !== tenantId) throw AUTH_FAILED();
  return info;
}

async function signWithTenantCertificate(deps: ReceptorDeps, tenantId: string, document: string, root: string): Promise<string> {
  const stored = await deps.store.loadCertificate(tenantId);
  if (!stored) throw new HttpError(503, "The taxpayer has no ready certificate.", "CERTIFICATE_UNAVAILABLE");
  const passphrase = await decryptPassphrase(stored.passphraseEncrypted, deps.encryptionKey());
  return deps.security.sign(deps.security.readSigningMaterial(stored.p12Bytes, passphrase), document, root);
}

function requireSeedSecret(deps: ReceptorDeps): string {
  const secret = deps.seedSecret();
  if (!secret) throw new NotConfiguredError("Seed secret is not configured.");
  return secret;
}

function requireMethod(req: Request, method: "GET" | "POST"): void {
  if (req.method !== method) throw new HttpError(405, "Method not allowed.", "METHOD_NOT_ALLOWED");
}

/** Seeds are stateless and tenant-agnostic: issuing one touches no storage and reveals nothing about the RNC. */
async function handleSeed(rnc: string, deps: ReceptorDeps): Promise<Response> {
  return xml(await createSeedXml(rnc, requireSeedSecret(deps), deps.now()));
}

async function handleValidateSeed(req: Request, rnc: string, deps: ReceptorDeps): Promise<Response> {
  const signedSeed = await readXmlPayload(req, MAX_SEED_BYTES);
  const now = deps.now();
  const reject = (reason: string): never => {
    deps.log("seed_rejected", { reason });
    throw AUTH_FAILED();
  };
  const valor = extractSeedValue(signedSeed);
  if (!valor) return reject("shape");
  const seed = await checkSeedValue(valor, rnc, requireSeedSecret(deps), now);
  if (!seed.ok) return reject("seed");
  const tenantId = await deps.store.resolveTenant(rnc);
  const verification = tenantId ? await verifyForTenant(deps, tenantId, signedSeed, now) : deps.security.verify(signedSeed, now);
  if (!verification.valid) return reject(verification.reason ?? "signature");
  if (!tenantId) return reject("tenant");
  if (!(await deps.store.consumeSeed(tenantId, seed.id, seed.expiresAt, now))) return reject("replay");
  const issued = await issueToken(now);
  await deps.store.createToken(tenantId, issued.hash, issued.expiresAt, encodeSubjectIds(verification));
  return json(issued.response);
}

async function handleReception(req: Request, rnc: string, deps: ReceptorDeps): Promise<Response> {
  const { tenantId, subjectIds } = await requireToken(req, rnc, deps);
  const document = await readXmlPayload(req);
  const now = deps.now();
  const fields = extractEcfFields(document);
  // A token whose certificate vouches for ANOTHER company may not deliver for this issuer.
  const tokenBinding = fields ? bindSigner(decodeSubjectIds(subjectIds), fields.rncEmisor) : "bound";
  if (tokenBinding === "violation") {
    throw new HttpError(403, "The token holder is not the issuer of this document.", "FORBIDDEN");
  }
  const verification = fields ? await verifyForTenant(deps, tenantId, document, now) : null;
  // Same rule for the document signature. A person-only certificate (the usual DGII profile) names no company:
  // the document is accepted on chain trust + signature validity and flagged `signerRncMismatch` for the tenant.
  const docBinding = fields && verification?.valid ? bindSigner(verification, fields.rncEmisor) : null;
  const signatureValid = !!fields && !!verification?.valid && docBinding !== "violation";
  const signerRncMismatch = tokenBinding === "unbound" || docBinding === "unbound";
  const signerIds = verification?.valid ? encodeSubjectIds(verification) : [];
  const signerSerial = verification?.valid ? verification.serial : null;
  // Rejected documents are echoed in the ARECF: only well-formed values may be reflected.
  const looseEncf = singleTagText(document, "eNCF") ?? "";
  const emisorRnc = fields?.rncEmisor ?? digitsOnly(singleTagText(document, "RNCEmisor") ?? "").slice(0, 11);
  const encf = fields?.encf ?? (/^E\d{12}$/.test(looseEncf) ? looseEncf : "");
  const isDuplicate = fields !== null ? await deps.store.hasAcceptedDocument(tenantId, fields.rncEmisor, fields.encf) : false;
  const xmlSha256 = await sha256Hex(document);

  const respond = async (decision: ReceptionDecision): Promise<{ arecf: string; row: ReceivedDocumentRow }> => {
    const unsigned = buildArecfXml({ rncEmisor: emisorRnc, rncComprador: rnc, encf, decision, now });
    const arecf = await signWithTenantCertificate(deps, tenantId, unsigned, "ARECF");
    return {
      arecf,
      row: {
        tenantId,
        emisorRnc,
        compradorRnc: fields?.rncComprador ?? digitsOnly(singleTagText(document, "RNCComprador") ?? "").slice(0, 11),
        encf,
        tipoEcf: fields?.tipoEcf ?? null,
        estado: decision.estado === "0" ? 0 : 1,
        motivoNoRecibido: decision.estado === "1" ? Number(decision.codigo) : null,
        xml: decision.estado === "0" ? document : null,
        xmlSha256,
        arecfXml: arecf,
        signerIds,
        signerSerial,
        signerRncMismatch: decision.estado === "0" && signerRncMismatch,
      },
    };
  };

  let result = await respond(decideReception({ fields, signatureValid, tenantRnc: rnc, isDuplicate }));
  if ((await deps.store.insertDocument(result.row)) === "duplicate" && result.row.estado === 0) {
    // Lost a race with a concurrent identical submission: answer "duplicate" and keep an audit row.
    result = await respond({ estado: "1", codigo: NoReceivedCode.Duplicate });
    await deps.store.insertDocument(result.row);
  }
  return xml(result.arecf);
}

async function handleApproval(req: Request, rnc: string, deps: ReceptorDeps): Promise<Response> {
  const { tenantId, subjectIds } = await requireToken(req, rnc, deps);
  const document = await readXmlPayload(req);
  const fields = extractAcecfFields(document);
  // The approval is issued by the buyer of the original e-CF (RNCComprador); see the reception comments.
  const tokenBinding = fields ? bindSigner(decodeSubjectIds(subjectIds), fields.rncComprador) : "bound";
  if (tokenBinding === "violation") {
    throw new HttpError(403, "The token holder is not the signer of this approval.", "FORBIDDEN");
  }
  const verification = fields ? await verifyForTenant(deps, tenantId, document, deps.now()) : null;
  const docBinding = fields && verification?.valid ? bindSigner(verification, fields.rncComprador) : null;
  const signatureValid = !!fields && !!verification?.valid && docBinding !== "violation";
  const validation = validateApproval(fields, signatureValid, rnc);
  if (!validation.ok || !fields) {
    throw new HttpError(400, validation.ok ? "Invalid ACECF." : validation.message, validation.ok ? "SPECIFICATION" : validation.code);
  }
  await deps.store.upsertApproval({
    tenantId,
    emisorRnc: fields.rncEmisor,
    compradorRnc: fields.rncComprador,
    encf: fields.encf,
    estado: fields.estado,
    detalleMotivoRechazo: fields.detalleMotivoRechazo,
    xml: document,
    signerIds: verification?.valid ? encodeSubjectIds(verification) : [],
    signerSerial: verification?.valid ? verification.serial : null,
    signerRncMismatch: tokenBinding === "unbound" || docBinding === "unbound",
  });
  return json({ message: "Commercial approval received.", encf: fields.encf });
}

export async function handleRequest(req: Request, deps: ReceptorDeps): Promise<Response> {
  try {
    const route = parseReceptorPath(new URL(req.url).pathname);
    if (!route) throw new HttpError(404, "Not found.", "NOT_FOUND");
    // Method checks come before any tenant lookup so they cannot be used as an RNC oracle.
    switch (route.service) {
      case "seed":
        requireMethod(req, "GET");
        return await handleSeed(route.rnc, deps);
      case "validateSeed":
        requireMethod(req, "POST");
        return await handleValidateSeed(req, route.rnc, deps);
      case "reception":
        requireMethod(req, "POST");
        return await handleReception(req, route.rnc, deps);
      case "approval":
        requireMethod(req, "POST");
        return await handleApproval(req, route.rnc, deps);
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
