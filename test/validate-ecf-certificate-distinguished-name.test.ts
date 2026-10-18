import { describe, expect, it } from "vitest";
import { formatDistinguishedName } from "../supabase/functions/validate-ecf-certificate/distinguishedName";
import { parseSubjectIdentifiers } from "../src/features/ajustes/lib/ecfCertificateHealth";

describe("formatDistinguishedName", () => {
  const subject = [
    { type: "2.5.4.6", shortName: "C", value: "DO" },
    { type: "2.5.4.4", value: "TORIBIO GUERRERO" },
    { type: "2.5.4.42", value: "JOSE ABRAHAN" },
    { type: "2.5.4.5", value: "IDCDO-12100129126" },
    { type: "2.5.4.3", shortName: "CN", value: "JOSE ABRAHAN TORIBIO GUERRERO" },
    { type: "2.5.4.13", value: "QUALIFIED CERTIFICATE FOR NATURAL PERSON - TAX PROCEDURES" },
  ];

  it("labels OIDs without a forge short name instead of printing undefined", () => {
    const text = formatDistinguishedName(subject);
    expect(text).not.toContain("undefined");
    expect(text).toBe(
      "C=DO, SN=TORIBIO GUERRERO, GN=JOSE ABRAHAN, serialNumber=IDCDO-12100129126, CN=JOSE ABRAHAN TORIBIO GUERRERO, description=QUALIFIED CERTIFICATE FOR NATURAL PERSON - TAX PROCEDURES",
    );
  });

  it("maps organizationIdentifier and title, and falls back to the dotted OID", () => {
    expect(formatDistinguishedName([
      { type: "2.5.4.97", value: "VATDO-133488485" },
      { type: "2.5.4.12", value: "Gerente" },
      { type: "1.2.3.4", value: "x" },
    ])).toBe("organizationIdentifier=VATDO-133488485, title=Gerente, 1.2.3.4=x");
  });

  it("keeps the identifiers parseable by the health classification", () => {
    expect(parseSubjectIdentifiers(formatDistinguishedName(subject))).toEqual({ companyIds: [], personIds: ["12100129126"] });
  });
});
