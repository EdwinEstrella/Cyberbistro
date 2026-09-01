import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";
import { insforgeClient } from "../src/shared/lib/insforge";
import { TenantStore } from "../electron/persistence/tenantStore";
import { PayrollRepository } from "../electron/persistence/payrollRepository";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

describe("Strict Local-First Creation -> Auto-Sync -> Cloud Verification", () => {
  it("creates employee and payroll payment in local SQLite only, pushes via sync worker, and confirms cloud persistence", async () => {
    const tenantId = "2a547d0e-4a0b-49e5-a7be-34071934c61d";
    const sucursalId = "2933e7b6-21df-4bbc-8fc7-fa6e39da4df5";
    const userDataDirectory = path.join(os.homedir(), "AppData", "Roaming", "Cloudix");

    console.log("\n=======================================================");
    console.log("🖥️ [PASO 1] CREANDO REGISTROS EN SQLITE LOCAL (DESKTOP)");
    console.log("=======================================================");

    const store = TenantStore.open({ dataRoot: userDataDirectory, tenantId });
    const db = store.getDatabase();
    const repo = new PayrollRepository(db);

    // 1. Crear Empleado Localmente en SQLite
    const employeeId = crypto.randomUUID();
    repo.upsertEmployee(tenantId, sucursalId, {
      id: employeeId,
      firstName: "Marleny",
      lastName: "Francisco",
      role: "Asistente de Cocina",
      baseSalaryCents: 3200000,
      frequency: "biweekly",
      isActive: true,
    });
    console.log(`✔ [LOCAL SQLITE] Empleado creado en SQLite: Marleny Francisco (ID: ${employeeId})`);

    // 2. Crear Pago de Nómina Localmente en SQLite
    const payResult = repo.createPayment(tenantId, sucursalId, {
      employeeId,
      period: "2026-08-2",
      frequency: "biweekly",
      paymentAmountCents: 1600000,
      receiptSnapshot: JSON.stringify({ period: "2026-08-2", amount: 16000, role: "Asistente de Cocina" }),
      adjustments: [],
    });
    console.log(`✔ [LOCAL SQLITE] Pago registrado en SQLite: ID=${payResult.paymentId}`);
    console.log(`✔ [LOCAL SQLITE] Gasto registrado en SQLite: ID=${payResult.expenseId}`);

    console.log("\n=======================================================");
    console.log("🔐 [PASO 2] AUTENTICANDO CON test@test.com Y CORRIENDO SYNC WORKER");
    console.log("=======================================================");

    const { data: authData, error: authError } = await insforgeClient.auth.signInWithPassword({
      email: "test@test.com",
      password: "lia2026",
    });
    expect(authError).toBeNull();
    const accessToken = authData.accessToken;
    console.log(`✔ Autenticado como test@test.com | Token obtenido.`);

    // 3. Ejecutar sincronización de fondo con DurableSyncWorker
    const syncClient = new PayrollSyncClient(undefined, accessToken);
    const syncStore = new SQLitePayrollSyncStore(db, tenantId);
    const worker = new DurableSyncWorker(syncStore, syncClient, tenantId);

    console.log("⏳ Sincronizando operaciones pendientes hacia la nube...");
    await worker.push();
    console.log("✔ Sincronización de fondo completada.");

    console.log("\n=======================================================");
    console.log("☁️ [PASO 3] CONSULTANDO BASE DE DATOS CLOUD (POSTGRESQL)");
    console.log("=======================================================");

    // Consultar Empleado en Cloud
    const { data: cloudEmp, error: empErr } = await insforgeClient.database
      .from("nomina_empleados")
      .select("*")
      .eq("id", employeeId)
      .single();

    expect(empErr).toBeNull();
    console.log("✔ [CLOUD ENCONTRADO] Empleado en nomina_empleados:", {
      id: cloudEmp.id,
      nombre: cloudEmp.nombre_completo,
      cargo: cloudEmp.cargo,
      salario_base_mensual: cloudEmp.salario_base_mensual,
      frecuencia_pago: cloudEmp.frecuencia_pago,
    });

    // Consultar Pago en Cloud
    const { data: cloudPay, error: payErr } = await insforgeClient.database
      .from("nomina_pagos")
      .select("*")
      .eq("id", payResult.paymentId)
      .single();

    expect(payErr).toBeNull();
    console.log("✔ [CLOUD ENCONTRADO] Pago en nomina_pagos:", {
      id: cloudPay.id,
      periodo: cloudPay.periodo,
      monto_pagado: cloudPay.monto_pagado,
    });

    // Consultar Gasto en Cloud
    const { data: cloudGasto, error: gastoErr } = await insforgeClient.database
      .from("gastos")
      .select("*")
      .eq("id", payResult.expenseId)
      .single();

    expect(gastoErr).toBeNull();
    console.log("✔ [CLOUD ENCONTRADO] Gasto en gastos:", {
      id: cloudGasto.id,
      descripcion: cloudGasto.descripcion,
      monto: cloudGasto.monto,
      metodo_pago: cloudGasto.metodo_pago,
      payroll_payment_id: cloudGasto.payroll_payment_id,
    });

    // Verificar estado en SQLite local
    const localEmployee = db.prepare("SELECT * FROM payroll_employees WHERE id = ?").get(employeeId) as any;
    const localPayment = db.prepare("SELECT * FROM payroll_payments WHERE id = ?").get(payResult.paymentId) as any;
    const localGasto = db.prepare("SELECT * FROM gastos WHERE id = ?").get(payResult.expenseId) as any;

    console.log("\n=======================================================");
    console.log("📊 [PASO 4] COMPARATIVA FINAL LOCAL VS CLOUD");
    console.log("=======================================================");
    console.log("1. EMPLEADO:");
    console.log("   - Local SQLite:  ", `${localEmployee.first_name} ${localEmployee.last_name} (${localEmployee.role}) - Salario: ${localEmployee.base_salary_cents}`);
    console.log("   - Cloud Postgres:", `${cloudEmp.nombre_completo} (${cloudEmp.cargo}) - Salario: ${cloudEmp.salario_base_mensual}`);
    console.log("2. PAGO:");
    console.log("   - Local SQLite:  ", `Periodo: ${localPayment.period}, Pagado: ${localPayment.payment_amount_cents}`);
    console.log("   - Cloud Postgres:", `Periodo: ${cloudPay.periodo}, Pagado: ${cloudPay.monto_pagado}`);
    console.log("3. GASTO:");
    console.log("   - Local SQLite:  ", `Descripción: ${localGasto.description}, Monto: ${localGasto.amount_cents}`);
    console.log("   - Cloud Postgres:", `Descripción: ${cloudGasto.descripcion}, Monto: ${cloudGasto.monto}`);

    store.close();
  });
});
