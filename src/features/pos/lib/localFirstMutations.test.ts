import { beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueLocalWriteMock, saveLocalMesaEstadoMock, deleteLocalComandaMock, saveLocalComandaMock } = vi.hoisted(() => ({
  enqueueLocalWriteMock: vi.fn(),
  saveLocalMesaEstadoMock: vi.fn().mockResolvedValue(undefined),
  deleteLocalComandaMock: vi.fn().mockResolvedValue(undefined),
  saveLocalComandaMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../shared/lib/localFirst", () => ({
  enqueueLocalWrite: enqueueLocalWriteMock,
}));

vi.mock("../../../shared/lib/ordersLocal", () => ({
  saveLocalMesaEstado: saveLocalMesaEstadoMock,
  deleteLocalComanda: deleteLocalComandaMock,
  saveLocalComanda: saveLocalComandaMock,
}));

import { closeKitchenComandasForMesaLocalFirst, writePosMutationLocalFirst } from "./localFirstMutations";

describe("localFirstMutations", () => {
  beforeEach(() => {
    enqueueLocalWriteMock.mockReset();
    saveLocalMesaEstadoMock.mockReset();
    deleteLocalComandaMock.mockReset();
    saveLocalComandaMock.mockReset();
  });

  it("routes mesas_estado writes through saveLocalMesaEstado without touching IndexedDB", async () => {
    saveLocalMesaEstadoMock.mockResolvedValue(undefined);

    await writePosMutationLocalFirst({
      tenantId: "tenant-1",
      tableName: "mesas_estado",
      rowId: "1",
      op: "upsert",
      payload: { id: 1, tenant_id: "tenant-1", estado: "ocupada" },
      authUserId: "auth-1",
      deviceId: "dev-1",
    });

    expect(saveLocalMesaEstadoMock).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        id: 1,
        tenant_id: "tenant-1",
        estado: "ocupada",
      })
    );
    expect(enqueueLocalWriteMock).not.toHaveBeenCalled();
  });

  it("closes open kitchen comandas by deleting them via deleteLocalComanda without touching IndexedDB", async () => {
    deleteLocalComandaMock.mockResolvedValue(undefined);

    await closeKitchenComandasForMesaLocalFirst({
      tenantId: "tenant-1",
      mesaNumero: 3,
      deviceId: "dev-1",
      authUserId: "auth-1",
      listOpenComandas: async () => [{ id: "c-1" }, { id: "c-2" }],
    });

    expect(deleteLocalComandaMock).toHaveBeenCalledTimes(2);
    expect(deleteLocalComandaMock).toHaveBeenNthCalledWith(1, "tenant-1", "c-1");
    expect(deleteLocalComandaMock).toHaveBeenNthCalledWith(2, "tenant-1", "c-2");
    expect(enqueueLocalWriteMock).not.toHaveBeenCalled();
  });
});
