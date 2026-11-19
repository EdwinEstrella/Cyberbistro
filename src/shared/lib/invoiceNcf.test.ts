import { describe, expect, it, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("./supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: vi.fn(),
  },
}));

import { resolveNcfForNewInvoice } from "./invoiceNcf";

describe("resolveNcfForNewInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null and does not call cloudix_reserve_ncf when requesting B01", async () => {
    const result = await resolveNcfForNewInvoice("tenant-1", "B01");
    expect(result).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns null and does not call cloudix_reserve_ncf when requesting B02", async () => {
    const result = await resolveNcfForNewInvoice("tenant-1", "B02");
    expect(result).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns null when preferredType is null or undefined", async () => {
    expect(await resolveNcfForNewInvoice("tenant-1", null)).toBeNull();
    expect(await resolveNcfForNewInvoice("tenant-1", undefined)).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls cloudix_reserve_ecf when requesting E31", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ seq_reserved: 5, ncf_tipo_codigo: "E31" }],
      error: null,
    });

    const result = await resolveNcfForNewInvoice("tenant-1", "E31");
    expect(rpcMock).toHaveBeenCalledWith("cloudix_reserve_ecf", {
      p_tenant_id: "tenant-1",
      p_ncf_tipo: "E31",
    });
    expect(result).toEqual({
      ncf: "E310000000005",
      ncf_tipo: "E31 - Factura de credito fiscal electronica",
      tipoCodigo: "E31",
      usedSequence: 5,
      sequenceReservedAtomically: true,
      reservationSource: "remote_rpc",
    });
  });

  it("calls cloudix_reserve_ecf when requesting E32", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ seq_reserved: 42, ncf_tipo_codigo: "E32" }],
      error: null,
    });

    const result = await resolveNcfForNewInvoice("tenant-1", "E32");
    expect(rpcMock).toHaveBeenCalledWith("cloudix_reserve_ecf", {
      p_tenant_id: "tenant-1",
      p_ncf_tipo: "E32",
    });
    expect(result).toEqual({
      ncf: "E320000000042",
      ncf_tipo: "E32 - Factura de consumo electronica",
      tipoCodigo: "E32",
      usedSequence: 42,
      sequenceReservedAtomically: true,
      reservationSource: "remote_rpc",
    });
  });

  it("throws when cloudix_reserve_ecf returns an RPC error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "range exhausted" },
    });

    await expect(resolveNcfForNewInvoice("tenant-1", "E32")).rejects.toThrow("range exhausted");
  });

  it("throws when cloudix_reserve_ecf returns no reserved sequence", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    await expect(resolveNcfForNewInvoice("tenant-1", "E32")).rejects.toThrow(
      "No se pudo reservar el e-NCF. Intentá de nuevo."
    );
  });
});
