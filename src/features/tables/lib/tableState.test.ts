import { describe, expect, it } from "vitest";
import { buildMesaEstadoUpsertPayload, buildTablesForConfiguredCount } from "./tableState";

describe("buildTablesForConfiguredCount", () => {
  it("adds missing table numbers without mutating existing occupied/free state", () => {
    const tables = buildTablesForConfiguredCount({
      cantidadMesas: 5,
      estadosRows: [
        { id: 1, span_columnas: 2, span_filas: 1, fusion_hijos: [2] },
        { id: 2, fusionada: true, fusion_padre_id: 1 },
        { id: 3 },
      ],
      pendingConsumptionRows: [{ mesa_numero: 2 }, { mesa_numero: 3 }],
    });

    expect(tables.map((table) => table.numero)).toEqual([1, 2, 3, 4, 5]);
    expect(tables.map((table) => table.estado)).toEqual(["libre", "ocupada", "ocupada", "libre", "libre"]);
    expect(tables[0]).toMatchObject({ span_columnas: 2, fusion_hijos: [2] });
    expect(tables[1]).toMatchObject({ fusionada: true, fusion_padre_id: 1 });
  });

  it("reduces the plan to configured table numbers and hides out-of-range occupied tables", () => {
    const tables = buildTablesForConfiguredCount({
      cantidadMesas: 3,
      estadosRows: [{ id: 4, fusionada: true, fusion_padre_id: 1 }],
      pendingConsumptionRows: [{ mesa_numero: 2 }, { mesa_numero: 4 }],
    });

    expect(tables.map((table) => table.numero)).toEqual([1, 2, 3]);
    expect(tables.map((table) => table.estado)).toEqual(["libre", "ocupada", "libre"]);
    expect(tables.some((table) => table.numero === 4)).toBe(false);
  });
});

describe("buildMesaEstadoUpsertPayload", () => {
  it("includes tenant, id, and branch scope required by mesas_estado composite upserts", () => {
    expect(
      buildMesaEstadoUpsertPayload({
        id: 7,
        tenantId: "tenant-1",
        sucursalId: "branch-1",
        state: { fusionada: true, fusion_padre_id: 3 },
      })
    ).toEqual({
      id: 7,
      tenant_id: "tenant-1",
      sucursal_id: "branch-1",
      fusionada: true,
      fusion_padre_id: 3,
    });
  });
});
