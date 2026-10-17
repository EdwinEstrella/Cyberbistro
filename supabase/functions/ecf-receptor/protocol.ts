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

export function generateSeedValue(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(64)));
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

/** Seed value (`<valor>`) of a signed SemillaModel document, or null when the shape is wrong. */
export function extractSeedValue(signedSeedXml: string): string | null {
  if (!/<SemillaModel[\s>]/.test(signedSeedXml)) return null;
  const valor = tagText(signedSeedXml, "valor");
  return valor && valor.length >= 16 && valor.length <= 512 ? valor : null;
}

export interface SeedRecord {
  hash: string;
  expiresAt: Date;
}

export async function createSeed(now: Date, valor = generateSeedValue()): Promise<{ xml: string; record: SeedRecord }> {
  return {
    xml: buildSeedXml(valor, now),
    record: { hash: await sha256Hex(valor), expiresAt: new Date(now.getTime() + SEED_TTL_SECONDS * 1000) },
  };
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
  if (!/<ECF[\s>]/.test(xml)) return null;
  const tipoEcf = tagText(xml, "TipoeCF");
  const encf = tagText(xml, "eNCF");
  const rncEmisor = tagText(xml, "RNCEmisor");
  const rncComprador = tagText(xml, "RNCComprador");
  if (!tipoEcf || !encf || !rncEmisor || !rncComprador) return null;
  if (!/^E\d{12}$/.test(encf) || !/^\d{2}$/.test(tipoEcf)) return null;
  return { tipoEcf, encf, rncEmisor, rncComprador };
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
  if (fields.rncComprador !== input.tenantRnc) return { estado: "1", codigo: NoReceivedCode.BuyerRncMismatch };
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
  if (!/<ACECF[\s>]/.test(xml)) return null;
  const rncEmisor = tagText(xml, "RNCEmisor");
  const rncComprador = tagText(xml, "RNCComprador");
  const encf = tagText(xml, "eNCF");
  const estadoText = tagText(xml, "Estado");
  if (!rncEmisor || !rncComprador || !encf || !estadoText) return null;
  if (!/^E\d{12}$/.test(encf) || !/^[12]$/.test(estadoText)) return null;
  const detalle = tagText(xml, "DetalleMotivoRechazo");
  return {
    rncEmisor,
    rncComprador,
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
  if (fields.rncEmisor !== tenantRnc) {
    return { ok: false, code: "RNC_MISMATCH", message: "RNCEmisor does not match this taxpayer." };
  }
  return { ok: true };
}
