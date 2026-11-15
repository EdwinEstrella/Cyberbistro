import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-id"),
  dismiss: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("./supabase", () => ({ supabase: {} }));

import { clearFiscalPrintQueue, FISCAL_GATE_WAITING_MESSAGE, gateFiscalPrint } from "./fiscalPrintGate";

describe("fiscalPrintGate waiting notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFiscalPrintQueue();
  });

  it("shows an animated loading toast while waiting for DGII and dismisses it once accepted", async () => {
    const printReceipt = vi.fn(async () => ({ ok: true }));
    const checkLocalMirror = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: "accepted", dgii_security_code: "SEC-1" });

    const result = await gateFiscalPrint(
      {
        tenantId: "t1",
        factura: { id: "inv-1", ncf: "E320000000001", total: 413 },
        numeroFactura: 1,
      },
      {
        checkLocalMirror,
        checkCloud: vi.fn(async () => null),
        triggerSync: vi.fn(async () => undefined),
        printReceipt,
        isOnline: () => true,
        sleep: vi.fn(async () => undefined),
        pollDelays: [1],
      }
    );

    expect(FISCAL_GATE_WAITING_MESSAGE).toBe("Esperando aprobación DGII…");
    expect(toastMock.loading).toHaveBeenCalledWith(FISCAL_GATE_WAITING_MESSAGE, { duration: Infinity });
    expect(toastMock.dismiss).toHaveBeenCalledWith("toast-id");
    expect(printReceipt).toHaveBeenCalledTimes(1);
    expect(result.printed).toBe(true);
  });
});
