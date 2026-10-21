import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadModule() {
  vi.resetModules();
  return import("./cloudAvailability");
}

function stubRuntime(opts: { desktop: boolean; online: boolean; fetchImpl: typeof fetch }) {
  vi.stubGlobal("window", {
    ...(opts.desktop ? { electronAPI: {} } : {}),
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("navigator", { onLine: opts.online });
  vi.stubGlobal("fetch", opts.fetchImpl);
}

describe("canAttemptCloudRead", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false on desktop when the cloud probe fails (HTTP 530) even though navigator is online", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 530 })) as unknown as typeof fetch;
    stubRuntime({ desktop: true, online: true, fetchImpl });
    const { canAttemptCloudRead } = await loadModule();

    expect(await canAttemptCloudRead()).toBe(false);
  });

  it("returns false on desktop when the probe cannot reach the backend", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    stubRuntime({ desktop: true, online: true, fetchImpl });
    const { canAttemptCloudRead } = await loadModule();

    expect(await canAttemptCloudRead()).toBe(false);
  });

  it("reuses the open circuit without probing again", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 530 })) as unknown as typeof fetch;
    stubRuntime({ desktop: true, online: true, fetchImpl });
    const { canAttemptCloudRead } = await loadModule();

    await canAttemptCloudRead();
    const callsAfterFirst = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(await canAttemptCloudRead()).toBe(false);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });

  it("returns true on desktop when the cloud probe succeeds", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 })) as unknown as typeof fetch;
    stubRuntime({ desktop: true, online: true, fetchImpl });
    const { canAttemptCloudRead } = await loadModule();

    expect(await canAttemptCloudRead()).toBe(true);
  });

  it("returns false whenever the browser reports offline, without probing", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    stubRuntime({ desktop: true, online: false, fetchImpl });
    const { canAttemptCloudRead } = await loadModule();

    expect(await canAttemptCloudRead()).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps web behavior equal to navigator.onLine (no probe)", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    stubRuntime({ desktop: false, online: true, fetchImpl });
    const { canAttemptCloudRead } = await loadModule();

    expect(await canAttemptCloudRead()).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
