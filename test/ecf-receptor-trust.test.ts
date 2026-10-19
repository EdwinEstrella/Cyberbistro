import { createHash } from "node:crypto";
import forge from "node-forge";
import { Signature } from "dgii-ecf";
import { beforeAll, describe, expect, it } from "vitest";
import { BUILT_IN_TRUSTED_CAS } from "../supabase/functions/ecf-receptor/trustedCas";
import { chainsToAnchors, createXmlSecurity } from "../supabase/functions/ecf-receptor/security";
import { createTestCa, createTestCertificate, type TestCa } from "./helpers/ecfTestCertificate";

const parse = (pem: string) => forge.pki.certificateFromPem(pem);
const now = new Date();

describe("built-in Dominican trust store", () => {
  it("lists only parseable CA certificates that still match their pinned SHA-256 fingerprint", () => {
    expect(BUILT_IN_TRUSTED_CAS.length).toBeGreaterThanOrEqual(7);
    for (const ca of BUILT_IN_TRUSTED_CAS) {
      const cert = parse(ca.pem);
      const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), "binary");
      expect(createHash("sha256").update(der).digest("hex"), ca.name).toBe(ca.sha256);
      expect(ca.source).toMatch(/^https?:\/\//);
      const constraints = cert.getExtension("basicConstraints") as { cA?: boolean } | null;
      expect(constraints?.cA, ca.name).toBe(true);
      expect(cert.validity.notAfter.getTime(), `${ca.name} expiry`).toBeGreaterThan(now.getTime());
    }
    expect(new Set(BUILT_IN_TRUSTED_CAS.map((ca) => ca.sha256)).size).toBe(BUILT_IN_TRUSTED_CAS.length);
  });

  it("only ships roots that are valid now and strong enough (Digito Root CA: 2026-06-22..2046-06-17, RSA 4096)", () => {
    const digito = BUILT_IN_TRUSTED_CAS.find((ca) => ca.name.startsWith("Digito"))!;
    const cert = parse(digito.pem);
    expect(cert.validity.notBefore.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(cert.validity.notAfter.getFullYear()).toBe(2046);
    expect((cert.publicKey as forge.pki.rsa.PublicKey).n.bitLength()).toBeGreaterThanOrEqual(2048);
    for (const ca of BUILT_IN_TRUSTED_CAS) {
      const c = parse(ca.pem);
      expect(c.validity.notBefore.getTime(), ca.name).toBeLessThanOrEqual(now.getTime());
      expect((c.publicKey as forge.pki.rsa.PublicKey).n.bitLength(), ca.name).toBeGreaterThanOrEqual(2048);
    }
  });

  it("does not trust global roots shared with other countries", () => {
    const subjects = BUILT_IN_TRUSTED_CAS.map((ca) => parse(ca.pem).subject.getField("CN")?.value as string);
    expect(subjects.join("|")).not.toMatch(/UANATACA ROOT|Root Indenova/i);
  });

  it("contains genuine issuer/subordinate pairs (signatures verify against their roots)", () => {
    const byCn = new Map(BUILT_IN_TRUSTED_CAS.map((ca) => [parse(ca.pem).subject.getField("CN").value as string, parse(ca.pem)]));
    const pair = (root: string, sub: string) => expect(byCn.get(root)!.verify(byCn.get(sub)!), `${root} -> ${sub}`).toBe(true);
    pair("AVANSI CERTIFICACION", "AVANSI CERTIFICADOS DIGITALES");
    // forge decodes the UTF-8 "í" of the root CN as latin1, so match by prefix.
    const digiRoot = [...byCn.keys()].find((cn) => cn.startsWith("digifirma CA Ra"))!;
    pair(digiRoot, "digifirma CA Subordinada 1");
    expect(byCn.get("Digito Root CA")!.verify(byCn.get("Digito Root CA")!)).toBe(true);
  });
});

describe("chain validation", () => {
  let root: TestCa;
  let intermediate: TestCa;
  beforeAll(() => {
    root = createTestCa("Root");
    intermediate = createTestCa("Intermediate", { parent: root });
  }, 60_000);

  const leafOf = (ca?: TestCa, extra = {}) => parse(createTestCertificate({ ca, rnc: "131880738", ...extra }).certPem);

  it("accepts a leaf issued by an anchor, whether the anchor is a root or an intermediate", () => {
    expect(chainsToAnchors(leafOf(root), [], [parse(root.certPem)], now)).toBeNull();
    expect(chainsToAnchors(leafOf(intermediate), [], [parse(intermediate.certPem)], now)).toBeNull();
  });

  it("walks through intermediates carried in the signature up to a root anchor", () => {
    const leaf = leafOf(intermediate);
    expect(chainsToAnchors(leaf, [parse(intermediate.certPem)], [parse(root.certPem)], now)).toBeNull();
    expect(chainsToAnchors(leaf, [], [parse(root.certPem)], now)).toBe("issuer is not trusted");
  });

  it("rejects self-signed, unknown-issuer, expired and CA-as-signer certificates", () => {
    const anchors = [parse(root.certPem)];
    expect(chainsToAnchors(leafOf(), [], anchors, now)).toBe("issuer is not trusted");
    expect(chainsToAnchors(leafOf(createTestCa("Other")), [], anchors, now)).toBe("issuer is not trusted");
    expect(chainsToAnchors(leafOf(root, { notBefore: new Date("2020-01-01"), notAfter: new Date("2021-01-01") }), [], anchors, now)).toBe("certificate outside validity period");
    expect(chainsToAnchors(leafOf(root, { isCa: true }), [], anchors, now)).toBe("signer certificate is a CA");
    expect(chainsToAnchors(parse(root.certPem), [], anchors, now)).toBe("signer certificate is a CA");
  });

  it("rejects an expired anchor and an empty trust store", () => {
    const expired = createTestCa("Old", { notBefore: new Date("2010-01-01"), notAfter: new Date("2011-01-01") });
    expect(chainsToAnchors(leafOf(expired), [], [parse(expired.certPem)], now)).not.toBeNull();
    expect(chainsToAnchors(leafOf(root), [], [], now)).toBe("empty trust store");
  });

  it("caps the number of embedded certificates per signature", () => {
    const leaf = createTestCertificate({ ca: root, rnc: "131880738" });
    const security = createXmlSecurity({ trustedCaPems: [root.certPem] });
    const signed = new Signature(leaf.keyPem, leaf.certPem).signXml("<ECF><a>1</a></ECF>", "ECF");
    expect(security.verify(signed, now)).toMatchObject({ valid: true, companyIds: ["131880738"], personIds: [] });
    const certBody = leaf.certPem.replace(/-----[A-Z ]+-----|\s/g, "");
    const withExtras = (count: number) =>
      signed.replace("</X509Data>", Array.from({ length: count }, () => `<X509Certificate>${certBody}</X509Certificate>`).join("") + "</X509Data>");
    expect(security.verify(withExtras(4), now).valid).toBe(true); // 5 certificates in total
    expect(security.verify(withExtras(5), now)).toMatchObject({ valid: false, reason: "too many embedded certificates" });
  });

  it("rejects signed documents containing DTDs or comments", () => {
    const leaf = createTestCertificate({ ca: root, rnc: "131880738" });
    const security = createXmlSecurity({ trustedCaPems: [root.certPem] });
    const signed = new Signature(leaf.keyPem, leaf.certPem).signXml("<ECF><a>1</a></ECF>", "ECF");
    expect(security.verify("<!-- c -->" + signed, now).valid).toBe(false);
    expect(security.verify('<!DOCTYPE ECF [<!ENTITY e "x">]>' + signed, now).valid).toBe(false);
  });

  it("ignores garbage in the configured PEM list instead of widening trust", () => {
    const security = createXmlSecurity({ trustedCaPems: ["not a pem", "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----"] });
    expect(security.verify("<a/>", now).valid).toBe(false);
  });
});
