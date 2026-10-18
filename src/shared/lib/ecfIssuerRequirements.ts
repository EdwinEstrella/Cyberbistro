/**
 * Single source of truth for the issuer data DGII requires to build an e-CF XML.
 * Used by the POS fiscal engine (decides whether `dgii_ecf` can be used) and by the
 * activation wizard (what to ask for and persist), so both always agree.
 */

export type EcfIssuerFieldKey =
  | "rnc"
  | "nombre"
  | "direccion"
  | "sucursal"
  | "municipio"
  | "provincia"
  | "actividadEconomica"
  | "correoEmisor";

export interface EcfIssuerFieldDef {
  key: EcfIssuerFieldKey;
  /** Spanish label shown to the user. */
  label: string;
  /** Column in public.tenants where the value is stored. */
  column: string;
}

export const ECF_ISSUER_FIELDS: readonly EcfIssuerFieldDef[] = [
  { key: "rnc", label: "RNC del emisor", column: "rnc" },
  { key: "nombre", label: "Razón social", column: "nombre_negocio" },
  { key: "direccion", label: "Dirección fiscal", column: "direccion" },
  { key: "sucursal", label: "Sucursal emisora", column: "ecf_issuer_sucursal" },
  { key: "municipio", label: "Municipio", column: "ecf_issuer_municipio" },
  { key: "provincia", label: "Provincia", column: "ecf_issuer_provincia" },
  { key: "actividadEconomica", label: "Actividad económica", column: "ecf_issuer_actividad_economica" },
  { key: "correoEmisor", label: "Correo del emisor e-CF", column: "ecf_issuer_correo_emisor" },
];

export type EcfIssuerInput = Partial<Record<EcfIssuerFieldKey, string | null | undefined>>;

export interface EcfIssuerValidation {
  complete: boolean;
  /** Labels of fields that are empty. */
  missing: string[];
  /** Fields that are present but malformed, with a user-facing reason. */
  invalid: Array<{ key: EcfIssuerFieldKey; label: string; message: string }>;
  /** Single Spanish sentence for the user, or "" when complete. */
  message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keeps digits only: "1-31-12345-6" -> "131123456". */
export function normalizeRnc(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function isValidRnc(value: string | null | undefined): boolean {
  const digits = normalizeRnc(value);
  return digits.length === 9 || digits.length === 11;
}

export function isValidIssuerEmail(value: string | null | undefined): boolean {
  return EMAIL_PATTERN.test((value ?? "").trim());
}

export function validateEcfIssuer(input: EcfIssuerInput): EcfIssuerValidation {
  const missing: string[] = [];
  const invalid: EcfIssuerValidation["invalid"] = [];

  for (const field of ECF_ISSUER_FIELDS) {
    const value = (input[field.key] ?? "").trim();
    if (!value) {
      missing.push(field.label);
      continue;
    }
    if (field.key === "rnc" && !isValidRnc(value)) {
      invalid.push({ key: field.key, label: field.label, message: "El RNC debe tener 9 u 11 dígitos." });
    }
    if (field.key === "correoEmisor" && !isValidIssuerEmail(value)) {
      invalid.push({ key: field.key, label: field.label, message: "El correo del emisor no tiene un formato válido." });
    }
  }

  const parts: string[] = [];
  if (missing.length > 0) parts.push(`Falta completar: ${missing.join(", ")}.`);
  for (const item of invalid) parts.push(item.message);

  return { complete: missing.length === 0 && invalid.length === 0, missing, invalid, message: parts.join(" ") };
}

/** Maps a tenants row (snake_case columns) to the helper input. */
export function issuerInputFromTenantRow(row: {
  rnc?: string | null;
  nombre_negocio?: string | null;
  direccion?: string | null;
  ecf_issuer_sucursal?: string | null;
  ecf_issuer_municipio?: string | null;
  ecf_issuer_provincia?: string | null;
  ecf_issuer_actividad_economica?: string | null;
  ecf_issuer_correo_emisor?: string | null;
} | null | undefined): EcfIssuerInput {
  return {
    rnc: row?.rnc,
    nombre: row?.nombre_negocio,
    direccion: row?.direccion,
    sucursal: row?.ecf_issuer_sucursal,
    municipio: row?.ecf_issuer_municipio,
    provincia: row?.ecf_issuer_provincia,
    actividadEconomica: row?.ecf_issuer_actividad_economica,
    correoEmisor: row?.ecf_issuer_correo_emisor,
  };
}

/** Builds the `tenants` update payload (trimmed, RNC as digits only). */
export function buildIssuerUpdatePayload(input: EcfIssuerInput): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of ECF_ISSUER_FIELDS) {
    const raw = (input[field.key] ?? "").trim();
    payload[field.column] = field.key === "rnc" ? normalizeRnc(raw) : raw;
  }
  return payload;
}

/** Cedula of the DGII-registered representative, digits only (accepts dashes and spaces). */
export function normalizeRepresentativeId(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Optional field: empty is valid; otherwise it must be an 11-digit cedula. */
export function validateRepresentativeId(value: string | null | undefined): { valid: boolean; message: string } {
  const digits = normalizeRepresentativeId(value);
  if (digits.length === 0 || digits.length === 11) return { valid: true, message: "" };
  return { valid: false, message: "La cédula del representante debe tener 11 dígitos." };
}

/** Value persisted in `tenants.ecf_representative_id` (null when empty). */
export function buildRepresentativeIdPayload(value: string | null | undefined): { ecf_representative_id: string | null } {
  const digits = normalizeRepresentativeId(value);
  return { ecf_representative_id: digits.length > 0 ? digits : null };
}
