import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { InsforgeStorageCertificateCustody } from "./certificateCustody";
import { RealDgiiClient, RealXmlSigner } from "./dgiiAdapters";
import { FiscalWorker } from "./fiscalWorker";
import { PostgresFiscalWorkerRepository, createProjectAdminPgPoolFromEnv } from "./postgresFiscalWorkerRepository";
import type { FiscalWorkerRepository } from "./types";

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
  const isProduction = env.NODE_ENV === "production";

  const insforgeKey = env.INSFORGE_SERVICE_ROLE_KEY?.trim();
  if (!insforgeKey && isProduction) {
    throw new Error("Missing required production environment variable: INSFORGE_SERVICE_ROLE_KEY");
  }

  const encryptionKey = env.ECF_ENCRYPTION_KEY?.trim();
  if (!encryptionKey && isProduction) {
    throw new Error("Missing required production environment variable: ECF_ENCRYPTION_KEY");
  } else if (isProduction && encryptionKey === "cyberbistro-default-dev-key-32chars") {
    throw new Error("Refusing to use insecure or default encryption key in production");
  }

  const pool = createProjectAdminPgPoolFromEnv(env);
  const repository = new PostgresFiscalWorkerRepository({ db: pool });
  const workerId = env.FISCAL_WORKER_ID?.trim() || `fiscal-worker-${randomUUID()}`;
  const insforgeUrl = env.VITE_INSFORGE_BASE_URL || env.INSFORGE_BASE_URL || "";
  const finalInsforgeKey = insforgeKey || env.VITE_INSFORGE_ANON_KEY || "";

  const worker = new FiscalWorker({
    repository,
    custody: new InsforgeStorageCertificateCustody(insforgeUrl, finalInsforgeKey, pool),
    signer: new RealXmlSigner(),
    dgii: new RealDgiiClient(),
    workerId,
  });
  return new FiscalWorkerRuntime({ repository, worker });
}
