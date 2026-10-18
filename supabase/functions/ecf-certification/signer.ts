// DGII-compatible signing (copied from ecf-sign-document; functions are self-contained).
// `npm:` specifiers must be static literals in the edge runtime.
import { P12Reader, Signature } from "npm:dgii-ecf@1.8.0";
import type { SigningMaterial } from "./context.ts";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function readSigningMaterial(p12Bytes: Uint8Array, passphrase: string): SigningMaterial {
  const keys = new P12Reader(passphrase).getKeyFromStringBase64(bytesToBase64(p12Bytes));
  if (!keys.key || !keys.cert) throw new Error("Certificate does not contain a private key and certificate.");
  return { key: keys.key, cert: keys.cert };
}

export function sign(material: SigningMaterial, xml: string, rootElement: string): string {
  return new Signature(material.key, material.cert).signXml(xml, rootElement);
}
