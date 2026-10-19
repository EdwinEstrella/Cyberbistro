// Pure formatting of X.509 distinguished names for certificate metadata.
// node-forge only exposes short names for a few OIDs, so the dgii-ecf formatter prints
// `undefined=` for surname, givenName, serialNumber, organizationIdentifier, ... This helper keeps
// every known short name and labels the remaining OIDs, falling back to the dotted OID.

export interface DistinguishedNameAttribute {
  type?: string;
  shortName?: string;
  value?: unknown;
}

const OID_LABELS: Readonly<Record<string, string>> = {
  "2.5.4.4": "SN",
  "2.5.4.42": "GN",
  "2.5.4.5": "serialNumber",
  "2.5.4.97": "organizationIdentifier",
  "2.5.4.13": "description",
  "2.5.4.12": "title",
};

export function formatDistinguishedName(attributes: readonly DistinguishedNameAttribute[]): string {
  return attributes
    .map((attribute) => {
      const label =
        (attribute.shortName && attribute.shortName.length > 0 ? attribute.shortName : undefined) ??
        (attribute.type ? OID_LABELS[attribute.type] ?? attribute.type : "OID");
      return `${label}=${String(attribute.value ?? "")}`;
    })
    .join(", ");
}
