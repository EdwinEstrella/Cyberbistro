import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCatalogCommandLocally } from "./catalogUiAdapter";

afterEach(() => vi.unstubAllGlobals());

describe("catalog UI adapter", () => {
  it("forwards a typed catalog command through the narrow preload API", async () => {
    const executeCatalogCommand = vi.fn().mockResolvedValue({ ok: true, data: { commitId: "commit-1", localStatus: "committed", syncStatus: "pending" } });
    vi.stubGlobal("window", { electronAPI: { executeCatalogCommand } });

    await expect(saveCatalogCommandLocally({ type: "catalog.customer.upsert", id: "customer-1", name: "Alice" })).resolves.toEqual({ commitId: "commit-1", localStatus: "committed", syncStatus: "pending" });
    expect(executeCatalogCommand).toHaveBeenCalledWith({ type: "catalog.customer.upsert", id: "customer-1", name: "Alice" });
  });

  it("does not provide a renderer-side storage fallback when the main-process adapter is absent", async () => {
    vi.stubGlobal("window", { electronAPI: {} });

    await expect(saveCatalogCommandLocally({ type: "catalog.customer.upsert", id: "customer-1", name: "Alice" })).rejects.toThrow("Catalog local storage is unavailable");
  });
});
