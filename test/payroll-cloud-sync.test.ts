import { describe, expect, it, vi } from "vitest";
import {
  deactivatePayrollEmployeeInCloud,
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
});
