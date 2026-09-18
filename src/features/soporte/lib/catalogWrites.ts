import { saveCatalogCommandLocally } from "../../../shared/lib/catalogUiAdapter";
import {
  enqueueLocalWrite,
  getDeviceId,
  writeLocalMirrorRow,
  deleteLocalMirrorRow,
} from "../../../shared/lib/localFirst";

export function hasSqliteCatalog(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.executeCatalogCommand);
}

export interface WritePlatoUpsertInput {
  tenantId: string;
  sucursalId: string;
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
}

export async function writePlatoUpsert(input: WritePlatoUpsertInput, isNew: boolean): Promise<void> {
  const payload = {
    id: input.id,
    nombre: input.nombre,
    precio: input.precio,
    categoria: input.categoria,
    disponible: input.disponible,
    va_a_cocina: input.va_a_cocina,
    tenant_id: input.tenantId,
    sucursal_id: input.sucursalId,
  };

  if (hasSqliteCatalog()) {
    await saveCatalogCommandLocally({
      type: "catalog.product.upsert",
      id: String(input.id),
      sucursalId: input.sucursalId,
      nombre: input.nombre,
      precio: input.precio,
      categoria: input.categoria,
      disponible: input.disponible,
      va_a_cocina: input.va_a_cocina,
    });
  } else {
    await enqueueLocalWrite({
      tenantId: input.tenantId,
      tableName: "platos",
      rowId: String(input.id),
      op: isNew ? "insert" : "update",
      payload,
      deviceId: await getDeviceId(),
    });
  }

  await writeLocalMirrorRow(input.tenantId, "platos", payload);
}

export async function writePlatoDelete(tenantId: string, id: number): Promise<void> {
  if (hasSqliteCatalog()) {
    await saveCatalogCommandLocally({ type: "catalog.product.delete", id: String(id) });
  } else {
    await enqueueLocalWrite({
      tenantId,
      tableName: "platos",
      rowId: String(id),
      op: "delete",
      deviceId: await getDeviceId(),
    });
  }
  await deleteLocalMirrorRow(tenantId, "platos", String(id));
}

export interface WriteCategoryUpsertInput {
  tenantId: string;
  sucursalId: string;
  id: string;
  nombre: string;
  color: string;
  sortOrder: number;
}

export async function writeCategoryUpsert(input: WriteCategoryUpsertInput, isNew: boolean): Promise<void> {
  const payload = {
    id: input.id,
    tenant_id: input.tenantId,
    nombre: input.nombre,
    color: input.color,
    sort_order: input.sortOrder,
    sucursal_id: input.sucursalId,
  };

  if (hasSqliteCatalog()) {
    await saveCatalogCommandLocally({
      type: "catalog.category.upsert",
      id: input.id,
      nombre: input.nombre,
      color: input.color,
      sortOrder: input.sortOrder,
      sucursalId: input.sucursalId,
    });
  } else {
    await enqueueLocalWrite({
      tenantId: input.tenantId,
      tableName: "menu_categories",
      rowId: input.id,
      op: isNew ? "insert" : "update",
      payload,
      deviceId: await getDeviceId(),
    });
  }

  await writeLocalMirrorRow(input.tenantId, "menu_categories", payload);
}

export async function writeCategoryDelete(tenantId: string, id: string): Promise<void> {
  if (hasSqliteCatalog()) {
    await saveCatalogCommandLocally({ type: "catalog.category.delete", id });
  } else {
    await enqueueLocalWrite({
      tenantId,
      tableName: "menu_categories",
      rowId: id,
      op: "delete",
      deviceId: await getDeviceId(),
    });
  }
  await deleteLocalMirrorRow(tenantId, "menu_categories", id);
}
