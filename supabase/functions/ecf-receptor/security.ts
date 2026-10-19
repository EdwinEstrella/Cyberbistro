// XML signing / verification. Stack proven in the supabase/edge-runtime:v1.74.0 image (see
// odd/tasks/ecf-receptor.md, T1): npm:dgii-ecf for .p12 parsing and DGII-compatible signing,
// npm:xml-crypto + npm:@xmldom/xmldom for independent verification of incoming signed XML.
// `npm:` specifiers must be static literals in this runtime. Vitest maps them to node_modules.
import { P12Reader, Signature } from "npm:dgii-ecf@1.8.0";
import { SignedXml } from "npm:xml-crypto@6.1.2";
import { DOMParser } from "npm:@xmldom/xmldom@0.8.12";
import forge from "npm:node-forge@1.3.1";
import { extractSubjectIdentities, hasForbiddenXml, type SubjectIdentities } from "./protocol.ts";

export interface SigningMaterial {
  key: string;
  cert: string;
}

export interface VerifyResult {
  valid: boolean;
  /** Short, non-sensitive reason when invalid (for logs only). */
  reason?: string;
  /** Identities asserted by the (trusted) signer certificate. Empty unless valid. */
  companyIds: string[];
  personIds: string[];
  serial: string | null;
}

const NO_IDENTITY: Pick<SubjectIdentities, "companyIds" | "personIds" | "serial"> = { companyIds: [], personIds: [], serial: null };

export interface XmlSecurity {
  readSigningMaterial(p12Bytes: Uint8Array, passphrase: string): SigningMaterial;
  sign(material: SigningMaterial, xml: string, rootElement: string): string;
  verify(xml: string, now: Date): VerifyResult;
}

const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const MAX_CHAIN_DEPTH = 4;
const MAX_EMBEDDED_CERTIFICATES = 5;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pemFromBase64Der(base64: string): string {
  const body = base64.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

export function readSigningMaterial(p12Bytes: Uint8Array, passphrase: string): SigningMaterial {
  const keys = new P12Reader(passphrase).getKeyFromStringBase64(bytesToBase64(p12Bytes));
  if (!keys.key || !keys.cert) throw new Error("Certificate does not contain a private key and certificate.");
  return { key: keys.key, cert: keys.cert };
}

export function sign(material: SigningMaterial, xml: string, rootElement: string): string {
  return new Signature(material.key, material.cert).signXml(xml, rootElement);
}

type Certificate = forge.pki.Certificate;

function parseCertificates(pems: readonly string[]): Certificate[] {
  const certificates: Certificate[] = [];
  for (const pem of pems) {
    for (const block of pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []) {
      try {
        certificates.push(forge.pki.certificateFromPem(block));
      } catch {
        // An unreadable entry must never widen trust; skip it.
      }
    }
  }
  return certificates;
}

function isCa(cert: Certificate): boolean {
  const constraints = cert.getExtension("basicConstraints") as { cA?: boolean } | null;
  return constraints?.cA === true;
}

function validAt(cert: Certificate, now: Date): boolean {
  return now >= cert.validity.notBefore && now <= cert.validity.notAfter;
}

function sameCertificate(a: Certificate, b: Certificate): boolean {
  return forge.pki.certificateToPem(a) === forge.pki.certificateToPem(b);
}

function issuedBy(child: Certificate, parent: Certificate): boolean {
  try {
    return parent.verify(child);
  } catch {
    return false;
  }
}

/**
 * Chain of trust to the configured anchors. Anchors may be roots or intermediates (subscriber
 * certificates are issued by intermediates and the XML only carries the leaf). Self-signed
 * certificates, CA certificates used as leaf, expired links and unknown issuers are rejected.
 * Revocation (OCSP/CRL) is NOT checked.
 */
export function chainsToAnchors(leaf: Certificate, extras: Certificate[], anchors: Certificate[], now: Date): string | null {
  if (anchors.length === 0) return "empty trust store";
  if (isCa(leaf)) return "signer certificate is a CA";
  let current = leaf;
  const pool = [...extras];
  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
    if (!validAt(current, now)) return "certificate outside validity period";
    if (depth > 0 && anchors.some((anchor) => sameCertificate(anchor, current))) return null;
    const anchor = anchors.find((candidate) => !sameCertificate(candidate, current) && validAt(candidate, now) && issuedBy(current, candidate));
    if (anchor) return null;
    const intermediate = pool.find((candidate) => isCa(candidate) && !sameCertificate(candidate, current) && issuedBy(current, candidate));
    if (!intermediate) return "issuer is not trusted";
    pool.splice(pool.indexOf(intermediate), 1);
    current = intermediate;
  }
  return "chain too long";
}

function attributesOf(cert: Certificate) {
  return cert.subject.attributes.map((attribute) => ({
    type: attribute.type as string | undefined,
    shortName: attribute.shortName as string | undefined,
    name: attribute.name as string | undefined,
    value: attribute.value as unknown,
  }));
}

export function createXmlSecurity(options: { trustedCaPems: readonly string[] }): XmlSecurity {
  const anchors = parseCertificates(options.trustedCaPems);

  function verify(xml: string, now: Date): VerifyResult {
    const fail = (reason: string): VerifyResult => ({ valid: false, reason, ...NO_IDENTITY });
    try {
      if (hasForbiddenXml(xml)) return fail("forbidden XML construct");
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const signatures = doc.getElementsByTagNameNS(DSIG_NS, "Signature");
      if (signatures.length !== 1) return fail("expected exactly one Signature");
      const signatureNode = signatures[0];
      const certNodes = signatureNode.getElementsByTagNameNS(DSIG_NS, "X509Certificate");
      const certs = Array.from({ length: certNodes.length }, (_, index) => certNodes[index].textContent?.trim() ?? "").filter(Boolean);
      if (certs.length === 0) return fail("missing X509Certificate");
      if (certs.length > MAX_EMBEDDED_CERTIFICATES) return fail("too many embedded certificates");
      const leafPem = pemFromBase64Der(certs[0]);
      const leaf = forge.pki.certificateFromPem(leafPem);
      const extras = certs.slice(1).map((base64) => forge.pki.certificateFromPem(pemFromBase64Der(base64)));

      const chainError = chainsToAnchors(leaf, extras, anchors, now);
      if (chainError) return fail(chainError);

      const verifier = new SignedXml({ publicCert: leafPem });
      verifier.loadSignature(signatureNode);
      const references = verifier.getReferences();
      if (references.length !== 1 || (references[0].uri ?? "") !== "") return fail("reference must cover the whole document");
      if (!verifier.checkSignature(xml)) return fail("signature mismatch");
      return { valid: true, ...extractSubjectIdentities(attributesOf(leaf)) };
    } catch {
      return fail("verification error");
    }
  }

  return { readSigningMaterial, sign, verify };
}
