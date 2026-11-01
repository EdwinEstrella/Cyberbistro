import { useMemo } from "react";
import { CreditCard, Calendar, Save, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../../shared/ui/card";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import type { LimitDraft } from "../lib/types";
import { isPaymentsFormDirty, validatePaymentDayInput } from "../lib/dirtyDetection";

interface PaymentsFormProps {
  draft: LimitDraft;
  initialDraft: LimitDraft;
  saving: boolean;
  onChange: (updated: LimitDraft) => void;
  onSave: () => void;
  onReset: () => void;
}

export function PaymentsForm({
  draft,
  initialDraft,
  saving,
  onChange,
  onSave,
  onReset,
}: PaymentsFormProps) {
  const isDirty = useMemo(
    () => isPaymentsFormDirty(draft, initialDraft),
    [draft, initialDraft]
  );

  const validation = useMemo(
    () => validatePaymentDayInput(draft.paymentDayOfMonth),
    [draft.paymentDayOfMonth]
  );

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

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-day-input" className="text-sm font-medium text-white">
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
                  !validation.valid ? "border-[#ff716c] focus-visible:ring-[#ff716c]/30" : ""
                }`}
              />
              <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-[#adaaaa] pointer-events-none" />
            </div>

            {!validation.valid ? (
              <p className="text-xs text-[#ff716c]">{validation.error}</p>
            ) : (
              <p className="text-xs text-[#adaaaa] leading-relaxed">
                Ingresa un valor entre 1 y 31. Los meses con menos días se ajustan automáticamente
                al último día hábil. Si se deja vacío, no se emitirán recordatorios de cobro.
              </p>
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
            <span>No hay cambios en la fecha de pago</span>
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
            {saving ? "Guardando..." : "Guardar día de pago"}
          </Button>
        </div>
      </div>
    </div>
  );
}
