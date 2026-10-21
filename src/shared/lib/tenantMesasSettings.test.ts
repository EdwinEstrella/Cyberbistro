import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  readLocalMirror: vi.fn(),
  shouldReadLocalFirst: vi.fn(),
  canAttemptCloudRead: vi.fn(),
}));

vi.mock("./supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("./localFirst", () => ({
  enqueueLocalWrite: vi.fn(),
  getDeviceId: vi.fn(),
  readLocalMirror: mocks.readLocalMirror,
  shouldReadLocalFirst: mocks.shouldReadLocalFirst,
}));
vi.mock("./cloudAvailability", () => ({ canAttemptCloudRead: mocks.canAttemptCloudRead }));

import { loadCantidadMesas } from "./tenantMesasSettings";

function cloudReturns(cantidad: number | null) {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: cantidad == null ? null : { cantidad_mesas: cantidad }, error: null }),
      }),
    }),
  });
}

describe("loadCantidadMesas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shouldReadLocalFirst.mockResolvedValue(true);
  });

  it("uses the local tenant row without touching the cloud", async () => {
    mocks.readLocalMirror.mockResolvedValue([{ id: "t1", cantidad_mesas: 12 }]);
    expect(await loadCantidadMesas("t1")).toBe(12);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("never calls the cloud when it is unavailable and the local row lacks the value", async () => {
    mocks.readLocalMirror.mockResolvedValue([]);
    mocks.canAttemptCloudRead.mockResolvedValue(false);
    expect(await loadCantidadMesas("t1")).toBe(20);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("falls back to the cloud when local has no value and the cloud is reachable", async () => {
    mocks.readLocalMirror.mockResolvedValue([]);
    mocks.canAttemptCloudRead.mockResolvedValue(true);
    cloudReturns(8);
    expect(await loadCantidadMesas("t1")).toBe(8);
    expect(mocks.from).toHaveBeenCalledWith("tenants");
  });
});
