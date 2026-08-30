import { describe, expect, it } from "vitest";
import { calculatePayrollPaymentContext } from "./payrollCalculation";

const employee = {
  id: "employee-1",
  firstName: "Ana",
  lastName: "Perez",
  role: "Cashier",
  baseSalaryCents: 100000,
  frequency: "monthly" as const,
  isActive: true,
};

describe("calculatePayrollPaymentContext", () => {
  it("uses the first payment snapshot and accumulates prior payments and current adjustments", () => {
    const context = calculatePayrollPaymentContext(employee, {
      employeeId: employee.id,
      period: "2026-08",
      frequency: "monthly",
      adjustments: [{ kind: "bonus", type: "target", scope: "currentPayment", amountCents: 5000, note: "" }],
    }, [{
      employeeId: employee.id,
      period: "2026-08",
      baseSalaryCents: 100000,
      periodSalaryCents: 100000,
      adjustmentsDeltaCents: -10000,
      amountPaidCents: 40000,
      createdAt: "2026-08-01T00:00:00.000Z",
    }]);

    expect(context).toMatchObject({
      baseSalaryCents: 100000,
      periodSalaryCents: 100000,
      adjustmentDeltaCents: -5000,
      dueCents: 95000,
      alreadyPaidCents: 40000,
      pendingCents: 55000,
    });
  });
});
