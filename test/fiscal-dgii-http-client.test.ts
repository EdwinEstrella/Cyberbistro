import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import {
  configureDgiiHttpClient,
  DEFAULT_DGII_HTTP_TIMEOUT_MS,
  DGII_ECF_CIPHERS,
  resolveDgiiHttpTimeoutMsFromEnv,
  type DgiiHttpClientLike,
} from "../worker/fiscal/dgiiHttpClient";
import {
  isDgiiTerminalError,
  isTransientTransportError,
} from "../worker/fiscal/dgiiAdapters";
import {
  calculateNextAttemptDelayMs,
  FiscalWorker,
} from "../worker/fiscal/fiscalWorker";
import {
  createFiscalWorkerRuntimeFromEnv,
} from "../worker/fiscal/fiscalWorkerRuntime";
import { fiscalWorkerError } from "../worker/fiscal/errors";
import type { FiscalWorkerRepository, FiscalWorkerSnapshot } from "../worker/fiscal/types";

const require = createRequire(import.meta.url);

function createMockSnapshot(overrides?: Partial<FiscalWorkerSnapshot>): FiscalWorkerSnapshot {
  return {
    ecf_secuencias_rangos: {
      E31: { start: 1, end: 100, vence: "31-12-2027" },
    },
    job: {
      id: "job-1",
      tenantId: "tenant-1",
      ecfDocumentId: "doc-1",
      facturaId: "factura-1",
      operation: "submit",
      status: "queued",
      attempts: 0,
      idempotencyKey: "idem-1",
    },
    document: {
      id: "doc-1",
      tenantId: "tenant-1",
      facturaId: "factura-1",
      status: "queued",
      certificateMetadataId: "cert-1",
      dgiiTrackId: null,
      rfce_threshold_used: null,
      rejection_scope: null,
      batchId: null,
    },
    certificate: {
      id: "cert-1",
      tenantId: "tenant-1",
      environment: "production",
      isReady: true,
      validUntil: "2030-12-31T23:59:59.000Z",
    },
    invoicePayload: {
      factura: {
        ncf: "E310000000001",
        total: 118,
        itbis: 18,
        subtotal: 100,
        created_at: "2026-11-15T12:00:00.000Z",
        cliente_rnc: "123456789",
        cliente_nombre: "Test Client",
      },
      tenant: {
        rnc: "130862346",
        nombre_negocio: "CYBERBISTRO SRL",
        direccion: "Av. Winston Churchill",
        telefono: "8095555555",
        email: "info@cyberbistro.app",
        ecf_issuer_sucursal: "Principal",
        ecf_issuer_municipio: "Santo Domingo Centro",
        ecf_issuer_provincia: "Distrito Nacional",
        ecf_issuer_actividad_economica: "6201",
        ecf_issuer_correo_emisor: "factura@cyberbistro.app",
        ecf_secuencias_rangos: { E31: { start: 1, end: 100, vence: "31-12-2027" } },
      },
      items: [
        {
          nombre: "Item 1",
          cantidad: 1,
          precio_unitario: 100,
          monto_item: 100,
        },
      ],
    },
    ...overrides,
  };
}

function createMockRepository(snapshot: FiscalWorkerSnapshot) {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const repo: FiscalWorkerRepository = {
    claimJob: vi.fn(async () => ({ kind: "claimed" as const, snapshot })),
    updateJob: vi.fn(async (_jobId, patch) => {
      jobUpdates.push(patch as Record<string, unknown>);
    }),
    updateDocument: vi.fn(async () => {}),
    recordAudit: vi.fn(async () => {}),
  };
  return { repo, jobUpdates };
}

describe("configureDgiiHttpClient", () => {
  it("sets timeout, replaces agent with keepAlive false, socket timeout, and identical TLS options", () => {
    const fakeClient: DgiiHttpClientLike = {
      defaults: {
        timeout: 0,
        httpsAgent: new https.Agent({ keepAlive: true }),
      },
    };

    configureDgiiHttpClient(fakeClient, { requestTimeoutMs: 15_000 });

    expect(fakeClient.defaults.timeout).toBe(15_000);
    const agent = fakeClient.defaults.httpsAgent as https.Agent;
    expect(agent).toBeInstanceOf(https.Agent);

    const agentOptions = (agent as unknown as { options: Record<string, unknown> }).options;
    expect(agentOptions.keepAlive).toBe(false);
    expect(agentOptions.minVersion).toBe("TLSv1.2");
    expect(agentOptions.maxVersion).toBe("TLSv1.3");
    expect(agentOptions.ciphers).toBe(DGII_ECF_CIPHERS);
    expect(agentOptions.honorCipherOrder).toBe(true);
    expect(agentOptions.timeout).toBe(15_000);
  });

  it("is idempotent and destroys any previous agent with destroy method", () => {
    const destroySpy = vi.fn();
    const fakeClient: DgiiHttpClientLike = {
      defaults: {
        timeout: 5000,
        httpsAgent: { destroy: destroySpy },
      },
    };

    configureDgiiHttpClient(fakeClient, { requestTimeoutMs: 20_000 });
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(fakeClient.defaults.timeout).toBe(20_000);

    const agent1 = fakeClient.defaults.httpsAgent as https.Agent;
    const destroySpy2 = vi.spyOn(agent1, "destroy");

    configureDgiiHttpClient(fakeClient, { requestTimeoutMs: 20_000 });
    expect(destroySpy2).toHaveBeenCalledTimes(1);
    expect(fakeClient.defaults.timeout).toBe(20_000);
  });
});

describe("real HTTP hang test", () => {
  it("rejects within requestTimeoutMs and error is classified transient and retryable", async () => {
    const server = http.createServer((_req, _res) => {
      // Intentionally never respond to simulate hung socket
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to get ephemeral port for local server");
    }
    const port = address.port;

    const axios = require("axios") as { create: (config?: Record<string, unknown>) => any };
    const client = axios.create();

    const requestTimeoutMs = 200;
    configureDgiiHttpClient(client, { requestTimeoutMs });

    const start = Date.now();
    let caughtError: any = null;

    try {
      await client.get(`http://127.0.0.1:${port}/hung-endpoint`);
    } catch (err) {
      caughtError = err;
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(2000);

    expect(caughtError).not.toBeNull();
    expect(caughtError.code).toBe("ECONNABORTED");
    expect(caughtError.message).toContain("timeout of 200ms exceeded");

    // Must be classified as transient transport error
    expect(isTransientTransportError(caughtError)).toBe(true);

    // Must stay retryable (never terminal)
    expect(isDgiiTerminalError(caughtError)).toBe(false);
  });
});

describe("resolveDgiiHttpTimeoutMsFromEnv", () => {
  it("returns default 25_000ms when unset or empty", () => {
    expect(resolveDgiiHttpTimeoutMsFromEnv({})).toBe(DEFAULT_DGII_HTTP_TIMEOUT_MS);
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "" })).toBe(25_000);
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "   " })).toBe(25_000);
  });

  it("returns parsed integer for valid positive strings", () => {
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "15000" })).toBe(15_000);
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: " 30000 " })).toBe(30_000);
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "1000" })).toBe(1_000);
  });

  it("returns default for invalid, non-positive, or floating point values", () => {
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "0" })).toBe(25_000);
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "-500" })).toBe(25_000);
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "abc" })).toBe(25_000);
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "12.34" })).toBe(25_000);
    expect(resolveDgiiHttpTimeoutMsFromEnv({ DGII_HTTP_TIMEOUT_MS: "NaN" })).toBe(25_000);
  });
});

describe("isTransientTransportError", () => {
  it("classifies all transport / timeout error codes and messages as true", () => {
    // Axios timeout
    expect(
      isTransientTransportError({
        code: "ECONNABORTED",
        message: "timeout of 25000ms exceeded",
      })
    ).toBe(true);

    // Message "timeout" alone or in phrase
    expect(isTransientTransportError({ message: "timeout of 10000ms exceeded" })).toBe(true);
    expect(isTransientTransportError({ message: "timeout" })).toBe(true);
    expect(isTransientTransportError({ message: "gateway timeout" })).toBe(true);

    // Explicit transient flag
    expect(isTransientTransportError({ transient: true })).toBe(true);

    // ETIMEDOUT
    expect(isTransientTransportError({ code: "ETIMEDOUT", message: "connect ETIMEDOUT" })).toBe(true);

    // ECONNRESET
    expect(isTransientTransportError({ code: "ECONNRESET", message: "read ECONNRESET" })).toBe(true);

    // ECONNREFUSED
    expect(
      isTransientTransportError({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:443" })
    ).toBe(true);

    // ENOTFOUND
    expect(
      isTransientTransportError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND fc.dgii.gov.do" })
    ).toBe(true);

    // EAI_AGAIN
    expect(
      isTransientTransportError({ code: "EAI_AGAIN", message: "getaddrinfo EAI_AGAIN fc.dgii.gov.do" })
    ).toBe(true);

    // ERR_NETWORK
    expect(isTransientTransportError({ code: "ERR_NETWORK", message: "Network Error" })).toBe(true);

    // Socket hang up
    expect(isTransientTransportError(new Error("socket hang up"))).toBe(true);

    // Job-timeout abort via JOB_TIMEOUT code and transient flag
    expect(
      isTransientTransportError(
        fiscalWorkerError(
          "JOB_TIMEOUT",
          "Fiscal job exceeded 120s and was aborted; it will be retried.",
          true,
          true
        )
      )
    ).toBe(true);

    // 5xx status codes
    expect(isTransientTransportError({ response: { status: 500, data: "Internal Server Error" } })).toBe(true);
    expect(isTransientTransportError({ response: { status: 502, data: "Bad Gateway" } })).toBe(true);
    expect(isTransientTransportError({ response: { status: 503, data: "Service Unavailable" } })).toBe(true);
    expect(isTransientTransportError({ response: { status: 504, data: "Gateway Timeout" } })).toBe(true);
    expect(isTransientTransportError({ statusCode: 500, message: "Error" })).toBe(true);
  });

  it("classifies DGII codigo 2 rejection as false", () => {
    expect(
      isTransientTransportError({
        response: { data: { codigo: 2, estado: "Rechazado" } },
      })
    ).toBe(false);

    expect(
      isTransientTransportError({
        codigo: 2,
        estado: "Rechazado",
        mensajes: [{ codigo: "000", valor: "Comprobante rechazado por DGII" }],
      })
    ).toBe(false);

    expect(isTransientTransportError({ message: "DGII [2] Rechazado" })).toBe(false);
  });

  it("classifies schema error as false", () => {
    expect(
      isTransientTransportError({
        response: {
          data: {
            estado: "Rechazado",
            mensajes: [{ mensaje: "El documento XML no es válido según el schema" }],
          },
        },
      })
    ).toBe(false);

    expect(
      isTransientTransportError({
        message: "Schema error: pattern constraint no es válido",
      })
    ).toBe(false);

    expect(isTransientTransportError({ message: "XML schema validation failed" })).toBe(false);
  });

  it("classifies a message containing 'exceeded' alone as false (not transient)", () => {
    expect(isTransientTransportError({ message: "exceeded" })).toBe(false);
    expect(isTransientTransportError({ message: "rate limit exceeded" })).toBe(false);
    expect(isTransientTransportError({ message: "execution time exceeded" })).toBe(false);
    expect(isTransientTransportError(new Error("query timeout exceeded"))).toBe(true);
    expect(isTransientTransportError(new Error("quota exceeded"))).toBe(false);
  });

  it("classifies DGII business statuses (e.g. En proceso) and 4xx client errors as false", () => {
    expect(isTransientTransportError({ codigo: 3, estado: "En proceso" })).toBe(false);
    expect(isTransientTransportError({ response: { status: 400, data: "Bad Request" } })).toBe(false);
    expect(isTransientTransportError({ response: { status: 422, data: "Unprocessable Entity" } })).toBe(false);
    expect(isTransientTransportError(null)).toBe(false);
    expect(isTransientTransportError(undefined)).toBe(false);
  });
});

describe("isDgiiTerminalError axios timeout retryable check", () => {
  it("proves an axios timeout error stays retryable (returns false)", () => {
    const axiosTimeoutError = {
      isAxiosError: true,
      code: "ECONNABORTED",
      message: "timeout of 25000ms exceeded",
    };
    expect(isDgiiTerminalError(axiosTimeoutError)).toBe(false);
  });
});

describe("nextAttempt scheduling", () => {
  const baseDate = new Date("2026-11-15T12:00:00.000Z");

  it("schedules transient failure attempts 1..3 with +10s, attempt 4 with existing exponential", () => {
    expect(calculateNextAttemptDelayMs(1, true)).toBe(10_000);
    expect(calculateNextAttemptDelayMs(2, true)).toBe(10_000);
    expect(calculateNextAttemptDelayMs(3, true)).toBe(10_000);
    expect(calculateNextAttemptDelayMs(4, true)).toBe(480_000); // 2^3 * 60_000 = 8m
  });

  it("keeps existing exponential backoff (1m, 2m, 4m, 8m...) for business retryable errors and caps at 1h", () => {
    expect(calculateNextAttemptDelayMs(1, false)).toBe(60_000);
    expect(calculateNextAttemptDelayMs(2, false)).toBe(120_000);
    expect(calculateNextAttemptDelayMs(3, false)).toBe(240_000);
    expect(calculateNextAttemptDelayMs(4, false)).toBe(480_000);
    expect(calculateNextAttemptDelayMs(10, false)).toBe(3_600_000);
    expect(calculateNextAttemptDelayMs(10, true)).toBe(3_600_000);
  });

  it("applies fast 10s retry end-to-end on transport failure in processJob", async () => {
    const snapshot = createMockSnapshot();
    const { repo, jobUpdates } = createMockRepository(snapshot);

    const worker = new FiscalWorker({
      repository: repo,
      custody: {
        getSigningMaterial: vi.fn(async () => ({
          ok: true as const,
          value: {
            certificateId: "cert-1",
            tenantId: "tenant-1",
            environment: "production" as const,
            p12Bytes: new Uint8Array([]),
            passphrase: "pass",
          },
        })),
      },
      signer: {
        signXml: vi.fn(async () => ({ signedXml: "<Signed />" })),
      },
      dgii: {
        submitSignedXml: vi.fn(async () => ({
          kind: "retryable_error" as const,
          message: "timeout of 25000ms exceeded",
          transient: true,
        })),
        pollStatus: vi.fn(),
        sendSummary: vi.fn(),
      },
      workerId: "worker-1",
      now: () => baseDate,
    });

    const result = await worker.processJob("job-1");
    expect(result.kind).toBe("failed");

    expect(jobUpdates).toContainEqual(
      expect.objectContaining({
        status: "retryable_error",
        attempts: 1,
        nextAttemptAt: "2026-11-15T12:00:10.000Z", // +10s fast retry!
      })
    );
  });

  it("applies standard 1m backoff end-to-end on DGII business retryable error in processJob", async () => {
    const snapshot = createMockSnapshot();
    const { repo, jobUpdates } = createMockRepository(snapshot);

    const worker = new FiscalWorker({
      repository: repo,
      custody: {
        getSigningMaterial: vi.fn(async () => ({
          ok: true as const,
          value: {
            certificateId: "cert-1",
            tenantId: "tenant-1",
            environment: "production" as const,
            p12Bytes: new Uint8Array([]),
            passphrase: "pass",
          },
        })),
      },
      signer: {
        signXml: vi.fn(async () => ({ signedXml: "<Signed />" })),
      },
      dgii: {
        submitSignedXml: vi.fn(async () => ({
          kind: "retryable_error" as const,
          message: "DGII [3] En proceso",
        })),
        pollStatus: vi.fn(),
        sendSummary: vi.fn(),
      },
      workerId: "worker-1",
      now: () => baseDate,
    });

    const result = await worker.processJob("job-1");
    expect(result.kind).toBe("failed");

    expect(jobUpdates).toContainEqual(
      expect.objectContaining({
        status: "retryable_error",
        attempts: 1,
        nextAttemptAt: "2026-11-15T12:01:00.000Z", // +60s standard exponential!
      })
    );
  });
});

describe("createFiscalWorkerRuntimeFromEnv configuration", () => {
  const serviceRoleJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url") +
    ".signature";

  const validEnv: NodeJS.ProcessEnv = {
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
    SUPABASE_URL: "https://demo-project.supabase.co",
    ECF_ENCRYPTION_KEY: "01234567890123456789012345678901",
    FISCAL_WORKER_DATABASE_URL: "postgresql://project_admin:secret@127.0.0.1:5432/cloudix",
    DGII_HTTP_TIMEOUT_MS: "18000",
    FISCAL_JOB_TIMEOUT_MS: "120000",
  };

  it("applies the configuration via seam and sets client timeout and agent", () => {
    const fakeClient: DgiiHttpClientLike = {
      defaults: {
        timeout: 0,
      },
    };
    const configureSpy = vi.fn(configureDgiiHttpClient);
    const mockPool = { query: vi.fn() } as any;

    const runtime = createFiscalWorkerRuntimeFromEnv(
      validEnv,
      undefined,
      {
        httpClient: fakeClient,
        configureClient: configureSpy,
        poolFactory: () => mockPool,
      }
    );

    expect(configureSpy).toHaveBeenCalledTimes(1);
    expect(configureSpy).toHaveBeenCalledWith(fakeClient, { requestTimeoutMs: 18_000 });
    expect(fakeClient.defaults.timeout).toBe(18_000);
    expect(fakeClient.defaults.httpsAgent).toBeInstanceOf(https.Agent);
    expect(runtime).toBeDefined();
  });

  it("warns via console.warn when requestTimeoutMs >= jobTimeoutMs / 3", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeClient: DgiiHttpClientLike = { defaults: {} };
    const mockPool = { query: vi.fn() } as any;

    const envWithHighHttpTimeout: NodeJS.ProcessEnv = {
      ...validEnv,
      DGII_HTTP_TIMEOUT_MS: "45000",
      FISCAL_JOB_TIMEOUT_MS: "120000", // 120000 / 3 = 40000 <= 45000 -> warning!
    };

    createFiscalWorkerRuntimeFromEnv(
      envWithHighHttpTimeout,
      undefined,
      {
        httpClient: fakeClient,
        poolFactory: () => mockPool,
      }
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("DGII HTTP timeout (45000ms) is >= job timeout / 3")
    );

    warnSpy.mockRestore();
  });

  it("does not warn when requestTimeoutMs < jobTimeoutMs / 3", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeClient: DgiiHttpClientLike = { defaults: {} };
    const mockPool = { query: vi.fn() } as any;

    const envWithSafeTimeout: NodeJS.ProcessEnv = {
      ...validEnv,
      DGII_HTTP_TIMEOUT_MS: "25000",
      FISCAL_JOB_TIMEOUT_MS: "120000", // 120000 / 3 = 40000 > 25000 -> safe
    };

    createFiscalWorkerRuntimeFromEnv(
      envWithSafeTimeout,
      undefined,
      {
        httpClient: fakeClient,
        poolFactory: () => mockPool,
      }
    );

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
