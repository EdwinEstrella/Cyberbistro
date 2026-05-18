import { enqueueLocalWrite, type LocalFirstMirrorTable } from "../../../shared/lib/localFirst";

interface LocalWriteArgs {
  tenantId: string;
  tableName: LocalFirstMirrorTable;
  rowId: string;
  op: "insert" | "update" | "upsert" | "delete";
  payload?: Record<string, unknown> | null;
  authUserId?: string | null;
  deviceId: string;
}

export async function writePosMutationLocalFirst(args: LocalWriteArgs): Promise<void> {
  await enqueueLocalWrite(args);
}

export async function closeKitchenComandasForMesaLocalFirst(args: {
  tenantId: string;
  mesaNumero: number;
  deviceId: string;
  authUserId?: string | null;
  listOpenComandas: (tenantId: string, mesaNumero: number) => Promise<Array<{ id: string }>>;
}): Promise<void> {
  const openComandas = await args.listOpenComandas(args.tenantId, args.mesaNumero);
  const updatedAt = new Date().toISOString();

  for (const comanda of openComandas) {
    await writePosMutationLocalFirst({
      tenantId: args.tenantId,
      tableName: "comandas",
      rowId: comanda.id,
      op: "update",
      payload: { estado: "entregado", updated_at: updatedAt },
      authUserId: args.authUserId ?? null,
      deviceId: args.deviceId,
    });
  }
}
