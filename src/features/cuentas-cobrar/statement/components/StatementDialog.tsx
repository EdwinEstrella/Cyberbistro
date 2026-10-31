import { useEffect, useState } from "react";
import {
  FileText,
  Download,
  Eye,
  AlertCircle,
  Loader2,
  ExternalLink,
  Receipt,
  Lock,
  Printer,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { useSucursal } from "../../../../app/context/SucursalContext";
import { canAttemptCloudRead } from "../../../../shared/lib/cloudAvailability";
import { canUseFeature } from "../../../../shared/lib/planFeatures";
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
import {
  previewConsolidatedInvoice,
  issueConsolidatedInvoice,
  buildConsolidatedInvoiceConfirmMessage,
  mapConsolidatedInvoiceError,
  formatRdCurrency,
  printConsolidatedInvoiceReceipt,
  type ConsolidatedInvoicePreview,
  type IssueConsolidatedInvoiceResult,
} from "../lib/consolidatedInvoiceService";

export interface StatementCustomerTarget {
  id: string;
  name: string;
  document_id?: string | null;
}

export interface StatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: StatementCustomerTarget | null;
  initialMode?: "statement" | "invoice";
}

export function StatementDialog({
  open,
  onOpenChange,
  customer,
  initialMode = "statement",
}: StatementDialogProps) {
  const { tenantId, plan } = useAuth();
  const { activeSucursalId } = useSucursal();

  const canConsolidate = canUseFeature(plan, "consolidated_invoice");
  const [activeTab, setActiveTab] = useState<"statement" | "invoice">("statement");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loadingAction, setLoadingAction] = useState<"preview" | "download" | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  // Consolidated invoice state
  const [loadingInvoicePreview, setLoadingInvoicePreview] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<ConsolidatedInvoicePreview | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [issuedInvoiceResult, setIssuedInvoiceResult] = useState<IssueConsolidatedInvoiceResult | null>(null);
  const [printingInvoice, setPrintingInvoice] = useState(false);

  // Reset state when opening or customer changes
  useEffect(() => {
    if (open) {
      const def = getDefaultStatementDateRange();
      setDateFrom(def.from);
      setDateTo(def.to);
      setValidationError(null);
      setApiError(null);
      setPreviewBlobUrl(null);
      setActiveTab(initialMode === "invoice" && canConsolidate ? "invoice" : "statement");
      setInvoicePreview(null);
      setInvoiceError(null);
      setConfirmDialogOpen(false);
      setIssuingInvoice(false);
      setIssuedInvoiceResult(null);
    } else {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
        setPreviewBlobUrl(null);
      }
    }
  }, [open, customer, initialMode, canConsolidate]);

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
    setInvoicePreview(null);
    setInvoiceError(null);
  };

  const handleDateToChange = (val: string) => {
    setDateTo(val);
    setValidationError(null);
    setApiError(null);
    setInvoicePreview(null);
    setInvoiceError(null);
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

      try {
        window.open(newUrl, "_blank");
      } catch {
        // Fallback: iframe preview rendered directly in dialog
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

  const handleRunInvoicePreview = async () => {
    if (!customer?.id) return;
    const check = validateStatementDateRange(dateFrom, dateTo);
    if (!check.valid) {
      setInvoiceError(check.error || "Rango de fechas no válido.");
      return;
    }

    setLoadingInvoicePreview(true);
    setInvoiceError(null);

    try {
      if (!(await canAttemptCloudRead())) {
        setInvoiceError("Sin conexión con la nube. Revisá tu conexión e intentá de nuevo.");
        return;
      }

      const prev = await previewConsolidatedInvoice(
        customer.id,
        dateFrom,
        dateTo,
        activeSucursalId
      );
      setInvoicePreview(prev);
    } catch (err) {
      setInvoiceError(mapConsolidatedInvoiceError(err));
    } finally {
      setLoadingInvoicePreview(false);
    }
  };

  const handleConfirmIssueInvoice = async () => {
    if (!customer?.id) return;
    setIssuingInvoice(true);
    setInvoiceError(null);

    try {
      if (!(await canAttemptCloudRead())) {
        setInvoiceError("Sin conexión con la nube. Revisá tu conexión e intentá de nuevo.");
        return;
      }

      const res = await issueConsolidatedInvoice(
        customer.id,
        dateFrom,
        dateTo,
        activeSucursalId
      );

      setIssuedInvoiceResult(res);
      setConfirmDialogOpen(false);
      toast.success(`Factura consolidada ${res.ncf} emitida con éxito.`);

      // Trigger local sync like credit notes
      void window.electronAPI?.triggerSync?.().catch(() => undefined);
    } catch (err) {
      setInvoiceError(mapConsolidatedInvoiceError(err));
      setConfirmDialogOpen(false);
    } finally {
      setIssuingInvoice(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!tenantId || !issuedInvoiceResult) return;
    setPrintingInvoice(true);
    try {
      const printed = await printConsolidatedInvoiceReceipt(
        tenantId,
        issuedInvoiceResult.factura_id
      );
      if (printed.ok) {
        toast.success("Comprobante enviado a la impresora.");
      } else {
        toast.error(printed.error ?? "No se pudo imprimir el comprobante.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al imprimir el comprobante.");
    } finally {
      setPrintingInvoice(false);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col bg-zinc-950 border-zinc-800 text-white p-6 gap-5">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                {activeTab === "invoice" ? (
                  <Receipt className="w-5 h-5 text-emerald-400" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
              </div>
              <div>
                <DialogTitle className="font-['Space_Grotesk'] text-lg font-bold text-white flex items-center gap-2">
                  {activeTab === "invoice"
                    ? "Factura consolidada (e-CF E31)"
                    : "Estado de cuenta (PDF)"}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400">
                  {customer.name}
                  {customer.document_id ? ` · RNC/Cédula: ${customer.document_id}` : ""}
                </DialogDescription>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab("statement")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-['Space_Grotesk'] transition-all ${
                  activeTab === "statement"
                    ? "bg-zinc-800 text-orange-400 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Estado de cuenta</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("invoice")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-['Space_Grotesk'] transition-all ${
                  activeTab === "invoice"
                    ? "bg-zinc-800 text-emerald-400 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {canConsolidate ? (
                  <Receipt className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Factura e-CF</span>
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* TAB 1: ESTADO DE CUENTA (PDF) */}
        {activeTab === "statement" && (
          <>
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

            {/* Embedded Iframe Preview */}
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
          </>
        )}

        {/* TAB 2: FACTURA CONSOLIDADA (E31) */}
        {activeTab === "invoice" && (
          <div className="flex flex-col gap-4">
            {!canConsolidate ? (
              /* Locked Upsell Card for non-Corporativo */
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="flex flex-col gap-1 max-w-md">
                  <h3 className="font-['Space_Grotesk'] text-base font-bold text-white">
                    Facturación consolidada (e-CF E31)
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Emití un e-CF mensual de crédito fiscal consolidando todos los consumos del período
                    a nombre de la empresa, sin duplicar deuda en cuentas por cobrar.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 font-['Space_Grotesk']">
                  <Sparkles className="w-3.5 h-3.5" />
                  Disponible en el plan Corporativo
                </span>
              </div>
            ) : issuedInvoiceResult ? (
              /* Success View */
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-6 flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="font-['Space_Grotesk'] text-lg font-bold text-white">
                    Factura consolidada emitida con éxito
                  </h3>
                  <p className="text-xs text-zinc-300">
                    Se emitió el comprobante fiscal electrónico <strong>{issuedInvoiceResult.ncf}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full max-w-sm bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-left">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-['Space_Grotesk'] font-bold">Total Facturado</span>
                    <p className="text-sm font-bold text-white font-['Space_Grotesk']">{formatRdCurrency(issuedInvoiceResult.total)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-['Space_Grotesk'] font-bold">Pedidos Agrupados</span>
                    <p className="text-sm font-bold text-white font-['Space_Grotesk']">{issuedInvoiceResult.count}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={() => void handlePrintReceipt()}
                    disabled={printingInvoice}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold font-['Space_Grotesk']"
                  >
                    {printingInvoice ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Imprimiendo...
                      </>
                    ) : (
                      <>
                        <Printer className="w-3.5 h-3.5 mr-1.5" />
                        Imprimir comprobante
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    onClick={() => void handleDownload()}
                    disabled={loadingAction === "download"}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold font-['Space_Grotesk']"
                  >
                    {loadingAction === "download" ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Descargando...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Descargar estado de cuenta (PDF)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              /* Invoice Controls & Preview */
              <div className="flex flex-col gap-4">
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

                  {invoiceError && (
                    <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{invoiceError}</span>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      disabled={loadingInvoicePreview}
                      onClick={() => void handleRunInvoicePreview()}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold font-['Space_Grotesk']"
                    >
                      {loadingInvoicePreview ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          Consultando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          Consultar pedidos a facturar
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Preview Summary */}
                {invoicePreview && (
                  <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-4">
                    {/* Buyer & Eligibility checks */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                      <div>
                        <span className="text-[11px] text-zinc-400 uppercase font-bold font-['Space_Grotesk']">
                          Cliente Comprador
                        </span>
                        <p className="text-sm font-bold text-white">{invoicePreview.customer.name}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">
                          RNC: <span className="text-zinc-200 font-mono">{invoicePreview.customer.document_id || "No registrado"}</span>
                        </span>
                        {invoicePreview.customer.rnc_valid ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-['Space_Grotesk']">
                            RNC válido
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400 font-['Space_Grotesk']">
                            RNC inválido
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Totals Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
                        <span className="text-[10px] text-zinc-500 uppercase font-['Space_Grotesk'] font-bold">Pedidos</span>
                        <p className="text-base font-bold text-white font-['Space_Grotesk']">{invoicePreview.count}</p>
                      </div>
                      <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
                        <span className="text-[10px] text-zinc-500 uppercase font-['Space_Grotesk'] font-bold">Subtotal</span>
                        <p className="text-base font-bold text-zinc-200 font-['Space_Grotesk']">
                          {invoicePreview.subtotal != null ? formatRdCurrency(invoicePreview.subtotal) : "—"}
                        </p>
                      </div>
                      <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
                        <span className="text-[10px] text-zinc-500 uppercase font-['Space_Grotesk'] font-bold">ITBIS</span>
                        <p className="text-base font-bold text-zinc-200 font-['Space_Grotesk']">
                          {invoicePreview.itbis != null ? formatRdCurrency(invoicePreview.itbis) : "—"}
                        </p>
                      </div>
                      <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
                        <span className="text-[10px] text-zinc-500 uppercase font-['Space_Grotesk'] font-bold">Total (E31)</span>
                        <p className="text-base font-bold text-emerald-400 font-['Space_Grotesk']">{formatRdCurrency(invoicePreview.total)}</p>
                      </div>
                    </div>

                    {/* Blocked reason warnings */}
                    {invoicePreview.blocked_reason && (
                      <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>
                          {invoicePreview.blocked_reason === "NOTHING_TO_INVOICE"
                            ? "No hay pedidos pendientes de facturar en este rango de fechas."
                            : invoicePreview.blocked_reason === "BUYER_RNC_INVALID"
                            ? "El RNC/Cédula del cliente debe tener 9 u 11 dígitos numéricos para emitir un e-CF de crédito fiscal (E31)."
                            : invoicePreview.blocked_reason === "PLAN_REQUIRED"
                            ? "Disponible en el plan Corporativo."
                            : invoicePreview.blocked_reason === "ITBIS_NOT_INCLUDED_UNSUPPORTED"
                            ? "La factura consolidada requiere que los precios incluyan ITBIS (Ajustes → Facturación → ITBIS incluido en precio). Así el total de la factura coincide con lo que debe la empresa."
                            : invoicePreview.blocked_reason === "TOTAL_MISMATCH"
                            ? "No se pudo emitir: el total no coincide con la deuda. Contactá a soporte."
                            : invoicePreview.blocked_reason}
                        </span>
                      </div>
                    )}

                    {/* Issue action button */}
                    {!invoicePreview.blocked_reason && invoicePreview.count > 0 && (
                      <div className="flex justify-end pt-2">
                        <Button
                          type="button"
                          onClick={() => setConfirmDialogOpen(true)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-['Space_Grotesk']"
                        >
                          <Receipt className="w-3.5 h-3.5 mr-1.5" />
                          Emitir factura consolidada (e-CF)
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmDialogOpen && invoicePreview && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-['Space_Grotesk'] text-base font-bold text-white">
                    Confirmar emisión de e-CF
                  </h4>
                  <p className="text-xs text-zinc-400">Crédito fiscal (E31)</p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                {buildConsolidatedInvoiceConfirmMessage(
                  invoicePreview.customer.name,
                  invoicePreview.total
                )}
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={issuingInvoice}
                  onClick={() => setConfirmDialogOpen(false)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-300 text-xs font-bold font-['Space_Grotesk']"
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  disabled={issuingInvoice}
                  onClick={() => void handleConfirmIssueInvoice()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-['Space_Grotesk']"
                >
                  {issuingInvoice ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Emitiendo...
                    </>
                  ) : (
                    "Confirmar y emitir"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
