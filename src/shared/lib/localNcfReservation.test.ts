import { describe, expect, it, vi } from "vitest";
import { resolveNcfForNewInvoiceDesktop, type DesktopNcfDeps } from "./localNcfReservation";

const cloudResult = (seq: number) => ({
  ncf: `E32${String(seq).padStart(10, "0")}`,
  ncf_tipo: "Consumo e-CF",
  tipoCodigo: "E32",
  usedSequence: seq,
  sequenceReservedAtomically: true,
  reservationSource: "remote_rpc" as const,
});

function deps(over: Partial<DesktopNcfDeps> = {}): DesktopNcfDeps {
  return {
    cloudReserve: vi.fn(async () => cloudResult(100)),
    ...over,
  };
}

describe("resolveNcfForNewInvoiceDesktop", () => {
  it("does not reserve from local SQLite for B02 when the cloud is unavailable", async () => {
    const d = deps();
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(res).toBeNull();
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("does not call cloud RPC or record locally when requesting B02", async () => {
    const d = deps();
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(res).toBeNull();
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("does not fall back to local B reservation when preferredType is null", async () => {
    const d = deps({
      cloudReserve: vi.fn(async () => {
        throw Object.assign(new Error("Failed to fetch"), { cloudUnavailable: true });
      }),
    });
    await expect(resolveNcfForNewInvoiceDesktop("t1", null, d)).resolves.toBeNull();
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("does not hide business errors from the RPC for e-CF", async () => {
    const d = deps({
      cloudReserve: vi.fn(async () => {
        throw new Error("insufficient_privilege");
      }),
    });
    await expect(resolveNcfForNewInvoiceDesktop("t1", "E32", d)).rejects.toThrow("insufficient_privilege");
  });

  it("keeps e-CF cloud-only", async () => {
    const d = deps();
    await resolveNcfForNewInvoiceDesktop("t1", "E32", d);
    expect(d.cloudReserve).toHaveBeenCalledWith("t1", "E32");
  });

  it("does not call cloudix_reserve_ncf or catchUpCloud for B02", async () => {
    const d = deps();
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(res).toBeNull();
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("does not issue B02 when local counter is ahead", async () => {
    const d = deps();
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(res).toBeNull();
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("returns null for B02 without the desktop bridge", async () => {
    const d = deps();
    await expect(resolveNcfForNewInvoiceDesktop("t1", "B02", d)).resolves.toBeNull();
  });

  it("does not reserve B02 across sales", async () => {
    const d = deps();
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(res).toBeNull();
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("does not reserve B02 when cloudReserve throws", async () => {
    const d = deps({
      cloudReserve: vi.fn(async () => {
        throw Object.assign(new Error("timeout"), { cloudUnavailable: true });
      }),
    });
    await expect(resolveNcfForNewInvoiceDesktop("t1", "B02", d)).resolves.toBeNull();
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("does not reserve B01 when preferredType is null", async () => {
    const d = deps();
    const res = await resolveNcfForNewInvoiceDesktop("t1", null, d);
    expect(res).toBeNull();
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });
});
