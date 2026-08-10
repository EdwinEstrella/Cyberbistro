import { describe, expect, it } from "vitest";
import {
  TENANT_STORE_IMPORT_CHANNEL,
  TENANT_STORE_STATUS_CHANNEL,
  registerTenantStoreIpc,
  type TenantStoreIpcMain,
} from "../electron/persistence/ipc";

type Handler = (event: { senderId: number }, payload?: unknown) => unknown;

function createIpcHarness() {
  const handlers = new Map<string, Handler>();
  const ipcMain: TenantStoreIpcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
  };
  return { handlers, ipcMain };
}

describe("tenant store IPC boundary", () => {
  it("rejects a forged sender before returning the active tenant store status", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    registerTenantStoreIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getStatus: () => ({ tenantId: "tenant-a", isOpen: true }),
    });

    const handler = handlers.get(TENANT_STORE_STATUS_CHANNEL);
    await expect(handler?.({ senderId: 99 })).rejects.toThrow("Untrusted IPC sender");
  });

  it("exposes only a payload-free status command, not renderer-selected tenant, path, SQL, or table commands", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    registerTenantStoreIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getStatus: () => ({ tenantId: "tenant-a", isOpen: true }),
    });

    expect([...handlers.keys()]).toEqual([TENANT_STORE_STATUS_CHANNEL]);
    await expect(handlers.get(TENANT_STORE_STATUS_CHANNEL)?.({ senderId: 7 }, {
      tenantId: "tenant-b",
      path: "C:\\forged.sqlite",
      sql: "SELECT * FROM tenant_b",
      table: "tenant_b",
    })).resolves.toEqual({ ok: true, data: { isOpen: true } });
  });

  it("permits bounded legacy import data only for the main-process active tenant", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    const importLegacySnapshot = async (payload: unknown) => ({ received: payload });
    registerTenantStoreIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getStatus: () => ({ tenantId: "tenant-a", isOpen: true }),
      getActiveTenantId: () => "tenant-a",
      importLegacySnapshot,
    });

    await expect(handlers.get(TENANT_STORE_IMPORT_CHANNEL)?.({ senderId: 7 }, {
      manifest: { tenantId: "tenant-b" }, chunks: [],
    })).rejects.toThrow("tenant mismatch");
    await expect(handlers.get(TENANT_STORE_IMPORT_CHANNEL)?.({ senderId: 7 }, {
      manifest: { tenantId: "tenant-a" }, chunks: [],
    })).resolves.toEqual({ ok: true, data: { received: { manifest: { tenantId: "tenant-a" }, chunks: [] } } });
  });
});
