import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Users,
  UserPlus,
  DollarSign,
  Calendar,
  CreditCard,
  Plus,
  Trash2,
  Edit3,
  Printer,
  Search,
  RefreshCw,
  X,
  AlertCircle,
  TrendingUp,
  Receipt,
  UserX,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "../../shared/hooks/useAuth";
import { useSucursal } from "../../app/context/SucursalContext";
import { executePayrollCommandLocally } from "../../shared/lib/payrollUiAdapter";
import { ConfirmModal } from "../../shared/components/ConfirmModal";
import type {
  PayrollCreatePaymentRequest,
  PayrollEmployee,
  PayrollEmployeeDraft,
  PayrollFrequency,
  PayrollPaymentAdjustment,
  PayrollPaymentContext,
} from "../../shared/lib/payrollContracts";

const emptyEmployeeDraft: PayrollEmployeeDraft = {
  firstName: "",
  lastName: "",
  role: "",
  baseSalaryCents: 0,
  frequency: "monthly",
  isActive: true,
};

const emptyAdjustmentDraft = {
  kind: "bonus" as const,
  type: "",
  scope: "currentPayment" as const,
  amountInput: "",
  note: "",
};

type AdjustmentDraft = {
  kind: PayrollPaymentAdjustment["kind"];
  type: string;
  scope: PayrollPaymentAdjustment["scope"];
  amountInput: string;
  note: string;
};

type ReceiptState = {
  employee: PayrollEmployee;
  paymentId: string;
  expenseId: string;
  period: string;
  paymentAmountCents: number;
  context: PayrollPaymentContext;
  adjustments: PayrollPaymentAdjustment[];
};

export function Nomina() {
  const { tenantId } = useAuth();
  const { activeSucursalId } = useSucursal();

  // Navigation
  const [activeTab, setActiveTab] = useState<"empleados" | "pagar" | "recibos">("empleados");

  // Data state
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [paying, setPaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState<string>("all");

  // Employee Modal
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeDraft, setEmployeeDraft] = useState<PayrollEmployeeDraft>(emptyEmployeeDraft);
  const [employeeMessage, setEmployeeMessage] = useState<string>("");

  // Confirm Modal for Deactivation
  const [confirmDeactivate, setConfirmDeactivate] = useState<{
    open: boolean;
    employeeId: string;
    employeeName: string;
  }>({ open: false, employeeId: "", employeeName: "" });

  // Payment Calculation State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [paymentMessage, setPaymentMessage] = useState<string>("");
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string>("");
  const [paymentContext, setPaymentContext] = useState<PayrollPaymentContext | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>("");
  const [periodMonth, setPeriodMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [periodHalf, setPeriodHalf] = useState<"1" | "2">("1");
  const [periodWeek, setPeriodWeek] = useState<string>(toWeekInputValue(new Date()));
  const [adjustmentDraft, setAdjustmentDraft] = useState<AdjustmentDraft>(emptyAdjustmentDraft);
  const [adjustments, setAdjustments] = useState<PayrollPaymentAdjustment[]>([]);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );

  const selectedFrequency = selectedEmployee?.frequency ?? "monthly";
  const periodValue = useMemo(
    () => buildPeriodValue(selectedFrequency, periodMonth, periodHalf, periodWeek),
    [selectedFrequency, periodHalf, periodMonth, periodWeek],
  );
  const paymentAmountCents = useMemo(() => currencyInputToCents(paymentAmountInput), [paymentAmountInput]);

  // Load employees list
  const loadEmployees = useCallback(async () => {
    if (!tenantId || !activeSucursalId) return;
    setLoading(true);
    try {
      const result = await executePayrollCommandLocally({
        type: "payroll.getEmployees",
        tenantId,
        sucursalId: activeSucursalId,
      });
      if (result.type === "payroll.employees") {
        setEmployees(result.employees);
        if (!selectedEmployeeId && result.employees.length > 0) {
          const firstActive = result.employees.find((e) => e.isActive) ?? result.employees[0];
          setSelectedEmployeeId(firstActive.id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [activeSucursalId, selectedEmployeeId, tenantId]);

  useEffect(() => {
    if (!tenantId || !activeSucursalId) return;
    void loadEmployees();
  }, [tenantId, activeSucursalId, loadEmployees]);

  // Fetch payment calculation context in real-time
  useEffect(() => {
    setPaymentContext(null);
    setPaymentMessage("");
    if (!tenantId || !activeSucursalId || !selectedEmployee || !periodValue) return;

    let cancelled = false;
    void executePayrollCommandLocally({
      type: "payroll.getPaymentContext",
      tenantId,
      sucursalId: activeSucursalId,
      payload: {
        employeeId: selectedEmployee.id,
        period: periodValue,
        frequency: selectedEmployee.frequency,
        adjustments,
      },
    })
      .then((result) => {
        if (cancelled || result.type !== "payroll.paymentContext") return;
        setPaymentContext(result.context);
        if (paymentAmountInput.trim().length === 0) {
          setPaymentAmountInput(centsToCurrencyInput(result.context.pendingCents));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPaymentContext(null);
          setPaymentMessage(error instanceof Error ? error.message : "No se pudo calcular el balance de nómina.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSucursalId, adjustments, paymentAmountInput, periodValue, selectedEmployee, tenantId]);

  // KPI Statistics
  const stats = useMemo(() => {
    const total = employees.length;
    const activos = employees.filter((e) => e.isActive).length;
    const mensualEstimado = employees.reduce((sum, emp) => {
      if (!emp.isActive) return sum;
      const base = emp.baseSalaryCents || 0;
      if (emp.frequency === "monthly") return sum + base;
      if (emp.frequency === "biweekly") return sum + base * 2;
      if (emp.frequency === "weekly") return sum + Math.round((base * 52) / 12);
      return sum + base;
    }, 0);

    return { total, activos, inactivos: total - activos, mensualEstimado };
  }, [employees]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchSearch =
        searchQuery.trim() === "" ||
        `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.role.toLowerCase().includes(searchQuery.toLowerCase());

      const matchFrequency = frequencyFilter === "all" || emp.frequency === frequencyFilter;
      return matchSearch && matchFrequency;
    });
  }, [employees, searchQuery, frequencyFilter]);

  // Open modal to create new employee
  function handleOpenNewEmployee() {
    setEmployeeDraft(emptyEmployeeDraft);
    setEmployeeMessage("");
    setIsEmployeeModalOpen(true);
  }

  // Open modal to edit existing employee
  function handleOpenEditEmployee(employee: PayrollEmployee) {
    setEmployeeDraft({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      baseSalaryCents: employee.baseSalaryCents,
      frequency: employee.frequency,
      isActive: employee.isActive,
    });
    setEmployeeMessage("");
    setIsEmployeeModalOpen(true);
  }

  // Direct action to pay an employee from the table
  function handleDirectPay(employee: PayrollEmployee) {
    setSelectedEmployeeId(employee.id);
    setActiveTab("pagar");
  }

  // Save employee (create or update)
  async function handleSaveEmployee(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !activeSucursalId) return;

    if (!employeeDraft.firstName.trim()) {
      setEmployeeMessage("El nombre del empleado es obligatorio.");
      return;
    }
    if (!employeeDraft.lastName.trim()) {
      setEmployeeMessage("El apellido del empleado es obligatorio.");
      return;
    }
    if (!employeeDraft.role.trim()) {
      setEmployeeMessage("El cargo o puesto es obligatorio.");
      return;
    }
    if (employeeDraft.baseSalaryCents <= 0) {
      setEmployeeMessage("El salario base debe ser mayor a 0.");
      return;
    }

    setSavingEmployee(true);
    setEmployeeMessage("");
    try {
      const result = await executePayrollCommandLocally({
        type: "payroll.upsertEmployee",
        tenantId,
        sucursalId: activeSucursalId,
        employee: employeeDraft,
      });

      if (result.type === "payroll.employeeSaved") {
        await loadEmployees();
        setIsEmployeeModalOpen(false);
        setEmployeeDraft(emptyEmployeeDraft);
      }
    } catch (error) {
      setEmployeeMessage(error instanceof Error ? error.message : "Error al guardar el empleado.");
    } finally {
      setSavingEmployee(false);
    }
  }

  // Confirm and disable employee
  async function handleConfirmDisable() {
    if (!tenantId || !activeSucursalId || !confirmDeactivate.employeeId) return;
    try {
      await executePayrollCommandLocally({
        type: "payroll.disableEmployee",
        tenantId,
        sucursalId: activeSucursalId,
        employeeId: confirmDeactivate.employeeId,
      });
      await loadEmployees();
    } finally {
      setConfirmDeactivate({ open: false, employeeId: "", employeeName: "" });
    }
  }

  // Adjustments handling
  function handleAddAdjustment() {
    const amountCents = currencyInputToCents(adjustmentDraft.amountInput);
    if (!adjustmentDraft.type.trim()) {
      setPaymentMessage("El concepto del ajuste es obligatorio.");
      return;
    }
    if (amountCents <= 0) {
      setPaymentMessage("El monto del ajuste debe ser mayor a 0.");
      return;
    }
    if (adjustmentDraft.kind === "discount" && !adjustmentDraft.note.trim()) {
      setPaymentMessage("La nota explicativa es obligatoria para los descuentos.");
      return;
    }

    setAdjustments((current) => [
      ...current,
      {
        kind: adjustmentDraft.kind,
        type: adjustmentDraft.type.trim(),
        scope: adjustmentDraft.scope,
        amountCents,
        note: adjustmentDraft.note.trim(),
      },
    ]);
    setAdjustmentDraft(emptyAdjustmentDraft);
    setPaymentMessage("");
  }

  function handleRemoveAdjustment(indexToRemove: number) {
    setAdjustments((current) => current.filter((_, idx) => idx !== indexToRemove));
  }

  // Submit Payroll Payment
  async function handleSubmitPayment(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !activeSucursalId || !selectedEmployee || !paymentContext) return;
    if (paymentAmountCents <= 0) {
      setPaymentMessage("El monto a pagar debe ser mayor a 0.");
      return;
    }

    setPaying(true);
    setPaymentMessage("");
    setPaymentSuccessMsg("");
    try {
      const payload: PayrollCreatePaymentRequest = {
        employeeId: selectedEmployee.id,
        period: paymentContext.period,
        frequency: selectedEmployee.frequency,
        paymentAmountCents,
        receiptSnapshot: JSON.stringify({
          employee: selectedEmployee,
          context: paymentContext,
          paymentAmountCents,
          adjustments,
          createdAt: new Date().toISOString(),
        }),
        adjustments,
      };

      const result = await executePayrollCommandLocally({
        type: "payroll.createPayment",
        tenantId,
        sucursalId: activeSucursalId,
        payload,
      });

      if (result.type === "payroll.paymentCommitted") {
        const createdReceipt: ReceiptState = {
          employee: selectedEmployee,
          paymentId: result.paymentId,
          expenseId: result.expenseId,
          period: payload.period,
          paymentAmountCents,
          context: result.context,
          adjustments,
        };

        setReceipt(createdReceipt);
        setPaymentAmountInput("");
        setAdjustments([]);
        setAdjustmentDraft(emptyAdjustmentDraft);
        setPaymentSuccessMsg(`Pago de ${formatMoney(paymentAmountCents)} registrado exitosamente.`);
        setPaymentContext(result.context);
        setActiveTab("recibos");
      }
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : "No se pudo registrar el pago.");
    } finally {
      setPaying(false);
    }
  }

  if (!tenantId || !activeSucursalId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[#0c0c0c] text-[#adaaaa] font-['Inter',sans-serif]">
        <div className="text-center">
          <AlertCircle className="size-8 mx-auto text-[#ff906d] mb-2" />
          <p className="text-sm">Se requiere un tenant y una sucursal activa para acceder al módulo de nómina.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 min-h-0 bg-[#0c0c0c] text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-[rgba(72,72,71,0.15)] shrink-0">
        <div>
          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] uppercase tracking-[0.5px]">
            Recursos Humanos y Nómina
          </span>
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px] uppercase tracking-[0.5px] mt-0.5">
            Gestión de Nómina
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadEmployees()}
            className="bg-transparent border border-[rgba(72,72,71,0.3)] hover:border-white text-[#adaaaa] hover:text-white rounded-[10px] p-2.5 transition-colors cursor-pointer"
            title="Refrescar datos"
          >
            <RefreshCw className={`size-[16px] ${loading ? "animate-spin text-[#ff906d]" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenNewEmployee}
            className="bg-[#ff906d] text-black font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] px-4 py-2.5 rounded-[10px] flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-[0_0_15px_rgba(255,144,109,0.15)]"
          >
            <UserPlus className="size-[16px]" />
            Nuevo Empleado
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(89,238,80,0.1)] rounded-[10px] p-2.5 text-[#59ee50]">
            <Users className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">
              Personal Activo
            </span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] text-white mt-0.5">
              {stats.activos} <span className="text-[13px] text-[#6b7280] font-normal">/ {stats.total} total</span>
            </h4>
          </div>
        </div>

        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(255,144,109,0.1)] rounded-[10px] p-2.5 text-[#ff906d]">
            <DollarSign className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">
              Masa Salarial Est.
            </span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] text-white mt-0.5">
              {formatMoney(stats.mensualEstimado)}
            </h4>
          </div>
        </div>

        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(56,189,248,0.1)] rounded-[10px] p-2.5 text-[#38bdf8]">
            <Calendar className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">
              Período Activo
            </span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[18px] text-white mt-0.5 truncate">
              {periodValue || "Mensual en curso"}
            </h4>
          </div>
        </div>

        <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex items-center gap-4">
          <div className="bg-[rgba(168,85,247,0.1)] rounded-[10px] p-2.5 text-[#a855f7]">
            <CreditCard className="size-[20px]" />
          </div>
          <div>
            <span className="text-[10px] text-[#adaaaa] uppercase tracking-[0.5px] font-['Inter',sans-serif]">
              Liquidación
            </span>
            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] text-white mt-0.5">
              {selectedEmployee ? formatMoney(selectedEmployee.baseSalaryCents) : "—"}
            </h4>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2.5 shrink-0 border-b border-[rgba(72,72,71,0.15)] pb-3">
        <button
          onClick={() => setActiveTab("empleados")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 ${
            activeTab === "empleados"
              ? "bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]"
              : "bg-transparent border-transparent text-[#adaaaa] hover:text-white"
          }`}
        >
          <Users className="size-[15px]" />
          Directorio de Empleados
        </button>

        <button
          onClick={() => setActiveTab("pagar")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 ${
            activeTab === "pagar"
              ? "bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]"
              : "bg-transparent border-transparent text-[#adaaaa] hover:text-white"
          }`}
        >
          <CreditCard className="size-[15px]" />
          Calcular y Pagar Nómina
        </button>

        <button
          onClick={() => setActiveTab("recibos")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 ${
            activeTab === "recibos"
              ? "bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]"
              : "bg-transparent border-transparent text-[#adaaaa] hover:text-white"
          }`}
        >
          <Receipt className="size-[15px]" />
          Recibo de Nómina
        </button>
      </div>

      {/* Global Notifications */}
      {paymentMessage && (
        <div className="bg-[rgba(255,113,108,0.06)] border border-[rgba(255,113,108,0.22)] rounded-[12px] px-4 py-3 flex items-center gap-3 shrink-0">
          <AlertCircle className="size-4 text-[#ff716c] shrink-0" />
          <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">{paymentMessage}</span>
        </div>
      )}
      {paymentSuccessMsg && (
        <div className="bg-[rgba(89,238,80,0.06)] border border-[rgba(89,238,80,0.22)] rounded-[12px] px-4 py-3 flex items-center gap-3 shrink-0">
          <CheckCircle className="size-4 text-[#59ee50] shrink-0" />
          <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">{paymentSuccessMsg}</span>
        </div>
      )}

      {/* TAB 1: EMPLEADOS LIST & ACTIONS */}
      {activeTab === "empleados" && (
        <div className="flex-1 flex flex-col min-h-0 gap-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shrink-0">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#6b7280]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o cargo..."
                className="w-full bg-[#131313] border border-[rgba(72,72,71,0.25)] focus:border-[#ff906d] rounded-[10px] pl-10 pr-4 py-2 text-[13px] text-white outline-none font-['Inter',sans-serif] transition-colors"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={frequencyFilter}
                onChange={(e) => setFrequencyFilter(e.target.value)}
                aria-label="Filtrar por frecuencia de pago"
                className="bg-[#131313] border border-[rgba(72,72,71,0.25)] rounded-[10px] px-3.5 py-2 text-[12px] text-[#adaaaa] outline-none font-['Inter',sans-serif] cursor-pointer"
              >
                <option value="all">Todas las Frecuencias</option>
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
          </div>

          {/* Employees Table */}
          <div className="flex-1 overflow-auto bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#191919] sticky top-0 border-b border-[rgba(72,72,71,0.18)] z-10">
                <tr>
                  <th className="px-5 py-3.5 font-['Space_Grotesk',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Empleado
                  </th>
                  <th className="px-5 py-3.5 font-['Space_Grotesk',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Cargo / Puesto
                  </th>
                  <th className="px-5 py-3.5 font-['Space_Grotesk',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Frecuencia
                  </th>
                  <th className="px-5 py-3.5 font-['Space_Grotesk',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Salario Base
                  </th>
                  <th className="px-5 py-3.5 font-['Space_Grotesk',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Estado
                  </th>
                  <th className="px-5 py-3.5 font-['Space_Grotesk',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#adaaaa] text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(72,72,71,0.1)] font-['Inter',sans-serif] text-[13px]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-[#6b7280]">
                      <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-[#ff906d]" />
                      Cargando directorio de empleados...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-[#6b7280]">
                      <Users className="size-8 mx-auto mb-2 text-[#484847]" />
                      <p>No se encontraron empleados registrados.</p>
                      <button
                        type="button"
                        onClick={handleOpenNewEmployee}
                        className="mt-3 text-[12px] text-[#ff906d] underline hover:text-[#ffd8ca] cursor-pointer"
                      >
                        Crear primer empleado
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr
                      key={emp.id}
                      onClick={() => handleOpenEditEmployee(emp)}
                      className="hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-[rgba(255,144,109,0.12)] border border-[rgba(255,144,109,0.25)] flex items-center justify-center text-[#ff906d] font-bold text-xs">
                            {emp.firstName.charAt(0)}
                            {emp.lastName.charAt(0)}
                          </div>
                          <div>
                            <span className="font-semibold text-white group-hover:text-[#ff906d] transition-colors">
                              {emp.firstName} {emp.lastName}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#adaaaa]">{emp.role}</td>
                      <td className="px-5 py-4">
                        <span className="bg-[#191919] border border-[rgba(72,72,71,0.25)] px-2.5 py-1 rounded-[6px] text-[11px] font-['Space_Grotesk',sans-serif] uppercase tracking-wider text-[#d1d5db]">
                          {frequencyLabel(emp.frequency)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-['Space_Grotesk',sans-serif] font-bold text-white">
                        {formatMoney(emp.baseSalaryCents)}
                      </td>
                      <td className="px-5 py-4">
                        {emp.isActive ? (
                          <span className="inline-flex items-center gap-1.5 bg-[rgba(89,238,80,0.1)] text-[#59ee50] border border-[rgba(89,238,80,0.2)] rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                            <span className="size-1.5 rounded-full bg-[#59ee50]" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-[rgba(72,72,71,0.2)] text-[#888] border border-[rgba(72,72,71,0.3)] rounded-full px-2.5 py-0.5 text-[11px]">
                            <span className="size-1.5 rounded-full bg-[#888]" />
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {emp.isActive && (
                            <button
                              type="button"
                              onClick={() => handleDirectPay(emp)}
                              className="px-2.5 py-1.5 rounded-[8px] bg-[rgba(255,144,109,0.15)] text-[#ff906d] border border-[rgba(255,144,109,0.3)] hover:brightness-125 font-['Space_Grotesk',sans-serif] text-[11px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                              title="Pagar nómina"
                            >
                              <CreditCard className="size-3.5" />
                              Pagar
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEditEmployee(emp)}
                            className="p-1.5 rounded-[8px] border border-[rgba(72,72,71,0.3)] text-[#adaaaa] hover:text-white hover:border-[#ff906d] transition-colors cursor-pointer"
                            title="Editar empleado"
                          >
                            <Edit3 className="size-3.5" />
                          </button>

                          {emp.isActive && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeactivate({
                                  open: true,
                                  employeeId: emp.id,
                                  employeeName: `${emp.firstName} ${emp.lastName}`,
                                })
                              }
                              className="p-1.5 rounded-[8px] border border-[rgba(255,113,108,0.3)] text-[#ff716c] hover:bg-[rgba(255,113,108,0.1)] transition-colors cursor-pointer"
                              title="Dar de baja"
                            >
                              <UserX className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CALCULAR Y PAGAR NÓMINA */}
      {activeTab === "pagar" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">
          <form onSubmit={handleSubmitPayment} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda: Configuración del Pago y Ajustes */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              {/* Sección Selección de Empleado y Período */}
              <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[rgba(72,72,71,0.15)]">
                  <Users className="size-4 text-[#ff906d]" />
                  <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] uppercase tracking-wider text-white">
                    1. Selección de Personal y Período
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                      Empleado a Liquidar
                    </label>
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none font-['Inter',sans-serif] cursor-pointer"
                    >
                      <option value="">Seleccione un empleado...</option>
                      {employees
                        .filter((e) => e.isActive)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.firstName} {e.lastName} — {e.role} ({frequencyLabel(e.frequency)})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                      Mes de Liquidación
                    </label>
                    <input
                      type="month"
                      value={periodMonth}
                      onChange={(e) => setPeriodMonth(e.target.value)}
                      className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none font-['Inter',sans-serif]"
                    />
                  </div>
                </div>

                {selectedEmployee && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-[#191919] border border-[rgba(72,72,71,0.2)] rounded-[12px]">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#adaaaa] block">Cargo</span>
                      <span className="font-semibold text-[13px] text-white">{selectedEmployee.role}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#adaaaa] block">Modalidad</span>
                      <span className="font-semibold text-[13px] text-[#38bdf8]">
                        {frequencyLabel(selectedEmployee.frequency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#adaaaa] block">Salario Base</span>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] text-[#ff906d]">
                        {formatMoney(selectedEmployee.baseSalaryCents)}
                      </span>
                    </div>
                  </div>
                )}

                {selectedFrequency === "biweekly" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                      Quincena correspondiente
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPeriodHalf("1")}
                        className={`py-2 rounded-[8px] font-['Space_Grotesk',sans-serif] text-[12px] font-bold uppercase transition-all ${
                          periodHalf === "1"
                            ? "bg-[rgba(255,144,109,0.15)] border border-[#ff906d] text-[#ff906d]"
                            : "bg-[#191919] border border-[rgba(72,72,71,0.25)] text-[#adaaaa] hover:text-white"
                        }`}
                      >
                        1ra Quincena (Día 1 - 15)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeriodHalf("2")}
                        className={`py-2 rounded-[8px] font-['Space_Grotesk',sans-serif] text-[12px] font-bold uppercase transition-all ${
                          periodHalf === "2"
                            ? "bg-[rgba(255,144,109,0.15)] border border-[#ff906d] text-[#ff906d]"
                            : "bg-[#191919] border border-[rgba(72,72,71,0.25)] text-[#adaaaa] hover:text-white"
                        }`}
                      >
                        2da Quincena (Día 16 - Fin)
                      </button>
                    </div>
                  </div>
                )}

                {selectedFrequency === "weekly" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                      Semana correspondiente
                    </label>
                    <input
                      type="week"
                      value={periodWeek}
                      onChange={(e) => setPeriodWeek(e.target.value)}
                      className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none font-['Inter',sans-serif]"
                    />
                  </div>
                )}
              </div>

              {/* Sección de Ajustes: Bonos y Deducciones */}
              <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-[rgba(72,72,71,0.15)]">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-[#59ee50]" />
                    <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] uppercase tracking-wider text-white">
                      2. Bonificaciones y Descuentos
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#adaaaa] font-['Inter',sans-serif]">Ajustes al período</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                      Tipo de Ajuste
                    </label>
                    <select
                      value={adjustmentDraft.kind}
                      onChange={(e) =>
                        setAdjustmentDraft((c) => ({ ...c, kind: e.target.value as "bonus" | "discount" }))
                      }
                      className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none"
                    >
                      <option value="bonus">+ Bonificación / Extra</option>
                      <option value="discount">- Descuento / Deducción</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                      Concepto
                    </label>
                    <input
                      type="text"
                      value={adjustmentDraft.type}
                      onChange={(e) => setAdjustmentDraft((c) => ({ ...c, type: e.target.value }))}
                      placeholder="Ej. Horas extras, Propina..."
                      className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                      Monto (RD$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={adjustmentDraft.amountInput}
                      onChange={(e) => setAdjustmentDraft((c) => ({ ...c, amountInput: e.target.value }))}
                      placeholder="0.00"
                      className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none font-['Space_Grotesk',sans-serif]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8 flex flex-col gap-1.5">
                    <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                      Nota explicativa {adjustmentDraft.kind === "discount" && <span className="text-[#ff716c]">*</span>}
                    </label>
                    <input
                      type="text"
                      value={adjustmentDraft.note}
                      onChange={(e) => setAdjustmentDraft((c) => ({ ...c, note: e.target.value }))}
                      placeholder={
                        adjustmentDraft.kind === "discount"
                          ? "Obligatorio: Motivo del descuento"
                          : "Opcional: Observación"
                      }
                      className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none"
                    />
                  </div>

                  <div className="sm:col-span-4 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddAdjustment}
                      className="w-full bg-[#191919] hover:bg-[#222] border border-[rgba(72,72,71,0.3)] hover:border-[#ff906d] text-white rounded-[10px] py-2 text-[12px] font-['Space_Grotesk',sans-serif] font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="size-3.5 text-[#ff906d]" />
                      Agregar Ajuste
                    </button>
                  </div>
                </div>

                {/* Lista de Ajustes Agregados */}
                <div className="flex flex-col gap-2 mt-2">
                  {adjustments.length === 0 ? (
                    <p className="text-[12px] text-[#6b7280] italic py-2 text-center">
                      No hay ajustes adicionales aplicados a este período.
                    </p>
                  ) : (
                    adjustments.map((adj, idx) => (
                      <div
                        key={`${adj.type}-${idx}`}
                        className="flex items-center justify-between p-3 bg-[#191919] border border-[rgba(72,72,71,0.2)] rounded-[10px]"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-1.5 rounded-[6px] ${
                              adj.kind === "bonus"
                                ? "bg-[rgba(89,238,80,0.1)] text-[#59ee50]"
                                : "bg-[rgba(255,113,108,0.1)] text-[#ff716c]"
                            }`}
                          >
                            {adj.kind === "bonus" ? (
                              <ArrowUpRight className="size-4" />
                            ) : (
                              <ArrowDownRight className="size-4" />
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-[13px] text-white block">{adj.type}</span>
                            <span className="text-[11px] text-[#adaaaa]">
                              {adj.kind === "bonus" ? "Bonificación" : "Descuento"}
                              {adj.note && ` — ${adj.note}`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`font-['Space_Grotesk',sans-serif] font-bold text-[14px] ${
                              adj.kind === "bonus" ? "text-[#59ee50]" : "text-[#ff716c]"
                            }`}
                          >
                            {adj.kind === "bonus" ? "+" : "-"}
                            {formatMoney(adj.amountCents)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAdjustment(idx)}
                            className="p-1 text-[#adaaaa] hover:text-[#ff716c] transition-colors cursor-pointer"
                            title="Eliminar ajuste"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Columna Derecha: Resumen de Liquidación y Pago */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[rgba(72,72,71,0.15)]">
                  <CreditCard className="size-4 text-[#ff906d]" />
                  <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] uppercase tracking-wider text-white">
                    3. Resumen y Emisión de Pago
                  </h3>
                </div>

                {/* Desglose de Cálculo */}
                <div className="flex flex-col gap-2.5 p-4 bg-[#191919] border border-[rgba(72,72,71,0.25)] rounded-[12px]">
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#adaaaa]">Salario Base del Período</span>
                    <span className="font-['Space_Grotesk',sans-serif] font-semibold text-white">
                      {paymentContext ? formatMoney(paymentContext.periodSalaryCents) : "RD$ 0.00"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#adaaaa]">Ajustes Netos (Bonos/Deducciones)</span>
                    <span
                      className={`font-['Space_Grotesk',sans-serif] font-semibold ${
                        paymentContext && paymentContext.adjustmentDeltaCents > 0
                          ? "text-[#59ee50]"
                          : paymentContext && paymentContext.adjustmentDeltaCents < 0
                          ? "text-[#ff716c]"
                          : "text-white"
                      }`}
                    >
                      {paymentContext ? formatSignedMoney(paymentContext.adjustmentDeltaCents) : "RD$ 0.00"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-[#adaaaa]">Ya Pagado Anteriormente</span>
                    <span className="font-['Space_Grotesk',sans-serif] text-[#adaaaa]">
                      {paymentContext ? formatMoney(paymentContext.alreadyPaidCents) : "RD$ 0.00"}
                    </span>
                  </div>

                  <div className="pt-2.5 border-t border-[rgba(72,72,71,0.2)] flex justify-between items-center">
                    <div>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px] uppercase tracking-wider text-white block">
                        Total Debido
                      </span>
                      <span className="text-[11px] text-[#6b7280]">Total neto del período</span>
                    </div>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[20px] text-white">
                      {paymentContext ? formatMoney(paymentContext.dueCents) : "RD$ 0.00"}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[rgba(72,72,71,0.2)] flex justify-between items-center">
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px] text-[#ff906d]">
                      Balance Pendiente
                    </span>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[22px] text-[#ff906d]">
                      {paymentContext ? formatMoney(paymentContext.pendingCents) : "RD$ 0.00"}
                    </span>
                  </div>
                </div>

                {/* Input Monto a Pagar */}
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Monto a Pagar Ahora (RD$)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={paymentAmountInput}
                      onChange={(e) => setPaymentAmountInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-4 py-3 text-[16px] font-['Space_Grotesk',sans-serif] font-bold text-white outline-none"
                    />
                  </div>

                  {/* Atajos Rápidos */}
                  {paymentContext && paymentContext.pendingCents > 0 && (
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setPaymentAmountInput(centsToCurrencyInput(paymentContext.pendingCents))}
                        className="flex-1 py-1.5 rounded-[8px] bg-[#191919] border border-[rgba(72,72,71,0.25)] hover:border-[#ff906d] text-[11px] font-['Space_Grotesk',sans-serif] uppercase tracking-wider text-[#adaaaa] hover:text-white transition-all cursor-pointer"
                      >
                        Pago Completo (100%)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentAmountInput(centsToCurrencyInput(Math.floor(paymentContext.pendingCents / 2)))
                        }
                        className="flex-1 py-1.5 rounded-[8px] bg-[#191919] border border-[rgba(72,72,71,0.25)] hover:border-[#ff906d] text-[11px] font-['Space_Grotesk',sans-serif] uppercase tracking-wider text-[#adaaaa] hover:text-white transition-all cursor-pointer"
                      >
                        Pago Parcial (50%)
                      </button>
                    </div>
                  )}
                </div>

                {/* Botón de Confirmación de Pago */}
                <button
                  type="submit"
                  disabled={paying || !selectedEmployee || !paymentContext || paymentAmountCents <= 0}
                  className="w-full mt-2 bg-[#ff906d] hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100 text-black font-['Space_Grotesk',sans-serif] font-bold text-[14px] uppercase tracking-wider py-3.5 rounded-[12px] transition-all cursor-pointer shadow-[0_0_20px_rgba(255,144,109,0.2)] flex items-center justify-center gap-2"
                >
                  {paying ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" />
                      Procesando Pago...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="size-4" />
                      Registrar y Emitir Pago
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: RECIBO DE NÓMINA */}
      {activeTab === "recibos" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-auto items-center justify-start py-4">
          {receipt ? (
            <div className="w-full max-w-3xl flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="font-['Space_Grotesk',sans-serif] text-[13px] uppercase tracking-wider text-[#adaaaa]">
                  Comprobante Oficial Generado
                </span>
                <button
                  type="button"
                  onClick={printReceipt}
                  className="bg-[#ff906d] text-black font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] px-4 py-2 rounded-[10px] flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-[0_0_12px_rgba(255,144,109,0.2)]"
                >
                  <Printer className="size-4" />
                  Imprimir Comprobante
                </button>
              </div>

              {/* Printable Receipt Card */}
              <article
                id="payroll-receipt"
                className="bg-[#131313] border border-[rgba(72,72,71,0.25)] rounded-[20px] p-8 text-white flex flex-col gap-6 shadow-2xl"
              >
                {/* Receipt Header */}
                <div className="flex justify-between items-start border-b border-[rgba(72,72,71,0.2)] pb-6">
                  <div>
                    <span className="text-[10px] font-['Space_Grotesk',sans-serif] uppercase tracking-[2px] text-[#ff906d] block mb-1">
                      Comprobante de Pago de Nómina
                    </span>
                    <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-[26px] text-white">
                      {receipt.employee.firstName} {receipt.employee.lastName}
                    </h3>
                    <p className="text-[13px] text-[#adaaaa] font-['Inter',sans-serif] mt-0.5">
                      {receipt.employee.role} · Frecuencia {frequencyLabel(receipt.employee.frequency)}
                    </p>
                  </div>

                  <div className="text-right font-['Space_Grotesk',sans-serif]">
                    <span className="text-[11px] text-[#6b7280] uppercase tracking-wider block">Período</span>
                    <span className="font-bold text-[16px] text-white">{receipt.period}</span>
                    <span className="text-[11px] text-[#59ee50] block mt-1">● Pagado</span>
                  </div>
                </div>

                {/* Receipt Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="p-3.5 bg-[#191919] border border-[rgba(72,72,71,0.2)] rounded-[12px]">
                    <span className="text-[10px] uppercase tracking-wider text-[#adaaaa] block">Monto Aplicado</span>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[18px] text-[#59ee50]">
                      {formatMoney(receipt.paymentAmountCents)}
                    </span>
                  </div>

                  <div className="p-3.5 bg-[#191919] border border-[rgba(72,72,71,0.2)] rounded-[12px]">
                    <span className="text-[10px] uppercase tracking-wider text-[#adaaaa] block">Total Debido</span>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[18px] text-white">
                      {formatMoney(receipt.context.dueCents)}
                    </span>
                  </div>

                  <div className="p-3.5 bg-[#191919] border border-[rgba(72,72,71,0.2)] rounded-[12px]">
                    <span className="text-[10px] uppercase tracking-wider text-[#adaaaa] block">Balance Restante</span>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[18px] text-[#ff906d]">
                      {formatMoney(receipt.context.pendingCents)}
                    </span>
                  </div>
                </div>

                {/* Adjustments in Receipt */}
                {receipt.adjustments.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-[rgba(72,72,71,0.15)] pt-4">
                    <span className="text-[11px] uppercase tracking-wider text-[#adaaaa] font-['Space_Grotesk',sans-serif] font-bold">
                      Desglose de Ajustes Aplicados
                    </span>
                    <div className="divide-y divide-[rgba(72,72,71,0.1)]">
                      {receipt.adjustments.map((adj, i) => (
                        <div key={i} className="flex justify-between py-2 text-[12px]">
                          <span className="text-white">
                            {adj.type} ({adj.kind === "bonus" ? "Bono" : "Descuento"})
                            {adj.note && ` — ${adj.note}`}
                          </span>
                          <span
                            className={`font-['Space_Grotesk',sans-serif] font-bold ${
                              adj.kind === "bonus" ? "text-[#59ee50]" : "text-[#ff716c]"
                            }`}
                          >
                            {adj.kind === "bonus" ? "+" : "-"}
                            {formatMoney(adj.amountCents)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-12 pt-8 border-t border-[rgba(72,72,71,0.2)] mt-4">
                  <div className="flex flex-col items-center">
                    <div className="w-full border-b border-dashed border-[rgba(72,72,71,0.5)] mb-2" />
                    <span className="text-[11px] font-['Inter',sans-serif] text-[#adaaaa]">Firma del Empleado</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-full border-b border-dashed border-[rgba(72,72,71,0.5)] mb-2" />
                    <span className="text-[11px] font-['Inter',sans-serif] text-[#adaaaa]">Firma Autorizada / RRHH</span>
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center max-w-md bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px]">
              <Receipt className="size-12 text-[#484847] mb-3" />
              <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-[18px] text-white uppercase">
                Sin recibos recientes
              </h4>
              <p className="text-[13px] text-[#adaaaa] font-['Inter',sans-serif] mt-1">
                Realizá una liquidación de nómina en la pestaña "Calcular y Pagar Nómina" para generar un comprobante
                oficial imprimible.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("pagar")}
                className="mt-4 bg-[#ff906d] text-black font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase px-4 py-2.5 rounded-[10px] hover:brightness-110 cursor-pointer"
              >
                Ir a Calcular Pago
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREAR / EDITAR EMPLEADO (POPUP) */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-lg bg-[#131313] border border-[rgba(72,72,71,0.3)] rounded-[20px] p-6 text-white shadow-2xl flex flex-col gap-5 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(72,72,71,0.2)]">
              <div>
                <span className="text-[10px] font-['Inter',sans-serif] text-[#6b7280] uppercase tracking-[0.5px]">
                  Ficha de Personal
                </span>
                <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-[18px] uppercase tracking-wider text-white mt-0.5">
                  {employeeDraft.id ? "Editar Empleado" : "Registrar Nuevo Empleado"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEmployeeModalOpen(false)}
                className="p-2 rounded-[8px] text-[#adaaaa] hover:text-white hover:bg-[rgba(255,255,255,0.05)] transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEmployee} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Nombre <span className="text-[#ff906d]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={employeeDraft.firstName}
                    onChange={(e) => setEmployeeDraft((c) => ({ ...c, firstName: e.target.value }))}
                    placeholder="Ej. Juan"
                    className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none font-['Inter',sans-serif]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Apellido <span className="text-[#ff906d]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={employeeDraft.lastName}
                    onChange={(e) => setEmployeeDraft((c) => ({ ...c, lastName: e.target.value }))}
                    placeholder="Ej. Pérez"
                    className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none font-['Inter',sans-serif]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                  Cargo o Puesto <span className="text-[#ff906d]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={employeeDraft.role}
                  onChange={(e) => setEmployeeDraft((c) => ({ ...c, role: e.target.value }))}
                  placeholder="Ej. Cocinero, Camarero, Administrador..."
                  className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none font-['Inter',sans-serif]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Salario Base (RD$) <span className="text-[#ff906d]">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={centsToCurrencyInput(employeeDraft.baseSalaryCents)}
                    onChange={(e) =>
                      setEmployeeDraft((c) => ({ ...c, baseSalaryCents: currencyInputToCents(e.target.value) }))
                    }
                    placeholder="0.00"
                    className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3.5 py-2.5 text-[13px] font-['Space_Grotesk',sans-serif] font-bold text-white outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-['Inter',sans-serif] uppercase tracking-[0.5px] text-[#adaaaa]">
                    Frecuencia de Pago
                  </label>
                  <select
                    value={employeeDraft.frequency}
                    onChange={(e) =>
                      setEmployeeDraft((c) => ({ ...c, frequency: e.target.value as PayrollFrequency }))
                    }
                    className="bg-[#191919] border border-[rgba(72,72,71,0.3)] focus:border-[#ff906d] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none font-['Inter',sans-serif] cursor-pointer"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="weekly">Semanal</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 bg-[#191919] border border-[rgba(72,72,71,0.2)] rounded-[10px] cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={employeeDraft.isActive}
                  onChange={(e) => setEmployeeDraft((c) => ({ ...c, isActive: e.target.checked }))}
                  className="size-4 rounded accent-[#ff906d] cursor-pointer"
                />
                <span className="text-[13px] font-['Inter',sans-serif] text-white">Empleado en servicio activo</span>
              </label>

              {employeeMessage && (
                <div className="p-3 rounded-[10px] bg-[rgba(255,113,108,0.1)] border border-[rgba(255,113,108,0.3)] text-[#ff716c] text-[12px]">
                  {employeeMessage}
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[rgba(72,72,71,0.2)] mt-2">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="px-4 py-2.5 rounded-[10px] border border-[rgba(72,72,71,0.3)] text-[#adaaaa] hover:text-white text-[12px] font-['Space_Grotesk',sans-serif] uppercase font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEmployee}
                  className="px-5 py-2.5 rounded-[10px] bg-[#ff906d] hover:brightness-110 disabled:opacity-50 text-black text-[12px] font-['Space_Grotesk',sans-serif] font-bold uppercase transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_12px_rgba(255,144,109,0.2)]"
                >
                  {savingEmployee ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="size-3.5" />
                      Guardar Empleado
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL: DAR DE BAJA */}
      <ConfirmModal
        open={confirmDeactivate.open}
        title="Dar de baja a empleado"
        message={`¿Estás seguro de que deseas desactivar a ${confirmDeactivate.employeeName}? Podrás reactivarlo en cualquier momento editando su ficha.`}
        confirmLabel="Dar de baja"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmDisable}
        onCancel={() => setConfirmDeactivate({ open: false, employeeId: "", employeeName: "" })}
      />
    </div>
  );
}

function formatMoney(cents: number): string {
  return "RD$ " + (cents / 100).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedMoney(cents: number): string {
  if (cents === 0) return "RD$ 0.00";
  const prefix = cents > 0 ? "+" : "-";
  return `${prefix}${formatMoney(Math.abs(cents))}`;
}

function centsToCurrencyInput(cents: number): string {
  if (!cents || isNaN(cents)) return "0.00";
  return (cents / 100).toFixed(2);
}

function currencyInputToCents(input: string): number {
  const clean = input.replace(/,/g, "").trim();
  const parsed = parseFloat(clean);
  if (isNaN(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function frequencyLabel(frequency: PayrollFrequency): string {
  switch (frequency) {
    case "monthly":
      return "Mensual";
    case "biweekly":
      return "Quincenal";
    case "weekly":
      return "Semanal";
    default:
      return frequency;
  }
}

function buildPeriodValue(
  frequency: PayrollFrequency,
  month: string,
  half: "1" | "2",
  week: string,
): string {
  if (frequency === "monthly") return month;
  if (frequency === "biweekly") return month ? `${month}-${half}` : "";
  return week;
}

function toWeekInputValue(date: Date): string {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function printReceipt(): void {
  const receipt = document.getElementById("payroll-receipt");
  if (!receipt) return;
  const popup = window.open("", "payroll-receipt-print", "width=900,height=700");
  if (!popup) return;
  popup.document.write(`<!doctype html>
<html>
<head>
  <title>Comprobante de Nómina</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px;
      background: #fff;
      color: #111;
    }
    * { box-sizing: border-box; }
    #payroll-receipt {
      border: 1px solid #ddd;
      border-radius: 12px;
      padding: 24px;
      max-width: 750px;
      margin: 0 auto;
    }
    button { display: none !important; }
    h3 { margin-top: 4px; font-size: 24px; }
  </style>
</head>
<body>
  ${receipt.outerHTML}
</body>
</html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}
