import forge from "node-forge";

export interface TestCertificate {
  p12Bytes: Uint8Array;
  passphrase: string;
  keyPem: string;
  certPem: string;
}

export interface TestCa {
  keyPem: string;
  certPem: string;
  privateKey: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
}

const DAY = 24 * 3600 * 1000;

export type NameAttribute = { name?: string; type?: string; shortName?: string; value: string };

/** Throwaway root CA, never trusted unless a test injects its PEM. */
export function createTestCa(name = "Cloudix Test Root CA", options: { notBefore?: Date; notAfter?: Date; parent?: TestCa } = {}): TestCa {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0a";
  cert.validity.notBefore = options.notBefore ?? new Date(Date.now() - DAY);
  cert.validity.notAfter = options.notAfter ?? new Date(Date.now() + 3650 * DAY);
  const attrs = [{ name: "commonName", value: name }];
  cert.setSubject(attrs);
  cert.setIssuer(options.parent ? options.parent.cert.subject.attributes : attrs);
  cert.setExtensions([{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, cRLSign: true }]);
  cert.sign((options.parent?.privateKey ?? keys.privateKey), forge.md.sha256.create());
  return { keyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert), privateKey: keys.privateKey, cert };
}

export interface CertificateOptions {
  notBefore?: Date;
  notAfter?: Date;
  passphrase?: string;
  /** Signs the certificate with this CA; self-signed when omitted. */
  ca?: TestCa;
  /** RNC asserted the way Dominican CAs do it: organizationIdentifier `VATDO-<rnc>`. */
  rnc?: string;
  /** Person document asserted as serialNumber `IDCDO-<cedula>` (the usual DGII signer profile). */
  cedula?: string;
  /** Raw serialNumber text (e.g. an unprefixed cedula as in the Viafirma policy). */
  serial?: string;
  /** Full subject, overriding the default (CN + rnc). */
  subject?: NameAttribute[];
  /** Mark the certificate itself as a CA (invalid as a signer). */
  isCa?: boolean;
}

/** Generates a throwaway .p12; chain-signed when `ca` is given, self-signed otherwise. */
export function createTestCertificate(options: CertificateOptions = {}): TestCertificate {
  const passphrase = options.passphrase ?? "test-pass-123";
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = options.notBefore ?? new Date(Date.now() - DAY);
  cert.validity.notAfter = options.notAfter ?? new Date(Date.now() + 365 * DAY);
  const subject: NameAttribute[] =
    options.subject ??
    [
      { name: "commonName", value: "Cloudix Test" },
      { name: "countryName", value: "DO" },
      ...(options.rnc ? [{ type: "2.5.4.97", value: `VATDO-${options.rnc}` }] : []),
      ...(options.cedula ? [{ type: "2.5.4.5", value: `IDCDO-${options.cedula}` }] : []),
      ...(options.serial ? [{ type: "2.5.4.5", value: options.serial }] : []),
    ];
  cert.setSubject(subject as forge.pki.CertificateField[]);
  cert.setIssuer(options.ca ? options.ca.cert.subject.attributes : (subject as forge.pki.CertificateField[]));
  if (options.isCa) cert.setExtensions([{ name: "basicConstraints", cA: true }]);
  cert.sign(options.ca?.privateKey ?? keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return {
    p12Bytes: Uint8Array.from(der, (character) => character.charCodeAt(0)),
    passphrase,
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
  };
}
