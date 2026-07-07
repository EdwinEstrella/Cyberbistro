import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { reenqueueEcfDocument, type FiscalRpcClient } from "../lib/reenqueueEcfDocument";
import { getLocalFirstStatusSnapshot, readLocalMirror } from "../../../shared/lib/localFirst";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { cacheLogoFromUrl } from "../../../shared/lib/logoCache";
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCcw, 
  FileText, 
  QrCode, 
  Download, 
  X, 
  Search, 
  Printer, 
  Eye, 
  DollarSign 
} from "lucide-react";

export function FiscalPanel() {
  const { tenantId } = useAuth();
  const [resubmitting, setResubmitting] = useState<string | null>(null);
  const [selectedQr, setSelectedQr] = useState<{ src: string, link: string, trackId: string } | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewingBatchError, setViewingBatchError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await insforgeClient.database
        .from("ecf_documents")
        .select(`
          *,
          facturas ( id, numero_factura, ncf, cliente_nombre, cliente_rnc, total, subtotal, itbis, metodo_pago, items, created_at ),
          tenants ( rnc, nombre_negocio ),
          ecf_batches ( id, status, last_error, dgii_status_message ),
          fiscal_outbox ( id, status, error_message )
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchDocuments();
    const intervalId = setInterval(fetchDocuments, 10000);
    return () => clearInterval(intervalId);
  }, [fetchDocuments]);

  async function handleResubmit(documentId: string) {
    if (!tenantId) return;
    setResubmitting(documentId);
    try {
      await reenqueueEcfDocument({
        client: insforgeClient as unknown as FiscalRpcClient,
        tenantId,
        ecfDocumentId: documentId,
      });
      await fetchDocuments();
    } catch (err) {
      console.error(err);
      alert("Error al reencolar el documento.");
    } finally {
      setResubmitting(null);
    }
  }

  async function handleReprint(doc: any) {
    if (!tenantId) return;
    try {
      let tenant: any = null;
      let factura: any = doc.facturas;

      const snapshot = await getLocalFirstStatusSnapshot(tenantId);
      const localMode = snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing";

      if (localMode || !navigator.onLine) {
        const allTenants = await readLocalMirror<any>(tenantId, "tenants").catch(() => []);
        tenant = allTenants.find((t: any) => t.id === tenantId);
        if (!factura) {
          const allFacturas = await readLocalMirror<any>(tenantId, "facturas").catch(() => []);
          factura = allFacturas.find((f: any) => f.id === doc.factura_id);
        }
      } else {
        const { data: tenantData } = await insforgeClient.database
          .from("tenants")
          .select("nombre_negocio, rnc, direccion, telefono, logo_url, ecf_environment, logo_size_px, logo_offset_x, logo_offset_y, moneda")
          .eq("id", tenantId)
          .maybeSingle();
        tenant = tenantData;

        if (!factura) {
          const { data: factData } = await insforgeClient.database
            .from("facturas")
            .select("*")
            .eq("id", doc.factura_id)
            .maybeSingle();
          factura = factData;
        }
      }

      if (!tenant) {
        tenant = {
          nombre_negocio: doc.tenants?.nombre_negocio,
          rnc: doc.tenants?.rnc,
        };
      }

      if (!factura) {
        console.error("Factura no encontrada para reimpresión");
        alert("No se encontró la factura a reimprimir.");
        return;
      }

      const paperWidthMm = getThermalPrintSettings().paperWidthMm;
      if (tenant.logo_url) {
        void cacheLogoFromUrl(tenant.logo_url);
      }
      const html = await buildFacturaReceiptHtml(
        {
          nombre_negocio: tenant.nombre_negocio || "",
          rnc: tenant.rnc || "",
          direccion: tenant.direccion || "",
          telefono: tenant.telefono || "",
          logo_url: tenant.logo_url || "",
          ecf_environment: tenant.ecf_environment || "certification",
          moneda: tenant.moneda || "DOP",
          logo_size_px: tenant.logo_size_px,
          logo_offset_x: tenant.logo_offset_x,
          logo_offset_y: tenant.logo_offset_y,
        },
        {
          ...factura,
          ecf_status: doc.status ?? null,
          ecf_track_id: doc.dgii_track_id ?? null,
          ecf_security_code: doc.dgii_security_code ?? null,
          ecf_submitted_at: doc.submitted_at ?? null,
        },
        factura.numero_factura || 0,
        paperWidthMm
      );

      const res = await printThermalHtml(html, { silent: true, printType: "sales" });
      if (!res.ok && res.error) {
        console.error("Error al reimprimir:", res.error);
        alert(`Error al imprimir: ${res.error}`);
      }
    } catch (err) {
      console.error("Error en reimpresión:", err);
      alert("Ocurrió un error inesperado al intentar reimprimir.");
    }
  }

  // KPIs
  const totalCount = documents.length;
  const acceptedCount = documents.filter(d => d.status === "accepted").length;
  const rejectedCount = documents.filter(d => d.status === "rejected" || d.status === "terminal_error").length;
  const pendingCount = documents.filter(d => ["pending_sync", "pending_offline", "queued", "signed", "submitted"].includes(d.status)).length;
  const totalAmount = documents.reduce((sum, d) => sum + Number(d.facturas?.total || 0), 0);

  // Filtrado
  const filteredDocs = documents.filter(doc => {
    const matchesStatus = statusFilter === "all" || doc.status === statusFilter;
    const matchesSearch = 
      (doc.facturas?.ncf || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.facturas?.cliente_nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.facturas?.numero_factura || "").toString().includes(searchTerm) ||
      (doc.dgii_track_id || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const hasConfigError = documents.some(
    (d) =>
      d.status === "pending_configuration" ||
      (d.fiscal_outbox &&
        Array.isArray(d.fiscal_outbox) &&
        d.fiscal_outbox.some((o: any) => o.status === "blocked_configuration"))
  );

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground font-['Space_Grotesk']">Cargando documentos fiscales...</div>;
  }

  return (
    <div className="flex-1 p-4 sm:p-8 bg-background min-h-0 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto">
        
        {/* Cabecera Principal */}
        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 mb-8 shadow-sm">
          <div className="flex justify-between items-start gap-4">
            <div>
              <span className="text-primary text-[11px] font-bold uppercase tracking-[0.2em] mb-2 block">Administración Fiscal</span>
              <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold text-foreground mb-4">Panel e-CF</h1>
              <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
                Monitorea y gestiona todos los comprobantes fiscales electrónicos (e-CF) emitidos a la DGII.
                Reencola envíos fallidos y audita de forma segura en tiempo real.
              </p>
            </div>
            <div className="bg-primary/10 p-4 rounded-full hidden sm:block">
              <FileText className="w-8 h-8 text-primary" />
            </div>
          </div>
          {hasConfigError && (
            <div className="mt-6 flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Se detectaron errores de configuración en algunos documentos. Revisa los detalles de los envíos para corregirlos.
              </p>
            </div>
          )}
        </div>

        {/* KPIs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1">Total Emitidos</span>
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold text-foreground">{totalCount}</span>
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
          <div className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <span className="text-green-600 dark:text-green-400 text-xs font-bold uppercase tracking-wider block mb-1">Aceptados</span>
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold text-foreground">{acceptedCount}</span>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
          </div>
          <div className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <span className="text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider block mb-1">Rechazados</span>
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold text-foreground">{rejectedCount}</span>
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <div className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <span className="text-yellow-600 dark:text-yellow-400 text-xs font-bold uppercase tracking-wider block mb-1">Pendientes</span>
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold text-foreground">{pendingCount}</span>
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
          </div>
          <div className="bg-card border border-black/5 dark:border-white/5 rounded-2xl p-5 shadow-sm">
            <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1">Volumen Total</span>
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold text-foreground">${totalAmount.toLocaleString("es-DO", { minimumFractionDigits: 2 })}</span>
              <DollarSign className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="bg-card rounded-[20px] border border-black/5 dark:border-white/5 p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5" />
            <input
              type="text"
              placeholder="Buscar por NCF, Factura o Cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-all"
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {[
              { id: "all", label: "Todos" },
              { id: "accepted", label: "Aceptados" },
              { id: "rejected", label: "Rechazados" },
              { id: "pending_sync", label: "Pendientes" },
              { id: "retryable_error", label: "Error de Red" }
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer border border-border
                  ${statusFilter === filter.id 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-background text-muted-foreground hover:bg-muted/50"}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla de Resultados */}
        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Factura / e-NCF</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Cliente</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-right">Monto</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Estado DGII</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Fecha</th>
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDocs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                      No se encontraron comprobantes con los filtros seleccionados.
                    </td>
                  </tr>
                )}
                {filteredDocs.map((doc: any) => {
                  const isError = ["rejected", "terminal_error", "retryable_error"].includes(doc.status);
                  const isAccepted = doc.status === "accepted";
                  const isWarning =
                    doc.status === "pending_configuration" ||
                    (doc.fiscal_outbox &&
                      Array.isArray(doc.fiscal_outbox) &&
                      doc.fiscal_outbox.some((o: any) => o.status === "blocked_configuration"));
                  const isPending = !isError && !isAccepted && !isWarning;

                  return (
                    <tr key={doc.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-sm text-foreground">
                          {doc.facturas?.numero_factura ? `#${doc.facturas.numero_factura}` : "S/N"}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">
                          {doc.facturas?.ncf || "S/NCF"}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-foreground">{doc.facturas?.cliente_nombre || "Consumidor Final"}</div>
                        {doc.facturas?.cliente_rnc && <div className="text-xs text-muted-foreground mt-0.5">{doc.facturas?.cliente_rnc}</div>}
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm font-bold text-foreground">
                          ${Number(doc.facturas?.total || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1.5 max-w-[250px]">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider w-fit
                            ${isAccepted ? "bg-green-500/10 text-green-600 dark:text-green-400" : 
                              isError ? "bg-red-500/10 text-red-600 dark:text-red-400" : 
                              "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"}`}
                          >
                            {isAccepted && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {isError && <AlertTriangle className="w-3.5 h-3.5" />}
                            {isWarning && <AlertTriangle className="w-3.5 h-3.5" />}
                            {isPending && <Clock className="w-3.5 h-3.5" />}
                            {doc.status}
                          </div>
                          {isWarning ? (
                            <span className="text-xs text-yellow-600 dark:text-yellow-400 font-bold">
                              Configuración fiscal incompleta. Completa los datos del emisor para enviar este documento a DGII.
                            </span>
                          ) : doc.rejection_scope === "batch" ? (
                            <div className="flex flex-col gap-1 mt-1">
                              <span className="text-xs text-red-600 dark:text-red-400 font-bold">
                                Rechazado por DGII en resumen RFCE
                              </span>
                              <div className="flex gap-2 mt-1">
                                <button
                                  onClick={() => {
                                    const batchObj = Array.isArray(doc.ecf_batches) ? doc.ecf_batches[0] : doc.ecf_batches;
                                    setViewingBatchError(batchObj?.last_error || batchObj?.dgii_status_message || "Error desconocido del lote");
                                  }}
                                  className="text-[10px] text-primary hover:underline font-semibold cursor-pointer"
                                >
                                  Ver error del lote
                                </button>
                                <button
                                  onClick={() => handleResubmit(doc.id)}
                                  disabled={resubmitting === doc.id}
                                  className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  {resubmitting === doc.id ? "Reintentando..." : "Reintentar resumen"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            doc.dgii_status_message && (
                              <span className="text-xs text-muted-foreground line-clamp-2" title={doc.dgii_status_message}>
                                {doc.dgii_status_message}
                              </span>
                            )
                          )}
                          {doc.dgii_track_id && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Track: {doc.dgii_track_id}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {new Date(doc.created_at).toLocaleString()}
                      </td>
                      <td className="p-4 flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedInvoice(doc)}
                          className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Ver Factura"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {doc.dgii_track_id && (
                          <button
                            onClick={async () => {
                              try {
                                const rnc = doc.tenants?.rnc || "";
                                const ncf = doc.facturas?.ncf || "";
                                const url = `https://fc.dgii.gov.do/ecf/consultas?trackId=${doc.dgii_track_id}&rnc=${rnc}&ncf=${ncf}`;
                                const src = await QRCode.toDataURL(url, { margin: 2, width: 300 });
                                setSelectedQr({ src, link: url, trackId: doc.dgii_track_id });
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="p-2 hover:bg-muted rounded-lg text-primary hover:text-primary-foreground transition-colors cursor-pointer"
                            title="Ver QR DGII"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        )}
                        {["rejected", "terminal_error", "retryable_error"].includes(doc.status) && doc.rejection_scope !== "batch" && (
                          <button
                            onClick={() => handleResubmit(doc.id)}
                            disabled={resubmitting === doc.id}
                            className="p-2 hover:bg-muted rounded-lg text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 transition-colors cursor-pointer"
                            title="Reencolar Documento"
                          >
                            <RefreshCcw className={`w-4 h-4 ${resubmitting === doc.id ? "animate-spin" : ""}`} />
                          </button>
                        )}
                        {doc.rejection_scope === "batch" && (
                          <button
                            onClick={() => handleResubmit(doc.id)}
                            disabled={resubmitting === doc.id}
                            className="p-2 hover:bg-muted rounded-lg text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 transition-colors cursor-pointer"
                            title="Reintentar resumen"
                          >
                            <RefreshCcw className={`w-4 h-4 ${resubmitting === doc.id ? "animate-spin" : ""}`} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Ver QR */}
        {selectedQr && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border shadow-2xl rounded-2xl p-6 max-w-sm w-full relative animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setSelectedQr(null)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-['Space_Grotesk'] text-xl font-bold text-foreground mb-1 text-center">Código QR e-CF</h3>
              <p className="text-center text-xs text-muted-foreground mb-6 font-mono">Track ID: {selectedQr.trackId}</p>
              
              <div className="bg-white p-4 rounded-xl border border-border flex justify-center mb-6">
                <img src={selectedQr.src} alt="DGII QR Code" className="w-full max-w-[250px] aspect-square" />
              </div>
              
              <div className="flex flex-col gap-3">
                <a 
                  href={selectedQr.src} 
                  download={`QR-eCF-${selectedQr.trackId}.png`}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:bg-primary/90 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Descargar Imagen QR
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Modal Ver Detalle de Factura */}
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border shadow-2xl rounded-2xl p-6 max-w-xl w-full relative max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setSelectedInvoice(null)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center border-b border-border pb-4 mb-4">
                <span className="text-primary text-[10px] font-bold uppercase tracking-widest block mb-1">
                  {selectedInvoice.tenants?.nombre_negocio || "Bistro"}
                </span>
                <h3 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">
                  Factura #{selectedInvoice.facturas?.numero_factura || "S/N"}
                </h3>
                <p className="text-xs text-muted-foreground font-mono mt-1">NCF: {selectedInvoice.facturas?.ncf || "N/A"}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs mb-6 bg-muted/20 p-4 rounded-xl border border-border/5">
                <div>
                  <p className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] mb-1">Cliente</p>
                  <p className="font-bold text-foreground">{selectedInvoice.facturas?.cliente_nombre || "Consumidor Final"}</p>
                  {selectedInvoice.facturas?.cliente_rnc && (
                    <p className="text-muted-foreground font-mono mt-0.5">{selectedInvoice.facturas.cliente_rnc}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] mb-1">Fecha de Emisión</p>
                  <p className="font-medium text-foreground">
                    {selectedInvoice.facturas?.created_at ? new Date(selectedInvoice.facturas.created_at).toLocaleString() : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] mb-1">Método de Pago</p>
                  <p className="font-bold uppercase text-primary">{selectedInvoice.facturas?.metodo_pago || "efectivo"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] mb-1">Estado Fiscal</p>
                  <p className="font-bold uppercase text-foreground">{selectedInvoice.status}</p>
                </div>
              </div>

              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Ítems de Venta</h4>
              <div className="divide-y divide-border border-y border-border mb-6">
                {(selectedInvoice.facturas?.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-2 text-xs">
                    <div className="flex-1">
                      <span className="font-bold text-foreground">{item.nombre}</span>
                      <span className="text-muted-foreground text-[10px] block mt-0.5">
                        {item.cantidad} x ${Number(item.precio_unitario).toFixed(2)}
                      </span>
                    </div>
                    <span className="font-semibold text-foreground text-right">${Number(item.subtotal).toFixed(2)}</span>
                  </div>
                ))}
                {(selectedInvoice.facturas?.items || []).length === 0 && (
                  <p className="text-center py-4 text-xs text-muted-foreground">No hay ítems registrados en esta factura.</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 text-xs max-w-[280px] ml-auto mb-6">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-semibold text-foreground">${Number(selectedInvoice.facturas?.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ITBIS (18%):</span>
                  <span className="font-semibold text-foreground">${Number(selectedInvoice.facturas?.itbis || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-sm font-bold">
                  <span className="text-foreground">Total:</span>
                  <span className="text-primary">${Number(selectedInvoice.facturas?.total || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => handleReprint(selectedInvoice)}
                  className="flex-1 flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-foreground font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer border border-border"
                >
                  <Printer className="w-4 h-4" />
                  Reimprimir ticket
                </button>
                <button 
                  onClick={() => setSelectedInvoice(null)}
                  className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-xs hover:opacity-90 transition-opacity cursor-pointer border-none"
                >
                  Cerrar vista
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Ver Error del Lote */}
        {viewingBatchError && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border shadow-2xl rounded-2xl p-6 max-w-md w-full relative animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setViewingBatchError(null)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-['Space_Grotesk'] text-xl font-bold text-foreground mb-4">Error del Lote</h3>
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm font-mono break-words mb-6">
                {viewingBatchError}
              </div>
              <button 
                onClick={() => setViewingBatchError(null)}
                className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-xs hover:opacity-90 transition-opacity cursor-pointer border-none"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
