import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";
import { insforgeClient } from "../src/shared/lib/insforge";
import { TenantStore } from "../electron/persistence/tenantStore";
import { PayrollRepository } from "../electron/persistence/payrollRepository";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

describe("Local-First Flow: Create Locally in SQLite -> Auto-Sync to Cloud -> Compare", () => {
  it("creates employee and payment strictly in SQLite local, syncs via background sync client, and verifies cloud", async () => {
    const tenantId = "2a547d0e-4a0b-49e5-a7be-34071934c61d";
    const sucursalId = "2933e7b6-21df-4bbc-8fc7-fa6e39da4df5";
    const userDataDirectory = path.join(os.homedir(), "AppData", "Roaming", "Cloudix");

    console.log("\n=======================================================");
    console.log("🖥️ [PASO 1] CREANDO EN SQLITE LOCAL (NADA EN LA NUBE DIRECTO)");
    console.log("=======================================================");

    const store = TenantStore.open({ dataRoot: userDataDirectory, tenantId });
    const db = store.getDatabase();
    const repo = new PayrollRepository(db);

    // 1. Crear Empleado SOLO en SQLite Local (se guarda en tabla y se encola en sync_outbox)
    const empId = crypto.randomUUID();
    repo.upsertEmployee(tenantId, sucursalId, {
      id: empId,
      firstName: "David",
      lastName: "Almonte",
      role: "Capitán de Meseros",
      baseSalaryCents: 3500000, // RD$ 35,000.00
      frequency: "biweekly",
      isActive: true,
    });
    console.log(`✔ [LOCAL SQLITE] Empleado guardado: David Almonte (ID: ${empId})`);

    // 2. Crear Pago de Nómina SOLO en SQLite Local (genera pago + gasto + encola en sync_outbox)
    const payRes = repo.createPayment(tenantId, sucursalId, {
      employeeId: empId,
      period: "2026-08-2",
      frequency: "biweekly",
      paymentAmountCents: 1750000, // RD$ 17,500.00
      receiptSnapshot: JSON.stringify({ period: "2026-08-2", amount: 17500 }),
      adjustments: [],
    });
    console.log(`✔ [LOCAL SQLITE] Pago registrado: PaymentId=${payRes.paymentId}, GastoId=${payRes.expenseId}, Monto=RD$ 17,500.00`);

    // Verificar que están en cola local de sync_outbox
    const pendingOutbox = db.prepare(
      "SELECT id, table_name, row_id, status FROM sync_outbox WHERE tenant_id = ? AND status = 'pending'"
    ).all(tenantId) as any[];
    console.log(`📦 [LOCAL SQLITE] Registros en cola 'sync_outbox' listos para subir: ${pendingOutbox.length} pendientes`);
    expect(pendingOutbox.length).toBeGreaterThanOrEqual(3);

    console.log("\n=======================================================");
    console.log("🔐 [PASO 2] AUTENTICANDO CON test@test.com Y CORRIENDO SYNC");
    console.log("=======================================================");

    const { data: authData, error: authError } = await insforgeClient.auth.signInWithPassword({
      email: "test@test.com",
      password: "lia2026",
    });
    expect(authError).toBeNull();
    const accessToken = authData!.session?.accessToken || authData!.session?.token || (authData as any).token;
    console.log(`✔ [AUTH] Autenticado como test@test.com | Token obtenido.`);

    // 3. Ejecutar el worker real de sincronización con el token autenticado
    const syncClient = new PayrollSyncClient(undefined, accessToken);

    const syncStore = new SQLitePayrollSyncStore(db, tenantId);
    const worker = new DurableSyncWorker(syncStore, syncClient, tenantId);

    console.log("⏳ [SYNC] Vaciando la cola de sync_outbox hacia la nube InsForge...");
    await worker.push();

    console.log("\n=======================================================");
    console.log("☁️ [PASO 3] VERIFICANDO LA BASE DE DATOS CLOUD (POSTGRESQL)");
    console.log("=======================================================");

    // Consultar la base de datos cloud para verificar que los datos locales subieron
    const { data: cloudEmp, error: empErr } = await insforgeClient.database
      .from("nomina_empleados")
      .select("*")
      .eq("id", empId)
      .single();
    expect(empErr).toBeNull();
    console.log("✔ [CLOUD ENCONTRADO] Empleado en 'nomina_empleados':", {
      id: cloudEmp.id,
      nombre: cloudEmp.nombre_completo,
      cargo: cloudEmp.cargo,
      salario: cloudEmp.salario_base_mensual,
      activo: cloudEmp.activo,
    });

    const { data: cloudPay, error: payErr } = await insforgeClient.database
      .from("nomina_pagos")
      .select("*")
      .eq("id", payRes.paymentId)
      .single();
    expect(payErr).toBeNull();
    console.log("✔ [CLOUD ENCONTRADO] Pago en 'nomina_pagos':", {
      id: cloudPay.id,
      periodo: cloudPay.periodo,
      monto_pagado: cloudPay.monto_pagado,
    });

    const { data: cloudGasto, error: gastoErr } = await insforgeClient.database
      .from("gastos")
      .select("*")
      .eq("id", payRes.expenseId)
      .single();
    expect(gastoErr).toBeNull();
    console.log("✔ [CLOUD ENCONTRADO] Gasto en 'gastos':", {
      id: cloudGasto.id,
      descripcion: cloudGasto.descripcion,
      monto: cloudGasto.monto,
      payroll_payment_id: cloudGasto.payroll_payment_id,
    });

    store.close();

    console.log("\n=======================================================");
    console.log("🎉 PRUEBA 100% EXITOSA: CREADO EN LOCAL -> SINCRONIZADO EN CLOUD");
    console.log("=======================================================\n");
  });
});
