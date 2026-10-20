import { Download, RefreshCw } from "lucide-react";
import type { ReceivedApprovalEvidence, ReceivedDocumentEvidence } from "../lib/ecfReceivedEvidence";

export interface EvidenceRow {
  id: string;
  encf: string;
  emisorRnc: string;
  tipo: string;
  estado: string;
  accepted: boolean;
  fecha: string;
}

export function formatReceivedDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" });
}

export function documentRows(docs: ReadonlyArray<ReceivedDocumentEvidence>): EvidenceRow[] {
  return docs.map((doc) => ({
    id: doc.id,
    encf: doc.encf ?? "—",
    emisorRnc: doc.emisor_rnc ?? "—",
    tipo: doc.tipo_ecf != null ? `E${doc.tipo_ecf}` : "—",
    estado: doc.estado === 0 ? "Recibido" : `No recibido (código ${doc.motivo_no_recibido ?? doc.estado ?? "?"})`,
    accepted: doc.estado === 0,
    fecha: formatReceivedDate(doc.received_at),
  }));
}

export function approvalRows(approvals: ReadonlyArray<ReceivedApprovalEvidence>): EvidenceRow[] {
  return approvals.map((approval) => ({
    id: approval.id,
    encf: approval.encf ?? "—",
    emisorRnc: approval.emisor_rnc ?? "—",
    tipo: "ACECF",
    estado: approval.estado === 1 ? "Aprobado" : approval.estado === 2 ? "Rechazado" : "Desconocido",
    accepted: approval.estado === 1,
    fecha: formatReceivedDate(approval.received_at),
  }));
}

interface ReceivedEvidencePanelProps {
  title: string;
  rows: EvidenceRow[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  onRefresh: () => void;
}

export function ReceivedEvidencePanel({ title, rows, loading, error, emptyText, onRefresh }: ReceivedEvidencePanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Download className="size-4 text-muted-foreground" /> {title}
        </h4>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>
      {error ? (
        <p role="alert" className="py-6 text-center text-xs font-semibold text-red-600 dark:text-red-400">No se pudo leer lo recibido: {error}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs font-semibold text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
              <div className="min-w-0">
                <p className="font-mono font-bold text-foreground">{row.encf}</p>
                <p className="text-muted-foreground">Emisor {row.emisorRnc} · {row.tipo} · {row.fecha}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${row.accepted ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>{row.estado}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
