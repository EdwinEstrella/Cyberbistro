import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executePayrollCommandLocally,
  isPayrollLocalStorageAvailable,
} from "./payrollUiAdapter";

afterEach(() => vi.unstubAllGlobals());

describe("payroll UI adapter", () => {
  it("detects the narrow payroll command exposed by the Electron preload", () => {
    vi.stubGlobal("window", { electronAPI: { executePayrollCommand: vi.fn() } });

    expect(isPayrollLocalStorageAvailable()).toBe(true);
  });

  it("reports unavailable local payroll storage in web without a renderer-side fallback", async () => {
    vi.stubGlobal("window", { electronAPI: {} });

    expect(isPayrollLocalStorageAvailable()).toBe(false);
    await expect(executePayrollCommandLocally({
      type: "payroll.getEmployees",
      tenantId: "tenant-1",
      sucursalId: "branch-1",
    })).rejects.toThrow("Payroll local storage is unavailable");
  });

  it("propagates durable SQLite command failures to the caller", async () => {
    vi.stubGlobal("window", {
      electronAPI: {
        executePayrollCommand: vi.fn().mockRejectedValue(new Error("SQLite disk is full")),
      },
    });

    await expect(executePayrollCommandLocally({
      type: "payroll.createPayment",
      tenantId: "tenant-1",
      sucursalId: "branch-1",
      payload: {
        employeeId: "employee-1",
        period: "2026-08",
        frequency: "monthly",
        paymentAmountCents: 1000,
        receiptSnapshot: "{}",
        adjustments: [],
      },
    })).rejects.toThrow("SQLite disk is full");
  });
});
