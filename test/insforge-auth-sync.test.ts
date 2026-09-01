import { describe, it, expect } from "vitest";
import { insforgeClient } from "../src/shared/lib/insforge";

describe("InsForge Auth & Live CRUD Synchronization for test@test.com", () => {
  it("authenticates as test@test.com and creates records in nomina_empleados, facturas, and gastos", async () => {
    console.log("\n=======================================================");
    console.log("🔐 [1/5] Autenticando con test@test.com / lia2026...");
    console.log("=======================================================");

    const { data: authData, error: authError } = await insforgeClient.auth.signInWithPassword({
      email: "test@test.com",
      password: "lia2026",
    });

    expect(authError).toBeNull();
    expect(authData?.user).toBeTruthy();
    console.log("✔ [1/5] Autenticado exitosamente. User ID:", authData?.user?.id);
    const userId = authData!.user!.id;
    const tenantId = "2a547d0e-4a0b-49e5-a7be-34071934c61d";

    console.log("⏳ [2/5] Consultando sucursal del tenant...");
    const { data: sucursales, error: sucErr } = await insforgeClient.database
      .from("sucursales")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1);

    expect(sucErr).toBeNull();
    const sucursalId = sucursales?.[0]?.id || "2a547d0e-4a0b-49e5-a7be-34071934c61d";
    console.log("✔ [2/5] Sucursal ID:", sucursalId);

    console.log("⏳ [3/5] Insertando empleado en 'nomina_empleados'...");
    const testEmployeeId = crypto.randomUUID();
    const { data: empData, error: empError } = await insforgeClient.database
      .from("nomina_empleados")
      .insert([
        {
          id: testEmployeeId,
          tenant_id: tenantId,
          sucursal_id: sucursalId,
          nombre_completo: "Empleado Test Sync",
          identificacion: testEmployeeId,
          cargo: "Chef de Prueba",
          salario_base_mensual: 5000000,
          frecuencia_pago: "quincenal",
          activo: true,
        },
      ]);

    console.log("Resultado inserción nomina_empleados:", { empError });
    expect(empError).toBeNull();
    console.log("✔ [3/5] Empleado insertado en Cloud sin error RLS!");

    console.log("⏳ [4/5] Insertando factura en 'facturas'...");
    const testFacturaId = crypto.randomUUID();
    const { data: facData, error: facError } = await insforgeClient.database
      .from("facturas")
      .insert([
        {
          id: testFacturaId,
          tenant_id: tenantId,
          sucursal_id: sucursalId,
          numero_factura: 99999,
          mesa_numero: 1,
          total: 1500,
          subtotal: 1500,
          metodo_pago: "efectivo",
          estado: "pagada",
          fiscal_mode: "internal_receipt",
        },
      ]);

    console.log("Resultado inserción facturas:", { facError });
    expect(facError).toBeNull();
    console.log("✔ [4/5] Factura insertada en Cloud sin error!");

    console.log("⏳ [5/5] Insertando gasto en 'gastos'...");
    const testGastoId = crypto.randomUUID();
    const { data: gastoData, error: gastoError } = await insforgeClient.database
      .from("gastos")
      .insert([
        {
          id: testGastoId,
          tenant_id: tenantId,
          sucursal_id: sucursalId,
          descripcion: "Gasto de prueba de sincronizacion",
          monto: 1500,
          metodo_pago: "efectivo",
          fecha_gasto: new Date().toISOString(),
        },
      ]);

    console.log("Resultado inserción gastos:", { gastoError });
    expect(gastoError).toBeNull();
    console.log("✔ [5/5] Gasto insertado en Cloud sin error!");

    console.log("🧹 Limpiando registros de prueba...");
    await insforgeClient.database.from("gastos").delete().eq("id", testGastoId);
    await insforgeClient.database.from("facturas").delete().eq("id", testFacturaId);
    await insforgeClient.database.from("nomina_empleados").delete().eq("id", testEmployeeId);

    console.log("=======================================================");
    console.log("🎉 TODAS LAS OPERACIONES CLOUD VERIFICADAS EXITOSAMENTE CON test@test.com");
    console.log("=======================================================");
  });
});
