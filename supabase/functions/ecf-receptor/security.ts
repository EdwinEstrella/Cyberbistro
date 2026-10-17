// XML signing / verification. Stack proven in the supabase/edge-runtime:v1.74.0 image (see
// odd/tasks/ecf-receptor.md, T1): npm:dgii-ecf for .p12 parsing and DGII-compatible signing,
// npm:xml-crypto + npm:@xmldom/xmldom for independent verification of incoming signed XML.
// `npm:` specifiers must be static literals in this runtime. Vitest maps them to node_modules.
import { P12Reader, Signature } from "npm:dgii-ecf@1.8.0";
import { SignedXml } from "npm:xml-crypto@6.1.2";
import { DOMParser } from "npm:@xmldom/xmldom@0.8.12";
import forge from "npm:node-forge@1.3.1";

export interface SigningMaterial {
  key: string;
  cert: string;
}

export interface XmlSecurity {
  readSigningMaterial(p12Bytes: Uint8Array, passphrase: string): SigningMaterial;
  sign(material: SigningMaterial, xml: string, rootElement: string): string;
  verify(xml: string, now: Date): VerifyResult;
}

export interface VerifyResult {
  valid: boolean;
  /** Short, non-sensitive reason when invalid (for logs only). */
  reason?: string;
}

const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

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

/**
 * Verifies the enveloped XMLDSig of a received document with the certificate embedded in KeyInfo.
 * Requirements: exactly one Signature, its single Reference covers the whole document (empty URI),
 * the signature value validates, and the embedded certificate is within its validity period.
 * Chain-of-trust to a DGII-accepted CA is NOT checked (open decision, see the feature doc).
 */
export function verify(xml: string, now: Date): VerifyResult {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const signatures = doc.getElementsByTagNameNS(DSIG_NS, "Signature");
    if (signatures.length !== 1) return { valid: false, reason: "expected exactly one Signature" };
    const signatureNode = signatures[0];
    const certNode = signatureNode.getElementsByTagNameNS(DSIG_NS, "X509Certificate")[0];
    const certBase64 = certNode?.textContent?.trim();
    if (!certBase64) return { valid: false, reason: "missing X509Certificate" };
    const certPem = pemFromBase64Der(certBase64);

    const validity = readCertificateValidity(certPem);
    if (!validity || now < validity.notBefore || now > validity.notAfter) {
      return { valid: false, reason: "certificate outside validity period" };
    }

    const verifier = new SignedXml({ publicCert: certPem });
    verifier.loadSignature(signatureNode);
    const references = verifier.getReferences();
    if (references.length !== 1 || (references[0].uri ?? "") !== "") {
      return { valid: false, reason: "reference must cover the whole document" };
    }
    return verifier.checkSignature(xml) ? { valid: true } : { valid: false, reason: "signature mismatch" };
  } catch {
    return { valid: false, reason: "verification error" };
  }
}

function readCertificateValidity(certPem: string): { notBefore: Date; notAfter: Date } | null {
  try {
    const { validity } = forge.pki.certificateFromPem(certPem);
    return { notBefore: validity.notBefore, notAfter: validity.notAfter };
  } catch {
    return null;
  }
}

export const xmlSecurity: XmlSecurity = { readSigningMaterial, sign, verify };
