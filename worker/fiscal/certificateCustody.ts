import { randomUUID } from "node:crypto";
import { fiscalWorkerError, unknownToWorkerError } from "./errors";
import type {
  CertificateCustody,
  CertificateCustodyStore,
  CertificateMetadataView,
  CertificateSecretInput,
  EcfEnvironment,
  ParsedCertificateMetadata,
  SigningMaterial,
  StoredCertificateMetadata,
  WorkerResult,
} from "./types";

export class SupabaseStorageCertificateCustody implements CertificateCustody {
  constructor(private readonly supabaseUrl: string, private readonly supabaseKey: string, private readonly db: any) {}

  async getSigningMaterial(request: import("./types").GetSigningMaterialRequest): Promise<WorkerResult<SigningMaterial>> {
    try {
      // 1. Fetch metadata from DB
      const result = await this.db.query(
        `SELECT storage_ref, password_encrypted FROM public.ecf_certificate_metadata WHERE id = $1 AND tenant_id = $2`,
        [request.certificateId, request.tenantId]
      );

      const row = result.rows[0] as any;
      if (!row || !row.storage_ref) {
        return { ok: false, error: fiscalWorkerError("CERTIFICATE_NOT_FOUND", "Certificate metadata not found or storage_ref missing.", false) };
      }

      // 2. Download from Supabase Storage REST API
      const storageUrl = `${this.supabaseUrl}/storage/v1/object/public/fiscal_certificates/${row.storage_ref}`;
      // Note: if private bucket, we must use authenticated request
      const response = await fetch(`${this.supabaseUrl}/storage/v1/object/fiscal_certificates/${row.storage_ref}`, {
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
        }
      });

      if (!response.ok) {
        return { ok: false, error: fiscalWorkerError("STORAGE_DOWNLOAD_FAILED", `Failed to download cert from storage: ${response.statusText}`, true) };
      }

      const arrayBuffer = await response.arrayBuffer();
      const p12Bytes = new Uint8Array(arrayBuffer);

      return {
        ok: true,
        value: {
          certificateId: request.certificateId,
          tenantId: request.tenantId,
          environment: request.environment,
          p12Bytes,
          passphrase: row.password_encrypted,
        }
      };
    } catch (err: any) {
      return { ok: false, error: unknownToWorkerError(err, "CERTIFICATE_FETCH_ERROR", true) };
    }
  }
}

export class FailClosedCertificateCustody implements CertificateCustody {
  async getSigningMaterial(_request: import("./types").GetSigningMaterialRequest): Promise<WorkerResult<SigningMaterial>> {
    return {
      ok: false,
      error: fiscalWorkerError(
        "CERTIFICATE_CUSTODY_NOT_CONFIGURED",
        "No encrypted external certificate custody is configured for the Node fiscal worker; refusing to expose signing material.",
        false
      ),
    };
  }
}

export type CertificateParser = (input: {
  p12Bytes: Uint8Array;
  passphrase: string;
}) => Promise<ParsedCertificateMetadata>;

export interface ValidateCertificateForCustodyInput extends CertificateSecretInput {
  now: Date;
  parser?: CertificateParser;
}

function validateSecretInput(input: CertificateSecretInput): WorkerResult<null> {
  if (!input.tenantId.trim()) {
    return { ok: false, error: fiscalWorkerError("TENANT_REQUIRED", "Tenant id is required for certificate custody.") };
  }
  if (!input.p12Bytes.byteLength) {
    return { ok: false, error: fiscalWorkerError("CERTIFICATE_BYTES_REQUIRED", "Certificate p12 bytes are required.") };
  }
  if (!input.passphrase.trim()) {
    return { ok: false, error: fiscalWorkerError("CERTIFICATE_PASSPHRASE_REQUIRED", "Certificate passphrase is required.") };
  }
  return { ok: true, value: null };
}

export async function validateCertificateForCustody(
  input: ValidateCertificateForCustodyInput
): Promise<WorkerResult<CertificateMetadataView>> {
  const basicValidation = validateSecretInput(input);
  if (!basicValidation.ok) return basicValidation;

  if (!input.parser) {
    return {
      ok: false,
      error: fiscalWorkerError(
        "CERTIFICATE_PARSER_NOT_CONFIGURED",
        "No server-side p12 parser is configured; refusing to mark certificate ready.",
        false
      ),
    };
  }

  try {
    const parsed = await input.parser({ p12Bytes: input.p12Bytes, passphrase: input.passphrase });
    if (parsed.validFrom.getTime() > input.now.getTime() || parsed.validUntil.getTime() <= input.now.getTime()) {
      return {
        ok: false,
        error: fiscalWorkerError("CERTIFICATE_NOT_VALID_NOW", "Certificate is not valid at the validation time.", false),
      };
    }

    return {
      ok: true,
      value: {
        tenantId: input.tenantId,
        environment: input.environment,
        subject: parsed.subject,
        issuer: parsed.issuer,
        serialNumber: parsed.serialNumber,
        validFrom: parsed.validFrom.toISOString(),
        validUntil: parsed.validUntil.toISOString(),
        isReady: true,
        lastValidationError: null,
      },
    };
  } catch (error) {
    return { ok: false, error: unknownToWorkerError(error, "CERTIFICATE_VALIDATION_FAILED", false) };
  }
}

export function createWorkerMemoryCertificateCustody(options: {
  parser?: CertificateParser;
  now?: () => Date;
}): CertificateCustodyStore {
  const records = new Map<string, SigningMaterial & StoredCertificateMetadata>();
  const now = options.now ?? (() => new Date());

  return {
    async store(input) {
      const validation = await validateCertificateForCustody({ ...input, parser: options.parser, now: now() });
      if (!validation.ok) return validation;

      const certificateId = randomUUID();
      const metadata: StoredCertificateMetadata = { ...validation.value, certificateId };
      records.set(certificateId, {
        ...metadata,
        certificateId,
        tenantId: input.tenantId,
        environment: input.environment,
        p12Bytes: new Uint8Array(input.p12Bytes),
        passphrase: input.passphrase,
      });

      return { ok: true, value: metadata };
    },

    async getSigningMaterial(request) {
      const record = records.get(request.certificateId);
      if (!record || record.tenantId !== request.tenantId || record.environment !== request.environment) {
        return { ok: false, error: fiscalWorkerError("CERTIFICATE_NOT_FOUND", "Certificate was not found for tenant/environment.") };
      }

      return {
        ok: true,
        value: {
          certificateId: record.certificateId,
          tenantId: record.tenantId,
          environment: record.environment as EcfEnvironment,
          p12Bytes: new Uint8Array(record.p12Bytes),
          passphrase: record.passphrase,
        },
      };
    },
  };
}
