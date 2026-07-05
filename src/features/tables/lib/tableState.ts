import { generateMesasConfig, type MesaConfig } from "../config/mesas";

export type TableVisualState = "libre" | "ocupada";

export interface MesaEstadoRow {
  id: number;
  estado?: TableVisualState | string | null;
  fusionada?: boolean | null;
  fusion_padre_id?: number | null;
  fusion_hijos?: number[] | null;
  span_filas?: number | null;
  span_columnas?: number | null;
}

export interface PendingTableConsumptionRow {
  mesa_numero: number | null;
  subtotal?: number | string | null;
}

export interface BuiltTableState extends MesaConfig {
  estado: TableVisualState;
  fusionada: boolean;
  fusion_padre_id: number | null;
  fusion_hijos: number[];
  span_filas: number;
  span_columnas: number;
}

export function buildTablesForConfiguredCount(args: {
  cantidadMesas: number;
  estadosRows?: readonly MesaEstadoRow[] | null;
  pendingConsumptionRows?: readonly PendingTableConsumptionRow[] | null;
}): BuiltTableState[] {
  const estadosById = new Map<number, MesaEstadoRow>();
  for (const row of args.estadosRows ?? []) {
    estadosById.set(Number(row.id), row);
  }

  const occupiedNumbers = new Set<number>();
  for (const row of args.pendingConsumptionRows ?? []) {
    const mesaNumero = Number(row.mesa_numero);
    if (mesaNumero > 0) occupiedNumbers.add(mesaNumero);
  }

  return generateMesasConfig(args.cantidadMesas).map((config) => {
    const persisted = estadosById.get(config.id);
    return {
      ...config,
      estado: occupiedNumbers.has(config.numero) ? "ocupada" : "libre",
      fusionada: Boolean(persisted?.fusionada),
      fusion_padre_id: persisted?.fusion_padre_id ?? null,
      fusion_hijos: persisted?.fusion_hijos ?? [],
      span_filas: persisted?.span_filas ?? 1,
      span_columnas: persisted?.span_columnas ?? 1,
    };
  });
}

export function buildMesaEstadoUpsertPayload(args: {
  id: number;
  tenantId: string;
  sucursalId: string;
  state: Partial<Pick<BuiltTableState, "fusionada" | "fusion_padre_id" | "fusion_hijos" | "span_filas" | "span_columnas">>;
}): Record<string, unknown> {
  return {
    id: args.id,
    tenant_id: args.tenantId,
    sucursal_id: args.sucursalId,
    ...args.state,
  };
}
