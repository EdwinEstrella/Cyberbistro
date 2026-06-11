export type EcfEnvironment = "test" | "certification" | "production";

export type EcfFiscalStatus =
  | "pending_offline"
  | "pending_sync"
  | "queued"
  | "signed"
  | "submitted"
  | "accepted"
  | "rejected"
  | "retryable_error"
  | "terminal_error";

export type FiscalOutboxOperation = "submit" | "poll_status" | "resubmit";
export type FiscalOutboxStatus = "queued" | "processing" | "retryable_error" | "terminal_error" | "done";

export type WorkerResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: FiscalWorkerError };

export interface FiscalWorkerError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ParsedCertificateMetadata {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validUntil: Date;
}

export interface CertificateMetadataView {
  tenantId: string;
  environment: EcfEnvironment;
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validUntil: string;
  isReady: boolean;
  lastValidationError: string | null;
}

export interface CertificateSecretInput {
  tenantId: string;
  environment: EcfEnvironment;
  p12Bytes: Uint8Array;
  passphrase: string;
}

export interface SigningMaterial extends CertificateSecretInput {
  certificateId: string;
}

export interface StoredCertificateMetadata extends CertificateMetadataView {
  certificateId: string;
}

export interface GetSigningMaterialRequest {
  tenantId: string;
  certificateId: string;
  environment: EcfEnvironment;
}

export interface CertificateCustody {
  getSigningMaterial(request: GetSigningMaterialRequest): Promise<WorkerResult<SigningMaterial>>;
}

export interface CertificateCustodyStore extends CertificateCustody {
  store(input: CertificateSecretInput): Promise<WorkerResult<StoredCertificateMetadata>>;
}

export interface FiscalOutboxJob {
  id: string;
  tenantId: string;
  ecfDocumentId: string;
  facturaId: string;
  operation: FiscalOutboxOperation;
  status: FiscalOutboxStatus;
  attempts: number;
  nextAttemptAt?: string;
  idempotencyKey: string;
}

export interface EcfDocumentSnapshot {
  id: string;
  tenantId: string;
  facturaId: string;
  status: EcfFiscalStatus;
  certificateMetadataId: string | null;
  dgiiTrackId: string | null;
}

export interface CertificateMetadataSnapshot {
  id: string;
  tenantId: string;
  environment: EcfEnvironment;
  isReady: boolean;
  validUntil: string | null;
}

export interface FiscalWorkerSnapshot {
  job: FiscalOutboxJob;
  document: EcfDocumentSnapshot;
  certificate: CertificateMetadataSnapshot | null;
  invoicePayload: Record<string, unknown>;
}

export type ClaimJobResult =
  | { kind: "claimed"; snapshot: FiscalWorkerSnapshot }
  | { kind: "already_done"; jobId: string }
  | { kind: "locked"; jobId: string; lockedBy?: string | null };

export interface FiscalWorkerRepository {
  claimJob(jobId: string, claim: { workerId: string; claimedAt: string }): Promise<ClaimJobResult>;
  updateDocument(documentId: string, update: Partial<{
    status: EcfFiscalStatus;
    certificateMetadataId: string;
    xmlHash: string;
    signedXmlStorageKey: string;
    dgiiTrackId: string;
    dgiiSecurityCode: string;
    dgiiStatusCode: string;
    dgiiStatusMessage: string;
    submittedAt: string;
    acceptedAt: string;
    rejectedAt: string;
    lastError: string | null;
  }>): Promise<void>;
  updateJob(jobId: string, update: Partial<{
    status: FiscalOutboxStatus;
    attempts: number;
    nextAttemptAt: string;
    errorMessage: string | null;
  }>): Promise<void>;
  recordAudit(event: FiscalAuditEvent): Promise<void>;
  findNextRunnableJob?(now: string): Promise<string | null>;
}

export interface FiscalAuditEvent {
  eventType: "job_started" | "xml_signed" | "dgii_submitted" | "dgii_polled" | "job_completed" | "job_failed" | "job_skipped";
  jobId: string;
  tenantId?: string;
  ecfDocumentId?: string;
  workerId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface XmlSignerAdapter {
  signXml(input: {
    unsignedXml: string;
    certificate: SigningMaterial;
    environment: EcfEnvironment;
  }): Promise<{ signedXml: string; storageKey?: string }>;
}

export type DgiiSubmitResult =
  | { kind: "submitted"; trackId: string; statusCode?: string; message?: string }
  | { kind: "retryable_error"; statusCode?: string; message: string }
  | { kind: "terminal_error"; statusCode?: string; message: string };

export type DgiiPollResult =
  | { kind: "submitted"; statusCode?: string; message?: string }
  | { kind: "accepted"; statusCode?: string; message?: string }
  | { kind: "rejected"; statusCode?: string; message: string }
  | { kind: "retryable_error"; statusCode?: string; message: string }
  | { kind: "terminal_error"; statusCode?: string; message: string };

export interface DgiiClientAdapter {
  submitSignedXml(input: {
    signedXml: string;
    environment: EcfEnvironment;
    idempotencyKey: string;
    certificate: SigningMaterial;
  }): Promise<DgiiSubmitResult>;
  pollStatus(input: {
    trackId: string;
    environment: EcfEnvironment;
    idempotencyKey: string;
    certificate: SigningMaterial;
  }): Promise<DgiiPollResult>;
}
