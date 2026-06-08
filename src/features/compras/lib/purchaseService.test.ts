import { describe, expect, it, vi, beforeEach } from "vitest";
import { registrarCompra } from "./purchaseService";
import { enqueueLocalWrite, readLocalMirror } from "../../../shared/lib/localFirst";

// Mock localFirst functions
vi.mock("../../../shared/lib/localFirst", () => ({
  readLocalMirror: vi.fn(),
  enqueueLocalWrite: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn().mockResolvedValue("device-123"),
}));

describe("purchaseService", () => {
  const mockTenantId = "tenant-abc";
  const mockProducts = [
    {
      id: "prod-simple",
      nombre: "Vaso Plástico",
      unidad_base: "unidad",
      ml_por_botella: null,
      stock_actual: 10,
      costo_promedio: 5.00,
    },
    {
      id: "prod-liquid",
      nombre: "Ron Premium",
      unidad_base: "ml",
      ml_por_botella: 1000,
      stock_actual: 2000,
      costo_promedio: 0.02,
    },
    {
      id: "prod-empty",
      nombre: "Papa Frita",
      unidad_base: "g",
      ml_por_botella: null,
      stock_actual: 0,
      costo_promedio: 0.00,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLocalMirror).mockResolvedValue(mockProducts as any);
  });

  it("calculates weighted average cost correctly for simple items", async () => {
    const result = await registrarCompra({
      tenantId: mockTenantId,
      sucursalId: "suc-1",
      usuarioId: "user-1",
      proveedorId: "prov-1",
      numeroFactura: "FAC-001",
      tipoPago: "contado",
      items: [
        {
          producto_id: "prod-simple",
          cantidad: 5,
          costo_unitario: 8.00,
        },
      ],
    });

    expect(result.compraId).toBeDefined();
    
    // Check update catalog write
    const updateCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      call => call[0].tableName === "productos_inventario"
    );
    expect(updateCall).toBeDefined();
    const payload = updateCall?.[0]?.payload as any;
    expect(payload).toBeDefined();
    expect(payload.stock_actual).toBe(15);
    // ((10 * 5) + (5 * 8)) / 15 = 6.00
    expect(payload.costo_promedio).toBe(6.00);
  });

  it("calculates cost and liquid volumes correctly for bottles", async () => {
    await registrarCompra({
      tenantId: mockTenantId,
      sucursalId: "suc-1",
      usuarioId: "user-1",
      proveedorId: "prov-1",
      numeroFactura: "FAC-002",
      tipoPago: "contado",
      items: [
        {
          producto_id: "prod-liquid",
          cantidad: 3, // 3 bottles of 1000ml = 3000ml
          costo_unitario: 30.00, // 30 per bottle = 0.03 per ml
        },
      ],
    });

    // Check catalog update
    const updateCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      call => call[0].tableName === "productos_inventario"
    );
    const payload = updateCall?.[0]?.payload as any;
    expect(payload).toBeDefined();
    expect(payload.stock_actual).toBe(5000); // 2000 + 3000
    // ((2000 * 0.02) + (3000 * 0.03)) / 5000 = 0.0260
    expect(payload.costo_promedio).toBe(0.0260);

    // Check movements list
    const movCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      call => call[0].tableName === "inventario_movimientos"
    );
    expect(movCall).toBeDefined();
    const movPayload = movCall?.[0]?.payload as any;
    expect(movPayload).toBeDefined();
    expect(movPayload.cantidad).toBe(3000); // quantity in base unit
    expect(movPayload.costo_unitario).toBe(0.03); // cost per base unit
  });

  it("resets cost to purchase unit cost if previous stock is <= 0", async () => {
    await registrarCompra({
      tenantId: mockTenantId,
      sucursalId: "suc-1",
      usuarioId: "user-1",
      proveedorId: "prov-1",
      numeroFactura: "FAC-003",
      tipoPago: "contado",
      items: [
        {
          producto_id: "prod-empty",
          cantidad: 10,
          costo_unitario: 15.00,
        },
      ],
    });

    const updateCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      call => call[0].tableName === "productos_inventario"
    );
    const payload = updateCall?.[0]?.payload as any;
    expect(payload).toBeDefined();
    expect(payload.stock_actual).toBe(10);
    expect(payload.costo_promedio).toBe(15.00); // equals purchase cost
  });
});
