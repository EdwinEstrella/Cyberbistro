import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { InsforgeStorageCertificateCustody } from "./certificateCustody";
import { RealDgiiClient, RealXmlSigner } from "./dgiiAdapters";
import { FiscalWorker } from "./fiscalWorker";
import { PostgresFiscalWorkerRepository, createProjectAdminPgPoolFromEnv } from "./postgresFiscalWorkerRepository";
import type { FiscalWorkerRepository } from "./types";

export type InsforgeWorkerCredentialClass = "service_role" | "project_admin" | "anon" | "unknown";

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split(".");
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function classifyInsforgeWorkerCredential(key: string): InsforgeWorkerCredentialClass {
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
  const key = env.INSFORGE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("INSFORGE_SERVICE_ROLE_KEY is required for the fiscal worker.");
  }

  const credentialClass = classifyInsforgeWorkerCredential(key);
  if (credentialClass === "anon") {
    throw new Error("Fiscal worker refused anon InsForge credential; use service-role or project-admin credentials.");
  }
  return key;
}

export interface FiscalWorkerRuntimeOptions {
  repository: FiscalWorkerRepository;
  worker: FiscalWorker;
  pollIntervalMs?: number;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export class FiscalWorkerRuntime {
  private stopped = false;

  constructor(private readonly options: FiscalWorkerRuntimeOptions) {}

  stop(): void {
    this.stopped = true;
  }

  async runForever(): Promise<void> {
    const pollIntervalMs = this.options.pollIntervalMs ?? 5_000;
    while (!this.stopped) {
      try {
        const now = (this.options.now ?? (() => new Date()))().toISOString();
        const jobId = await this.options.repository.findNextRunnableJob?.(now);
        if (jobId) {
          await this.options.worker.processJob(jobId);
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

export function createFiscalWorkerRuntimeFromEnv(env: NodeJS.ProcessEnv = process.env): FiscalWorkerRuntime {
  const insforgeKey = resolveFiscalWorkerCredentialFromEnv(env);

  const encryptionKey = env.ECF_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    throw new Error("Missing required environment variable: ECF_ENCRYPTION_KEY");
  } else if (encryptionKey === "cyberbistro-default-dev-key-32chars") {
    throw new Error("Refusing to use insecure or default encryption key");
  }

  const pool = createProjectAdminPgPoolFromEnv(env);
  const repository = new PostgresFiscalWorkerRepository({ db: pool });
  const workerId = env.FISCAL_WORKER_ID?.trim() || `fiscal-worker-${randomUUID()}`;
  const insforgeUrl = env.VITE_INSFORGE_BASE_URL || env.INSFORGE_BASE_URL || "";
  const worker = new FiscalWorker({
    repository,
    custody: new InsforgeStorageCertificateCustody(insforgeUrl, insforgeKey, pool),
    signer: new RealXmlSigner(),
    dgii: new RealDgiiClient(),
    workerId,
  });
  return new FiscalWorkerRuntime({ repository, worker });
}
