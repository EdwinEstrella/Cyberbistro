import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.hoisted(() => vi.fn());
const desktopRef = vi.hoisted(() => ({ value: true }));

vi.mock("./supabase", () => {
  const chain = {
    update: (payload: Record<string, unknown>) => { updateMock(payload); return chain; },
    eq: () => chain,
    select: () => Promise.resolve({ data: [{ id: "t1" }], error: null }),
  };
  return { supabase: { from: () => chain } };
});

vi.mock("./cloudAvailability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloudAvailability")>();
  return {
    ...actual,
    isDesktopRuntime: () => desktopRef.value,
    isCloudAvailableForDesktop: async () => true,
  };
});

import { enqueueLocalWrite } from "./localFirst";

const baseArgs = {
  tenantId: "t1",
  tableName: "tenants" as const,
  rowId: "t1",
  op: "update" as const,
  payload: { ncf_b01_secuencia_siguiente: 25, itbis_incluido_en_precio: true },
  deviceId: "dev-1",
};

describe("enqueueLocalWrite tenants write-through (desktop)", () => {
  const mergeTenantSettings = vi.fn();

  beforeEach(() => {
    updateMock.mockReset();
    mergeTenantSettings.mockReset();
    desktopRef.value = true;
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", { electronAPI: { mergeTenantSettings } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pushes the saved fields to local SQLite after the cloud update succeeds", async () => {
    mergeTenantSettings.mockResolvedValue({ ok: true, data: { merged: true } });
    await enqueueLocalWrite(baseArgs);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(mergeTenantSettings).toHaveBeenCalledWith("t1", baseArgs.payload);
  });

  it("does not turn a successful cloud save into an error when the bridge fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mergeTenantSettings.mockRejectedValue(new Error("ipc down"));
    await expect(enqueueLocalWrite(baseArgs)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores a missing bridge (older preload)", async () => {
    vi.stubGlobal("window", { electronAPI: {} });
    await expect(enqueueLocalWrite(baseArgs)).resolves.toBeUndefined();
  });

  it("skips the write-through for other tables", async () => {
    await enqueueLocalWrite({ ...baseArgs, tableName: "gastos" });
    expect(mergeTenantSettings).not.toHaveBeenCalled();
  });
});
