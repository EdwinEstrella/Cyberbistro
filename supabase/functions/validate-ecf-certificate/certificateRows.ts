export const ECF_ENVIRONMENTS = ["test", "certification", "production"] as const;
export type EcfEnvironment = (typeof ECF_ENVIRONMENTS)[number];

export interface BaseCertificateData {
  tenant_id: string;
  subject: string;
  issuer: string;
  serial_number?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  storage_ref: string;
  password_encrypted: string;
  is_ready: boolean;
  last_validation_error?: string | null;
  [key: string]: unknown;
}

export type CertificateRow<T = BaseCertificateData> = T & { environment: string };

/**
 * Builds metadata rows across the target environments (default: test, certification, production)
 * from a single validated certificate payload. Pure and non-mutating.
 */
export function buildCertificateRows<T extends Record<string, unknown>>(
  base: T,
  environments: readonly string[] = ECF_ENVIRONMENTS,
): CertificateRow<T>[] {
  return environments.map((environment) => ({
    ...base,
    environment,
  }));
}
