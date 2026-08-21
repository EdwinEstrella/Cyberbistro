import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../shared/hooks/useAuth";
import { useSucursal } from "../../app/context/SucursalContext";
import { executePayrollCommandLocally } from "../../shared/lib/payrollUiAdapter";
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
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [paying, setPaying] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [employeeDraft, setEmployeeDraft] = useState<PayrollEmployeeDraft>(emptyEmployeeDraft);
  const [employeeMessage, setEmployeeMessage] = useState<string>("");
  const [paymentMessage, setPaymentMessage] = useState<string>("");
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

  const selectedFrequency = selectedEmployee?.frequency ?? employeeDraft.frequency;
  const periodValue = useMemo(() => buildPeriodValue(selectedFrequency, periodMonth, periodHalf, periodWeek), [selectedFrequency, periodHalf, periodMonth, periodWeek]);
  const paymentAmountCents = useMemo(() => currencyInputToCents(paymentAmountInput), [paymentAmountInput]);

  useEffect(() => {
    if (!tenantId || !activeSucursalId) return;
    void loadEmployees();
  }, [tenantId, activeSucursalId]);

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
          setPaymentMessage(error instanceof Error ? error.message : "No se pudo calcular el balance.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSucursalId, adjustments, paymentAmountInput, periodValue, selectedEmployee, tenantId]);

  async function loadEmployees() {
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
        if (!selectedEmployeeId && result.employees[0]) {
          setSelectedEmployeeId(result.employees[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEmployee(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !activeSucursalId) return;
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
        setEmployeeDraft(emptyEmployeeDraft);
        setSelectedEmployeeId((current) => current || result.id);
        setEmployeeMessage("Empleado guardado en SQLite local.");
        await loadEmployees();
      }
    } catch (error) {
      setEmployeeMessage(error instanceof Error ? error.message : "No se pudo guardar el empleado.");
    } finally {
      setSavingEmployee(false);
    }
  }

  async function handleDisableEmployee(employeeId: string) {
    if (!tenantId || !activeSucursalId) return;
    try {
      await executePayrollCommandLocally({
        type: "payroll.disableEmployee",
        tenantId,
        sucursalId: activeSucursalId,
        employeeId,
      });
      setEmployeeMessage("Empleado marcado como inactivo.");
      await loadEmployees();
    } catch (error) {
      setEmployeeMessage(error instanceof Error ? error.message : "No se pudo desactivar el empleado.");
    }
  }

  function startEditingEmployee(employee: PayrollEmployee) {
    setEmployeeDraft({ ...employee });
  }

  function addAdjustment() {
    const amountCents = currencyInputToCents(adjustmentDraft.amountInput);
    if (amountCents <= 0 || adjustmentDraft.type.trim().length === 0) {
      setPaymentMessage("Completá concepto y monto del ajuste.");
      return;
    }
    if (adjustmentDraft.kind === "discount" && adjustmentDraft.note.trim().length === 0) {
      setPaymentMessage("Los descuentos requieren una nota obligatoria.");
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

  async function handleSubmitPayment(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !activeSucursalId || !selectedEmployee || !paymentContext) return;
    setPaying(true);
    setPaymentMessage("");
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
        setReceipt({
          employee: selectedEmployee,
          paymentId: result.paymentId,
          expenseId: result.expenseId,
          period: payload.period,
          paymentAmountCents,
          context: result.context,
          adjustments,
        });
        setPaymentAmountInput("");
        setAdjustments([]);
        setAdjustmentDraft(emptyAdjustmentDraft);
        setPaymentMessage("Pago registrado localmente. El outbox quedó pendiente para futura sincronización.");
        setPaymentContext(result.context);
      }
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : "No se pudo registrar el pago.");
    } finally {
      setPaying(false);
    }
  }

  if (!tenantId || !activeSucursalId) {
    return <div className="p-6 text-sm text-muted-foreground">Necesitás un tenant y una sucursal activa para usar nómina.</div>;
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(255,144,109,0.18),_transparent_38%),linear-gradient(180deg,_#121212_0%,_#090909_100%)] p-6 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-white/10 bg-black/35 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[#ff906d]">Local-first payroll</p>
              <h1 className="mt-2 font-['Georgia',serif] text-4xl">Nómina real sobre SQLite</h1>
              <p className="mt-3 max-w-3xl text-sm text-white/70">Alta, edición, baja lógica, pagos parciales o completos, ajustes con nota obligatoria y recibo imprimible con firma. Todo entra por IPC hacia SQLite local.</p>
            </div>
            <div className="rounded-2xl border border-[#ff906d]/30 bg-[#ff906d]/10 px-4 py-3 text-sm text-[#ffd8ca]">
              Sucursal activa: <span className="font-semibold text-white">{activeSucursalId}</span>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-['Georgia',serif] text-2xl">Empleados</h2>
                <p className="text-sm text-white/60">Creá, editá y desactivá empleados locales.</p>
              </div>
              <button type="button" onClick={() => setEmployeeDraft(emptyEmployeeDraft)} className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[#ff906d]/50 hover:text-[#ff906d]">
                Nuevo
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 text-white/70">
                    <tr>
                      <th className="px-4 py-3">Empleado</th>
                      <th className="px-4 py-3">Frecuencia</th>
                      <th className="px-4 py-3">Salario</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-white/60">Cargando empleados...</td></tr>
                    ) : employees.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-white/60">Todavía no hay empleados cargados.</td></tr>
                    ) : (
                      employees.map((employee) => (
                        <tr key={employee.id} className="border-t border-white/5 align-top">
                          <td className="px-4 py-4">
                            <button type="button" onClick={() => setSelectedEmployeeId(employee.id)} className="text-left">
                              <span className="block font-semibold text-white">{employee.firstName} {employee.lastName}</span>
                              <span className="text-xs text-white/50">{employee.role}</span>
                            </button>
                          </td>
                          <td className="px-4 py-4 text-white/70">{frequencyLabel(employee.frequency)}</td>
                          <td className="px-4 py-4 text-white/70">{formatMoney(employee.baseSalaryCents)}</td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs ${employee.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/60"}`}>
                              {employee.isActive ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => startEditingEmployee(employee)} className="rounded-full border border-white/15 px-3 py-1 text-xs hover:border-[#ff906d]/50 hover:text-[#ff906d]">Editar</button>
                              {employee.isActive && (
                                <button type="button" onClick={() => void handleDisableEmployee(employee.id)} className="rounded-full border border-red-400/30 px-3 py-1 text-xs text-red-200 hover:bg-red-500/10">Dar de baja</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <form onSubmit={handleSaveEmployee} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="font-semibold text-white">{employeeDraft.id ? "Editar empleado" : "Nuevo empleado"}</h3>
                <div className="mt-4 grid gap-3">
                  <Input label="Nombre" value={employeeDraft.firstName} onChange={(value) => setEmployeeDraft((current) => ({ ...current, firstName: value }))} />
                  <Input label="Apellido" value={employeeDraft.lastName} onChange={(value) => setEmployeeDraft((current) => ({ ...current, lastName: value }))} />
                  <Input label="Cargo" value={employeeDraft.role} onChange={(value) => setEmployeeDraft((current) => ({ ...current, role: value }))} />
                  <Input label="Salario base" value={centsToCurrencyInput(employeeDraft.baseSalaryCents)} onChange={(value) => setEmployeeDraft((current) => ({ ...current, baseSalaryCents: currencyInputToCents(value) }))} placeholder="0.00" />
                  <label className="grid gap-2 text-sm text-white/70">
                    <span>Frecuencia</span>
                    <select value={employeeDraft.frequency} onChange={(event) => setEmployeeDraft((current) => ({ ...current, frequency: event.target.value as PayrollFrequency }))} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">
                      <option value="monthly">Mensual</option>
                      <option value="biweekly">Quincenal</option>
                      <option value="weekly">Semanal</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
                    <input type="checkbox" checked={employeeDraft.isActive} onChange={(event) => setEmployeeDraft((current) => ({ ...current, isActive: event.target.checked }))} />
                    Empleado activo
                  </label>
                </div>
                {employeeMessage && <p className="mt-4 text-sm text-[#ffd8ca]">{employeeMessage}</p>}
                <button disabled={savingEmployee} className="mt-4 w-full rounded-2xl bg-[#ff906d] px-4 py-3 font-semibold text-black transition hover:brightness-110 disabled:opacity-60">
                  {savingEmployee ? "Guardando..." : "Guardar empleado"}
                </button>
              </form>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/40 p-6">
            <div>
              <h2 className="font-['Georgia',serif] text-2xl">Pago y recibo</h2>
              <p className="mt-1 text-sm text-white/60">Calculá balance por período, agregá bonificaciones o descuentos y emití el recibo local.</p>
            </div>

            <form onSubmit={handleSubmitPayment} className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm text-white/70">
                <span>Empleado</span>
                <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">
                  <option value="">Seleccioná un empleado</option>
                  {employees.filter((employee) => employee.isActive).map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>
                  ))}
                </select>
              </label>

              {selectedEmployee && (
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
                  <ReadOnlyStat label="Frecuencia" value={frequencyLabel(selectedEmployee.frequency)} />
                  <ReadOnlyStat label="Salario base" value={formatMoney(selectedEmployee.baseSalaryCents)} />
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm text-white/70">
                  <span>Mes base</span>
                  <input type="month" value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" />
                </label>
                {selectedFrequency === "biweekly" ? (
                  <label className="grid gap-2 text-sm text-white/70">
                    <span>Quincena</span>
                    <select value={periodHalf} onChange={(event) => setPeriodHalf(event.target.value as "1" | "2")} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">
                      <option value="1">Primera</option>
                      <option value="2">Segunda</option>
                    </select>
                  </label>
                ) : selectedFrequency === "weekly" ? (
                  <label className="grid gap-2 text-sm text-white/70">
                    <span>Semana</span>
                    <input type="week" value={periodWeek} onChange={(event) => setPeriodWeek(event.target.value)} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" />
                  </label>
                ) : (
                  <ReadOnlyStat label="Período" value={periodValue || "-"} />
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Ajustes</h3>
                  <span className="text-xs uppercase tracking-[0.3em] text-white/40">Cents exactos</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-white/70">
                    <span>Tipo</span>
                    <select value={adjustmentDraft.kind} onChange={(event) => setAdjustmentDraft((current) => ({ ...current, kind: event.target.value as "bonus" | "discount" }))} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">
                      <option value="bonus">Bonificación</option>
                      <option value="discount">Descuento</option>
                    </select>
                  </label>
                  <Input label="Concepto" value={adjustmentDraft.type} onChange={(value) => setAdjustmentDraft((current) => ({ ...current, type: value }))} />
                  <label className="grid gap-2 text-sm text-white/70">
                    <span>Alcance</span>
                    <select value={adjustmentDraft.scope} onChange={(event) => setAdjustmentDraft((current) => ({ ...current, scope: event.target.value as PayrollPaymentAdjustment["scope"] }))} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">
                      <option value="currentPayment">Impacta este pago</option>
                      <option value="nextPayment">Aplicar al próximo pago</option>
                    </select>
                  </label>
                  <Input label="Monto" value={adjustmentDraft.amountInput} onChange={(value) => setAdjustmentDraft((current) => ({ ...current, amountInput: value }))} placeholder="0.00" />
                  <div className="md:col-span-2">
                    <Input label="Nota" value={adjustmentDraft.note} onChange={(value) => setAdjustmentDraft((current) => ({ ...current, note: value }))} placeholder={adjustmentDraft.kind === "discount" ? "Obligatoria para descuentos" : "Opcional"} />
                  </div>
                </div>
                <button type="button" onClick={addAdjustment} className="mt-4 rounded-2xl border border-[#ff906d]/40 px-4 py-3 text-sm text-[#ff906d] hover:bg-[#ff906d]/10">Agregar ajuste</button>

                <div className="mt-4 grid gap-2">
                  {adjustments.length === 0 ? (
                    <p className="text-sm text-white/50">Sin ajustes cargados.</p>
                  ) : adjustments.map((adjustment, index) => (
                    <div key={`${adjustment.type}-${index}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-white">{adjustment.type}</p>
                        <p className="text-white/55">{adjustment.kind === "bonus" ? "Bonificación" : "Descuento"} · {adjustment.scope === "currentPayment" ? "Este pago" : "Próximo pago"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={adjustment.kind === "bonus" ? "text-emerald-300" : "text-rose-300"}>{adjustment.kind === "bonus" ? "+" : "-"}{formatMoney(adjustment.amountCents)}</span>
                        <button type="button" onClick={() => setAdjustments((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="text-xs text-white/50 hover:text-white">Quitar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-3">
                <ReadOnlyStat label="Salario período" value={paymentContext ? formatMoney(paymentContext.periodSalaryCents) : "-"} />
                <ReadOnlyStat label="Ya pagado" value={paymentContext ? formatMoney(paymentContext.alreadyPaidCents) : "-"} />
                <ReadOnlyStat label="Balance pendiente" value={paymentContext ? formatMoney(paymentContext.pendingCents) : "-"} />
                <ReadOnlyStat label="Ajustes acumulados" value={paymentContext ? formatSignedMoney(paymentContext.adjustmentDeltaCents) : "-"} />
                <ReadOnlyStat label="Total debido" value={paymentContext ? formatMoney(paymentContext.dueCents) : "-"} />
                <div className="grid gap-2 text-sm text-white/70">
                  <span>Monto a pagar</span>
                  <input value={paymentAmountInput} onChange={(event) => setPaymentAmountInput(event.target.value)} placeholder="0.00" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => paymentContext && setPaymentAmountInput(centsToCurrencyInput(paymentContext.pendingCents))} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">Completo</button>
                    <button type="button" onClick={() => paymentContext && setPaymentAmountInput(centsToCurrencyInput(Math.floor(paymentContext.pendingCents / 2)))} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">Parcial 50%</button>
                  </div>
                </div>
              </div>

              {paymentMessage && <p className="text-sm text-[#ffd8ca]">{paymentMessage}</p>}

              <button disabled={paying || !selectedEmployee || !paymentContext || paymentAmountCents <= 0} className="rounded-2xl bg-[#ff906d] px-5 py-4 font-semibold text-black transition hover:brightness-110 disabled:opacity-60">
                {paying ? "Registrando pago..." : "Registrar pago local"}
              </button>
            </form>

            {receipt && (
              <article id="payroll-receipt" className="mt-6 rounded-3xl border border-[#ff906d]/30 bg-white px-6 py-7 text-black shadow-[0_16px_50px_rgba(255,144,109,0.2)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-[#8d4c38]">Recibo de nómina</p>
                    <h3 className="mt-2 font-['Georgia',serif] text-3xl">{receipt.employee.firstName} {receipt.employee.lastName}</h3>
                    <p className="mt-1 text-sm text-black/60">{receipt.employee.role} · {frequencyLabel(receipt.employee.frequency)}</p>
                  </div>
                  <button type="button" onClick={() => printReceipt()} className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium text-black hover:bg-black/5">Imprimir recibo</button>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <ReceiptField label="ID de pago" value={receipt.paymentId} />
                  <ReceiptField label="ID de gasto" value={receipt.expenseId} />
                  <ReceiptField label="Período" value={receipt.period} />
                  <ReceiptField label="Pago aplicado" value={formatMoney(receipt.paymentAmountCents)} />
                  <ReceiptField label="Total debido" value={formatMoney(receipt.context.dueCents)} />
                  <ReceiptField label="Pendiente luego del pago" value={formatMoney(receipt.context.pendingCents)} />
                </div>
                <div className="mt-6 rounded-2xl border border-black/10 p-4">
                  <p className="text-sm font-semibold">Ajustes</p>
                  <div className="mt-3 grid gap-2 text-sm">
                    {receipt.adjustments.length === 0 ? <p>Sin ajustes.</p> : receipt.adjustments.map((adjustment, index) => (
                      <div key={`${adjustment.type}-${index}`} className="flex justify-between gap-3">
                        <span>{adjustment.type} · {adjustment.scope === "currentPayment" ? "Este pago" : "Próximo pago"}</span>
                        <span>{adjustment.kind === "bonus" ? "+" : "-"}{formatMoney(adjustment.amountCents)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-8 grid gap-8 md:grid-cols-2">
                  <SignatureBlock title="Firma del empleado" />
                  <SignatureBlock title="Firma autorizada" />
                </div>
              </article>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-2 text-sm text-white/70">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" />
    </label>
  );
}

function ReadOnlyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
      <span>{label}</span>
      <span className="text-lg font-semibold text-white">{value}</span>
    </div>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fff7f4] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.25em] text-black/45">{label}</p>
      <p className="mt-1 break-all font-medium">{value}</p>
    </div>
  );
}

function SignatureBlock({ title }: { title: string }) {
  return (
    <div>
      <div className="h-16 border-b border-dashed border-black/40" />
      <p className="mt-3 text-sm text-black/65">{title}</p>
    </div>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(value / 100);
}

function formatSignedMoney(value: number): string {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
}

function centsToCurrencyInput(value: number): string {
  return (value / 100).toFixed(2);
}

function currencyInputToCents(value: string): number {
  const parsed = Number(value.replace(/,/g, "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function frequencyLabel(frequency: PayrollFrequency): string {
  return frequency === "monthly" ? "Mensual" : frequency === "biweekly" ? "Quincenal" : "Semanal";
}

function buildPeriodValue(frequency: PayrollFrequency, month: string, half: "1" | "2", week: string): string {
  if (frequency === "monthly") return month;
  if (frequency === "biweekly") return month ? `${month}-${half}` : "";
  return week;
}

function toWeekInputValue(date: Date): string {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function printReceipt(): void {
  const receipt = document.getElementById("payroll-receipt");
  if (!receipt) return;
  const popup = window.open("", "payroll-receipt-print", "width=900,height=700");
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><title>Payroll Receipt</title><style>body{font-family:Georgia,serif;padding:24px;background:#fff;color:#111}*{box-sizing:border-box}button{display:none}</style></head><body>${receipt.outerHTML}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}
