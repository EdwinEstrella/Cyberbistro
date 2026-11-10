import { randomUUID } from "node:crypto";
import { SupabaseStorageCertificateCustody } from "./certificateCustody";
import { RealDgiiClient, RealXmlSigner } from "./dgiiAdapters";
import { DEFAULT_FISCAL_JOB_TIMEOUT_MS, FiscalWorker } from "./fiscalWorker";
import { withTimeout } from "./withTimeout";
import { PostgresFiscalWorkerRepository, createProjectAdminPgPoolFromEnv } from "./postgresFiscalWorkerRepository";
import type { FiscalWorkerRepository } from "./types";

// Uses global setTimeout instead of node:timers/promises so it honors vitest fake timers.
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SupabaseWorkerCredentialClass = "service_role" | "project_admin" | "anon" | "unknown";

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split(".");
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function classifySupabaseWorkerCredential(key: string): SupabaseWorkerCredentialClass {
  const trimmed = key.trim();
  if (!trimmed) return "unknown";

  const payload = decodeJwtPayload(trimmed);
  const role = typeof payload?.role === "string" ? payload.role : "";
  if (role === "anon") return "anon";
  if (role === "service_role") return "service_role";
  if (role === "project_admin") return "project_admin";

  if (/anon/i.test(trimmed)) return "anon";
  if (/service[_-]?role|project[_-]?admin/i.test(trimmed)) return "project_admin";
  return "unknown";
}

export function resolveFiscalWorkerCredentialFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the fiscal worker.");
  }

  const credentialClass = classifySupabaseWorkerCredential(key);
  if (credentialClass === "anon") {
    throw new Error("Fiscal worker refused anon Supabase credential; use service-role or project-admin credentials.");
  }
  return key;
}

export function resolveFiscalWorkerSupabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim() || "";
  if (!/^https:\/\/[^\s/]+/i.test(url)) {
    throw new Error("SUPABASE_URL is required for fiscal certificate storage.");
  }
  return url;
}

export interface FiscalWorkerRuntimeOptions {
  repository: FiscalWorkerRepository;
  worker: FiscalWorker;
  pollIntervalMs?: number;
  now?: () => Date;
  onError?: (error: unknown) => void;
  jobTimeoutMs?: number;
}

export class FiscalWorkerRuntime {
  private stopped = false;

  constructor(private readonly options: FiscalWorkerRuntimeOptions) {}

  get jobTimeoutMs(): number {
    return this.options.jobTimeoutMs ?? this.options.worker.jobTimeoutMs ?? DEFAULT_FISCAL_JOB_TIMEOUT_MS;
  }

  stop(): void {
    this.stopped = true;
  }

  async runForever(): Promise<void> {
    const pollIntervalMs = this.options.pollIntervalMs ?? 5_000;
    const outerTimeoutMs = this.jobTimeoutMs + 30_000;
    while (!this.stopped) {
      try {
        const now = (this.options.now ?? (() => new Date()))().toISOString();
        const jobId = await this.options.repository.findNextRunnableJob?.(now);
        if (jobId) {
          await withTimeout(
            this.options.worker.processJob(jobId),
            outerTimeoutMs,
            () =>
              new Error(
                `Fiscal job ${jobId} exceeded outer runtime timeout (${Math.round(outerTimeoutMs / 1000)}s); continuing loop.`
              )
          );
        } else {
          await delay(pollIntervalMs);
        }
      } catch (error) {
        this.options.onError?.(error);
        await delay(pollIntervalMs);
      }
    }
  }
}

export function resolveFiscalJobTimeoutMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.FISCAL_JOB_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_FISCAL_JOB_TIMEOUT_MS;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_FISCAL_JOB_TIMEOUT_MS;
}

export function createFiscalWorkerRuntimeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<FiscalWorkerRuntimeOptions>
): FiscalWorkerRuntime {
  const supabaseKey = resolveFiscalWorkerCredentialFromEnv(env);

  const encryptionKey = env.ECF_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    throw new Error("Missing required environment variable: ECF_ENCRYPTION_KEY");
  } else if (encryptionKey === "cyberbistro-default-dev-key-32chars") {
    throw new Error("Refusing to use insecure or default encryption key");
  }

  const pool = createProjectAdminPgPoolFromEnv(env);
  const repository = new PostgresFiscalWorkerRepository({ db: pool });
  const workerId = env.FISCAL_WORKER_ID?.trim() || `fiscal-worker-${randomUUID()}`;
  const supabaseUrl = resolveFiscalWorkerSupabaseUrlFromEnv(env);
  const jobTimeoutMs = resolveFiscalJobTimeoutMsFromEnv(env);
  const worker = new FiscalWorker({
    repository,
    custody: new SupabaseStorageCertificateCustody(supabaseUrl, supabaseKey, pool),
    signer: new RealXmlSigner(),
    dgii: new RealDgiiClient(),
    workerId,
    jobTimeoutMs,
  });
  return new FiscalWorkerRuntime({ repository, worker, jobTimeoutMs, ...overrides });
}
