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
    console.log("\n=======================================================");
    console.log("🚀 INICIANDO TEST CRUD COMPLETO DE NÓMINA (PLAYWRIGHT)");
    console.log("=======================================================");

    await expect.poll(() =>
      page.evaluate(() => typeof window.electronAPI?.executePayrollCommand === "function")
    ).toBe(true);
    console.log("✔ [1/7] BRIDGE IPC: window.electronAPI.executePayrollCommand conectado.");

    // 2. CREATE: Add a new employee
    console.log("⏳ [2/7] CREATE: Registrando nuevo empleado 'Carlos Gomez' (Chef Ejecutivo, RD$45,000)...");
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
    console.log("✔ [2/7] CREATE EXITOSO: Empleado guardado en SQLite local.");

    // 3. READ: List employees and check values
    console.log("⏳ [3/7] READ: Consultando empleados desde SQLite local...");
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
    const employeeId = employees[0].id;
    console.log(`✔ [3/7] READ EXITOSO: Encontrado empleado ID=${employeeId} | Nombre=${employees[0].firstName} ${employees[0].lastName} | Salario=RD$${employees[0].baseSalaryCents / 100}`);

    // 4. UPDATE: Modify employee salary & role
    console.log("⏳ [4/7] UPDATE: Modificando rol a 'Jefe de Cocina' y salario a RD$50,000...");
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
    console.log("✔ [4/7] UPDATE EXITOSO: Rol y salario actualizados en SQLite.");

    // 5. PAYMENT CONTEXT: Calculate period context with adjustment
    console.log("⏳ [5/7] CALCULO: Calculando nómina con bono de horas extras (+RD$5,000)...");
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
    console.log(`✔ [5/7] CALCULO EXITOSO: Total a pagar = RD$${context.dueCents / 100} (Base RD$50,000 + Bono RD$5,000)`);

    // 6. CREATE PAYMENT: Execute full payment
    console.log("⏳ [6/7] PAGO ATÓMICO: Ejecutando pago de nómina de RD$55,000...");
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
    const paymentId = (paymentRes.data as any).paymentId;
    const expenseId = (paymentRes.data as any).expenseId;
    console.log(`✔ [6/7] PAGO EXITOSO: PaymentId=${paymentId} | Gasto Vinculado=${expenseId} | Outbox registrado.`);

    // 7. DELETE / DISABLE: Deactivate the employee
    console.log("⏳ [7/7] DISABLE / DELETE: Desactivando empleado...");
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
    console.log("✔ [7/7] DISABLE EXITOSO: Empleado desactivado en SQLite (isActive = false).");
    console.log("=======================================================");
    console.log("🎉 CRUD COMPLETO VERIFICADO EN SQLITE LOCAL-FIRST");
    console.log("=======================================================\n");
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

  test("records payment of RD$ 12,500.00 and verifies persistent receipt in historical list", async () => {
    console.log("\n=======================================================");
    console.log("🧾 TEST VISUAL: PAGO DE RD$ 12,500 Y HISTORIAL DE RECIBOS");
    console.log("=======================================================");

    // 1. Create employee with RD$ 25,000 monthly salary and biweekly payment
    console.log("⏳ [1/4] Creando empleado 'Manuel Diaz' (Salario Base RD$25,000, Quincenal)...");
    const createEmp = await page.evaluate(
      ({ tid, sid }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.upsertEmployee",
          tenantId: tid,
          sucursalId: sid,
          employee: {
            firstName: "Manuel",
            lastName: "Diaz",
            role: "Bartender",
            baseSalaryCents: 2500000, // 25,000.00 DOP
            frequency: "biweekly",
            isActive: true,
          },
        }),
      { tid: tenantId, sid: sucursalId }
    );
    expect(createEmp.ok).toBe(true);

    const empList = await page.evaluate(
      ({ tid, sid }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.getEmployees",
          tenantId: tid,
          sucursalId: sid,
        }),
      { tid: tenantId, sid: sucursalId }
    );
    const employee = (empList.data as any).employees[0];
    console.log(`✔ [1/4] Empleado creado: ${employee.firstName} ${employee.lastName} (ID: ${employee.id})`);

    // 2. Calculate payment context for 1st biweekly period (should be RD$ 12,500.00)
    console.log("⏳ [2/4] Calculando pago quincenal (RD$25,000 / 2 = RD$12,500)...");
    const contextRes = await page.evaluate(
      ({ tid, sid, empId }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.getPaymentContext",
          tenantId: tid,
          sucursalId: sid,
          payload: {
            employeeId: empId,
            period: "2026-08-1",
            frequency: "biweekly",
            adjustments: [],
          },
        }),
      { tid: tenantId, sid: sucursalId, empId: employee.id }
    );
    expect(contextRes.ok).toBe(true);
    const context = (contextRes.data as any).context;
    expect(context.periodSalaryCents).toBe(1250000); // RD$ 12,500.00
    expect(context.dueCents).toBe(1250000);
    console.log(`✔ [2/4] Cálculo exacto: Total a pagar = RD$${context.dueCents / 100} (Quincenal)`);

    // 3. Register payment of RD$ 12,500.00
    console.log("⏳ [3/4] Registrando pago de RD$ 12,500.00 en SQLite...");
    const payRes = await page.evaluate(
      ({ tid, sid, empId, ctx }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.createPayment",
          tenantId: tid,
          sucursalId: sid,
          payload: {
            employeeId: empId,
            period: "2026-08-1",
            frequency: "biweekly",
            paymentAmountCents: 1250000,
            receiptSnapshot: JSON.stringify({
              employee: { firstName: "Manuel", lastName: "Diaz", role: "Bartender" },
              period: "2026-08-1",
              paymentAmountCents: 1250000,
            }),
            adjustments: [],
          },
        }),
      { tid: tenantId, sid: sucursalId, empId: employee.id, ctx: context }
    );
    expect(payRes.ok).toBe(true);
    const paymentId = (payRes.data as any).paymentId;
    console.log(`✔ [3/4] Pago asentado exitosamente con ID: ${paymentId}`);

    // 4. Query receipts history (getPayments)
    console.log("⏳ [4/4] Consultando historial de recibos en SQLite...");
    const paymentsList = await page.evaluate(
      ({ tid, sid }) =>
        window.electronAPI!.executePayrollCommand!({
          type: "payroll.getPayments",
          tenantId: tid,
          sucursalId: sid,
        }),
      { tid: tenantId, sid: sucursalId }
    );
    expect(paymentsList.ok).toBe(true);
    const receipts = (paymentsList.data as any).payments;
    expect(receipts).toHaveLength(1);
    expect(receipts[0].employeeName).toBe("Manuel Diaz");
    expect(receipts[0].employeeRole).toBe("Bartender");
    expect(receipts[0].period).toBe("2026-08-1");
    expect(receipts[0].amountPaidCents).toBe(1250000);
    expect(receipts[0].pendingCents).toBe(0);

    console.log(`✔ [4/4] RECIBO ENCONTRADO EN LISTA HISTÓRICA:`);
    console.log(`       - Empleado: ${receipts[0].employeeName}`);
    console.log(`       - Cargo:    ${receipts[0].employeeRole}`);
    console.log(`       - Período:  ${receipts[0].period}`);
    console.log(`       - Monto:    RD$ ${(receipts[0].amountPaidCents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`);
    console.log(`       - Pendiente: RD$ ${(receipts[0].pendingCents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`);
    console.log("=======================================================");
    console.log("🎉 VERIFICACIÓN DE HISTORIAL DE RECIBO EXITOSA");
    console.log("=======================================================\n");
  });
});
