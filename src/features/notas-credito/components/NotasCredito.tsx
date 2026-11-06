import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useSucursal } from "../../../app/context/SucursalContext";
import { canAttemptCloudRead } from "../../../shared/lib/cloudAvailability";
import { isCreditNoteInvoice } from "../../../shared/lib/invoiceKind";
import {
  INELIGIBLE_REASON_LABELS,
  buildCreditNoteRows,
  canManageCreditNotes,
  filterCreditNoteRows,
  type CreditNoteInvoice,
  type CreditNoteRow,
} from "../lib/creditNoteEligibility";
import { getCreditNoteStatusDisplay, type CreditNoteStatusTone } from "../lib/creditNoteStatus";
import { loadCreditNoteData, issueCreditNote, type CreditNoteData } from "../lib/creditNotesService";
import { formatDateTimeDo, formatRd } from "../lib/formatRd";
import { printCreditNote } from "../lib/creditNotePrint";
import { gateFiscalPrint, FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE } from "../../../shared/lib/fiscalPrintGate";
import { IssueCreditNoteDialog } from "./IssueCreditNoteDialog";

const TONE_CLASS: Record<CreditNoteStatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-amber-500/10 text-amber-500",
  info: "bg-blue-500/10 text-blue-500",
  success: "bg-emerald-500/10 text-emerald-500",
  danger: "bg-red-500/10 text-red-500",
};

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function NotasCredito() {
  const { tenantId, rol, loading: authLoading } = useAuth();
  const { activeSucursalId } = useSucursal();
  const online = useOnline();
  const [data, setData] = useState<CreditNoteData>({ invoices: [], ecfByInvoiceId: new Map() });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showIneligible, setShowIneligible] = useState(false);
  const [target, setTarget] = useState<CreditNoteRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const isAdmin = canManageCreditNotes(rol);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      setData(await loadCreditNoteData(tenantId, activeSucursalId));
      setLoadError(null);
    } catch (error) {
      console.warn("[notas-credito] load failed:", error);
      setLoadError("No se pudieron cargar las facturas.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeSucursalId]);

  useEffect(() => {
    if (!authLoading && isAdmin) void reload();
  }, [authLoading, isAdmin, reload]);

  // A pulled change (e.g. the E34 status turning accepted) refreshes the lists.
  useEffect(() => {
    if (!isAdmin) return;
    const refresh = () => void reload();
    window.addEventListener("local-mirror-updated", refresh);
    const unbind = window.electronAPI?.onLocalDataUpdated?.((updated) => {
      const payload: unknown = updated;
      const updatedTenantId =
        typeof payload === "string"
          ? payload
          : (payload as { tenantId?: string } | null | undefined)?.tenantId;
      if (!updatedTenantId || updatedTenantId === tenantId) refresh();
    });
    return () => {
      window.removeEventListener("local-mirror-updated", refresh);
      unbind?.();
    };
  }, [isAdmin, tenantId, reload]);

  const { eligible, ineligible } = useMemo(
    () => buildCreditNoteRows(data.invoices, data.ecfByInvoiceId, new Date()),
    [data],
  );
  const visibleRows = useMemo(
    () => filterCreditNoteRows(showIneligible ? [...eligible, ...ineligible] : eligible, query),
    [eligible, ineligible, showIneligible, query],
  );
  const issuedNotes = useMemo(
    () => data.invoices.filter(isCreditNoteInvoice).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [data],
  );

  const confirm = async (reason: string) => {
    if (!tenantId || !target) return;
    setSubmitting(true);
    setIssueError(null);
    try {
      if (!(await canAttemptCloudRead())) {
        setIssueError("Sin conexión con la nube. Las notas de crédito solo se emiten con internet.");
        return;
      }
      const result = await issueCreditNote({ tenantId, facturaId: target.invoice.id, reason, sucursalId: activeSucursalId });
      toast.success(`Nota de crédito ${result.encf} emitida`);
      setTarget(null);
      // e-CF credit notes wait for DGII security code confirmation before printing
      void gateFiscalPrint({
        tenantId,
        factura: {
          id: result.credit_note_factura_id,
          ncf: result.encf,
          ncf_tipo: "E34",
          estado: "nota_credito",
        },
        numeroFactura: 0,
      });
      void window.electronAPI?.triggerSync?.().catch(() => undefined);
      await reload();
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "No se pudo emitir la nota de crédito.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async (note: CreditNoteInvoice) => {
    if (!tenantId) return;
    const printed = await printCreditNote({
      tenantId,
      note: note as unknown as Record<string, unknown>,
      isReprint: true,
    });
    if (!printed.ok && printed.error !== FISCAL_GATE_PENDING_CONFIRMATION_MESSAGE) {
      toast.error(printed.error ?? "No se pudo imprimir la nota de crédito.");
    }
  };

  if (authLoading) return null;
  if (!isAdmin) {
    return <div className="flex-1 p-6 text-center text-muted-foreground">Solo los administradores pueden ver las notas de crédito.</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Notas de crédito</h1>
            <p className="text-sm text-muted-foreground">Anulá facturas e-CF aceptadas (E31/E32) dentro de los 30 días.</p>
          </div>
          <button type="button" onClick={() => void reload()} aria-label="Actualizar" className="size-10 rounded-lg bg-muted flex items-center justify-center">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </header>

        {!online && (
          <div role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-500">
            Sin conexión: las notas de crédito solo se pueden emitir con internet.
          </div>
        )}
        {loadError && <div role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div>}

        <section className="flex flex-col gap-3" aria-labelledby="eligible-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="eligible-title" className="text-lg font-semibold">Facturas elegibles</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={showIneligible} onChange={(e) => setShowIneligible(e.target.checked)} />
                Mostrar no elegibles
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por NCF o cliente"
                  className="h-10 w-64 rounded-lg border border-input bg-input-background pl-8 pr-3 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-black/10 bg-card dark:border-white/5">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">NCF</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {visibleRows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{loading ? "Cargando..." : "No hay facturas elegibles."}</td></tr>
                )}
                {visibleRows.map((row) => (
                  <tr key={row.invoice.id}>
                    <td className="px-4 py-3 font-semibold">{row.invoice.ncf}</td>
                    <td className="px-4 py-3">{formatDateTimeDo(row.invoice.created_at)}</td>
                    <td className="px-4 py-3">{row.invoice.cliente_nombre || "Consumidor final"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRd(row.invoice.total)}</td>
                    <td className="px-4 py-3 capitalize">{row.invoice.metodo_pago || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={Boolean(row.reason) || !online}
                        title={row.reason ? INELIGIBLE_REASON_LABELS[row.reason] : !online ? "Requiere conexión a internet" : undefined}
                        onClick={() => { setIssueError(null); setTarget(row); }}
                        className="h-9 rounded-lg bg-destructive px-3 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Emitir nota de crédito
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="issued-title">
          <h2 id="issued-title" className="text-lg font-semibold">Notas emitidas</h2>
          <div className="overflow-x-auto rounded-2xl border border-black/10 bg-card dark:border-white/5">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nota (E34)</th>
                  <th className="px-4 py-3">Factura original</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Estado DGII</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {issuedNotes.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Todavía no hay notas de crédito.</td></tr>
                )}
                {issuedNotes.map((note: CreditNoteInvoice) => {
                  const status = getCreditNoteStatusDisplay(data.ecfByInvoiceId.get(note.id)?.status ?? note.fiscal_status);
                  return (
                    <tr key={note.id}>
                      <td className="px-4 py-3 font-semibold">{note.ncf}</td>
                      <td className="px-4 py-3">{note.ref_ncf || "-"}</td>
                      <td className="px-4 py-3">{formatDateTimeDo(note.created_at)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRd(note.total)}</td>
                      <td className="px-4 py-3">{note.ref_razon_modificacion || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${TONE_CLASS[status.tone]}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handlePrint(note)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-muted px-3 text-xs font-semibold"
                        >
                          <Printer size={14} /> Imprimir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {target && (
        <IssueCreditNoteDialog
          open
          ncf={String(target.invoice.ncf)}
          total={Number(target.invoice.total ?? 0)}
          submitting={submitting}
          error={issueError}
          onCancel={() => setTarget(null)}
          onConfirm={(reason) => void confirm(reason)}
        />
      )}
    </div>
  );
}
