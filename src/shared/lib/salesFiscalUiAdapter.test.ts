import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalFiscalSale, getFiscalPendingPresentation } from "./salesFiscalUiAdapter";

describe("C3d renderer fiscal adapter", () => {
  it("uses only the named local bridge and keeps every fiscal mode pending", async () => {
    const execute = vi.fn(async () => ({ ok: true as const, data: { commitId: "c3d-1", localStatus: "committed" as const, syncStatus: "pending" as const } }));
    vi.stubGlobal("window", { electronAPI: { executeSalesFiscalCommand: execute } });

    await expect(createLocalFiscalSale({ type: "sales.fiscal.create", invoiceId: "invoice-1", fiscalIntentId: "intent-1", fiscalMode: "dgii_ecf", documentType: "31", total: 25 })).resolves.toMatchObject({ localStatus: "committed", syncStatus: "pending" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ fiscalMode: "dgii_ecf" }));
    expect(["internal_receipt", "ncf_legacy", "dgii_ecf"].map(getFiscalPendingPresentation)).toEqual([
      { label: "Recibo local pendiente de sincronización", status: "pending_sync" },
      { label: "NCF local pendiente de sincronización", status: "pending_sync" },
      { label: "e-CF local pendiente de sincronización", status: "pending_sync" },
    ]);
  });

  it("fails closed when the named fiscal bridge is unavailable", async () => {
    vi.stubGlobal("window", { electronAPI: {} });
    await expect(createLocalFiscalSale({ type: "sales.fiscal.create", invoiceId: "invoice-2", fiscalIntentId: "intent-2", fiscalMode: "internal_receipt", documentType: "01", total: 10 })).rejects.toThrow("Sales fiscal local storage is unavailable");
  });
});

afterEach(() => vi.unstubAllGlobals());
