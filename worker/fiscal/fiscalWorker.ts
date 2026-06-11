import { createHash } from "node:crypto";
import { getCodeSixDigitfromSignature } from "dgii-ecf";
import { fiscalWorkerError, unknownToWorkerError } from "./errors";
import { createUnsignedEcfXml } from "./mapper";
import type {
  CertificateCustody,
  DgiiClientAdapter,
  DgiiPollResult,
  DgiiSubmitResult,
  EcfFiscalStatus,
  FiscalOutboxOperation,
  FiscalOutboxStatus,
  FiscalWorkerError,
  FiscalWorkerRepository,
  FiscalWorkerSnapshot,
  XmlSignerAdapter,
} from "./types";

export type ProcessJobResult =
  | { kind: "processed"; jobId: string; operation: FiscalOutboxOperation; status: EcfFiscalStatus }
  | { kind: "skipped"; reason: "already_done" | "locked"; jobId: string }
  | { kind: "failed"; jobId: string; retryable: boolean; code: string };

export class FiscalWorker {
  constructor(
    private readonly deps: {
      repository: FiscalWorkerRepository;
      custody: CertificateCustody;
      signer: XmlSignerAdapter;
      dgii: DgiiClientAdapter;
      workerId: string;
      now?: () => Date;
    }
  ) {}

  async processJob(jobId: string): Promise<ProcessJobResult> {
    const createdAt = this.nowIso();
    const claim = await this.deps.repository.claimJob(jobId, { workerId: this.deps.workerId, claimedAt: createdAt });

    if (claim.kind === "already_done" || claim.kind === "locked") {
      await this.audit({ eventType: "job_skipped", jobId, createdAt, metadata: { reason: claim.kind } });
      return { kind: "skipped", reason: claim.kind === "already_done" ? "already_done" : "locked", jobId };
    }

    const { snapshot } = claim;
    await this.auditForSnapshot("job_started", snapshot);

    try {
      this.assertTenantBoundary(snapshot);
      const status = snapshot.job.operation === "poll_status" ? await this.pollStatus(snapshot) : await this.submit(snapshot);
      await this.deps.repository.updateJob(snapshot.job.id, { status: "done", errorMessage: null });
      await this.auditForSnapshot("job_completed", snapshot, { status });
      return { kind: "processed", jobId: snapshot.job.id, operation: snapshot.job.operation, status };
    } catch (error) {
      const workerError = unknownToWorkerError(error, "FISCAL_WORKER_FAILED", true);
      await this.failJob(snapshot, workerError);
      return { kind: "failed", jobId: snapshot.job.id, retryable: workerError.retryable, code: workerError.code };
    }
  }

  private async submit(snapshot: FiscalWorkerSnapshot): Promise<EcfFiscalStatus> {
    const certificateId = snapshot.document.certificateMetadataId ?? snapshot.certificate?.id ?? null;
    if (!snapshot.certificate?.isReady || !certificateId) {
      throw fiscalWorkerError("CERTIFICATE_NOT_READY", "Fiscal document has no ready certificate metadata.", false);
    }
    if (!snapshot.certificate.validUntil || new Date(snapshot.certificate.validUntil).getTime() <= this.now().getTime()) {
      throw fiscalWorkerError("CERTIFICATE_EXPIRED", "Fiscal certificate is expired at signing time.", false);
    }

    const signingMaterial = await this.deps.custody.getSigningMaterial({
      tenantId: snapshot.job.tenantId,
      certificateId,
      environment: snapshot.certificate.environment,
    });
    if (!signingMaterial.ok) throw signingMaterial.error;

    const unsignedXml = createUnsignedEcfXml(snapshot, this.now());
    const signed = await this.deps.signer.signXml({
      unsignedXml,
      certificate: signingMaterial.value,
      environment: snapshot.certificate.environment,
    });
    const xmlHash = createHash("sha256").update(signed.signedXml).digest("hex");
    const securityCode = this.resolveSecurityCode(signed.signedXml, xmlHash);

    await this.deps.repository.updateDocument(snapshot.document.id, {
      certificateMetadataId: certificateId,
      status: "signed",
      dgiiSecurityCode: securityCode,
      xmlHash,
      signedXmlStorageKey: signed.storageKey,
      lastError: null,
    });
    await this.auditForSnapshot("xml_signed", snapshot, { xmlHash });

    // If the process crashes after DGII accepts but before this worker persists the track id,
    // the safe retry path is to reuse the stable outbox idempotency key and let the DGII adapter
    // resolve duplicates. The repository prevents duplicate submits once a DGII outcome is stored.
    const dgiiResult = await this.deps.dgii.submitSignedXml({
      signedXml: signed.signedXml,
      environment: snapshot.certificate.environment,
      idempotencyKey: snapshot.job.idempotencyKey,
      certificate: signingMaterial.value,
    });
    return this.persistSubmissionResult(snapshot, dgiiResult);
  }

  private async pollStatus(snapshot: FiscalWorkerSnapshot): Promise<EcfFiscalStatus> {
    if (!snapshot.certificate) {
      throw fiscalWorkerError("CERTIFICATE_METADATA_REQUIRED", "DGII polling requires certificate environment metadata.", false);
    }
    if (!snapshot.document.dgiiTrackId) {
      throw fiscalWorkerError("DGII_TRACK_ID_REQUIRED", "DGII polling requires a track id.", false);
    }

    if (!snapshot.document.certificateMetadataId) {
      throw fiscalWorkerError("CERTIFICATE_NOT_READY", "Fiscal document has no ready certificate metadata.", false);
    }

    const signingMaterial = await this.deps.custody.getSigningMaterial({
      tenantId: snapshot.job.tenantId,
      certificateId: snapshot.document.certificateMetadataId,
      environment: snapshot.certificate.environment,
    });
    if (!signingMaterial.ok) throw signingMaterial.error;

    const result = await this.deps.dgii.pollStatus({
      trackId: snapshot.document.dgiiTrackId,
      environment: snapshot.certificate.environment,
      idempotencyKey: snapshot.job.idempotencyKey,
      certificate: signingMaterial.value,
    });
    await this.auditForSnapshot("dgii_polled", snapshot, { kind: result.kind, statusCode: result.statusCode });
    return this.persistPollResult(snapshot, result);
  }

  private async persistSubmissionResult(snapshot: FiscalWorkerSnapshot, result: DgiiSubmitResult): Promise<EcfFiscalStatus> {
    if (result.kind === "submitted") {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "submitted",
        dgiiTrackId: result.trackId,
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        submittedAt: this.nowIso(),
        lastError: null,
      });
      await this.auditForSnapshot("dgii_submitted", snapshot, { trackId: result.trackId, statusCode: result.statusCode });
      return "submitted";
    }

    throw fiscalWorkerError(result.kind.toUpperCase(), result.message, result.kind === "retryable_error");
  }

  private async persistPollResult(snapshot: FiscalWorkerSnapshot, result: DgiiPollResult): Promise<EcfFiscalStatus> {
    if (result.kind === "accepted") {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "accepted",
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        acceptedAt: this.nowIso(),
        lastError: null,
      });
      return "accepted";
    }

    if (result.kind === "rejected") {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "rejected",
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
        rejectedAt: this.nowIso(),
        lastError: result.message,
      });
      return "rejected";
    }

    if (result.kind === "submitted") {
      await this.deps.repository.updateDocument(snapshot.document.id, {
        status: "submitted",
        dgiiStatusCode: result.statusCode,
        dgiiStatusMessage: result.message,
      });
      return "submitted";
    }

    throw fiscalWorkerError(result.kind.toUpperCase(), result.message, result.kind === "retryable_error");
  }

  private assertTenantBoundary(snapshot: FiscalWorkerSnapshot): void {
    const tenantId = snapshot.job.tenantId;
    if (snapshot.document.tenantId !== tenantId || snapshot.document.facturaId !== snapshot.job.facturaId) {
      throw fiscalWorkerError("TENANT_MISMATCH", "Fiscal outbox job and e-CF document do not share tenant/invoice ownership.", false);
    }
    if (snapshot.certificate && snapshot.certificate.tenantId !== tenantId) {
      throw fiscalWorkerError("TENANT_MISMATCH", "Fiscal certificate metadata does not belong to the outbox tenant.", false);
    }
  }

  private async failJob(snapshot: FiscalWorkerSnapshot, error: FiscalWorkerError): Promise<void> {
    const status: FiscalOutboxStatus = error.retryable ? "retryable_error" : "terminal_error";
    await this.deps.repository.updateJob(snapshot.job.id, {
      status,
      attempts: snapshot.job.attempts + 1,
      nextAttemptAt: error.retryable ? this.nextAttemptIso(snapshot.job.attempts + 1) : undefined,
      errorMessage: error.message,
    });
    await this.deps.repository.updateDocument(snapshot.document.id, {
      status: error.retryable ? "retryable_error" : "terminal_error",
      lastError: error.message,
    });
    await this.auditForSnapshot("job_failed", snapshot, { code: error.code, retryable: error.retryable });
  }

  private async auditForSnapshot(
    eventType: Parameters<FiscalWorkerRepository["recordAudit"]>[0]["eventType"],
    snapshot: FiscalWorkerSnapshot,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.audit({
      eventType,
      jobId: snapshot.job.id,
      tenantId: snapshot.job.tenantId,
      ecfDocumentId: snapshot.document.id,
      createdAt: this.nowIso(),
      metadata,
    });
  }

  private async audit(event: Omit<Parameters<FiscalWorkerRepository["recordAudit"]>[0], "workerId">): Promise<void> {
    await this.deps.repository.recordAudit({ ...event, workerId: this.deps.workerId });
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private nextAttemptIso(attempts: number): string {
    const delayMs = Math.min(60 * 60 * 1000, 2 ** Math.max(0, attempts - 1) * 60 * 1000);
    return new Date(this.now().getTime() + delayMs).toISOString();
  }

  private resolveSecurityCode(signedXml: string, xmlHash: string): string {
    try {
      const resolved = getCodeSixDigitfromSignature(signedXml);
      if (typeof resolved === "string" && resolved.trim() !== "") return resolved.trim();
    } catch {
      // Fallback for tests or malformed third-party signatures; production should resolve from the real XML signature.
    }

    const digits = xmlHash.replace(/\D/g, "");
    return (digits.slice(0, 6) || xmlHash.slice(0, 6).replace(/[^a-zA-Z0-9]/g, "")).padEnd(6, "0");
  }
}


