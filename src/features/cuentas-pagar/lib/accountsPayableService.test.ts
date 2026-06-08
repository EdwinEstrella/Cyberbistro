import { describe, expect, it, vi, beforeEach } from "vitest";
import { registrarPagoCxP } from "./accountsPayableService";
import { enqueueLocalWrite, readLocalMirror } from "../../../shared/lib/localFirst";

// Mock localFirst functions
vi.mock("../../../shared/lib/localFirst", () => ({
  readLocalMirror: vi.fn(),
  enqueueLocalWrite: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn().mockResolvedValue("device-123"),
}));

describe("accountsPayableService", () => {
  const mockTenantId = "tenant-xyz";
  const mockDebt = {
    id: "debt-123",
    tenant_id: mockTenantId,
    proveedor_id: "prov-1",
    monto_total: 100.00,
    monto_pagado: 40.00,
    estado: "parcial",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLocalMirror).mockImplementation(async (_tenantId, tableName) => {
      if (tableName === "cuentas_pagar") {
        return [mockDebt] as any;
      }
      if (tableName === "cierres_operativos") {
        return [
          {
            id: "cycle-active-456",
            closed_at: null,
            sucursal_id: "suc-1",
            opened_at: "2026-06-08T10:00:00Z",
          }
        ] as any;
      }
      if (tableName === "gasto_categorias") {
        return [
          {
            id: "cat-compras-uuid",
            nombre: "Compras",
            activa: true,
          }
        ] as any;
      }
      if (tableName === "proveedores") {
        return [
          {
            id: "prov-1",
            nombre: "Distribuidora Nacional",
          }
        ] as any;
      }
      return [] as any;
    });
  });

  it("throws error if payment amount is less than or equal to zero", async () => {
    await expect(
      registrarPagoCxP({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaPagarId: "debt-123",
        monto: 0,
        metodoPago: "transferencia",
      })
    ).rejects.toThrow("El monto del pago debe ser mayor a cero.");
  });

  it("throws error if debt does not exist", async () => {
    vi.mocked(readLocalMirror).mockImplementation(async () => []);
    await expect(
      registrarPagoCxP({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaPagarId: "debt-nonexistent",
        monto: 10,
        metodoPago: "transferencia",
      })
    ).rejects.toThrow("La cuenta por pagar no existe.");
  });

  it("throws error if payment amount exceeds remaining balance", async () => {
    await expect(
      registrarPagoCxP({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaPagarId: "debt-123",
        monto: 60.01, // 100 - 40 = 60
        metodoPago: "transferencia",
      })
    ).rejects.toThrow("El monto del pago (60.01) excede el balance pendiente (60).");
  });

  it("updates debt status to parcial if not fully paid", async () => {
    const result = await registrarPagoCxP({
      tenantId: mockTenantId,
      sucursalId: "suc-1",
      usuarioId: "user-1",
      cuentaPagarId: "debt-123",
      monto: 20.00,
      metodoPago: "transferencia",
    });

    expect(result.pagoId).toBeDefined();

    // Check payment write
    const payCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      c => c[0].tableName === "cxp_pagos"
    );
    expect(payCall).toBeDefined();
    expect((payCall?.[0] as any)?.payload?.monto).toBe(20.00);

    // Check debt update
    const debtCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      c => c[0].tableName === "cuentas_pagar"
    );
    expect(debtCall).toBeDefined();
    expect((debtCall?.[0] as any)?.payload?.monto_pagado).toBe(60.00); // 40 + 20
    expect((debtCall?.[0] as any)?.payload?.estado).toBe("parcial");
  });

  it("updates debt status to pagada if fully paid", async () => {
    await registrarPagoCxP({
      tenantId: mockTenantId,
      sucursalId: "suc-1",
      usuarioId: "user-1",
      cuentaPagarId: "debt-123",
      monto: 60.00,
      metodoPago: "transferencia",
    });

    const debtCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      c => c[0].tableName === "cuentas_pagar"
    );
    expect(debtCall).toBeDefined();
    expect((debtCall?.[0] as any)?.payload?.estado).toBe("pagada");
  });

  it("throws error if cash payment has no active cycle", async () => {
    vi.mocked(readLocalMirror).mockImplementation(async (_tenantId, tableName) => {
      if (tableName === "cuentas_pagar") return [mockDebt] as any;
      if (tableName === "cierres_operativos") return [] as any;
      return [] as any;
    });

    await expect(
      registrarPagoCxP({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaPagarId: "debt-123",
        monto: 10.00,
        metodoPago: "efectivo",
      })
    ).rejects.toThrow("No hay un ciclo operativo abierto para registrar un pago en efectivo.");
  });

  it("registers gasto and creates category if not exists for cash payments", async () => {
    vi.mocked(readLocalMirror).mockImplementation(async (_tenantId, tableName) => {
      if (tableName === "cuentas_pagar") return [mockDebt] as any;
      if (tableName === "cierres_operativos") {
        return [
          {
            id: "cycle-active-456",
            closed_at: null,
            sucursal_id: "suc-1",
            opened_at: "2026-06-08T10:00:00Z",
          }
        ] as any;
      }
      if (tableName === "gasto_categorias") return [] as any; // No category
      if (tableName === "proveedores") {
        return [
          {
            id: "prov-1",
            nombre: "Distribuidora Nacional",
          }
        ] as any;
      }
      return [] as any;
    });

    await registrarPagoCxP({
      tenantId: mockTenantId,
      sucursalId: "suc-1",
      usuarioId: "user-1",
      cuentaPagarId: "debt-123",
      monto: 30.00,
      metodoPago: "efectivo",
    });

    // Check category insert
    const catCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      c => c[0].tableName === "gasto_categorias" && c[0].op === "insert"
    );
    expect(catCall).toBeDefined();

    // Check gasto insert
    const gastoCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      c => c[0].tableName === "gastos" && c[0].op === "insert"
    );
    expect(gastoCall).toBeDefined();
    expect((gastoCall?.[0] as any)?.payload?.monto).toBe(30.00);
    expect((gastoCall?.[0] as any)?.payload?.proveedor).toBe("Distribuidora Nacional");
  });
});
