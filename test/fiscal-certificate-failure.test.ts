import { describe, expect, it, vi } from "vitest";
import { classifyCertificateFailure } from "../worker/fiscal/certificateFailure";
import { FiscalWorker } from "../worker/fiscal/fiscalWorker";
import {
  PostgresFiscalWorkerRepository,
  type Queryable,
} from "../worker/fiscal/postgresFiscalWorkerRepository";
import { normalizeCertificateErrorCode } from "../src/features/ajustes/lib/ecfCertificateHealth";
import type {
  CertificateCustody,
  DgiiClientAdapter,
  FiscalWorkerRepository,
  FiscalWorkerSnapshot,
  XmlSignerAdapter,
} from "../worker/fiscal/types";

const now = new Date("2026-06-10T12:00:00.000Z");

describe("classifyCertificateFailure", () => {
  it.each([
    ["CERTIFICATE_NOT_FOUND", "x"],
    ["STORAGE_DOWNLOAD_FAILED", "Failed to download cert from storage: Not Found"],
    ["CERTIFICATE_EXPIRED", "x"],
    ["CERTIFICATE_NOT_READY", "x"],
    ["CERTIFICATE_NOT_VALID_NOW", "x"],
  ])("maps %s to itself", (code, message) => {
    expect(classifyCertificateFailure({ code, message })).toBe(code);
  });

  it("maps a decrypt failure wrapped by the custody fetch error to DECRYPT_FAILED", () => {
    expect(classifyCertificateFailure({ code: "CERTIFICATE_FETCH_ERROR", message: "Unsupported state or unable to authenticate data" })).toBe("DECRYPT_FAILED");
    expect(classifyCertificateFailure({ code: "CERTIFICATE_FETCH_ERROR", message: "ECF_ENCRYPTION_KEY missing" })).toBe("DECRYPT_FAILED");
    expect(classifyCertificateFailure({ code: "CERTIFICATE_FETCH_ERROR", message: "socket hang up" })).toBe("CERTIFICATE_FETCH_ERROR");
  });

  it("maps an unusable certificate during signing to INVALID_FILE", () => {
    expect(classifyCertificateFailure({ code: "SIGN_ERROR", message: "Invalid certificate extracting keys" })).toBe("INVALID_FILE");
  });

  it("ignores non-certificate errors", () => {
    for (const code of ["RETRYABLE_ERROR", "TERMINAL_ERROR", "TENANT_MISMATCH", "FISCAL_CONFIGURATION_INCOMPLETE", "FISCAL_WORKER_FAILED", "DGII_TRACK_ID_REQUIRED", "SECURITY_CODE_ERROR"]) {
      expect(classifyCertificateFailure({ code, message: "anything" })).toBeNull();
    }
    expect(classifyCertificateFailure({ code: "SIGN_ERROR", message: "Failed to sign XML: bad node" })).toBeNull();
  });

  it("only emits codes that the certificate health parser recognizes", () => {
    const samples = [
      { code: "CERTIFICATE_NOT_FOUND", message: "" },
      { code: "CERTIFICATE_NOT_READY", message: "" },
      { code: "CERTIFICATE_EXPIRED", message: "" },
      { code: "CERTIFICATE_NOT_VALID_NOW", message: "" },
      { code: "CERTIFICATE_METADATA_REQUIRED", message: "" },
      { code: "CERTIFICATE_PASSPHRASE_REQUIRED", message: "" },
      { code: "STORAGE_DOWNLOAD_FAILED", message: "" },
      { code: "CERTIFICATE_FETCH_ERROR", message: "net" },
      { code: "CERTIFICATE_FETCH_ERROR", message: "decrypt" },
      { code: "SIGN_ERROR", message: "Invalid certificate" },
    ];
    for (const sample of samples) {
      const code = classifyCertificateFailure(sample);
      expect(code).not.toBeNull();
      expect(normalizeCertificateErrorCode(code)).toBe(code);
    }
  });
});

describe("PostgresFiscalWorkerRepository certificate failure writes", () => {
  it("scopes both statements by certificate id and tenant id and only clears when set", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repo = new PostgresFiscalWorkerRepository({ db: { query } as unknown as Queryable });

    await repo.recordCertificateFailure({ tenantId: "t1", certificateId: "c1" }, "DECRYPT_FAILED");
    await repo.clearCertificateFailure({ tenantId: "t1", certificateId: "c1" });

    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("SET last_validation_error = $3 WHERE id = $1 AND tenant_id = $2"), ["c1", "t1", "DECRYPT_FAILED"]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("last_validation_error IS NOT NULL"), ["c1", "t1"]);
  });
});

function snapshot(): FiscalWorkerSnapshot {
  return {
    job: { id: "job-1", tenantId: "tenant-1", ecfDocumentId: "doc-1", facturaId: "inv-1", operation: "submit", status: "queued", attempts: 0, idempotencyKey: "k" },
    document: { id: "doc-1", tenantId: "tenant-1", facturaId: "inv-1", status: "queued", certificateMetadataId: "cert-1", dgiiTrackId: null, rfce_threshold_used: null, rejection_scope: null },
    certificate: { id: "cert-1", tenantId: "tenant-1", environment: "certification", isReady: true, validUntil: "2027-01-01T00:00:00.000Z" },
    ecf_secuencias_rangos: { E31: { start: 1, end: 300, vence: "31-12-2027" } },
    invoicePayload: {
      factura: { total: 118, itbis: 18, subtotal: 100, created_at: "2026-06-10T12:00:00.000Z", cliente_rnc: "123456789", cliente_nombre: "C", ncf: "E310000000001" },
      tenant: {
        rnc: "130862346", nombre_negocio: "X SRL", direccion: "A", telefono: "8095555555", email: "i@x.app",
        ecf_issuer_sucursal: "P", ecf_issuer_municipio: "SD", ecf_issuer_provincia: "DN", ecf_issuer_actividad_economica: "6201", ecf_issuer_correo_emisor: "f@x.app",
        ecf_secuencias_rangos: { E31: { start: 1, end: 300, vence: "31-12-2027" } },
      },
      items: [],
      payments: [],
    },
  };
}

function repo(overrides: Partial<FiscalWorkerRepository> = {}) {
  return {
    claimJob: vi.fn().mockResolvedValue({ kind: "claimed", snapshot: snapshot() }),
    recordAudit: vi.fn(async () => undefined),
    updateDocument: vi.fn(async () => undefined),
    updateJob: vi.fn(async () => undefined),
    recordCertificateFailure: vi.fn(async () => undefined),
    clearCertificateFailure: vi.fn(async () => undefined),
    ...overrides,
  } satisfies FiscalWorkerRepository;
}

const okCustody: CertificateCustody = {
  getSigningMaterial: vi.fn(async () => ({
    ok: true,
    value: { certificateId: "cert-1", tenantId: "tenant-1", environment: "certification", p12Bytes: new Uint8Array([1]), passphrase: "s" },
  }) as const),
};
const signer: XmlSignerAdapter = { signXml: vi.fn(async ({ unsignedXml }) => ({ signedXml: `<S>${unsignedXml}</S>` })) };

function failingCustody(code: string, message = "boom", retryable = false): CertificateCustody {
  return { getSigningMaterial: vi.fn(async () => ({ ok: false, error: { code, message, retryable } }) as const) };
}

const dgiiOk: DgiiClientAdapter = {
  submitSignedXml: vi.fn(async () => ({ kind: "submitted", trackId: "T1" }) as const),
  pollStatus: vi.fn(),
  sendSummary: vi.fn(),
};

describe("FiscalWorker certificate failure reason", () => {
  it("records the code on the certificate row when custody fails and keeps the job outcome", async () => {
    const repository = repo();
    const worker = new FiscalWorker({ repository, custody: failingCustody("CERTIFICATE_NOT_FOUND"), signer, dgii: dgiiOk, workerId: "w", now: () => now });

    const result = await worker.processJob("job-1");

    expect(result).toEqual({ kind: "failed", jobId: "job-1", retryable: false, code: "CERTIFICATE_NOT_FOUND" });
    expect(repository.recordCertificateFailure).toHaveBeenCalledWith({ tenantId: "tenant-1", certificateId: "cert-1" }, "CERTIFICATE_NOT_FOUND");
    expect(repository.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "terminal_error" }));
  });

  it("records CERTIFICATE_EXPIRED when the certificate is expired at signing time", async () => {
    const snap = snapshot();
    snap.certificate = { ...snap.certificate!, validUntil: "2026-01-01T00:00:00.000Z" };
    const repository = repo({ claimJob: vi.fn().mockResolvedValue({ kind: "claimed", snapshot: snap }) });
    const worker = new FiscalWorker({ repository, custody: okCustody, signer, dgii: dgiiOk, workerId: "w", now: () => now });

    await worker.processJob("job-1");

    expect(repository.recordCertificateFailure).toHaveBeenCalledWith({ tenantId: "tenant-1", certificateId: "cert-1" }, "CERTIFICATE_EXPIRED");
  });

  it("does not touch the certificate row for DGII or invoice-data errors", async () => {
    const repository = repo();
    const dgii: DgiiClientAdapter = {
      ...dgiiOk,
      submitSignedXml: vi.fn(async () => ({ kind: "retryable_error", message: "DGII timeout" }) as const),
    };
    const worker = new FiscalWorker({ repository, custody: okCustody, signer, dgii, workerId: "w", now: () => now });

    const result = await worker.processJob("job-1");

    expect(result).toMatchObject({ kind: "failed", code: "RETRYABLE_ERROR" });
    expect(repository.recordCertificateFailure).not.toHaveBeenCalled();
  });

  it("does not record a retryable certificate error while retries remain", async () => {
    const repository = repo();
    const worker = new FiscalWorker({ repository, custody: failingCustody("STORAGE_DOWNLOAD_FAILED", "Not Found", true), signer, dgii: dgiiOk, workerId: "w", now: () => now });

    const result = await worker.processJob("job-1");

    expect(result).toMatchObject({ kind: "failed", retryable: true, code: "STORAGE_DOWNLOAD_FAILED" });
    expect(repository.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "retryable_error" }));
    expect(repository.recordCertificateFailure).not.toHaveBeenCalled();
  });

  it("records a retryable certificate error once the attempt threshold is reached", async () => {
    const snap = snapshot();
    snap.job = { ...snap.job, attempts: 4 };
    const repository = repo({ claimJob: vi.fn().mockResolvedValue({ kind: "claimed", snapshot: snap }) });
    const worker = new FiscalWorker({ repository, custody: failingCustody("STORAGE_DOWNLOAD_FAILED", "Not Found", true), signer, dgii: dgiiOk, workerId: "w", now: () => now });

    await worker.processJob("job-1");

    expect(repository.recordCertificateFailure).toHaveBeenCalledWith({ tenantId: "tenant-1", certificateId: "cert-1" }, "STORAGE_DOWNLOAD_FAILED");
  });

  it("never changes the job outcome when writing the reason fails", async () => {
    const snap = snapshot();
    snap.job = { ...snap.job, attempts: 4 };
    const repository = repo({ claimJob: vi.fn().mockResolvedValue({ kind: "claimed", snapshot: snap }), recordCertificateFailure: vi.fn(async () => { throw new Error("db down"); }) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const worker = new FiscalWorker({ repository, custody: failingCustody("STORAGE_DOWNLOAD_FAILED", "Not Found", true), signer, dgii: dgiiOk, workerId: "w", now: () => now });

    const result = await worker.processJob("job-1");
    spy.mockRestore();

    expect(result).toEqual({ kind: "failed", jobId: "job-1", retryable: true, code: "STORAGE_DOWNLOAD_FAILED" });
    expect(repository.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "retryable_error" }));
  });

  it("clears the stored reason after a successful signing, and ignores a failing clear", async () => {
    const repository = repo({ clearCertificateFailure: vi.fn(async () => { throw new Error("db down"); }) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const worker = new FiscalWorker({ repository, custody: okCustody, signer, dgii: dgiiOk, workerId: "w", now: () => now });

    const result = await worker.processJob("job-1");
    spy.mockRestore();

    expect(result).toMatchObject({ kind: "processed", status: "submitted" });
    expect(repository.clearCertificateFailure).toHaveBeenCalledWith({ tenantId: "tenant-1", certificateId: "cert-1" });
    expect(repository.recordCertificateFailure).not.toHaveBeenCalled();
  });
});
