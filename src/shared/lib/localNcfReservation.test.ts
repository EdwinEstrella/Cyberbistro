import { describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({ supabase: {} as Record<string, unknown> }));
vi.mock("./supabase", () => supabaseMock);

import { catchUpCloudNcfSequence, resolveNcfForNewInvoiceDesktop, type DesktopNcfDeps } from "./localNcfReservation";
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
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("uses the cloud path unchanged without the desktop bridge", async () => {
    const d = deps({ isCloudUnavailable: async () => true });
    await expect(resolveNcfForNewInvoiceDesktop("t1", "B02", d)).resolves.toMatchObject({ reservationSource: "remote_rpc" });
  });

  it("keeps using the local sequence across several sales while catch-up is denied", async () => {
    const fake = statefulBridge({ B02: { local: 105, cloud: 100 } });
    let cloudNext = 100;
    const d = deps({ bridge: fake.bridge, catchUpCloud: vi.fn(async () => false), cloudReserve: vi.fn(async () => cloudResult(cloudNext++)) });
    const used: number[] = [];
    for (let i = 0; i < 3; i++) used.push((await resolveNcfForNewInvoiceDesktop("t1", "B02", d))!.usedSequence);
    expect(used).toEqual([105, 106, 107]);
    expect(d.cloudReserve).not.toHaveBeenCalled();
  });

  it("uses the local sequence when the RPC committed but timed out, without recording the lost number", async () => {
    const fake = statefulBridge({ B02: { local: 100, cloud: 100 } });
    const d = deps({ bridge: fake.bridge, cloudReserve: vi.fn(async () => { throw Object.assign(new Error("timeout"), { cloudUnavailable: true }); }) });
    await expect(resolveNcfForNewInvoiceDesktop("t1", "B02", d)).resolves.toMatchObject({ usedSequence: 100, reservationSource: "local_sqlite" });
    expect(fake.calls.filter((c) => c.action === "record")).toEqual([]);
  });

  it("checks the lag for the type the RPC actually used", async () => {
    // Local default resolves to B02 (in sync) but the cloud default is B01, which lags offline B01 issuance.
    const fake = statefulBridge({ B02: { local: 50, cloud: 50 }, B01: { local: 20, cloud: 20 } }, "B02");
    const d = deps({ bridge: fake.bridge, cloudReserve: vi.fn(async () => ({ ...cloudResult(10), ncf: "B0100000010", tipoCodigo: "B01" })) });
    const res = await resolveNcfForNewInvoiceDesktop("t1", null, d);
    expect(res).toMatchObject({ tipoCodigo: "B01", usedSequence: 20, reservationSource: "local_sqlite" });
  });
});

function statefulBridge(state: Record<string, { local: number; cloud: number }>, defaultType = "B02") {
  const calls: NcfLocalSequenceRequest[] = [];
  const bridge = vi.fn(async (request: NcfLocalSequenceRequest): Promise<NcfLocalSequenceResponse> => {
    calls.push(request);
    const type = (request.action === "record" ? request.tipoCodigo : request.preferredType) || defaultType;
    const s = state[type];
    if (request.action === "peek") {
      return { ok: true, data: { tipoCodigo: type as never, nextSequence: Math.max(s.local, s.cloud), localNextSequence: s.local, cloudNextSequence: s.cloud } };
    }
    if (request.action === "reserve") {
      const sequence = Math.max(s.local, s.cloud);
      s.local = sequence + 1;
      return { ok: true, data: { tipoCodigo: type as never, sequence } };
    }
    s.local = Math.max(s.local, request.sequence + 1);
    if (request.source === "cloud") s.cloud = Math.max(s.cloud, request.sequence + 1);
    return { ok: true, data: null };
  });
  return { bridge, calls };
}

describe("catchUpCloudNcfSequence", () => {
  function mockSupabase(rpcResult: { data?: unknown; error: { code?: string; message?: string } | null }, updatedRows: unknown[] = [{ id: "t1" }]) {
    const update = vi.fn(() => ({ eq: () => ({ or: () => ({ select: async () => ({ data: updatedRows, error: null }) }) }) }));
    const rpc = vi.fn(async () => rpcResult);
    supabaseMock.supabase = { rpc, from: vi.fn(() => ({ update })) };
    return { rpc, update };
  }

  it("advances the counter through the forward-only RPC", async () => {
    const { rpc, update } = mockSupabase({ data: 105, error: null });
    await expect(catchUpCloudNcfSequence("t1", "B02", 105)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("cloudix_advance_ncf_sequence", { p_tenant_id: "t1", p_ncf_tipo: "B02", p_next: 105 });
    expect(update).not.toHaveBeenCalled();
  });

  it("falls back to the conditional UPDATE while the RPC is not deployed", async () => {
    const { update } = mockSupabase({ error: { code: "PGRST202", message: "Could not find the function" } });
    await expect(catchUpCloudNcfSequence("t1", "B02", 105)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ ncf_b02_secuencia_siguiente: 105 }));
  });

  it("reports failure on other RPC errors without touching the table", async () => {
    const { update } = mockSupabase({ error: { code: "42501", message: "insufficient_privilege" } });
    await expect(catchUpCloudNcfSequence("t1", "B02", 105)).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
