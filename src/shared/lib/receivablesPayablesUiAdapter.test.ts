import { afterEach, describe, expect, it, vi } from "vitest";
import { executeReceivablesCommandLocally } from "./receivablesUiAdapter";
import { executePayablesCommandLocally } from "./payablesUiAdapter";

describe("Receivables & Payables UI Adapters", () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it("executeReceivablesCommandLocally calls electronAPI.executeReceivablesCommand", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      ok: true,
      data: { commitId: "cxc-commit-1", localStatus: "committed", syncStatus: "pending" },
    });
    (globalThis as any).window = { electronAPI: { executeReceivablesCommand: mockExecute } };

    const result = await executeReceivablesCommandLocally({
      type: "receivables.create",
      id: "cxc-1",
      customerId: "cust-1",
      totalAmount: 500,
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.commitId).toBe("cxc-commit-1");
  });

  it("executeReceivablesCommandLocally throws when outside Electron", async () => {
    (globalThis as any).window = {};
    await expect(
      executeReceivablesCommandLocally({
        type: "receivables.create",
        id: "cxc-1",
        customerId: "cust-1",
        totalAmount: 500,
      })
    ).rejects.toThrow("Receivables local storage is unavailable");
  });

  it("executePayablesCommandLocally calls electronAPI.executePayablesCommand", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      ok: true,
      data: { commitId: "cxp-commit-1", localStatus: "committed", syncStatus: "pending" },
    });
    (globalThis as any).window = { electronAPI: { executePayablesCommand: mockExecute } };

    const result = await executePayablesCommandLocally({
      type: "payables.create",
      id: "cxp-1",
      supplierId: "prov-1",
      totalAmount: 1200,
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.commitId).toBe("cxp-commit-1");
  });

  it("executePayablesCommandLocally throws when outside Electron", async () => {
    (globalThis as any).window = {};
    await expect(
      executePayablesCommandLocally({
        type: "payables.create",
        id: "cxp-1",
        supplierId: "prov-1",
        totalAmount: 1200,
      })
    ).rejects.toThrow("Payables local storage is unavailable");
  });
});
