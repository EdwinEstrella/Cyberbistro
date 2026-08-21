import { useState, useEffect } from "react";
import { useAuth } from "../../shared/hooks/useAuth";
import { useSucursal } from "../../app/context/SucursalContext";
import { executePayrollCommandLocally } from "../../shared/lib/payrollUiAdapter";
import type { PayrollEmployee } from "../../shared/lib/payrollContracts";

export function Nomina() {
  const { tenantId } = useAuth();
  const { activeSucursalId: sucursalId } = useSucursal();
  const [activeTab, setActiveTab] = useState<"empleados" | "pagos">("empleados");

  const [empleados, setEmpleados] = useState<PayrollEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (tenantId && sucursalId && activeTab === "empleados") {
      fetchEmpleados();
    }
  }, [tenantId, sucursalId, activeTab]);

  const fetchEmpleados = async () => {
    if (!tenantId || !sucursalId) return;
    setIsLoading(true);
    try {
      const res = await executePayrollCommandLocally({
        type: "GET_EMPLOYEES",
        tenantId,
        sucursalId
      });
      if (res.type === "EMPLOYEES_LIST") {
        setEmpleados(res.employees);
      }
    } catch (e) {
      console.error("Error fetching empleados:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCrearEmpleado = async () => {
    if (!tenantId || !sucursalId) return;
    try {
      await executePayrollCommandLocally({
        type: "UPSERT_EMPLOYEE",
        tenantId,
        sucursalId,
        employee: {
          firstName: "Juan",
          lastName: "Perez",
          role: "Cocinero",
          baseSalary: 15000,
          frequency: "biweekly",
          isActive: true
        }
      });
      fetchEmpleados();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCrearPago = async (empleadoId: string) => {
    if (!tenantId || !sucursalId) return;
    try {
      await executePayrollCommandLocally({
        type: "CREATE_PAYMENT",
        tenantId,
        sucursalId,
        payload: {
          employeeId: empleadoId,
          period: "2026-08-15",
          frequency: "biweekly",
          baseAmount: 7500,
          amountPaid: 7500,
          pendingAmount: 0,
          receiptSnapshot: "Pago completado via UI",
          adjustments: [
            {
              kind: "deduction",
              type: "tardanza",
              amount: 50,
              note: "Tardanza lunes",
              applyMode: "auto"
            }
          ]
        }
      });
      alert("Pago creado");
    } catch (e) {
      console.error(e);
    }
  };

  if (!tenantId) {
    return <div className="p-6">Cargando sesin...</div>;
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Mdulo de Nmina</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("empleados")}
            className={`px-4 py-2 rounded ${activeTab === "empleados" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Empleados
          </button>
          <button
            onClick={() => setActiveTab("pagos")}
            className={`px-4 py-2 rounded ${activeTab === "pagos" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Pagos / Recibos
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white p-4 rounded-md border shadow">
        {activeTab === "empleados" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Listado de Empleados</h2>
              <button 
                className="bg-green-600 text-white px-4 py-2 rounded"
                onClick={handleCrearEmpleado}
              >
                Nuevo Empleado (Demo)
              </button>
            </div>
            
            {isLoading ? (
              <p>Cargando empleados...</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Nombre</th>
                    <th className="py-2">Cargo</th>
                    <th className="py-2">Salario Base</th>
                    <th className="py-2">Frecuencia</th>
                    <th className="py-2">Estado</th>
                    <th className="py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((e) => (
                    <tr key={e.id} className="border-b">
                      <td className="py-2">{e.firstName} {e.lastName}</td>
                      <td className="py-2">{e.role}</td>
                      <td className="py-2">${e.baseSalary}</td>
                      <td className="py-2">{e.frequency}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-xs ${e.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {e.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="py-2">
                        <button 
                          className="text-blue-600 hover:underline mr-2"
                          onClick={() => handleCrearPago(e.id)}
                        >
                          Pagar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {empleados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-gray-500">
                        No hay empleados registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "pagos" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Flujo de Pagos</h2>
            <p className="text-gray-600">
              Aqu se gestionarǭ la nmina quincenal o mensual, permitiendo pagos completos, parciales y visualizacin de comprobantes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
