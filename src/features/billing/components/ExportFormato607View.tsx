import { Download, FileText, RefreshCw, AlertCircle, CheckCircle2, Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/select";
import { Button } from "../../../shared/ui/button";
import type { ConsumoSummaryResult } from "../../contabilidad/lib/formato607";
import type { MonthOption } from "../../contabilidad/lib/formato607Export";

export interface ExportFormato607ViewProps {
  selectedMonth: string;
  monthOptions: MonthOption[];
  loading: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  summary: ConsumoSummaryResult | null;
  onMonthChange: (month: string) => void;
  onExport: (format: "txt" | "csv") => void;
}

const RD = (n: number) =>
  "RD$ " +
  Number(n).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function ExportFormato607View({
  selectedMonth,
  monthOptions,
  loading,
  errorMessage,
  successMessage,
  summary,
  onMonthChange,
  onExport,
}: ExportFormato607ViewProps) {
  return (
    <div className="bg-card rounded-[20px] border border-border p-4 sm:p-5 shadow-sm flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-primary shrink-0" />
          <div>
            <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-[14px] text-foreground tracking-wide">
              Exportar Formato 607 (Ventas DGII)
            </h3>
            <p className="text-[11px] text-muted-foreground font-medium">
              Envío mensual de ventas de bienes y servicios · Presentar a más tardar el día 15 del mes siguiente
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Mes:
            </span>
            <Select value={selectedMonth} onValueChange={onMonthChange} disabled={loading}>
              <SelectTrigger className="w-[180px] rounded-xl bg-muted/60 border border-border h-[36px] text-[13px] capitalize font-medium">
                <SelectValue placeholder="Seleccionar mes" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border">
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="capitalize cursor-pointer">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onExport("txt")}
              disabled={loading}
              className="rounded-xl border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-[11px] font-bold uppercase tracking-wider h-[36px]"
              title="Descargar archivo TXT para la DGII"
            >
              {loading ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              TXT
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => onExport("csv")}
              disabled={loading}
              className="rounded-xl border-border bg-muted/60 text-foreground hover:bg-accent text-[11px] font-bold uppercase tracking-wider h-[36px]"
              title="Descargar archivo CSV compatible con Excel"
            >
              {loading ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <FileText size={13} />
              )}
              Excel (CSV)
            </Button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-[12px] text-destructive">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-2 rounded-xl bg-primary/10 border border-primary/20 p-3 text-[12px] text-foreground">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-primary" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-primary">{successMessage}</span>
            {summary && (
              <div className="mt-1 text-[11px] text-foreground bg-background/50 rounded-lg p-2.5 border border-border">
                <span className="font-bold text-primary block">
                  Resumen General de Facturas de Consumo (&lt; RD$ 250,000):
                </span>
                <span className="text-muted-foreground block mt-0.5">
                  Cantidad: <strong className="text-foreground">{summary.count}</strong> comprobante(s) · Monto facturado: <strong className="text-foreground">{RD(summary.totalMontoFacturado)}</strong>
                </span>
                <span className="text-[10px] text-muted-foreground italic block mt-1">
                  (Este resumen no va en el detalle del 607; se digita directamente en el formulario de la Oficina Virtual de la DGII).
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
