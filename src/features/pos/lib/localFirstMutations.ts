import { enqueueLocalWrite, type LocalFirstMirrorTable } from "../../../shared/lib/localFirst";
import { saveLocalMesaEstado, saveLocalComanda, deleteLocalComanda } from "../../../shared/lib/ordersLocal";

export type PosMutationTable = LocalFirstMirrorTable | "mesas_estado" | "comandas";

interface LocalWriteArgs {
  tenantId: string;
  tableName: PosMutationTable;
  rowId: string;
  op: "insert" | "update" | "upsert" | "delete";
  payload?: Record<string, unknown> | null;
  authUserId?: string | null;
  deviceId: string;
}

export async function writePosMutationLocalFirst(args: LocalWriteArgs): Promise<void> {
  if (args.tableName === "mesas_estado") {
    if (args.payload) {
      await saveLocalMesaEstado(args.tenantId, args.payload);
    }
    return;
  }
  if (args.tableName === "comandas") {
    if (args.op === "delete") {
      await deleteLocalComanda(args.tenantId, args.rowId);
    } else if (args.payload) {
      await saveLocalComanda(args.tenantId, args.payload);
    }
    return;
  }
  await enqueueLocalWrite(args as any);
}

export async function closeKitchenComandasForMesaLocalFirst(args: {
  tenantId: string;
  mesaNumero: number;
  deviceId: string;
  authUserId?: string | null;
  listOpenComandas: (tenantId: string, mesaNumero: number) => Promise<Array<{ id: string }>>;
}): Promise<void> {
  const openComandas = await args.listOpenComandas(args.tenantId, args.mesaNumero);

  for (const comanda of openComandas) {
    await writePosMutationLocalFirst({
      tenantId: args.tenantId,
      tableName: "comandas",
      rowId: comanda.id,
      op: "delete",
      payload: {},
      authUserId: args.authUserId ?? null,
      deviceId: args.deviceId,
    });
  }
}
