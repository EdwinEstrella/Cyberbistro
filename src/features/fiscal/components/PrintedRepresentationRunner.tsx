import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Copy, Download, FileText, RefreshCw } from "lucide-react";
import { supabase } from "../../../shared/lib/supabase";
import {
  ECF_CERTIFICATION_FUNCTION,
  buildDownloadRequest,
  buildLatestRequest,
  describeRunError,
  extractRunInvokeError,
  isTestSetEnvironment,
  toRunView,
  type RunView,
} from "../lib/ecfCertificationRun";
import { pickPrintedSlots } from "../lib/ecfPrintedRepresentation";
import {
  MISSING_SLOT_MESSAGE,
  PORTAL_MAX_BYTES,
  buildPrintedDocument,
  formatBytes,
  totalBytes,
  type PrintedDocument,
} from "../lib/ecfPrintedDocuments";
import { saveFile } from "../lib/saveFile";

const RUN_TYPE = "simulation" as const;
/** Pause between sequential downloads so the browser does not drop any of them. */
const DOWNLOAD_GAP_MS = 400;

type SlotResult = { document: PrintedDocument; error?: undefined } | { document?: undefined; error: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function invoke(body: Record<string, unknown>): Promise<{ data: unknown; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(ECF_CERTIFICATION_FUNCTION, { body });
  if (error) return { data: null, error: (await extractRunInvokeError(error, RUN_TYPE)).message };
  return { data, error: null };
}

const savePdf = (document: PrintedDocument) => saveFile(document.fileName, document.bytes, "application/pdf");

interface PrintedRepresentationRunnerProps {
  tenantId: string | null | undefined;
  environment: string;
}

/**
 * Wizard step 5: builds the printed representation (PDF with the DGII QR) of one accepted e-CF of
 * the step-4 simulation per portal slot, exactly as signed, for the admin to upload to the portal.
 */
export function PrintedRepresentationRunner({ tenantId, environment }: PrintedRepresentationRunnerProps) {
  const [run, setRun] = useState<RunView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"generate" | "download" | null>(null);
  const [results, setResults] = useState<Record<string, SlotResult>>({});
  const [status, setStatus] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const supported = isTestSetEnvironment(environment);

  const loadRun = useCallback(async () => {
    if (!isTestSetEnvironment(environment) || !tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await invoke(buildLatestRequest(environment, tenantId, RUN_TYPE));
      if (error) return setStatus({ kind: "error", text: error });
      setRun(toRunView((data as { run?: unknown } | null)?.run));
      setResults({});
    } catch {
      setStatus({ kind: "error", text: describeRunError(undefined, undefined, RUN_TYPE) });
    } finally {
      setLoading(false);
    }
  }, [environment, tenantId]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  if (!supported) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-primary/35 bg-muted/20 p-5 text-xs text-muted-foreground">
        La representación impresa se genera con la Simulación e-CF de los ambientes de Pruebas (TesteCF) o Certificación (CerteCF). Cambiá el ambiente en el paso Ambiente y certificado.
      </div>
    );
  }

  const picks = run ? pickPrintedSlots(run.items) : [];
  const available = picks.filter((pick) => pick.item);
  const documents = picks.map((pick) => results[pick.slot.inputName]?.document).filter((document): document is PrintedDocument => !!document);
  const size = totalBytes(documents);

  async function generate() {
    if (!run || !isTestSetEnvironment(environment)) return;
    setBusy("generate");
    setStatus({ kind: "info", text: "Generando las representaciones impresas..." });
    const next: Record<string, SlotResult> = {};
    try {
      for (const { slot, item } of available) {
        const { data, error } = await invoke(buildDownloadRequest(run.runId, item!.caseId, tenantId));
        const body = (data ?? {}) as { signedXml?: unknown; securityCode?: unknown; code?: unknown };
        if (error || typeof body.signedXml !== "string") {
          next[slot.inputName] = { error: error ?? describeRunError(typeof body.code === "string" ? body.code : undefined, undefined, RUN_TYPE) };
        } else {
          const outcome = await buildPrintedDocument({
            slot,
            signedXml: body.signedXml,
            storedSecurityCode: typeof body.securityCode === "string" ? body.securityCode : null,
            environment,
          });
          next[slot.inputName] = outcome.ok ? { document: outcome.document } : { error: outcome.message };
        }
        setResults({ ...next });
      }
      const generated = Object.values(next).filter((result) => result.document).length;
      const failed = Object.keys(next).length - generated;
      const missing = picks.length - available.length;
      setStatus({
        kind: failed || missing ? "error" : "success",
        text: `Se generaron ${generated} de ${picks.length} representaciones.${failed ? ` ${failed} con error.` : ""}${missing ? ` Faltan ${missing} tipos en la simulación.` : ""}`,
      });
    } catch {
      setStatus({ kind: "error", text: "No se pudieron generar las representaciones impresas. Intentá de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    setBusy("download");
    try {
      for (const [index, document] of documents.entries()) {
        if (index > 0) await wait(DOWNLOAD_GAP_MS);
        savePdf(document);
      }
      setStatus({ kind: "success", text: `Se descargaron ${documents.length} PDF.` });
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ kind: "success", text: "URL del QR copiada." });
    } catch {
      setStatus({ kind: "error", text: "No se pudo copiar la URL." });
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-dashed border-primary/35 bg-muted/20 p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground"><FileText className="size-4 text-primary" /> Representaciones impresas para el portal</div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Cloudix toma, por cada casilla del portal, el primer comprobante aceptado de la Simulación e-CF (Paso 4) y genera su PDF tal como fue firmado y enviado, con el QR de validación de la DGII, el código de seguridad y la fecha de firma. Descargá los PDF y subí cada uno en su casilla del portal.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" disabled={!run || available.length === 0 || busy !== null || loading} onClick={() => void generate()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
          <FileText className="size-4" /> {busy === "generate" ? "Generando..." : "Generar representaciones"}
        </button>
        <button type="button" disabled={documents.length === 0 || busy !== null} onClick={() => void downloadAll()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">
          <Download className="size-4" /> {busy === "download" ? "Descargando..." : `Descargar todos (${documents.length})`}
        </button>
        <button type="button" disabled={busy !== null || loading} onClick={() => void loadRun()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
          <RefreshCw className="size-4" /> {loading ? "Buscando..." : "Actualizar simulación"}
        </button>
      </div>

      {!run && !loading && (
        <div className="rounded-xl border border-border bg-background py-6 text-center text-xs font-semibold text-muted-foreground">
          No hay comprobantes de simulación. Generá y enviá los del Paso 4 primero.
        </div>
      )}

      {run && (
        <div className="overflow-auto rounded-xl border border-border bg-background">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Casilla del portal</th>
                <th className="px-3 py-2">e-NCF</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">QR</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {picks.map(({ slot, item }) => {
                const result = results[slot.inputName];
                return (
                  <tr key={slot.inputName} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-foreground">{slot.label}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{slot.inputName}</div>
                    </td>
                    <td className="px-3 py-2 font-mono">{item?.encf ?? "—"}</td>
                    <td className="px-3 py-2">
                      {!item ? (
                        <span className="text-red-600 dark:text-red-400">{MISSING_SLOT_MESSAGE}</span>
                      ) : result?.error ? (
                        <span className="text-red-600 dark:text-red-400">{result.error}</span>
                      ) : result?.document ? (
                        <span className="rounded-full bg-green-500/15 px-2 py-0.5 font-bold text-green-600 dark:text-green-400">Generado · {formatBytes(result.document.bytes.length)}</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-muted-foreground">Pendiente</span>
                      )}
                    </td>
                    <td className="max-w-[28rem] min-w-0 px-3 py-2">
                      {result?.document && (
                        <div className="flex items-center gap-1">
                          <span title={result.document.qrUrl} className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">{result.document.qrUrl}</span>
                          <button type="button" aria-label="Copiar URL del QR" onClick={() => void copy(result.document!.qrUrl)} className="shrink-0 rounded p-1 text-primary hover:bg-primary/10">
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {result?.document && (
                        <button type="button" disabled={busy !== null} onClick={() => savePdf(result.document!)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">
                          <Download className="size-3.5" /> Descargar PDF
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {documents.length > 0 && (
        <p className={`text-xs font-semibold ${size > PORTAL_MAX_BYTES ? "text-red-500" : "text-muted-foreground"}`}>
          {size > PORTAL_MAX_BYTES && <AlertTriangle className="mr-1 inline size-3.5" />}
          Tamaño total: {formatBytes(size)}{size > PORTAL_MAX_BYTES ? " — supera el límite de 10 MB del portal." : " (límite del portal: 10 MB)."}
        </p>
      )}

      {status && (
        <p role="status" className={`text-xs font-semibold ${status.kind === "success" ? "text-green-600" : status.kind === "error" ? "text-red-500" : "text-muted-foreground"}`}>{status.text}</p>
      )}
    </div>
  );
}
