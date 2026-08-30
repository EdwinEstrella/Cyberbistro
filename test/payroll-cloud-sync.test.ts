import { describe, expect, it, vi } from "vitest";
import {
  createPayrollPaymentInCloud,
  deactivatePayrollEmployeeInCloud,
  getPayrollPaymentContextFromCloud,
  mapPayrollEmployeeForCloud,
  mapPayrollFrequencyFromCloud,
  syncPayrollEmployeeToCloud,
} from "../src/shared/lib/payrollCloudSync";

describe("payroll employee cloud synchronization", () => {
  it("maps the default local monthly frequency to the remote payroll contract", () => {
    const payload = mapPayrollEmployeeForCloud(
      {
        id: "employee-1",
        firstName: "Ana",
        lastName: "Perez",
        role: "Cashier",
        baseSalaryCents: 100000,
        frequency: "monthly",
        isActive: true,
      },
      "tenant-1",
      "branch-1",
    );

    expect(payload).toMatchObject({ frecuencia_pago: "mensual" });
  });

  it("maps the local biweekly frequency to the remote payroll contract", () => {
    const payload = mapPayrollEmployeeForCloud(
      {
        id: "employee-1",
        firstName: "Ana",
        lastName: "Perez",
        role: "Cashier",
        baseSalaryCents: 100000,
        frequency: "biweekly",
        isActive: true,
      },
      "tenant-1",
      "branch-1",
    );

    expect(payload).toMatchObject({ frecuencia_pago: "quincenal" });
  });

  it("maps remote payroll frequencies to the local contract", () => {
    expect(mapPayrollFrequencyFromCloud("mensual")).toBe("monthly");
    expect(mapPayrollFrequencyFromCloud("quincenal")).toBe("biweekly");
  });

  it("defaults unknown remote payroll frequencies to monthly", () => {
    expect(mapPayrollFrequencyFromCloud("semanal")).toBe("monthly");
    expect(mapPayrollFrequencyFromCloud(null)).toBe("monthly");
  });

  it("rejects weekly employees before making a remote request", async () => {
    const upsert = vi.fn();
    const client = {
      database: {
        from: vi.fn().mockReturnValue({ upsert }),
      },
    };

    await expect(
      syncPayrollEmployeeToCloud(
        client,
        {
          id: "employee-1",
          firstName: "Ana",
          lastName: "Perez",
          role: "Cashier",
          baseSalaryCents: 100000,
          frequency: "weekly",
          isActive: true,
        },
        "tenant-1",
        "branch-1",
      ),
    ).rejects.toMatchObject({
      code: "PAYROLL_FREQUENCY_NOT_SUPPORTED",
      message: "Weekly payroll frequency is not supported by the remote payroll service.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("surfaces a rejected remote employee upsert to the caller", async () => {
    const upsert = vi.fn().mockResolvedValue({
      error: {
        code: "23514",
        message: "nomina_empleados_frecuencia_pago_check",
      },
    });
    const client = {
      database: {
        from: vi.fn().mockReturnValue({ upsert }),
      },
    };

    await expect(
      syncPayrollEmployeeToCloud(
        client,
        {
          id: "employee-1",
          firstName: "Ana",
          lastName: "Perez",
          role: "Cashier",
          baseSalaryCents: 100000,
          frequency: "monthly",
          isActive: true,
        },
        "tenant-1",
        "branch-1",
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: "Payroll employee cloud sync failed (23514): nomina_empleados_frecuencia_pago_check",
    });
  });

  it("surfaces a rejected remote employee deactivation to the caller", async () => {
    const eq = vi.fn().mockResolvedValue({
      error: {
        code: "42501",
        message: "permission denied for table nomina_empleados",
      },
    });
    const update = vi.fn().mockReturnValue({ eq });
    const client = {
      database: {
        from: vi.fn().mockReturnValue({ update }),
      },
    };

    await expect(deactivatePayrollEmployeeInCloud(client, "employee-1")).rejects.toMatchObject({
      code: "42501",
      message: "Payroll employee deactivation failed (42501): permission denied for table nomina_empleados",
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
    expect(eq).toHaveBeenCalledWith("id", "employee-1");
  });

  it("uses the atomic payroll RPC instead of inserting a web payment directly", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{
        empleado_id: "employee-1",
        periodo: "2026-08",
        monto_base: 100000,
        total_bonos: 0,
        total_descuentos: 10000,
        monto_pagado: 40000,
        created_at: "2026-08-01T00:00:00.000Z",
      }],
      error: null,
    });
    const eq = vi.fn().mockReturnThis();
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        payment_id: "payment-1",
        period_salary_cents: 100000,
        due_cents: 95000,
        amount_paid_cents: 50000,
        pending_cents: 5000,
        paid_total_cents: 90000,
      }],
      error: null,
    });
    const client = {
      database: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ eq, order }),
        }),
        rpc,
      },
    };
    const employee = {
      id: "employee-1",
      firstName: "Ana",
      lastName: "Perez",
      role: "Cashier",
      baseSalaryCents: 100000,
      frequency: "monthly" as const,
      isActive: true,
    };
    const payload = {
      employeeId: employee.id,
      period: "2026-08",
      frequency: "monthly" as const,
      paymentAmountCents: 50000,
      receiptSnapshot: "{}",
      adjustments: [{ kind: "bonus" as const, type: "target", scope: "currentPayment" as const, amountCents: 5000, note: "" }],
    };

    const context = await getPayrollPaymentContextFromCloud(client, employee, payload);
    const committedContext = await createPayrollPaymentInCloud(client, payload);

    expect(context).toMatchObject({ dueCents: 95000, alreadyPaidCents: 40000, pendingCents: 55000 });
    expect(client.database.from).toHaveBeenCalledWith("nomina_pagos");
    expect(rpc).toHaveBeenCalledWith("register_nomina_pago", {
      p_empleado_id: "employee-1",
      p_periodo: "2026-08",
      p_monto_pagado: 50000,
      p_total_bonos: 5000,
      p_total_descuentos: 0,
    });
    expect(committedContext).toMatchObject({
      dueCents: 95000,
      alreadyPaidCents: 90000,
      pendingCents: 5000,
    });
  });

  it("surfaces rejected atomic payroll registration", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: "P0001", message: "Overpayment not allowed" } });
    const client = { database: { rpc } };
    const payload = {
      employeeId: "employee-1",
      period: "2026-08",
      frequency: "monthly" as const,
      paymentAmountCents: 1000,
      receiptSnapshot: "{}",
      adjustments: [],
    };
    await expect(createPayrollPaymentInCloud(client, payload)).rejects.toMatchObject({
      code: "P0001",
      message: "Payroll payment registration failed (P0001): Overpayment not allowed",
    });
  });
});
