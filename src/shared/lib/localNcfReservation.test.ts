import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));

import { resolveNcfForNewInvoiceDesktop, type DesktopNcfDeps } from "./localNcfReservation";
import type { NcfLocalSequenceRequest, NcfLocalSequenceResponse } from "../../../electron/persistence/ncfLocalSequence";

type Peek = { tipoCodigo: string; nextSequence: number; localNextSequence: number; cloudNextSequence: number };

function makeBridge(opts: { peek?: Peek | null; next?: number } = {}) {
  let next = opts.next ?? 50;
  const calls: NcfLocalSequenceRequest[] = [];
  const bridge = vi.fn(async (request: NcfLocalSequenceRequest): Promise<NcfLocalSequenceResponse> => {
    calls.push(request);
    if (request.action === "reserve") return { ok: true, data: { tipoCodigo: "B02", sequence: next++ } };
    if (request.action === "peek") {
      return opts.peek ? { ok: true, data: opts.peek as never } : { ok: false, code: "no_local_tenant", message: "x" };
    }
    return { ok: true, data: null };
  });
  return { bridge, calls };
}

const cloudResult = (seq: number) => ({
  ncf: `B02${String(seq).padStart(8, "0")}`,
  ncf_tipo: "Consumo",
  tipoCodigo: "B02",
  usedSequence: seq,
  sequenceReservedAtomically: true,
  reservationSource: "remote_rpc" as const,
});

function deps(over: Partial<DesktopNcfDeps>): DesktopNcfDeps {
  return {
    bridge: undefined,
    isCloudUnavailable: async () => false,
    cloudReserve: vi.fn(async () => cloudResult(100)),
    catchUpCloud: vi.fn(async () => true),
    ...over,
  };
}

describe("resolveNcfForNewInvoiceDesktop", () => {
  it("reserves from local SQLite when the cloud is unavailable", async () => {
    const { bridge } = makeBridge({ next: 77 });
    const d = deps({ bridge, isCloudUnavailable: async () => true });
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(res).toMatchObject({ ncf: "B0200000077", tipoCodigo: "B02", usedSequence: 77, sequenceReservedAtomically: true, reservationSource: "local_sqlite" });
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("uses the cloud RPC when reachable and records the number locally", async () => {
    const { bridge, calls } = makeBridge({ peek: { tipoCodigo: "B02", nextSequence: 100, localNextSequence: 90, cloudNextSequence: 100 } });
    const d = deps({ bridge });
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(res?.reservationSource).toBe("remote_rpc");
    expect(d.catchUpCloud).not.toHaveBeenCalled();
    expect(calls).toContainEqual({ action: "record", tenantId: "t1", tipoCodigo: "B02", sequence: 100, source: "cloud" });
  });

  it("falls back to local when the RPC fails on connectivity", async () => {
    const { bridge } = makeBridge({ next: 61 });
    const d = deps({ bridge, cloudReserve: vi.fn(async () => { throw Object.assign(new Error("Failed to fetch"), { cloudUnavailable: true }); }) });
    await expect(resolveNcfForNewInvoiceDesktop("t1", null, d)).resolves.toMatchObject({ usedSequence: 61, reservationSource: "local_sqlite" });
  });

  it("does not hide business errors from the RPC", async () => {
    const { bridge } = makeBridge();
    const d = deps({ bridge, cloudReserve: vi.fn(async () => { throw new Error("insufficient_privilege"); }) });
    await expect(resolveNcfForNewInvoiceDesktop("t1", null, d)).rejects.toThrow("insufficient_privilege");
  });

  it("keeps e-CF cloud-only", async () => {
    const { bridge } = makeBridge();
    const d = deps({ bridge, isCloudUnavailable: async () => true });
    await resolveNcfForNewInvoiceDesktop("t1", "E32", d);
    expect(d.cloudReserve).toHaveBeenCalledWith("t1", "E32");
    expect(bridge).not.toHaveBeenCalled();
  });

  it("catches the cloud counter up before reserving after offline sales", async () => {
    const { bridge, calls } = makeBridge({ peek: { tipoCodigo: "B02", nextSequence: 105, localNextSequence: 105, cloudNextSequence: 100 } });
    const d = deps({ bridge, cloudReserve: vi.fn(async () => cloudResult(105)) });
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(d.catchUpCloud).toHaveBeenCalledWith("t1", "B02", 105);
    expect(calls).toContainEqual({ action: "record", tenantId: "t1", tipoCodigo: "B02", sequence: 104, source: "cloud" });
    expect(res?.usedSequence).toBe(105);
  });

  it("never reuses a cloud number that a lagging counter hands out", async () => {
    const { bridge } = makeBridge({ peek: { tipoCodigo: "B02", nextSequence: 105, localNextSequence: 105, cloudNextSequence: 100 }, next: 105 });
    const d = deps({ bridge, catchUpCloud: vi.fn(async () => false), cloudReserve: vi.fn(async () => cloudResult(100)) });
    const res = await resolveNcfForNewInvoiceDesktop("t1", "B02", d);
    expect(res).toMatchObject({ usedSequence: 105, reservationSource: "local_sqlite" });
  });

  it("uses the cloud path unchanged without the desktop bridge", async () => {
    const d = deps({ isCloudUnavailable: async () => true });
    await expect(resolveNcfForNewInvoiceDesktop("t1", "B02", d)).resolves.toMatchObject({ reservationSource: "remote_rpc" });
  });
});
