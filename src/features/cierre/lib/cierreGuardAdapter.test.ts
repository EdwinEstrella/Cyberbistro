import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCierreCloseGuard, CLOSE_GUARD_TIMEOUT_MS } from "./cierreGuardAdapter";
import { MSG_CYCLE_AUTO_CLOSED, MSG_OPEN_PUSH_CONFLICT } from "./cierreCloseGuard";

describe("cierreGuardAdapter", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete (globalThis as any).window;
    }
  });

  it("proceeds immediately when not in SQLite environment (no executeOrdersCommand)", async () => {
    delete (globalThis as any).window;
    const res = await runCierreCloseGuard("cycle-123");
    expect(res).toEqual({ action: "proceed" });
  });

  it("proceeds when reconcile times out (>5000ms) with no push conflict", async () => {
    const hangingReconcile = new Promise<never>(() => {});
    globalThis.window = {
      electronAPI: {
        executeOrdersCommand: vi.fn(),
        reconcileGhostCycles: vi.fn(() => hangingReconcile),
        cycleSyncStatus: vi.fn(async () => ({ openPushConflict: false })),
      },
    } as any;

    const guardPromise = runCierreCloseGuard("cycle-123");
    await vi.advanceTimersByTimeAsync(CLOSE_GUARD_TIMEOUT_MS);
    const decision = await guardPromise;

    expect(decision).toEqual({ action: "proceed" });
  });

  it("proceeds when sync status times out (>5000ms) with normal reconcile", async () => {
    const hangingSyncStatus = new Promise<never>(() => {});
    globalThis.window = {
      electronAPI: {
        executeOrdersCommand: vi.fn(),
        reconcileGhostCycles: vi.fn(async () => ({ ok: true, closed: [] })),
        cycleSyncStatus: vi.fn(() => hangingSyncStatus),
      },
    } as any;

    const guardPromise = runCierreCloseGuard("cycle-123");
    await vi.advanceTimersByTimeAsync(CLOSE_GUARD_TIMEOUT_MS);
    const decision = await guardPromise;

    expect(decision).toEqual({ action: "proceed" });
  });

  it("proceeds when both reconcile and sync status time out (>5000ms)", async () => {
    const hangingPromise = new Promise<never>(() => {});
    globalThis.window = {
      electronAPI: {
        executeOrdersCommand: vi.fn(),
        reconcileGhostCycles: vi.fn(() => hangingPromise),
        cycleSyncStatus: vi.fn(() => hangingPromise),
      },
    } as any;

    const guardPromise = runCierreCloseGuard("cycle-123");
    await vi.advanceTimersByTimeAsync(CLOSE_GUARD_TIMEOUT_MS * 2);
    const decision = await guardPromise;

    expect(decision).toEqual({ action: "proceed" });
  });

  it("stops and reloads when reconcile auto-closes the current cycle within timeout", async () => {
    globalThis.window = {
      electronAPI: {
        executeOrdersCommand: vi.fn(),
        reconcileGhostCycles: vi.fn(async () => ({
          ok: true,
          closed: [
            {
              id: "cycle-123",
              cycleNumber: 1,
              closedAt: "2026-09-19T10:00:00Z",
              supersededByCycleNumber: 2,
              supersededBy: "later_cycle" as const,
            },
          ],
        })),
        cycleSyncStatus: vi.fn(async () => ({ openPushConflict: false })),
      },
    } as any;

    const decision = await runCierreCloseGuard("cycle-123");
    expect(decision).toEqual({
      action: "stop",
      message: MSG_CYCLE_AUTO_CLOSED,
      reload: true,
    });
  });

  it("stops with conflict message when sync status has conflict within timeout", async () => {
    globalThis.window = {
      electronAPI: {
        executeOrdersCommand: vi.fn(),
        reconcileGhostCycles: vi.fn(async () => ({ ok: true, closed: [] })),
        cycleSyncStatus: vi.fn(async () => ({ openPushConflict: true })),
      },
    } as any;

    const decision = await runCierreCloseGuard("cycle-123");
    expect(decision).toEqual({
      action: "stop",
      message: MSG_OPEN_PUSH_CONFLICT,
      reload: false,
    });
  });

  it("proceeds when both calls succeed quickly and indicate no conflict or closure", async () => {
    globalThis.window = {
      electronAPI: {
        executeOrdersCommand: vi.fn(),
        reconcileGhostCycles: vi.fn(async () => ({ ok: true, closed: [] })),
        cycleSyncStatus: vi.fn(async () => ({ openPushConflict: false })),
      },
    } as any;

    const decision = await runCierreCloseGuard("cycle-123");
    expect(decision).toEqual({ action: "proceed" });
  });
});
