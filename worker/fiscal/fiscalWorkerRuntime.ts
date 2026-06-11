import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { FailClosedCertificateCustody } from "./certificateCustody";
import { FailClosedDgiiClient, FailClosedXmlSigner } from "./dgiiAdapters";
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
  const pool = createProjectAdminPgPoolFromEnv(env);
  const repository = new PostgresFiscalWorkerRepository({ db: pool });
  const workerId = env.FISCAL_WORKER_ID?.trim() || `fiscal-worker-${randomUUID()}`;
  const worker = new FiscalWorker({
    repository,
    custody: new FailClosedCertificateCustody(),
    signer: new FailClosedXmlSigner(),
    dgii: new FailClosedDgiiClient(),
    workerId,
  });
  return new FiscalWorkerRuntime({ repository, worker });
}
