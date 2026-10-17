// Pure DGII sender/receiver protocol logic for the ecf-receptor edge function.
// No Deno-only globals and no npm: imports, so it runs unchanged under Deno and vitest (Node).
//
// Sources for the wire contract (verified against the dgii-ecf package in modulo-ecf/):
//  - endpoint suffixes: modulo-ecf/src/networking/RestApi.ts (ENDPOINTS_SENDER_RECEIVER)
//  - seed XML shape:    modulo-ecf/src/customAuthentication/CustomAuthentication.ts (generateSeed)
//  - token JSON shape:  modulo-ecf/src/networking/types.ts (AuthToken: token / expira / expedido)
//  - ARECF + codes:     modulo-ecf/src/senderReceiver/SenderReceiver.ts (NoReceivedCode, ReceivedStatus)
//  - ACECF fields:      modulo-ecf/src/types/IACECF.ts

export type ReceptorService = "seed" | "validateSeed" | "reception" | "approval";

export interface ParsedReceptorPath {
  rnc: string;
  service: ReceptorService;
}

const SERVICE_SUFFIXES: Record<string, ReceptorService> = {
  "fe/autenticacion/api/semilla": "seed",
  "fe/autenticacion/api/validacioncertificado": "validateSeed",
  "fe/recepcion/api/ecf": "reception",
  "fe/aprobacioncomercial/api/ecf": "approval",
};

export const SEED_TTL_SECONDS = 300;
export const TOKEN_TTL_SECONDS = 3600;
export const MAX_XML_BYTES = 5 * 1024 * 1024;
export const MAX_SEED_BYTES = 16 * 1024;

/** Digits only, 9 (company) or 11 (individual) long. Accepts the legacy `rnc_` prefix. */
export function normalizeRnc(value: string): string | null {
  const digits = value.replace(/^rnc_/i, "");
  return /^\d{9}$|^\d{11}$/.test(digits) ? digits : null;
}

/**
 * Accepts `/ecf-receptor/{rnc}/fe/...`, `/functions/v1/ecf-receptor/{rnc}/fe/...` and `/{rnc}/fe/...`.
 * DGII suffixes are matched case-insensitively (`ValidacionCertificado` vs `validacioncertificado`).
 */
export function parseReceptorPath(pathname: string): ParsedReceptorPath | null {
  let segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments[0]?.toLowerCase() === "functions" && segments[1]?.toLowerCase() === "v1") segments = segments.slice(2);
  if (segments[0]?.toLowerCase() === "ecf-receptor") segments = segments.slice(1);
  if (segments.length < 2) return null;
  const rnc = normalizeRnc(segments[0]);
  if (!rnc) return null;
  const service = SERVICE_SUFFIXES[segments.slice(1).join("/").toLowerCase()];
  return service ? { rnc, service } : null;
}

/** Digits only; DGII documents and certificates write RNCs with or without separators. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export interface CertificateNameAttribute {
  type?: string;
  shortName?: string;
  name?: string;
  value: unknown;
}

export interface SubjectIdentities {
  /** Company RNCs vouched for by the CA: organizationIdentifier (2.5.4.97) `VATDO-<9|11 digits>`. */
  companyIds: string[];
  /** Person documents: serialNumber (2.5.4.5) `IDCDO-<9|11 digits>`. */
  personIds: string[];
  /** Raw serialNumber text (informational only, never used for binding). */
  serial: string | null;
}

/**
 * Identifiers a subscriber certificate asserts, read ONLY from the exact ETSI EN 319 412-1 encodings (matched by
 * OID, prefix required) in a subject whose countryName (2.5.4.6) is `DO`. Names, organizations and unit names are
 * never read: anyone can choose those when requesting a certificate.
 *
 * CA evidence (see odd/tasks/ecf-receptor.md, T7): the DGII / e-invoicing profiles of Viafirma ("Procedimientos
 * Tributarios", VIAFIRMA-PI-DGII) and Digifirma ("Certificado Facturacion Electronica") are issued to a PERSON and
 * carry name, cedula/passport and email only, so most real signer certificates have no company identifier.
 */
export function extractSubjectIdentities(attributes: readonly CertificateNameAttribute[]): SubjectIdentities {
  const result: SubjectIdentities = { companyIds: [], personIds: [], serial: null };
  const rawSerial = attributes.find((attribute) => attribute.type === "2.5.4.5" && typeof attribute.value === "string");
  if (rawSerial) result.serial = String(rawSerial.value).trim().slice(0, 64) || null;
  const countries = attributes.filter((attribute) => attribute.type === "2.5.4.6").map((attribute) => attribute.value);
  if (countries.length === 0 || countries.some((country) => country !== "DO")) return result;
  const company = new Set<string>();
  const person = new Set<string>();
  for (const attribute of attributes) {
    if (typeof attribute.value !== "string") continue;
    if (attribute.type === "2.5.4.97") {
      const match = attribute.value.match(/^VATDO-(\d{9}|\d{11})$/);
      if (match) company.add(match[1]);
    } else if (attribute.type === "2.5.4.5") {
      const match = attribute.value.match(/^IDCDO-(\d{9}|\d{11})$/);
      if (match) person.add(match[1]);
    }
  }
  result.companyIds = [...company];
  result.personIds = [...person];
  return result;
}

/** All asserted numbers (company and person), digits only. */
export function extractSubjectIdentifiers(attributes: readonly CertificateNameAttribute[]): string[] {
  const identities = extractSubjectIdentities(attributes);
  return [...new Set([...identities.companyIds, ...identities.personIds])];
}

/** Compact, prefixed form stored on tokens and documents: `VATDO-<rnc>` / `IDCDO-<id>`. */
export function encodeSubjectIds(identities: Pick<SubjectIdentities, "companyIds" | "personIds">): string[] {
  return [...identities.companyIds.map((id) => `VATDO-${id}`), ...identities.personIds.map((id) => `IDCDO-${id}`)];
}

export function decodeSubjectIds(encoded: readonly string[]): Pick<SubjectIdentities, "companyIds" | "personIds"> {
  const pick = (prefix: string) => encoded.filter((entry) => entry.startsWith(`${prefix}-`)).map((entry) => entry.slice(prefix.length + 1));
  return { companyIds: pick("VATDO"), personIds: pick("IDCDO") };
}

export type SignerBinding = "bound" | "unbound" | "violation";

/**
 * Relation between a signer certificate and the RNC a document claims to act for:
 *  - bound:     the certificate vouches for that RNC (company identifier, or a person whose cedula is the RNC);
 *  - violation: the certificate vouches for a DIFFERENT company (CA-vetted) -> reject;
 *  - unbound:   the certificate names no company (person-only DGII profile) -> accept, but flag for the tenant.
 */
export function bindSigner(ids: Pick<SubjectIdentities, "companyIds" | "personIds">, rnc: string): SignerBinding {
  const target = digitsOnly(rnc);
  if (ids.companyIds.length > 0) return ids.companyIds.includes(target) ? "bound" : "violation";
  return ids.personIds.includes(target) ? "bound" : "unbound";
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

/** Local Dominican Republic time (UTC-4, no DST) as an ISO string with an explicit offset. */
export function formatSeedDate(now: Date): string {
  return new Date(now.getTime() - 4 * 3600 * 1000).toISOString().replace("Z", "-04:00");
}

/** `dd-MM-yyyy HH:mm:ss` in Dominican Republic local time, 24 hour clock (ARECF sample format). */
export function formatAcuseDateTime(now: Date): string {
  const d = new Date(now.getTime() - 4 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function buildSeedXml(valor: string, now: Date): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <valor>${escapeXml(valor)}</valor>
  <fecha>${formatSeedDate(now)}</fecha>
</SemillaModel>`;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Text of the first `<tag>` element (no nesting expected), or null. */
export function tagText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
  return match ? decodeXmlText(match[1].trim()) : null;
}

/**
 * DTDs/entities, comments, CDATA and processing instructions (other than a leading XML declaration) have no
 * place in DGII documents and enable parser differentials, so they are rejected before any field is read.
 */
export function hasForbiddenXml(xml: string): boolean {
  if (/<!DOCTYPE|<!ENTITY|<!--|<!\[CDATA\[/i.test(xml)) return true;
  const withoutDeclaration = xml.replace(/^\uFEFF?\s*<\?xml\s[^>]*\?>/, "");
  return withoutDeclaration.includes("<?");
}

export function countTag(xml: string, tag: string): number {
  return (xml.match(new RegExp(`<${tag}[\\s>/]`, "g")) ?? []).length;
}

/** Text of `<tag>` only when the element occurs exactly once in the document. */
export function singleTagText(xml: string, tag: string): string | null {
  return countTag(xml, tag) === 1 ? tagText(xml, tag) : null;
}

/** Seed value (`<valor>`) of a signed SemillaModel document, or null when the shape is wrong. */
export function extractSeedValue(signedSeedXml: string): string | null {
  if (hasForbiddenXml(signedSeedXml) || !/<SemillaModel[\s>]/.test(signedSeedXml)) return null;
  const valor = singleTagText(signedSeedXml, "valor");
  return valor && valor.length >= 16 && valor.length <= 512 ? valor : null;
}

const SEED_LABEL = "ecf-receptor-seed-v1";

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`${SEED_LABEL}:${secret}`);
  const keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  return await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function seedMacInput(rnc: string, payload: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${rnc}|`);
  const joined = new Uint8Array(prefix.length + payload.length);
  joined.set(prefix);
  joined.set(payload, prefix.length);
  return joined;
}

/**
 * Stateless seed value: nonce(16) | expiry ms (8, big endian) | HMAC-SHA256(secret, rnc | nonce | expiry),
 * base64. Issuing a seed writes nothing to the database, so unauthenticated GETs cannot grow storage and
 * a seed for an unknown taxpayer is indistinguishable from a real one. Single use is enforced when the
 * seed is consumed after a successful signature check.
 */
export async function generateSeedValueFor(rnc: string, secret: string, now: Date): Promise<string> {
  const payload = new Uint8Array(24);
  crypto.getRandomValues(payload.subarray(0, 16));
  new DataView(payload.buffer).setBigUint64(16, BigInt(now.getTime() + SEED_TTL_SECONDS * 1000));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), seedMacInput(rnc, payload)));
  const out = new Uint8Array(payload.length + mac.length);
  out.set(payload);
  out.set(mac, payload.length);
  return toBase64(out);
}

/** `id` is the SHA-256 of the decoded seed bytes: the single-use key, independent of the text encoding. */
export type SeedCheck = { ok: true; expiresAt: Date; id: string } | { ok: false };

export async function checkSeedValue(valor: string, rnc: string, secret: string, now: Date): Promise<SeedCheck> {
  try {
    if (!/^[A-Za-z0-9+/]{75}=$/.test(valor)) return { ok: false };
    const bytes = Uint8Array.from(atob(valor), (c) => c.charCodeAt(0));
    if (bytes.length !== 56) return { ok: false };
    // Several base64 texts decode to the same bytes (non-zero padding bits): accept only the canonical one.
    if (toBase64(bytes) !== valor) return { ok: false };
    const payload = bytes.slice(0, 24);
    const mac = bytes.slice(24);
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), mac, seedMacInput(rnc, payload));
    if (!valid) return { ok: false };
    const expiresAt = new Date(Number(new DataView(payload.buffer).getBigUint64(16)));
    if (expiresAt <= now) return { ok: false };
    const id = toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    return { ok: true, expiresAt, id };
  } catch {
    return { ok: false };
  }
}

export async function createSeedXml(rnc: string, secret: string, now: Date): Promise<string> {
  return buildSeedXml(await generateSeedValueFor(rnc, secret, now), now);
}

export interface IssuedToken {
  token: string;
  hash: string;
  expiresAt: Date;
  /** Wire response, shaped like dgii-ecf `AuthToken`. */
  response: { token: string; expira: string; expedido: string };
}

export async function issueToken(now: Date, ttlSeconds = TOKEN_TTL_SECONDS): Promise<IssuedToken> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  return {
    token,
    hash: await sha256Hex(token),
    expiresAt,
    response: { token, expira: expiresAt.toISOString(), expedido: now.toISOString() },
  };
}

export function parseBearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})$/i);
  return match ? match[1] : null;
}

// --- Reception (ARECF) ---

export const ReceivedStatus = { Received: "0", NotReceived: "1" } as const;
export const NoReceivedCode = {
  SpecificationError: "1",
  InvalidSignature: "2",
  Duplicate: "3",
  BuyerRncMismatch: "4",
} as const;

/** e-CF types a receptor must not accept (32 consumption; 41/43/45/46/47 are not B2B). */
export const EXCLUDED_ECF_TYPES = ["32", "41", "43", "45", "46", "47"];
export const ACCEPTED_ECF_TYPES = ["31", "33", "34", "44"];

export interface EcfFields {
  tipoEcf: string;
  encf: string;
  rncEmisor: string;
  rncComprador: string;
}

export function extractEcfFields(xml: string): EcfFields | null {
  if (hasForbiddenXml(xml) || !/<ECF[\s>]/.test(xml)) return null;
  const tipoEcf = singleTagText(xml, "TipoeCF");
  const encf = singleTagText(xml, "eNCF");
  const rncEmisor = singleTagText(xml, "RNCEmisor");
  const rncComprador = singleTagText(xml, "RNCComprador");
  if (!tipoEcf || !encf || !rncEmisor || !rncComprador) return null;
  if (!/^E\d{12}$/.test(encf) || !/^\d{2}$/.test(tipoEcf)) return null;
  return { tipoEcf, encf, rncEmisor: digitsOnly(rncEmisor), rncComprador: digitsOnly(rncComprador) };
}

export type ReceptionDecision =
  | { estado: "0" }
  | { estado: "1"; codigo: (typeof NoReceivedCode)[keyof typeof NoReceivedCode] };

export interface ReceptionInput {
  fields: EcfFields | null;
  signatureValid: boolean;
  tenantRnc: string;
  isDuplicate: boolean;
}

/** Rule order: specification (1), signature (2), buyer RNC (4), duplicate (3). */
export function decideReception(input: ReceptionInput): ReceptionDecision {
  const { fields } = input;
  if (!fields || !ACCEPTED_ECF_TYPES.includes(fields.tipoEcf)) {
    return { estado: "1", codigo: NoReceivedCode.SpecificationError };
  }
  if (!input.signatureValid) return { estado: "1", codigo: NoReceivedCode.InvalidSignature };
  if (fields.rncComprador !== digitsOnly(input.tenantRnc)) return { estado: "1", codigo: NoReceivedCode.BuyerRncMismatch };
  if (input.isDuplicate) return { estado: "1", codigo: NoReceivedCode.Duplicate };
  return { estado: "0" };
}

export interface ArecfInput {
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  decision: ReceptionDecision;
  now: Date;
}

/** Unsigned ARECF. CodigoMotivoNoRecibido is present only when Estado is 1. */
export function buildArecfXml(input: ArecfInput): string {
  const code =
    input.decision.estado === "1"
      ? `\n    <CodigoMotivoNoRecibido>${input.decision.codigo}</CodigoMotivoNoRecibido>`
      : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<ARECF>
  <DetalleAcusedeRecibo>
    <Version>1.0</Version>
    <RNCEmisor>${escapeXml(input.rncEmisor)}</RNCEmisor>
    <RNCComprador>${escapeXml(input.rncComprador)}</RNCComprador>
    <eNCF>${escapeXml(input.encf)}</eNCF>
    <Estado>${input.decision.estado}</Estado>${code}
    <FechaHoraAcuseRecibo>${formatAcuseDateTime(input.now)}</FechaHoraAcuseRecibo>
  </DetalleAcusedeRecibo>
</ARECF>`;
}

// --- Commercial approval (ACECF) ---

export interface AcecfFields {
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  estado: number;
  detalleMotivoRechazo: string | null;
}

/** ACECF Estado: 1 = approved, 2 = rejected. */
export function extractAcecfFields(xml: string): AcecfFields | null {
  if (hasForbiddenXml(xml) || !/<ACECF[\s>]/.test(xml)) return null;
  const rncEmisor = singleTagText(xml, "RNCEmisor");
  const rncComprador = singleTagText(xml, "RNCComprador");
  const encf = singleTagText(xml, "eNCF");
  const estadoText = singleTagText(xml, "Estado");
  if (!rncEmisor || !rncComprador || !encf || !estadoText) return null;
  if (!/^E\d{12}$/.test(encf) || !/^[12]$/.test(estadoText)) return null;
  if (countTag(xml, "DetalleMotivoRechazo") > 1) return null;
  const detalle = tagText(xml, "DetalleMotivoRechazo");
  return {
    rncEmisor: digitsOnly(rncEmisor),
    rncComprador: digitsOnly(rncComprador),
    encf,
    estado: Number(estadoText),
    detalleMotivoRechazo: detalle ? detalle.slice(0, 500) : null,
  };
}

export type ApprovalValidation =
  | { ok: true }
  | { ok: false; code: "SPECIFICATION" | "SIGNATURE" | "RNC_MISMATCH"; message: string };

/** The tenant must be the original e-CF issuer; the approving buyer is someone else. */
export function validateApproval(fields: AcecfFields | null, signatureValid: boolean, tenantRnc: string): ApprovalValidation {
  if (!fields) return { ok: false, code: "SPECIFICATION", message: "ACECF does not match the expected format." };
  if (!signatureValid) return { ok: false, code: "SIGNATURE", message: "ACECF digital signature is invalid." };
  if (fields.rncEmisor !== digitsOnly(tenantRnc)) {
    return { ok: false, code: "RNC_MISMATCH", message: "RNCEmisor does not match this taxpayer." };
  }
  return { ok: true };
}
