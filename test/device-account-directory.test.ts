import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DeviceAccountDirectory } from "../electron/persistence/deviceAccountDirectory";
import { SAVED_ACCOUNTS_CREDENTIAL_CHANNEL, SAVED_ACCOUNTS_LIST_CHANNEL, SAVED_ACCOUNTS_SAVE_CHANNEL, registerSavedAccountIpc, type SavedAccountIpcMain } from "../electron/persistence/ipc";

describe("device account directory", () => {
  it("lists metadata without ciphertext and validates a persisted branch preference", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "cloudix-accounts-"));
    try {
      const directory = DeviceAccountDirectory.open(dataRoot);
      directory.saveAccount({ email: "Owner@example.com", passwordCiphertext: Buffer.from("ciphertext") });
      expect(directory.listAccounts()).toEqual([{ id: expect.any(String), email: "owner@example.com", hasPassword: true }]);
      expect(JSON.stringify(directory.listAccounts())).not.toContain("ciphertext");
      const account = directory.listAccounts()[0];
      expect(Buffer.from(directory.getPasswordCiphertext(account.id) ?? []).toString()).toBe("ciphertext");
      expect(directory.saveSessionPreference({ tenantId: "tenant-a", userId: "user-a", allowedBranchIds: ["branch-a"], defaultBranchId: "branch-forged" })).toEqual({ tenantId: "tenant-a", userId: "user-a", allowedBranchIds: ["branch-a"], defaultBranchId: "branch-a" });
      directory.close();
    } finally {
      try { rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* SQLite handles may linger on Windows. */ }
    }
  });
});

describe("saved account IPC boundary", () => {
  it("does not expose a password through the metadata list and only decrypts after an explicit selection", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const account = { id: "account-a", email: "owner@example.com", hasPassword: true };
    const ipcMain: SavedAccountIpcMain = {
      handle(channel, handler) { handlers.set(channel, handler); },
      removeHandler(channel) { handlers.delete(channel); },
    };
    registerSavedAccountIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getDirectory: () => ({
        listAccounts: () => [account],
        saveAccount: () => account,
        getPasswordCiphertext: (id) => id === account.id ? Buffer.from("encrypted") : null,
        deleteAccount: () => undefined,
        saveSessionPreference: (value) => value,
        readSessionPreference: () => null,
      }),
      isEncryptionAvailable: () => true,
      encrypt: (password) => Buffer.from(password),
      decrypt: () => "selected-password",
    });
    await expect(handlers.get(SAVED_ACCOUNTS_LIST_CHANNEL)?.({ senderId: 7 })).resolves.toEqual({ ok: true, data: { encryptionAvailable: true, accounts: [account] } });
    await expect(handlers.get(SAVED_ACCOUNTS_CREDENTIAL_CHANNEL)?.({ senderId: 7 }, { id: account.id })).resolves.toEqual({ ok: true, data: { password: "selected-password" } });
    await expect(handlers.get(SAVED_ACCOUNTS_CREDENTIAL_CHANNEL)?.({ senderId: 9 }, { id: account.id })).rejects.toThrow("Untrusted IPC sender");
  });

  it("stores no credential and never decrypts when safeStorage is unavailable", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const saved: Array<{ email: string; passwordCiphertext: Uint8Array | null }> = [];
    let decryptCalls = 0;
    const ipcMain: SavedAccountIpcMain = {
      handle(channel, handler) { handlers.set(channel, handler); },
      removeHandler(channel) { handlers.delete(channel); },
    };
    registerSavedAccountIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getDirectory: () => ({
        listAccounts: () => [],
        saveAccount: (value) => { saved.push(value); return { id: "account-a", email: value.email, hasPassword: false }; },
        getPasswordCiphertext: () => Buffer.from("encrypted"),
        deleteAccount: () => undefined,
        saveSessionPreference: (value) => value,
        readSessionPreference: () => null,
      }),
      isEncryptionAvailable: () => false,
      encrypt: () => { throw new Error("encrypt must not run"); },
      decrypt: () => { decryptCalls += 1; return "secret"; },
    });

    await expect(handlers.get(SAVED_ACCOUNTS_SAVE_CHANNEL)?.({ senderId: 7 }, { email: "owner@example.com", password: "secret" }))
      .resolves.toEqual({ ok: true, data: { id: "account-a", email: "owner@example.com", hasPassword: false } });
    await expect(handlers.get(SAVED_ACCOUNTS_CREDENTIAL_CHANNEL)?.({ senderId: 7 }, { id: "account-a" }))
      .resolves.toEqual({ ok: true, data: null });
    expect(saved).toEqual([{ email: "owner@example.com", passwordCiphertext: null }]);
    expect(decryptCalls).toBe(0);
  });
});
