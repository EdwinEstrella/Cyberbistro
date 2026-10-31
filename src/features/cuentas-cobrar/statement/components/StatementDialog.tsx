import { useEffect, useState } from "react";
import {
  FileText,
  Download,
  Eye,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../../../../shared/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../../../shared/ui/dialog";
import { DatePicker } from "../../../../shared/ui/date-picker";
import { Button } from "../../../../shared/ui/button";
import {
  buildStatementFileName,
  getDefaultStatementDateRange,
  validateStatementDateRange,
} from "../lib/statementFormat";
import { buildStatementPdf } from "../lib/statementPdf";
import { fetchCompanyStatement, resolveStatementTenant } from "../lib/statementApi";

export interface StatementCustomerTarget {
  id: string;
  name: string;
  document_id?: string | null;
}

export interface StatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: StatementCustomerTarget | null;
}

export function StatementDialog({
  open,
  onOpenChange,
  customer,
}: StatementDialogProps) {
  const { tenantId } = useAuth();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loadingAction, setLoadingAction] = useState<"preview" | "download" | null>(
    null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // Initialize or reset date range on dialog open
  useEffect(() => {
    if (open) {
      const def = getDefaultStatementDateRange();
      setDateFrom(def.from);
      setDateTo(def.to);
      setValidationError(null);
      setApiError(null);
      setPreviewBlobUrl(null);
    } else {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
        setPreviewBlobUrl(null);
      }
    }
  }, [open]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  const handleDateFromChange = (val: string) => {
    setDateFrom(val);
    setValidationError(null);
    setApiError(null);
  };

  const handleDateToChange = (val: string) => {
    setDateTo(val);
    setValidationError(null);
    setApiError(null);
  };

  const generateDoc = async () => {
    if (!customer?.id) {
      throw new Error("No se ha seleccionado ningún cliente.");
    }

    const check = validateStatementDateRange(dateFrom, dateTo);
    if (!check.valid) {
      setValidationError(check.error || "Rango de fechas no válido.");
      return null;
    }

    setValidationError(null);
    setApiError(null);

    const [data, tenant] = await Promise.all([
      fetchCompanyStatement(customer.id, dateFrom, dateTo),
      tenantId ? resolveStatementTenant(tenantId) : Promise.resolve(null),
    ]);

    return { doc: buildStatementPdf(data, tenant), data };
  };

  const handlePreview = async () => {
    try {
      setLoadingAction("preview");
      const result = await generateDoc();
      if (!result) return;

      const blob = result.doc.output("blob");
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
      const newUrl = URL.createObjectURL(blob);
      setPreviewBlobUrl(newUrl);

      // Attempt opening in new window/tab as well (works in web browsers)
      try {
        window.open(newUrl, "_blank");
      } catch {
        // Fallback: iframe preview rendered directly in the dialog
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado.";
      setApiError(msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDownload = async () => {
    try {
      setLoadingAction("download");
      const result = await generateDoc();
      if (!result) return;

      const fileName = buildStatementFileName(
        result.data.customer.name || customer?.name || "cliente",
        dateFrom,
        dateTo
      );
      result.doc.save(fileName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado.";
      setApiError(msg);
    } finally {
      setLoadingAction(null);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col bg-zinc-950 border-zinc-800 text-white p-6 gap-5">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="font-['Space_Grotesk'] text-lg font-bold text-white">
                Estado de cuenta (PDF)
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                {customer.name}
                {customer.document_id ? ` · RNC/Cédula: ${customer.document_id}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Date Filter & Action Controls */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-['Space_Grotesk']">
                Desde
              </label>
              <DatePicker
                value={dateFrom}
                onChange={handleDateFromChange}
                placeholder="Fecha inicial"
                className="bg-zinc-950 border-zinc-800 text-zinc-200"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-['Space_Grotesk']">
                Hasta
              </label>
              <DatePicker
                value={dateTo}
                onChange={handleDateToChange}
                placeholder="Fecha final"
                className="bg-zinc-950 border-zinc-800 text-zinc-200"
              />
            </div>
          </div>

          {/* Validation or API Errors */}
          {validationError && (
            <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {apiError && (
            <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{apiError}</span>
            </div>
          )}

          {/* Buttons: Vista previa & Descargar PDF */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => void handlePreview()}
              className="bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:text-white text-xs font-bold font-['Space_Grotesk']"
            >
              {loadingAction === "preview" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Cargando...
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  Vista previa
                </>
              )}
            </Button>

            <Button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => void handleDownload()}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold font-['Space_Grotesk']"
            >
              {loadingAction === "download" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Generando...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Descargar PDF
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Embedded Iframe Preview (works reliably in Electron & Web) */}
        {previewBlobUrl && (
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span className="font-medium">Vista previa del documento (A4)</span>
              <a
                href={previewBlobUrl}
                target="_blank"
                rel="noreferrer"
                className="text-orange-400 hover:underline flex items-center gap-1 font-medium"
              >
                Abrir en pestaña completa
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex-1 min-h-[380px] h-[480px] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
              <iframe
                src={previewBlobUrl}
                title="Vista previa del estado de cuenta"
                className="w-full h-full border-none"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
