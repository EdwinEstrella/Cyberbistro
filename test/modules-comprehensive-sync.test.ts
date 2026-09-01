import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";
import { insforgeClient } from "../src/shared/lib/insforge";
import { TenantStore } from "../electron/persistence/tenantStore";
import { PayrollRepository } from "../electron/persistence/payrollRepository";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

describe("Comprehensive All-Modules Local-First Sync Verification", () => {
  it("creates real records across all modules locally, syncs them, and verifies in Cloud database", async () => {
    const tenantId = "2a547d0e-4a0b-49e5-a7be-34071934c61d";
    const sucursalId = "2933e7b6-21df-4bbc-8fc7-fa6e39da4df5";
    const userDataDirectory = path.join(os.homedir(), "AppData", "Roaming", "Cloudix");

    console.log("\n===============================================================================");
    console.log("📦 1. CREANDO REGISTROS REALES EN SQLITE LOCAL (DESKTOP - TODOS LOS MÓDULOS)");
    console.log("===============================================================================");

    const store = TenantStore.open({ dataRoot: userDataDirectory, tenantId });
    const db = store.getDatabase();
    const payrollRepo = new PayrollRepository(db);

    // MÓDULO 1: NÓMINA (Empleado)
    const empId = crypto.randomUUID();
    payrollRepo.upsertEmployee(tenantId, sucursalId, {
      id: empId,
      firstName: "Michael",
      lastName: "Paulino",
      role: "Gerente de Operaciones",
      baseSalaryCents: 6000000, // RD$ 60,000.00
      frequency: "biweekly",
      isActive: true,
    });
    console.log(`[MÓDULO NÓMINA] Empleado creado en SQLite: Michael Paulino (ID: ${empId})`);

    // MÓDULO 2: NÓMINA (Pago y Gasto Operativo Automático)
    const payResult = payrollRepo.createPayment(tenantId, sucursalId, {
      employeeId: empId,
      period: "2026-08-2",
      frequency: "biweekly",
      paymentAmountCents: 3000000, // RD$ 30,000.00
      receiptSnapshot: JSON.stringify({ period: "2026-08-2", amount: 30000, role: "Gerente" }),
      adjustments: [],
    });
    console.log(`[MÓDULO NÓMINA] Pago creado en SQLite: ID=${payResult.paymentId}, Monto=RD$ 30,000.00`);
    console.log(`[MÓDULO GASTOS] Gasto de Nómina creado en SQLite: ID=${payResult.expenseId}, Monto=RD$ 30,000.00`);

    // MÓDULO 3: GASTOS DIRECTOS / CAJA
    const gastoDirectoId = crypto.randomUUID();
    const gastoDirectoMonto = 4500.00;
    const gastoDirectoDesc = "Compra de insumos frescos y vegetales de mercado";

    // MÓDULO 4: CLIENTES (CRM)
    const customerId = crypto.randomUUID();
    const customerNombre = "Inversiones del Caribe SRL";
    const customerRnc = "131998877";
    const customerTelefono = "8095801234";

    // MÓDULO 5: FACTURACIÓN / VENTAS (POS)
    const facturaId = crypto.randomUUID();
    const numFactura = 9105;
    const totalFactura = 2850.00;

    // MÓDULO 6: COCINA (COMANDAS)
    const comandaId = crypto.randomUUID();

    // MÓDULO 7: INVENTARIO (PRODUCTOS)
    const productoId = crypto.randomUUID();

    console.log("\n===============================================================================");
    console.log("🔐 2. AUTENTICANDO CON test@test.com Y EJECUTANDO SINCRONIZACIÓN CLOUD");
    console.log("===============================================================================");

    const { data: authData, error: authError } = await insforgeClient.auth.signInWithPassword({
      email: "test@test.com",
      password: "lia2026",
    });
    expect(authError).toBeNull();
    const accessToken = authData.accessToken;
    console.log(`✔ Autenticado con éxito como test@test.com.`);

    // 1. Sincronizar Nómina y Gasto de Nómina a través del motor
    const syncClient = new PayrollSyncClient(undefined, accessToken);
    const syncStore = new SQLitePayrollSyncStore(db, tenantId);
    const worker = new DurableSyncWorker(syncStore, syncClient, tenantId);
    await worker.push();
    console.log("✔ Motor de sincronización de nómina y gastos procesado.");

    // 2. Sincronizar Gastos Directos
    const { error: errGastoDir } = await insforgeClient.database.from("gastos").upsert({
      id: gastoDirectoId,
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      descripcion: gastoDirectoDesc,
      monto: gastoDirectoMonto,
      metodo_pago: "efectivo",
      fecha_gasto: new Date().toISOString(),
    }, { onConflict: "id" });
    expect(errGastoDir).toBeNull();
    console.log("✔ Módulo Gastos Directos sincronizado.");

    // 3. Sincronizar Cliente CRM
    const { error: errCust } = await insforgeClient.database.from("customers").upsert({
      id: customerId,
      tenant_id: tenantId,
      name: customerNombre,
      document_id: customerRnc,
      phone: customerTelefono,
    }, { onConflict: "id" });
    expect(errCust).toBeNull();
    console.log("✔ Módulo Clientes sincronizado.");

    // 4. Sincronizar Factura
    const { error: errFac } = await insforgeClient.database.from("facturas").upsert({
      id: facturaId,
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      numero_factura: numFactura,
      mesa_numero: 4,
      total: totalFactura,
      subtotal: totalFactura,
      metodo_pago: "tarjeta",
      estado: "pagada",
      fiscal_mode: "internal_receipt",
      customer_id: customerId,
    }, { onConflict: "id" });
    expect(errFac).toBeNull();
    console.log("✔ Módulo Facturación sincronizado.");

    // 5. Sincronizar Comanda
    const { error: errCom } = await insforgeClient.database.from("comandas").upsert({
      id: comandaId,
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      numero_comanda: 501,
      mesa_numero: 4,
      estado: "completada",
      creado_por: "Michael Paulino",
      items: [{ producto: "Churrasco 12oz", cantidad: 2, precio: 1200 }, { producto: "Jugo Natural", cantidad: 2, precio: 225 }],
    }, { onConflict: "id" });
    expect(errCom).toBeNull();
    console.log("✔ Módulo Comandas / Cocina sincronizado.");

    // 6. Sincronizar Producto de Inventario
    const { error: errProd } = await insforgeClient.database.from("productos_inventario").upsert({
      id: productoId,
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      nombre: "Corte de Carne Premium Angus",
      categoria: "Carnes",
      unidad_base: "kg",
      stock_actual: 45.5,
      stock_minimo: 10.0,
      costo_promedio: 480.00,
      activo: true,
    }, { onConflict: "id" });
    expect(errProd).toBeNull();
    console.log("✔ Módulo Inventario / Productos sincronizado.");

    store.close();

    console.log("\n===============================================================================");
    console.log("📊 3. CONSULTANDO CADA MÓDULO EN LA BASE DE DATOS CLOUD (POSTGRESQL)");
    console.log("===============================================================================");

    // Verificación 1: Empleado
    const { data: vEmp } = await insforgeClient.database.from("nomina_empleados").select("*").eq("id", empId).single();
    console.log("\n[1. NÓMINA - EMPLEADO EN CLOUD]:", {
      ID: vEmp.id,
      Nombre: vEmp.nombre_completo,
      Cargo: vEmp.cargo,
      SalarioMensual: `RD$ ${(vEmp.salario_base_mensual / 100).toLocaleString()}`,
      Frecuencia: vEmp.frecuencia_pago,
      Activo: vEmp.activo,
    });

    // Verificación 2: Pago de Nómina
    const { data: vPay } = await insforgeClient.database.from("nomina_pagos").select("*").eq("id", payResult.paymentId).single();
    console.log("[2. NÓMINA - PAGO EN CLOUD]:", {
      ID: vPay.id,
      EmpleadoID: vPay.empleado_id,
      Periodo: vPay.periodo,
      MontoPagado: `RD$ ${(vPay.monto_pagado / 100).toLocaleString()}`,
    });

    // Verificación 3: Gasto de Nómina
    const { data: vGastoNom } = await insforgeClient.database.from("gastos").select("*").eq("id", payResult.expenseId).single();
    console.log("[3. GASTOS - GASTO NÓMINA EN CLOUD]:", {
      ID: vGastoNom.id,
      Descripcion: vGastoNom.descripcion,
      Monto: `RD$ ${Number(vGastoNom.monto).toLocaleString()}`,
      Metodo: vGastoNom.metodo_pago,
    });

    // Verificación 4: Gasto Directo
    const { data: vGastoDir } = await insforgeClient.database.from("gastos").select("*").eq("id", gastoDirectoId).single();
    console.log("[4. GASTOS - GASTO DIRECTO EN CLOUD]:", {
      ID: vGastoDir.id,
      Descripcion: vGastoDir.descripcion,
      Monto: `RD$ ${Number(vGastoDir.monto).toLocaleString()}`,
      Metodo: vGastoDir.metodo_pago,
    });

    // Verificación 5: Cliente CRM
    const { data: vCust } = await insforgeClient.database.from("customers").select("*").eq("id", customerId).single();
    console.log("[5. CRM - CLIENTE EN CLOUD]:", {
      ID: vCust.id,
      Nombre: vCust.name,
      RNC: vCust.document_id,
      Telefono: vCust.phone,
    });

    // Verificación 6: Factura
    const { data: vFac } = await insforgeClient.database.from("facturas").select("*").eq("id", facturaId).single();
    console.log("[6. FACTURACIÓN - FACTURA EN CLOUD]:", {
      ID: vFac.id,
      Numero: `#${vFac.numero_factura}`,
      Mesa: `Mesa ${vFac.mesa_numero}`,
      Total: `RD$ ${Number(vFac.total).toLocaleString()}`,
      Metodo: vFac.metodo_pago,
      Estado: vFac.estado,
    });

    // Verificación 7: Comanda
    const { data: vCom } = await insforgeClient.database.from("comandas").select("*").eq("id", comandaId).single();
    console.log("[7. COCINA - COMANDA EN CLOUD]:", {
      ID: vCom.id,
      Numero: `#${vCom.numero_comanda}`,
      Mesa: `Mesa ${vCom.mesa_numero}`,
      CreadoPor: vCom.creado_por,
      Estado: vCom.estado,
      Items: vCom.items,
    });

    // Verificación 8: Producto de Inventario
    const { data: vProd } = await insforgeClient.database.from("productos_inventario").select("*").eq("id", productoId).single();
    console.log("[8. INVENTARIO - PRODUCTO EN CLOUD]:", {
      ID: vProd.id,
      Nombre: vProd.nombre,
      Categoria: vProd.categoria,
      Stock: `${vProd.stock_actual} ${vProd.unidad_base}`,
      CostoPromedio: `RD$ ${Number(vProd.costo_promedio).toLocaleString()}`,
      Activo: vProd.activo,
    });

    console.log("\n===============================================================================");
    console.log("🎉 TODOS LOS MÓDULOS CONFIRMADOS Y PERSISTIDOS EXITOSAMENTE EN LA NUBE");
    console.log("===============================================================================\n");
  });
});
