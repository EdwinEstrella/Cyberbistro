import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueLocalWritesAtomically: vi.fn(),
  enqueueThermalPrint: vi.fn(),
}));

vi.mock("./localFirst", () => ({ enqueueLocalWritesAtomically: mocks.enqueueLocalWritesAtomically }));
vi.mock("./thermalPrint", () => ({ enqueueThermalPrint: mocks.enqueueThermalPrint }));

import { commitCheckout } from "./checkoutCommit";

describe("commitCheckout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not hand a receipt to printing until every checkout write is durable", async () => {
    let commit!: () => void;
    mocks.enqueueLocalWritesAtomically.mockReturnValue(new Promise<void>((resolve) => { commit = resolve; }));
    const completion = commitCheckout({
      writes: [{ tenantId: "tenant-1", tableName: "facturas", rowId: "invoice-1", op: "insert", deviceId: "device-1" }],
      prints: [{ id: "invoice-1", label: "Factura #1", print: vi.fn() }],
    });

    expect(mocks.enqueueThermalPrint).not.toHaveBeenCalled();
    commit();
    await completion;
    expect(mocks.enqueueThermalPrint).toHaveBeenCalledWith(expect.objectContaining({ id: "invoice-1" }));
  });

  it("returns after queue handoff without awaiting receipt printing", async () => {
    mocks.enqueueLocalWritesAtomically.mockResolvedValue(undefined);
    mocks.enqueueThermalPrint.mockReturnValue(true);
    const print = vi.fn(() => new Promise<never>(() => undefined));

    await expect(commitCheckout({ writes: [], prints: [{ id: "invoice-1", label: "Factura #1", print }] })).resolves.toBeUndefined();
    expect(mocks.enqueueThermalPrint).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();
  });
});
