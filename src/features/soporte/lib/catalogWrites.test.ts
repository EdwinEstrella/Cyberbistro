import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writePlatoUpsert, writePlatoDelete, writeCategoryUpsert, writeCategoryDelete } from "./catalogWrites";
import * as adapter from "../../../shared/lib/catalogUiAdapter";
import * as localFirst from "../../../shared/lib/localFirst";

describe("catalogWrites — desktop SQLite vs web IndexedDB", () => {
  beforeEach(() => {
    vi.spyOn(adapter, "saveCatalogCommandLocally").mockResolvedValue({ commitId: "c1", localStatus: "committed", syncStatus: "pending" });
    vi.spyOn(localFirst, "enqueueLocalWrite").mockResolvedValue({ id: "e1", status: "pending" } as any);
    vi.spyOn(localFirst, "writeLocalMirrorRow").mockResolvedValue();
    vi.spyOn(localFirst, "deleteLocalMirrorRow").mockResolvedValue();
    vi.spyOn(localFirst, "getDeviceId").mockResolvedValue("dev-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("desktop runtime (executeCatalogCommand present)", () => {
    beforeEach(() => {
      vi.stubGlobal("window", { electronAPI: { executeCatalogCommand: vi.fn() } });
    });

    it("routes plato upsert through saveCatalogCommandLocally", async () => {
      await writePlatoUpsert(
        {
          tenantId: "tenant-1",
          sucursalId: "branch-1",
          id: 10,
          nombre: "Pizza",
          precio: 500,
          categoria: "Pizzas",
          disponible: true,
          va_a_cocina: true,
        },
        true
      );

      expect(adapter.saveCatalogCommandLocally).toHaveBeenCalledWith({
        type: "catalog.product.upsert",
        id: "10",
        sucursalId: "branch-1",
        nombre: "Pizza",
        precio: 500,
        categoria: "Pizzas",
        disponible: true,
        va_a_cocina: true,
      });
      expect(localFirst.enqueueLocalWrite).not.toHaveBeenCalled();
      expect(localFirst.writeLocalMirrorRow).toHaveBeenCalledWith("tenant-1", "platos", expect.objectContaining({ id: 10 }));
    });

    it("routes plato delete through saveCatalogCommandLocally", async () => {
      await writePlatoDelete("tenant-1", 10);

      expect(adapter.saveCatalogCommandLocally).toHaveBeenCalledWith({ type: "catalog.product.delete", id: "10" });
      expect(localFirst.enqueueLocalWrite).not.toHaveBeenCalled();
      expect(localFirst.deleteLocalMirrorRow).toHaveBeenCalledWith("tenant-1", "platos", "10");
    });
  });

  describe("web runtime (no electronAPI)", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {});
    });

    it("routes plato upsert through enqueueLocalWrite without throwing", async () => {
      await writePlatoUpsert(
        {
          tenantId: "tenant-1",
          sucursalId: "branch-1",
          id: 10,
          nombre: "Pizza",
          precio: 500,
          categoria: "Pizzas",
          disponible: true,
          va_a_cocina: true,
        },
        true
      );

      expect(adapter.saveCatalogCommandLocally).not.toHaveBeenCalled();
      expect(localFirst.enqueueLocalWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "platos",
          rowId: "10",
          op: "insert",
        })
      );
      expect(localFirst.writeLocalMirrorRow).toHaveBeenCalledWith("tenant-1", "platos", expect.objectContaining({ id: 10 }));
    });

    it("routes plato delete through enqueueLocalWrite without throwing", async () => {
      await writePlatoDelete("tenant-1", 10);

      expect(adapter.saveCatalogCommandLocally).not.toHaveBeenCalled();
      expect(localFirst.enqueueLocalWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "platos",
          rowId: "10",
          op: "delete",
        })
      );
      expect(localFirst.deleteLocalMirrorRow).toHaveBeenCalledWith("tenant-1", "platos", "10");
    });

    it("routes category upsert and delete through enqueueLocalWrite", async () => {
      await writeCategoryUpsert(
        {
          tenantId: "tenant-1",
          sucursalId: "branch-1",
          id: "cat-1",
          nombre: "Bebidas",
          color: "#ff0000",
          sortOrder: 1,
        },
        true
      );
      expect(localFirst.enqueueLocalWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "menu_categories",
          rowId: "cat-1",
          op: "insert",
        })
      );

      await writeCategoryDelete("tenant-1", "cat-1");
      expect(localFirst.enqueueLocalWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "menu_categories",
          rowId: "cat-1",
          op: "delete",
        })
      );
    });
  });
});
