import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";

test.describe("Nomina (Payroll) Full CRUD & Local-First SQLite E2E", () => {
  let userDataDirectory: string;
  let app: ElectronApplication;
  let page: Page;
  const tenantId = "tenant-e2e-nomina";
  const sucursalId = "branch-e2e-nomina";

  test.beforeEach(async () => {
    userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-nomina-e2e-"));
    const seed = TenantStore.open({ dataRoot: userDataDirectory, tenantId });
    const db = seed.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(sucursalId, tenantId, "Principal");
    seed.close();

    app = await electron.launch({
      args: [".", `--user-data-dir=${userDataDirectory}`],
    });
    page = await app.firstWindow();
    await expect(page.getByLabel("Correo")).toBeVisible();
  });

  test.afterEach(async () => {
    if (app) await app.close();
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
    }
  });

  test("performs complete CRUD on employees and records payment with SQLite atomicity", async () => {
    // 1. Verify bridge is exposed
    await expect.poll(() =>
      page.evaluate(() => typeof window.electronAPI?.executePayrollCommand === "function")
    ).toBe(true);

    // 2. CREATE: Add a new employee
    const createRes = await page.evaluate(
      ({ tid, sid }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.upsertEmployee",
          tenantId: tid,
          sucursalId: sid,
          employee: {
            firstName: "Carlos",
            lastName: "Gomez",
            role: "Chef Ejecutivo",
            baseSalaryCents: 4500000, // 45,000.00 DOP
            frequency: "monthly",
            isActive: true,
          },
        }),
      { tid: tenantId, sid: sucursalId }
    );
    expect(createRes.ok).toBe(true);
    expect((createRes.data as any).type).toBe("payroll.employeeSaved");

    // 3. READ: List employees and check values
    const listRes = await page.evaluate(
      ({ tid, sid }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.getEmployees",
          tenantId: tid,
          sucursalId: sid,
        }),
      { tid: tenantId, sid: sucursalId }
    );
    expect(listRes.ok).toBe(true);
    const employees = (listRes.data as any).employees;
    expect(employees).toHaveLength(1);
    expect(employees[0]).toMatchObject({
      firstName: "Carlos",
      lastName: "Gomez",
      role: "Chef Ejecutivo",
      baseSalaryCents: 4500000,
      frequency: "monthly",
      isActive: true,
    });
    const employeeId = employees[0].id;
    expect(typeof employeeId).toBe("string");

    // 4. UPDATE: Modify employee salary & role
    const updateRes = await page.evaluate(
      ({ tid, sid, empId }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.upsertEmployee",
          tenantId: tid,
          sucursalId: sid,
          employee: {
            id: empId,
            firstName: "Carlos",
            lastName: "Gomez",
            role: "Jefe de Cocina",
            baseSalaryCents: 5000000, // Updated to 50,000.00 DOP
            frequency: "monthly",
            isActive: true,
          },
        }),
      { tid: tenantId, sid: sucursalId, empId: employeeId }
    );
    expect(updateRes.ok).toBe(true);

    const updatedList = await page.evaluate(
      ({ tid, sid }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.getEmployees",
          tenantId: tid,
          sucursalId: sid,
        }),
      { tid: tenantId, sid: sucursalId }
    );
    expect((updatedList.data as any).employees[0].role).toBe("Jefe de Cocina");
    expect((updatedList.data as any).employees[0].baseSalaryCents).toBe(5000000);

    // 5. PAYMENT CONTEXT: Calculate period context with adjustment
    const contextRes = await page.evaluate(
      ({ tid, sid, empId }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.getPaymentContext",
          tenantId: tid,
          sucursalId: sid,
          payload: {
            employeeId: empId,
            period: "2026-08",
            frequency: "monthly",
            adjustments: [
              {
                kind: "bonus",
                type: "Horas Extras",
                scope: "currentPayment",
                amountCents: 500000, // 5,000.00 DOP bonus
                note: "Turno extra de fin de semana",
              },
            ],
          },
        }),
      { tid: tenantId, sid: sucursalId, empId: employeeId }
    );
    expect(contextRes.ok).toBe(true);
    const context = (contextRes.data as any).context;
    expect(context.periodSalaryCents).toBe(5000000);
    expect(context.adjustmentDeltaCents).toBe(500000);
    expect(context.dueCents).toBe(5500000); // 50,000 + 5,000 = 55,000 DOP
    expect(context.pendingCents).toBe(5500000);

    // 6. CREATE PAYMENT: Execute full payment
    const paymentRes = await page.evaluate(
      ({ tid, sid, empId }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.createPayment",
          tenantId: tid,
          sucursalId: sid,
          payload: {
            employeeId: empId,
            period: "2026-08",
            frequency: "monthly",
            paymentAmountCents: 5500000,
            receiptSnapshot: "Receipt #123",
            adjustments: [
              {
                kind: "bonus",
                type: "Horas Extras",
                scope: "currentPayment",
                amountCents: 500000,
                note: "Turno extra de fin de semana",
              },
            ],
          },
        }),
      { tid: tenantId, sid: sucursalId, empId: employeeId }
    );
    expect(paymentRes.ok).toBe(true);
    expect((paymentRes.data as any).type).toBe("payroll.paymentCommitted");
    expect((paymentRes.data as any).paymentId).toBeDefined();
    expect((paymentRes.data as any).expenseId).toBeDefined();

    // 7. DELETE / DISABLE: Deactivate the employee
    const disableRes = await page.evaluate(
      ({ tid, sid, empId }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.disableEmployee",
          tenantId: tid,
          sucursalId: sid,
          employeeId: empId,
        }),
      { tid: tenantId, sid: sucursalId, empId: employeeId }
    );
    expect(disableRes.ok).toBe(true);

    const finalList = await page.evaluate(
      ({ tid, sid }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.getEmployees",
          tenantId: tid,
          sucursalId: sid,
        }),
      { tid: tenantId, sid: sucursalId }
    );
    expect((finalList.data as any).employees[0].isActive).toBe(false);
  });

  test("rejects invalid or corrupted payroll commands (safety checks)", async () => {
    // Rejects negative base salary
    await expect(
      page.evaluate(
        ({ tid, sid }) =>
          window.electronAPI!.executePayrollCommand!({
            type: "payroll.upsertEmployee",
            tenantId: tid,
            sucursalId: sid,
            employee: {
              id: "emp-invalid",
              firstName: "Test",
              lastName: "User",
              role: "Mesero",
              baseSalaryCents: -100,
              frequency: "monthly",
              isActive: true,
            },
          }),
        { tid: tenantId, sid: sucursalId }
      )
    ).rejects.toThrow();

    // Rejects missing employeeId on disable
    await expect(
      page.evaluate(
        ({ tid, sid }) =>
          window.electronAPI!.executePayrollCommand!({
            type: "payroll.disableEmployee",
            tenantId: tid,
            sucursalId: sid,
            employeeId: "",
          }),
        { tid: tenantId, sid: sucursalId }
      )
    ).rejects.toThrow();
  });
});
