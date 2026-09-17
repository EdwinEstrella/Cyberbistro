import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { registrarPagoCxC } from "./accountsReceivableService";
import { enqueueLocalWrite, readLocalMirror } from "../../../shared/lib/localFirst";

// Mock localFirst functions
vi.mock("../../../shared/lib/localFirst", () => ({
  readLocalMirror: vi.fn(),
  enqueueLocalWrite: vi.fn().mockResolvedValue(undefined),
  getDeviceId: vi.fn().mockResolvedValue("device-123"),
}));

describe("accountsReceivableService", () => {
  const mockTenantId = "tenant-xyz";
  const mockDebt = {
    id: "debt-123",
    tenant_id: mockTenantId,
    customer_id: "customer-1",
    monto_total: 100.00,
    monto_pagado: 40.00,
    estado: "parcial",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readLocalMirror).mockImplementation(async (_tenantId, tableName) => {
      if (tableName === "cuentas_cobrar") {
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
      return [] as any;
    });
  });

  it("throws error if payment amount is less than or equal to zero", async () => {
    await expect(
      registrarPagoCxC({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaCobrarId: "debt-123",
        monto: 0,
        metodoPago: "transferencia",
      })
    ).rejects.toThrow("El monto del pago debe ser mayor a cero.");
  });

  it("throws error if debt does not exist", async () => {
    vi.mocked(readLocalMirror).mockImplementation(async () => []);
    await expect(
      registrarPagoCxC({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaCobrarId: "debt-nonexistent",
        monto: 10,
        metodoPago: "transferencia",
      })
    ).rejects.toThrow("La cuenta por cobrar no existe.");
  });

  it("throws error if payment amount exceeds remaining balance", async () => {
    await expect(
      registrarPagoCxC({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaCobrarId: "debt-123",
        monto: 60.01, // 100 - 40 = 60
        metodoPago: "transferencia",
      })
    ).rejects.toThrow("El monto del pago (60.01) excede el balance pendiente (60).");
  });

  it("updates debt status to parcial if not fully paid", async () => {
    const result = await registrarPagoCxC({
      tenantId: mockTenantId,
      sucursalId: "suc-1",
      usuarioId: "user-1",
      cuentaCobrarId: "debt-123",
      monto: 20.00,
      metodoPago: "transferencia",
    });

    expect(result.pagoId).toBeDefined();

    // Check payment write
    const payCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      c => c[0].tableName === "cxc_pagos"
    );
    expect(payCall).toBeDefined();
    expect((payCall?.[0] as any)?.payload?.monto).toBe(20.00);

    // Check debt update
    const debtCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      c => c[0].tableName === "cuentas_cobrar"
    );
    expect(debtCall).toBeDefined();
    expect((debtCall?.[0] as any)?.payload?.monto_pagado).toBe(60.00); // 40 + 20
    expect((debtCall?.[0] as any)?.payload?.estado).toBe("parcial");
  });

  it("updates debt status to pagada if fully paid", async () => {
    await registrarPagoCxC({
      tenantId: mockTenantId,
      sucursalId: "suc-1",
      usuarioId: "user-1",
      cuentaCobrarId: "debt-123",
      monto: 60.00,
      metodoPago: "transferencia",
    });

    const debtCall = vi.mocked(enqueueLocalWrite).mock.calls.find(
      c => c[0].tableName === "cuentas_cobrar"
    );
    expect(debtCall).toBeDefined();
    expect((debtCall?.[0] as any)?.payload?.estado).toBe("pagada");
  });

  it("throws error if cash payment has no active cycle", async () => {
    vi.mocked(readLocalMirror).mockImplementation(async (_tenantId, tableName) => {
      if (tableName === "cuentas_cobrar") return [mockDebt] as any;
      if (tableName === "cierres_operativos") return [] as any;
      return [] as any;
    });

    await expect(
      registrarPagoCxC({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaCobrarId: "debt-123",
        monto: 10.00,
        metodoPago: "efectivo",
      })
    ).rejects.toThrow("No hay un ciclo operativo abierto para registrar un pago en efectivo.");
  });

  describe("SQLite desktop path", () => {
    const executeReceivablesCommand = vi.fn();
    beforeEach(() => {
      executeReceivablesCommand.mockReset();
      executeReceivablesCommand.mockResolvedValue({ data: { commitId: "c1", localStatus: "committed", syncStatus: "pending" } });
      (globalThis as any).window = { electronAPI: { executeReceivablesCommand } };
    });
    afterEach(() => {
      delete (globalThis as any).window;
    });

    it("routes the payment through the SQLite command and does not enqueue IndexedDB writes", async () => {
      const result = await registrarPagoCxC({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaCobrarId: "debt-123",
        monto: 20.0,
        metodoPago: "efectivo",
      });

      expect(result.pagoId).toBeDefined();
      expect(executeReceivablesCommand).toHaveBeenCalledTimes(1);
      const cmd = executeReceivablesCommand.mock.calls[0][0];
      expect(cmd).toMatchObject({
        type: "receivables.payment.record",
        receivableId: "debt-123",
        amount: 20.0,
        paymentMethod: "efectivo",
        cycleId: "cycle-active-456", // cash payment carries the open cycle
        usuarioId: "user-1",
      });
      expect(cmd.paymentId).toBe(result.pagoId);
      expect(enqueueLocalWrite).not.toHaveBeenCalled();
    });

    it("falls back to IndexedDB when the SQLite command rejects", async () => {
      executeReceivablesCommand.mockRejectedValueOnce(new Error("Cuenta por cobrar no encontrada."));
      const result = await registrarPagoCxC({
        tenantId: mockTenantId,
        sucursalId: "suc-1",
        usuarioId: "user-1",
        cuentaCobrarId: "debt-123",
        monto: 20.0,
        metodoPago: "transferencia",
      });

      expect(result.pagoId).toBeDefined();
      const payCall = vi.mocked(enqueueLocalWrite).mock.calls.find(c => c[0].tableName === "cxc_pagos");
      const debtCall = vi.mocked(enqueueLocalWrite).mock.calls.find(c => c[0].tableName === "cuentas_cobrar");
      expect(payCall).toBeDefined();
      expect(debtCall).toBeDefined();
      expect((debtCall?.[0] as any)?.payload?.monto_pagado).toBe(60.0);
    });
  });
});
