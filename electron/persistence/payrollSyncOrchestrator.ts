import type { DatabaseSync } from "node:sqlite";
import { DurableSyncWorker } from "./syncWorker";
import { SQLitePayrollSyncStore } from "./payrollSyncStore";
import { PayrollSyncClient } from "./payrollSyncClient";

export class PayrollSyncOrchestrator {
  private worker: DurableSyncWorker | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private stopRequested = false;

  public start(db: DatabaseSync, tenantId: string, clientOverride?: any) {
    this.stop();
    this.stopRequested = false;
    try {
      const store = new SQLitePayrollSyncStore(db, tenantId);
      const client = clientOverride || new PayrollSyncClient();
      this.worker = new DurableSyncWorker(store, client, tenantId);
      
      this.intervalId = setInterval(() => this.triggerSync(), 30000);
      this.intervalId.unref(); // Don't block exit
    } catch (err) {
      // Missing config or error - fail closed
      console.error("[PayrollSyncOrchestrator] failed to start:", err);
      this.worker = null;
    }
  }

  public stop() {
    this.stopRequested = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.worker = null;
  }

  public async triggerSync(): Promise<void> {
    if (!this.worker || this.isSyncing || this.stopRequested) return;
    
    this.isSyncing = true;
    try {
      await this.worker.push();
      // Note: Actual production remote transmission still needs the remote migration applied
    } catch (err) {
      // Fail closed, log error
      console.error("[PayrollSyncOrchestrator] sync error:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  public isRunning(): boolean {
    return this.worker !== null;
  }
}