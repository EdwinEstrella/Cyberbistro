import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

/** True when the document carries exactly one XMLDSig signature that verifies with the certificate. */
export function verifyXmlSignature(xml: string, certPem: string): boolean {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const signatures = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
  if (signatures.length !== 1) return false;
  const verifier = new SignedXml({ publicCert: certPem });
  verifier.loadSignature(signatures[0] as unknown as Node);
  return verifier.checkSignature(xml);
}
