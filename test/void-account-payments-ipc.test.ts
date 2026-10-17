import { describe, expect, it, vi } from "vitest";
import { registerPayablesRepositoryIpc, registerReceivablesRepositoryIpc, PAYABLES_REPOSITORY_EXECUTE_CHANNEL, RECEIVABLES_REPOSITORY_EXECUTE_CHANNEL } from "../electron/persistence/ipc";

type Handler = (event: { senderId: number }, payload?: unknown) => unknown;

function fakeIpcMain() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    ipcMain: {
      handle: (channel: string, handler: Handler) => void handlers.set(channel, handler),
      removeHandler: (channel: string) => void handlers.delete(channel),
    },
  };
}

describe("void payment IPC commands", () => {
  it.each([
    ["payables.payment.void", PAYABLES_REPOSITORY_EXECUTE_CHANNEL, registerPayablesRepositoryIpc],
    ["receivables.payment.void", RECEIVABLES_REPOSITORY_EXECUTE_CHANNEL, registerReceivablesRepositoryIpc],
  ] as const)("accepts %s with a payment id and rejects malformed payloads", async (type, channel, register) => {
    const { ipcMain, handlers } = fakeIpcMain();
    const execute = vi.fn(() => ({ commitId: "c", localStatus: "committed", syncStatus: "pending" }));
    (register as (input: unknown) => void)({ ipcMain, isTrustedSender: () => true, getRepository: () => ({ execute }) });
    const handler = handlers.get(channel)!;

    await expect(handler({ senderId: 1 }, { type, paymentId: "pay-1", injected: true })).resolves.toMatchObject({ ok: true });
    expect(execute).toHaveBeenCalledWith({ type, paymentId: "pay-1" });

    await expect(handler({ senderId: 1 }, { type })).rejects.toThrow(/Invalid/);
    await expect(handler({ senderId: 1 }, { type, paymentId: "  " })).rejects.toThrow(/Invalid/);
    await expect(handler({ senderId: 1 }, { type, paymentId: 5 })).rejects.toThrow(/Invalid/);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
