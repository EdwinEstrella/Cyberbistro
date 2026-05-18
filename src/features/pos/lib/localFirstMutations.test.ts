import { beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueLocalWriteMock } = vi.hoisted(() => ({
  enqueueLocalWriteMock: vi.fn(),
}));

vi.mock("../../../shared/lib/localFirst", () => ({
  enqueueLocalWrite: enqueueLocalWriteMock,
}));

import { closeKitchenComandasForMesaLocalFirst, writePosMutationLocalFirst } from "./localFirstMutations";

describe("localFirstMutations", () => {
  beforeEach(() => {
    enqueueLocalWriteMock.mockReset();
  });

  it("routes POS writes through enqueueLocalWrite boundary", async () => {
    enqueueLocalWriteMock.mockResolvedValue(undefined);

    await writePosMutationLocalFirst({
      tenantId: "tenant-1",
      tableName: "mesas_estado",
      rowId: "1",
      op: "upsert",
      payload: { id: 1, tenant_id: "tenant-1", estado: "ocupada" },
      authUserId: "auth-1",
      deviceId: "dev-1",
    });

    expect(enqueueLocalWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "mesas_estado",
        op: "upsert",
        rowId: "1",
      })
    );
  });

  it("closes open kitchen comandas by enqueueing local-first updates", async () => {
    enqueueLocalWriteMock.mockResolvedValue(undefined);

    await closeKitchenComandasForMesaLocalFirst({
      tenantId: "tenant-1",
      mesaNumero: 3,
      deviceId: "dev-1",
      authUserId: "auth-1",
      listOpenComandas: async () => [{ id: "c-1" }, { id: "c-2" }],
    });

    expect(enqueueLocalWriteMock).toHaveBeenCalledTimes(2);
    expect(enqueueLocalWriteMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tableName: "comandas", rowId: "c-1", op: "update" })
    );
    expect(enqueueLocalWriteMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tableName: "comandas", rowId: "c-2", op: "update" })
    );
  });
});
