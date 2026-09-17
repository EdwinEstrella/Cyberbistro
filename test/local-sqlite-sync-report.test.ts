import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";

function withStore(run: (store: TenantStore) => void): void {
  const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-sync-report-"));
  try {
    const store = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
    run(store);
    store.close();
  } finally {
    try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows retains SQLite handles briefly. */ }
  }
}

describe("sync diagnostic report — download (pull) visibility", () => {
  it("counts cierres_operativos and exposes a pullState section", () => {
    withStore((store) => {
      const report = store.getSyncDiagnosticReport();

      // cierres is now SQLite-owned, so the monitor must count it.
      expect(report.tableCounts.some((t) => t.table === "cierres_operativos")).toBe(true);

      // Download visibility is present even on a fresh DB (empty, not missing).
      expect(report.pullState).toEqual({ global: null, perTable: [] });
    });
  });
});
