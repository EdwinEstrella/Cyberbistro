import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "./supabase";
import { isDesktopCloudUnavailable } from "./cloudAvailability";
import { getNextFacturaNumber, getNextFacturaNumbers } from "./invoiceNumber";

vi.mock("./supabase", () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock("./cloudAvailability", () => ({
  isDesktopCloudUnavailable: vi.fn(),
}));

describe("invoice number reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {});
    vi.mocked(isDesktopCloudUnavailable).mockResolvedValue(false);
  });

  it("reserves a contiguous tenant-scoped range through the cloud RPC", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ first_number: 5756, last_number: 5758 }],
      error: null,
    } as never);

    await expect(getNextFacturaNumbers("tenant-1", 3)).resolves.toEqual([5756, 5757, 5758]);
    expect(supabase.rpc).toHaveBeenCalledWith("cloudix_reserve_invoice_numbers", {
      p_tenant_id: "tenant-1",
      p_count: 3,
    });
  });

  it("never falls back to invoice 1 when cloud allocation fails", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: "RPC unavailable" } } as never);
    await expect(getNextFacturaNumber("tenant-1")).rejects.toThrow("RPC unavailable");
  });

  it("uses the transactional desktop allocator while offline", async () => {
    const reserveInvoiceNumbers = vi.fn().mockResolvedValue({ ok: true, data: [5756, 5757] });
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("window", { electronAPI: { reserveInvoiceNumbers } });
    vi.mocked(isDesktopCloudUnavailable).mockResolvedValue(true);

    await expect(getNextFacturaNumbers("tenant-1", 2)).resolves.toEqual([5756, 5757]);
    expect(reserveInvoiceNumbers).toHaveBeenCalledWith({ tenantId: "tenant-1", count: 2 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
