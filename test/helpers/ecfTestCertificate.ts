import forge from "node-forge";

export interface TestCertificate {
  p12Bytes: Uint8Array;
  passphrase: string;
  keyPem: string;
  certPem: string;
}

/** Generates a throwaway self-signed .p12 so tests never depend on a committed or expired certificate. */
export function createTestCertificate(options: { notBefore?: Date; notAfter?: Date; passphrase?: string } = {}): TestCertificate {
  const passphrase = options.passphrase ?? "test-pass-123";
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = options.notBefore ?? new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = options.notAfter ?? new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ name: "commonName", value: "Cloudix Test" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return {
    p12Bytes: Uint8Array.from(der, (character) => character.charCodeAt(0)),
    passphrase,
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
  };
}
