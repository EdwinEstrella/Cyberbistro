import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { Clock, CheckCircle2, AlertTriangle, RefreshCcw, FileText, QrCode, Download, X } from "lucide-react";

export function FiscalPanel() {
  const { tenantId } = useAuth();
  const [resubmitting, setResubmitting] = useState<string | null>(null);
  const [selectedQr, setSelectedQr] = useState<{ src: string, link: string, trackId: string } | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await insforgeClient.database
        .from("ecf_documents")
        .select(`
          *,
          facturas ( numero_factura, ncf, cliente_nombre, cliente_rnc, total ),
          tenants ( rnc )
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

  async function handleResubmit(invoiceId: string, documentId: string) {
    if (!tenantId) return;
    setResubmitting(invoiceId);
    try {
      // Create a resubmit outbox operation
      await insforgeClient.database.from("fiscal_outbox").insert({
        tenant_id: tenantId,
        factura_id: invoiceId,
        ecf_document_id: documentId,
        operation: "submit", // trigger a new submission flow
        status: "queued",
        idempotency_key: `manual_resubmit_${invoiceId}_${Date.now()}`
      });
      // Optimistically update document status to pending
      await insforgeClient.database.from("ecf_documents")
        .update({ status: "pending_sync", dgii_status_message: "Reencolado manualmente" })
        .eq("factura_id", invoiceId);
      
      await fetchDocuments();
    } catch (err) {
      console.error(err);
      alert("Error al reencolar el documento.");
    } finally {
      setResubmitting(null);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground font-['Space_Grotesk']">Cargando documentos fiscales...</div>;
  }

  return (
    <div className="flex-1 p-4 sm:p-8 bg-background min-h-0 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto">
        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-10 mb-8 shadow-sm">
          <div className="flex justify-between items-start gap-4">
            <div>
              <span className="text-primary text-[11px] font-bold uppercase tracking-[0.2em] mb-2 block">Auditoría</span>
              <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold text-foreground mb-4">Documentos e-CF</h1>
              <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
                Monitorea el estado de todas las facturas electrónicas emitidas a la DGII. 
                Los documentos con errores de red pueden ser reencolados.
              </p>
            </div>
            <div className="bg-primary/10 p-4 rounded-full">
              <FileText className="w-8 h-8 text-primary" />
            </div>
          </div>
        </div>

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
                  <th className="p-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                      No hay documentos electrónicos emitidos todavía.
                    </td>
                  </tr>
                )}
                {documents?.map((doc: any) => {
                  const isError = doc.status === "rejected" || doc.status === "terminal_error" || doc.status === "retryable_error";
                  const isAccepted = doc.status === "accepted";
                  const isPending = !isError && !isAccepted;

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
                            {isPending && <Clock className="w-3.5 h-3.5" />}
                            {doc.status}
                          </div>
                          {doc.dgii_status_message && (
                            <span className="text-xs text-muted-foreground line-clamp-2" title={doc.dgii_status_message}>
                              {doc.dgii_status_message}
                            </span>
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
                      <td className="p-4 text-right flex justify-end gap-2">
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
                            className="inline-flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            Ver QR
                          </button>
                        )}
                        {isError && (
                          <button
                            onClick={() => handleResubmit(doc.factura_id, doc.id)}
                            disabled={resubmitting === doc.factura_id}
                            className="inline-flex items-center gap-2 bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                          >
                            <RefreshCcw className={`w-3.5 h-3.5 ${resubmitting === doc.factura_id ? "animate-spin" : ""}`} />
                            Reenviar
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
    </div>
  );
}
