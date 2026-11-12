import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeKitchenEnabled, loadTenantKitchenSettings } from "./tenantKitchenSettings";

const mocks = vi.hoisted(() => ({
  isDesktopCloudUnavailable: vi.fn(),
  recordCloudFailure: vi.fn(),
  recordCloudSuccess: vi.fn(),
  readLocalMirror: vi.fn(),
  supabaseSelect: vi.fn(),
  supabaseEq: vi.fn(),
  supabaseMaybeSingle: vi.fn(),
}));

vi.mock("./cloudAvailability", () => ({
  isDesktopCloudUnavailable: mocks.isDesktopCloudUnavailable,
  isCloudAvailabilityFailure: vi.fn(() => true),
  recordCloudFailure: mocks.recordCloudFailure,
  recordCloudSuccess: mocks.recordCloudSuccess,
}));

vi.mock("./localFirst", () => ({
  readLocalMirror: mocks.readLocalMirror,
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mocks.supabaseSelect.mockReturnValue({
        eq: mocks.supabaseEq.mockReturnValue({
          maybeSingle: mocks.supabaseMaybeSingle,
        }),
      }),
    })),
  },
}));

describe("normalizeKitchenEnabled", () => {
  it("returns false only for boolean false", () => {
    expect(normalizeKitchenEnabled(false)).toBe(false);
  });

  it("returns true for true, undefined, null, and non-boolean truthy values", () => {
    expect(normalizeKitchenEnabled(true)).toBe(true);
    expect(normalizeKitchenEnabled(undefined)).toBe(true);
    expect(normalizeKitchenEnabled(null)).toBe(true);
    expect(normalizeKitchenEnabled("true")).toBe(true);
    expect(normalizeKitchenEnabled(0)).toBe(true);
  });
});

describe("loadTenantKitchenSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when tenantId is null or undefined", async () => {
    await expect(loadTenantKitchenSettings(null)).resolves.toBe(true);
    await expect(loadTenantKitchenSettings(undefined)).resolves.toBe(true);
  });

  it("loads kitchen_enabled from cloud when available", async () => {
    mocks.isDesktopCloudUnavailable.mockResolvedValue(false);
    mocks.supabaseMaybeSingle.mockResolvedValue({
      data: { kitchen_enabled: false },
      error: null,
    });

    const result = await loadTenantKitchenSettings("tenant-1");
    expect(result).toBe(false);
    expect(mocks.recordCloudSuccess).toHaveBeenCalled();
  });

  it("falls back to local mirror when cloud fails", async () => {
    mocks.isDesktopCloudUnavailable.mockResolvedValue(false);
    mocks.supabaseMaybeSingle.mockResolvedValue({
      data: null,
      error: new Error("Network error"),
    });
    mocks.readLocalMirror.mockResolvedValue([
      { id: "tenant-1", kitchen_enabled: false },
    ]);

    const result = await loadTenantKitchenSettings("tenant-1");
    expect(result).toBe(false);
    expect(mocks.recordCloudFailure).toHaveBeenCalled();
  });

  it("falls back to local mirror when desktop cloud is unavailable", async () => {
    mocks.isDesktopCloudUnavailable.mockResolvedValue(true);
    mocks.readLocalMirror.mockResolvedValue([
      { id: "tenant-1", kitchen_enabled: true },
    ]);

    const result = await loadTenantKitchenSettings("tenant-1");
    expect(result).toBe(true);
    expect(mocks.supabaseMaybeSingle).not.toHaveBeenCalled();
  });

  it("defaults to true if local mirror read throws or tenant not found", async () => {
    mocks.isDesktopCloudUnavailable.mockResolvedValue(true);
    mocks.readLocalMirror.mockRejectedValue(new Error("Disk error"));

    const result = await loadTenantKitchenSettings("tenant-1");
    expect(result).toBe(true);
  });
});
