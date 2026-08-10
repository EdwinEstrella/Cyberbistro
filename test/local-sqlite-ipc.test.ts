import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESKTOP_REPOSITORY_EXECUTE_CHANNEL, registerDesktopRepositoryIpc, type DesktopRepositoryIpcMain } from "../electron/persistence/ipc";
import { DesktopRepository } from "../src/shared/lib/desktopRepository";
import { TenantStore } from "../electron/persistence/tenantStore";

type Handler = (event: { senderId: number }, payload?: unknown) => unknown;

function createIpcHarness() {
  const handlers = new Map<string, Handler>();
  const ipcMain: DesktopRepositoryIpcMain = {
    handle(channel, handler) { handlers.set(channel, handler); },
    removeHandler(channel) { handlers.delete(channel); },
  };
  return { handlers, ipcMain };
}

describe("desktop repository IPC boundary", () => {
  it("rejects forged sender, tenant, table, and SQL payloads without executing a local write", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    const executed: unknown[] = [];
    registerDesktopRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({ execute: (command: unknown) => { executed.push(command); return { commitId: "never", localStatus: "committed", syncStatus: "pending" }; } }),
    });

    const handler = handlers.get(DESKTOP_REPOSITORY_EXECUTE_CHANNEL);
    await expect(handler?.({ senderId: 99 }, { type: "foundation.record.write", id: "record-1", value: "safe" })).rejects.toThrow("Untrusted IPC sender");
    for (const forgedPayload of [
      { tenantId: "tenant-b", type: "foundation.record.write", id: "record-1", value: "forged" },
      { table: "foundation_records", type: "foundation.record.write", id: "record-1", value: "forged" },
      { sql: "INSERT INTO foundation_records VALUES ('pwned')", type: "foundation.record.write", id: "record-1", value: "forged" },
      { type: "arbitrary.sql", sql: "DROP TABLE foundation_records" },
    ]) {
      await expect(handler?.({ senderId: 7 }, forgedPayload)).rejects.toThrow("Invalid desktop repository command");
    }
    expect(executed).toEqual([]);
  });
});

describe("DesktopRepository", () => {
  it("pins tenant and branch in the main process and atomically commits a domain record plus pending outbox entry", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-desktop-repository-"));
    try {
      const store = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
      const repository = new DesktopRepository({ store, branchId: "branch-main", createCommitId: () => "commit-1" });

      expect(repository.execute({ type: "foundation.record.write", id: "record-1", value: "safe" })).toEqual({
        commitId: "commit-1", localStatus: "committed", syncStatus: "pending",
      });
      expect(store.readFoundationRecord("record-1")).toEqual({ id: "record-1", value: "safe" });
      expect(store.readLocalOutbox()).toEqual([{
        id: "commit-1", tenantId: "tenant-a", branchId: "branch-main", tableName: "foundation_records", rowId: "record-1", status: "pending",
      }]);
      store.close();
    } finally {
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows may retain SQLite handles until process exit. */ }
    }
  });

  it("rolls back both the domain record and outbox entry when the outbox insert fails", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-desktop-repository-"));
    try {
      const store = TenantStore.open({ dataRoot, tenantId: "tenant-a" });
      const repository = new DesktopRepository({ store, branchId: "branch-main", createCommitId: () => "duplicate-commit" });
      repository.execute({ type: "foundation.record.write", id: "existing", value: "safe" });

      expect(() => repository.execute({ type: "foundation.record.write", id: "rolled-back", value: "unsafe" })).toThrow();
      expect(store.readFoundationRecord("rolled-back")).toBeNull();
      expect(store.readLocalOutbox()).toHaveLength(1);
      store.close();
    } finally {
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows may retain SQLite handles until process exit. */ }
    }
  });
});
