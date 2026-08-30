import { describe, expect, it } from "vitest";
import {
  TENANT_STORE_IMPORT_CHANNEL,
  TENANT_STORE_STATUS_CHANNEL,
  PAYROLL_SYNC_ACCESS_TOKEN_CHANNEL,
  registerPayrollSyncAccessTokenIpc,
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

describe("payroll sync auth IPC boundary", () => {
  it("accepts only an unexpired JWT from the trusted renderer and keeps it out of the IPC response", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    const received: Array<string | null> = [];
    registerPayrollSyncAccessTokenIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      setAccessToken: (token) => received.push(token),
    });
    const token = createJwt({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 60 });
    const handler = handlers.get(PAYROLL_SYNC_ACCESS_TOKEN_CHANNEL);

    await expect(handler?.({ senderId: 99 }, { accessToken: token })).rejects.toThrow("Untrusted IPC sender");
    await expect(handler?.({ senderId: 7 }, { accessToken: "not-a-jwt" })).rejects.toThrow("Invalid payroll sync access token");
    await expect(handler?.({ senderId: 7 }, { accessToken: token })).resolves.toEqual({ ok: true });
    await expect(handler?.({ senderId: 7 }, null)).resolves.toEqual({ ok: true });
    expect(received).toEqual([token, null]);
  });
});

function createJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}
