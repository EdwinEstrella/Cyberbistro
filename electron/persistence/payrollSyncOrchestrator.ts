import type { DatabaseSync } from "node:sqlite";
import { DurableSyncWorker, type ServerSyncClient } from "./syncWorker";
import { SQLitePayrollSyncStore } from "./payrollSyncStore";
import { PayrollSyncClient } from "./payrollSyncClient";

export class PayrollSyncOrchestrator {
  private worker: DurableSyncWorker | null = null;
  private store: SQLitePayrollSyncStore | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private stopRequested = false;
  private accessToken: string | null = null;
  private client: ServerSyncClient | null = null;
  private tenantId = "";
  public onPullApplied?: (tenantId: string) => void;

  public start(db: DatabaseSync, tenantId: string, clientOverride?: any) {
    this.stop();
    this.stopRequested = false;
    this.tenantId = tenantId;
    try {
      const store = new SQLitePayrollSyncStore(db, tenantId);
      const client = clientOverride || new PayrollSyncClient(undefined, this.accessToken);
      this.store = store;
      this.client = client;
      this.worker = new DurableSyncWorker(store, client, tenantId);
      
      this.intervalId = setInterval(() => this.triggerSync(), 30000);
      this.intervalId.unref(); // Don't block exit
    } catch (err) {
      // Missing config or error - fail closed
      console.error("[PayrollSyncOrchestrator] failed to start:", err);
      this.store = null;
      this.client = null;
      this.worker = null;
    }
  }

  public stop() {
    this.stopRequested = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.store?.releaseClaims();
    this.store?.deactivate();
    this.store = null;
    this.client = null;
    this.worker = null;
  }

  public setAccessToken(accessToken: string | null): void {
    this.accessToken = accessToken;
    const client = this.client as (ServerSyncClient & { setAccessToken?: (token: string | null) => void }) | null;
    client?.setAccessToken?.(accessToken);
  }

  public async triggerSync(): Promise<void> {
    if (!this.worker || this.isSyncing || this.stopRequested) return;

    this.isSyncing = true;
    const worker = this.worker;
    const tenantId = this.tenantId;
    try {
      // Push (local → cloud) and pull (cloud → local) run each turn. A failure in
      // one direction must not block the other, so they are isolated.
      try {
        await worker.push();
      } catch (err) {
        console.error("[PayrollSyncOrchestrator] push error:", err);
      }
      try {
        if (!this.stopRequested && this.worker === worker) {
          await worker.pull();
          if (!this.stopRequested && this.worker === worker) this.onPullApplied?.(tenantId);
        }
      } catch (err) {
        console.error("[PayrollSyncOrchestrator] pull error:", err);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  public isRunning(): boolean {
    return this.worker !== null;
  }
}
