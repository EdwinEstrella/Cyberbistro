import { useMemo, useState, useEffect, useCallback } from "react";
import { CreditCard, Calendar, Save, RotateCcw, CheckCircle2, History } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../../shared/ui/card";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import type { LimitDraft, TenantBillingPaymentRow } from "../lib/types";
import type { DebtCurrency } from "../../../shared/lib/tenantDebt";
import { getDebtStatus, formatDebtAmount } from "../../../shared/lib/tenantDebt";
import {
  isPaymentsFormDirty,
  parseDebtAmount,
  parseMonthlyFeeAmount,
  parsePaymentDay,
  validatePaymentsDraft,
  resolveDebtDueDate,
  isValidIsoDate,
  formatIsoDateDisplay,
} from "../lib/dirtyDetection";
import {
  nextBillingDateAfter,
  formatBillingDateDisplay,
} from "../../../shared/lib/monthlyFee";
import { supabase } from "../../../shared/lib/supabase";

interface PaymentsFormProps {
  draft: LimitDraft;
  initialDraft: LimitDraft;
  tenantId?: string;
  tenantName?: string;
  saving: boolean;
  onChange: (updated: LimitDraft) => void;
  onSave: () => void;
  onReset: () => void;
  onMarkPaid?: () => void;
  paymentHistory?: TenantBillingPaymentRow[];
}

function formatPaymentTimestamp(paidAt: string): string {
  try {
    const d = new Date(paidAt);
    if (Number.isNaN(d.getTime())) return paidAt;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return paidAt;
  }
}

export function PaymentsForm({
  draft,
  initialDraft,
  tenantId,
  tenantName: _tenantName,
  saving,
  onChange,
  onSave,
  onReset,
  onMarkPaid,
  paymentHistory,
}: PaymentsFormProps) {
  const [internalPayments, setInternalPayments] = useState<TenantBillingPaymentRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const fetchPayments = useCallback(async () => {
    if (!tenantId) {
      setInternalPayments([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("tenant_billing_payments")
        .select("id, tenant_id, amount, currency, paid_at, recorded_by, notes, created_at")
        .eq("tenant_id", tenantId)
        .order("paid_at", { ascending: false })
        .limit(12);

      if (error) {
        console.warn("Error fetching tenant billing payments:", error);
      } else {
        setInternalPayments((data as TenantBillingPaymentRow[]) ?? []);
      }
    } catch (err) {
      console.warn("Unexpected error fetching payments:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (paymentHistory !== undefined) {
      setInternalPayments(paymentHistory);
    } else {
      void fetchPayments();
    }
  }, [tenantId, paymentHistory, fetchPayments, initialDraft.debtAmount]);

  const isDirty = useMemo(
    () => isPaymentsFormDirty(draft, initialDraft),
    [draft, initialDraft]
  );

  const validation = useMemo(
    () => validatePaymentsDraft(draft),
    [draft]
  );

  const savedAmount = useMemo(() => {
    try {
      return parseDebtAmount(initialDraft.debtAmount);
    } catch {
      return null;
    }
  }, [initialDraft.debtAmount]);

  const hasSavedDebt = savedAmount !== null && savedAmount > 0;

  const nextChargePreview = useMemo(() => {
    try {
      const fee = parseMonthlyFeeAmount(draft.monthlyFeeAmount);
      const day = parsePaymentDay(draft.paymentDayOfMonth);
      if (fee !== null && fee > 0 && day !== null && day >= 1 && day <= 31) {
        const nextIso = nextBillingDateAfter(day, new Date());
        return `Próximo cobro: ${formatBillingDateDisplay(nextIso)}`;
      }
      return null;
    } catch {
      return null;
    }
  }, [draft.monthlyFeeAmount, draft.paymentDayOfMonth]);

  const isBalanceCurrencyDisabled = useMemo(() => {
    let fee = 0;
    try {
      fee = parseMonthlyFeeAmount(draft.monthlyFeeAmount) ?? 0;
    } catch {
      fee = 0;
    }
    return fee > 0;
  }, [draft.monthlyFeeAmount]);

  const debtStatus = useMemo(() => {
    let parsed: number | null = null;
    try {
      parsed = parseDebtAmount(draft.debtAmount);
    } catch {
      parsed = null;
    }
    const resolvedDueDate = resolveDebtDueDate({
      amount: parsed,
      existingDueDate: draft.debtDueDate,
      hadSavedDebt: hasSavedDebt,
      today: new Date(),
    });
    return getDebtStatus(new Date(), {
      amount: parsed,
      currency: draft.debtCurrency,
      dueDate: resolvedDueDate,
    });
  }, [draft.debtAmount, draft.debtCurrency, draft.debtDueDate, hasSavedDebt]);

  const statusBadgeInfo = useMemo(() => {
    switch (debtStatus.kind) {
      case "none":
        return {
          label: "Sin deuda",
          className: "border border-[rgba(72,72,71,0.3)] bg-[rgba(255,255,255,0.05)] text-[#adaaaa]",
          dotColor: "bg-[#adaaaa]",
        };
      case "upcoming":
        return {
          label: "Vence mañana",
          className: "border border-amber-500/30 bg-amber-500/10 text-amber-400",
          dotColor: "bg-amber-400",
        };
      case "due_today":
        return {
          label: "Vence hoy",
          className: "border border-amber-500/30 bg-amber-500/10 text-amber-400",
          dotColor: "bg-amber-400",
        };
      case "overdue":
        return {
          label: `Vencida hace ${debtStatus.daysOverdue} día${debtStatus.daysOverdue === 1 ? "" : "s"}`,
          className: "border border-orange-500/30 bg-orange-500/10 text-orange-400",
          dotColor: "bg-orange-400",
        };
      case "locked":
        return {
          label: "Deshabilitado",
          className: "border border-[rgba(255,113,108,0.3)] bg-[rgba(255,113,108,0.1)] text-[#ff716c]",
          dotColor: "bg-[#ff716c]",
        };
    }
  }, [debtStatus]);

  const paymentsToDisplay = paymentHistory !== undefined ? paymentHistory : internalPayments;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Card className="border border-[rgba(72,72,71,0.18)] bg-[#131313] rounded-[16px]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] p-2.5 bg-[rgba(255,144,109,0.1)] text-[#ff906d]">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="font-['Space_Grotesk',sans-serif] font-bold text-base text-white">
                Ciclo de facturación y cobro
              </CardTitle>
              <CardDescription className="text-xs text-[#adaaaa]">
                Configura los parámetros de vencimiento para la cuota mensual del restaurante.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Section 1: Cuota mensual */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-white">
                Cuota mensual
              </Label>
              {nextChargePreview && (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs px-2.5 py-0.5"
                >
                  {nextChargePreview}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="monthly-fee-amount-input" className="text-xs text-[#adaaaa]">
                  Monto
                </Label>
                <Input
                  id="monthly-fee-amount-input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={draft.monthlyFeeAmount}
                  onChange={(e) => {
                    const newFee = e.target.value;
                    let fee = 0;
                    try {
                      fee = parseMonthlyFeeAmount(newFee) ?? 0;
                    } catch {
                      fee = 0;
                    }
                    onChange({
                      ...draft,
                      monthlyFeeAmount: newFee,
                      ...(fee > 0 ? { debtCurrency: draft.monthlyFeeCurrency } : {}),
                    });
                  }}
                  className={`rounded-[10px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] text-sm text-white focus:border-[#ff906d]/50 ${
                    validation.errors.monthlyFeeAmount ? "border-[#ff716c] focus-visible:ring-[#ff716c]/30" : ""
                  }`}
                />
                {validation.errors.monthlyFeeAmount && (
                  <p className="text-xs text-[#ff716c]">{validation.errors.monthlyFeeAmount}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monthly-fee-currency-select" className="text-xs text-[#adaaaa]">
                  Moneda
                </Label>
                <select
                  id="monthly-fee-currency-select"
                  value={draft.monthlyFeeCurrency}
                  onChange={(e) => {
                    const newCurrency = e.target.value as DebtCurrency;
                    let fee = 0;
                    try {
                      fee = parseMonthlyFeeAmount(draft.monthlyFeeAmount) ?? 0;
                    } catch {
                      fee = 0;
                    }
                    onChange({
                      ...draft,
                      monthlyFeeCurrency: newCurrency,
                      ...(fee > 0 ? { debtCurrency: newCurrency } : {}),
                    });
                  }}
                  className={`w-full h-9 rounded-[10px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] text-sm text-white px-3 focus:border-[#ff906d]/50 focus:outline-none cursor-pointer ${
                    validation.errors.monthlyFeeCurrency ? "border-[#ff716c]" : ""
                  }`}
                >
                  <option value="DOP">DOP</option>
                  <option value="USD">USD</option>
                </select>
                {validation.errors.monthlyFeeCurrency && (
                  <p className="text-xs text-[#ff716c]">{validation.errors.monthlyFeeCurrency}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-day-input" className="text-xs text-[#adaaaa]">
                Día de pago mensual
              </Label>
              <div className="relative max-w-xs">
                <Input
                  id="payment-day-input"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Sin configurar"
                  value={draft.paymentDayOfMonth}
                  onChange={(e) =>
                    onChange({ ...draft, paymentDayOfMonth: e.target.value })
                  }
                  className={`rounded-[10px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] text-sm text-white focus:border-[#ff906d]/50 ${
                    validation.errors.paymentDayOfMonth ? "border-[#ff716c] focus-visible:ring-[#ff716c]/30" : ""
                  }`}
                />
                <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-[#adaaaa] pointer-events-none" />
              </div>
              {validation.errors.paymentDayOfMonth && (
                <p className="text-xs text-[#ff716c]">{validation.errors.paymentDayOfMonth}</p>
              )}
            </div>

            <p className="text-xs text-[#adaaaa] leading-relaxed">
              Cada mes, el día de pago, esta cuota se suma al saldo pendiente. El primer cobro es el próximo día de pago.
            </p>
          </div>

          {/* Section 2: Saldo pendiente */}
          <div className="border-t border-[rgba(72,72,71,0.18)] pt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Label className="text-sm font-medium text-white">
                  Saldo pendiente
                </Label>
                <Badge
                  variant="outline"
                  className={`gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${statusBadgeInfo.className}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusBadgeInfo.dotColor}`} />
                  {statusBadgeInfo.label}
                </Badge>
              </div>

              {hasSavedDebt && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={saving}
                  onClick={onMarkPaid}
                  className="gap-1.5 text-xs font-bold rounded-[10px] bg-[#ff906d] text-black hover:bg-[#ff8059] disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Pagó
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="debt-amount-input" className="text-xs text-[#adaaaa]">
                  Monto
                </Label>
                <Input
                  id="debt-amount-input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={draft.debtAmount}
                  onChange={(e) =>
                    onChange({ ...draft, debtAmount: e.target.value })
                  }
                  className={`rounded-[10px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] text-sm text-white focus:border-[#ff906d]/50 ${
                    validation.errors.debtAmount ? "border-[#ff716c] focus-visible:ring-[#ff716c]/30" : ""
                  }`}
                />
                {validation.errors.debtAmount && (
                  <p className="text-xs text-[#ff716c]">{validation.errors.debtAmount}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="debt-currency-select" className="text-xs text-[#adaaaa]">
                  Moneda
                </Label>
                <select
                  id="debt-currency-select"
                  value={draft.debtCurrency}
                  disabled={isBalanceCurrencyDisabled}
                  onChange={(e) =>
                    onChange({ ...draft, debtCurrency: e.target.value as DebtCurrency })
                  }
                  className={`w-full h-9 rounded-[10px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] text-sm text-white px-3 focus:border-[#ff906d]/50 focus:outline-none cursor-pointer ${
                    isBalanceCurrencyDisabled ? "opacity-60 cursor-not-allowed" : ""
                  } ${validation.errors.debtCurrency ? "border-[#ff716c]" : ""}`}
                >
                  <option value="DOP">DOP</option>
                  <option value="USD">USD</option>
                </select>
                {validation.errors.debtCurrency && (
                  <p className="text-xs text-[#ff716c]">{validation.errors.debtCurrency}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[#adaaaa] leading-relaxed">
                Monto vacío o en 0 indica que el cliente no tiene deuda. La deuda vence el día en que se registra y se dan 3 días de gracia antes de bloquear el servicio.
              </p>
              {hasSavedDebt && isValidIsoDate(initialDraft.debtDueDate) && (
                <p className="text-xs text-[#adaaaa]">
                  Vence el {formatIsoDateDisplay(initialDraft.debtDueDate)}
                </p>
              )}
            </div>
          </div>

          {/* Section 3: Historial de pagos */}
          <div className="border-t border-[rgba(72,72,71,0.18)] pt-5 space-y-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#adaaaa]" />
              <Label className="text-sm font-medium text-white">
                Historial de pagos
              </Label>
            </div>

            {loadingHistory ? (
              <p className="text-xs text-[#adaaaa] py-2">Cargando pagos...</p>
            ) : paymentsToDisplay.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[rgba(72,72,71,0.3)] bg-[#1a1a1a]/50 p-4 text-center">
                <p className="text-xs text-[#adaaaa]">
                  Todavía no hay pagos registrados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[10px] border border-[rgba(72,72,71,0.2)] bg-[#1a1a1a]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[rgba(72,72,71,0.2)] text-[10px] uppercase tracking-[0.5px] text-[#adaaaa]">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Fecha</th>
                      <th className="py-2.5 px-3 font-medium">Monto</th>
                      <th className="py-2.5 px-3 font-medium">Moneda</th>
                      <th className="py-2.5 px-3 font-medium">Nota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(72,72,71,0.12)] font-mono text-white">
                    {paymentsToDisplay.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2 px-3 text-[#adaaaa] whitespace-nowrap">
                          {formatPaymentTimestamp(p.paid_at)}
                        </td>
                        <td className="py-2 px-3 font-bold text-[#ff906d] whitespace-nowrap">
                          {formatDebtAmount(p.amount, p.currency)}
                        </td>
                        <td className="py-2 px-3 text-[#adaaaa] whitespace-nowrap">
                          {p.currency}
                        </td>
                        <td className="py-2 px-3 text-[#adaaaa] font-sans truncate max-w-[180px]">
                          {p.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-4 rounded-[16px] border border-[rgba(72,72,71,0.25)] bg-[#131313]/95 p-4 shadow-sm">
        <div className="text-xs text-[#adaaaa]">
          {isDirty ? (
            <span className="text-amber-400 font-medium">Hay cambios pendientes sin guardar</span>
          ) : (
            <span>No hay cambios en los pagos o deuda</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={onReset}
              className="gap-1.5 text-xs rounded-[10px] border border-[rgba(72,72,71,0.3)] text-[#adaaaa] hover:border-white hover:text-white bg-transparent cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Descartar
            </Button>
          )}

          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!isDirty || !validation.valid || saving}
            onClick={onSave}
            className="gap-1.5 text-xs font-bold rounded-[10px] bg-[#ff906d] text-black hover:bg-[#ff8059] disabled:opacity-50 cursor-pointer transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
