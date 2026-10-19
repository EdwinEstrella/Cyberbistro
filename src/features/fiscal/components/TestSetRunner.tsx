import { useEffect, useRef, useState } from "react";
import { Download, FileKey2, RefreshCw, Send, Square, Upload } from "lucide-react";
import { supabase } from "../../../shared/lib/supabase";
import {
  ECF_CERTIFICATION_FUNCTION,
  KIND_LABELS,
  RUN_COPY,
  STATUS_LABELS,
  buildAuthCheckRequest,
  buildDownloadRequest,
  buildLatestRequest,
  buildSendNextRequest,
  buildStartRequest,
  buildStatusRequest,
  bytesToBase64,
  describeProgress,
  describeRunError,
  extractRunInvokeError,
  interpretRunResponse,
  isTestSetEnvironment,
  nextLoopAction,
  portalDownloads,
  safeDownloadName,
  signedEcfDownloads,
  simulationQuotaSummary,
  statusTone,
  summariesAccepted,
  toRunView,
  validateTestSetFile,
  type RunOutcome,
  type RunType,
  type RunView,
  type StatusTone,
} from "../lib/ecfCertificationRun";
import { saveFile } from "../lib/saveFile";

const POLL_DELAY_MS = 5000;
const MAX_POLL_ROUNDS = 60;

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  progress: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  success: "bg-green-500/15 text-green-600 dark:text-green-400",
  warning: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  danger: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const saveXml = (fileName: string, text: string) => saveFile(fileName, text, "application/xml;charset=utf-8");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function invoke(
  body: Record<string, unknown>,
  runType: RunType,
): Promise<{ data: unknown; error: { ok: false; message: string; code?: string } | null }> {
  const { data, error } = await supabase.functions.invoke(ECF_CERTIFICATION_FUNCTION, { body });
  if (error) return { data: null, error: await extractRunInvokeError(error, runType) };
  return { data, error: null };
}

async function invokeRun(body: Record<string, unknown>, runType: RunType): Promise<RunOutcome> {
  const { data, error } = await invoke(body, runType);
  return error ?? interpretRunResponse(data, runType);
}

interface TestSetRunnerProps {
  tenantId: string | null | undefined;
  environment: string;
  /** Wizard step 2 runs the test set (default); step 3 the commercial approval set; step 4 the simulation. */
  runType?: RunType;
  title?: string;
  description?: string;
}

/**
 * Wizard steps 2, 3 and 4: run a DGII set (upload, send in batches, poll status). The test set and
 * the simulation also offer the consumo < 250k portal downloads; the simulation adds the quotas of
 * the DGII portal list and the download of every signed e-CF (needed for step 5).
 */
export function TestSetRunner({ tenantId, environment, runType = "test_set", title, description }: TestSetRunnerProps) {
  const copy = RUN_COPY[runType];
  const hasPortalUploads = runType !== "commercial_approval";
  const isSimulation = runType === "simulation";
  const [file, setFile] = useState<File | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [busy, setBusy] = useState<"auth" | "start" | "send" | "status" | "download" | null>(null);
  const [status, setStatus] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const stopRef = useRef(false);
  const supported = isTestSetEnvironment(environment);

  useEffect(() => {
    if (!supported || !tenantId) return;
    let cancelled = false;
    void invoke(buildLatestRequest(environment, tenantId, runType), runType).then(({ data }) => {
      const latest = toRunView((data as { run?: unknown } | null)?.run);
      if (!cancelled && latest) setRun(latest);
    });
    return () => {
      cancelled = true;
    };
  }, [environment, tenantId, supported, runType]);

  if (!supported) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-primary/35 bg-muted/20 p-5 text-xs text-muted-foreground">
        {copy.unsupportedEnvironment}
      </div>
    );
  }

  function selectFile(selected: File | null) {
    setStatus(null);
    if (!selected) return setFile(null);
    const problem = validateTestSetFile(selected, runType);
    if (problem) {
      setFile(null);
      setStatus({ kind: "error", text: problem });
      return;
    }
    setFile(selected);
  }

  async function checkConnection() {
    if (!isTestSetEnvironment(environment)) return;
    setBusy("auth");
    setStatus({ kind: "info", text: "Probando la conexión con la DGII..." });
    try {
      const { data, error } = await invoke(buildAuthCheckRequest(environment, tenantId), runType);
      if (error) return setStatus({ kind: "error", text: error.message });
      const ok = (data as { ok?: unknown } | null)?.ok === true;
      setStatus(ok
        ? { kind: "success", text: "Conexión con la DGII correcta: tu certificado fue aceptado. No se envió ningún documento." }
        : { kind: "error", text: describeRunError(undefined, undefined, runType) });
    } catch {
      setStatus({ kind: "error", text: describeRunError(undefined, undefined, runType) });
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (!file || !isTestSetEnvironment(environment)) return;
    setBusy("start");
    setStatus(null);
    try {
      const xlsxBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
      const outcome = await invokeRun(buildStartRequest({ environment, xlsxBase64, tenantId, runType }), runType);
      if (!outcome.ok) return setStatus({ kind: "error", text: outcome.message });
      setRun(outcome.run);
      setStatus({ kind: "success", text: copy.loaded(outcome.run.items.length) });
    } catch {
      setStatus({ kind: "error", text: describeRunError(undefined, undefined, runType) });
    } finally {
      setBusy(null);
    }
  }

  async function poll(runId: string): Promise<RunView | null> {
    const outcome = await invokeRun(buildStatusRequest(runId, tenantId), runType);
    if (!outcome.ok) {
      setStatus({ kind: "error", text: outcome.message });
      return null;
    }
    setRun(outcome.run);
    return outcome.run;
  }

  async function sendAll() {
    if (!run) return;
    stopRef.current = false;
    setBusy("send");
    setStatus({ kind: "info", text: "Enviando documentos a la DGII..." });
    try {
      let pollRounds = 0;
      while (!stopRef.current) {
        const outcome = await invokeRun(buildSendNextRequest(run.runId, tenantId), runType);
        if (!outcome.ok) return setStatus({ kind: "error", text: outcome.message });
        setRun(outcome.run);
        const action = nextLoopAction(outcome.run);
        if (action === "stop") return setStatus({ kind: "error", text: describeRunError(outcome.run.stoppedReason ?? undefined, undefined, runType) });
        if (action === "done") {
          await poll(run.runId);
          return setStatus({ kind: "success", text: copy.sentAll });
        }
        if (action === "poll") {
          if (++pollRounds > MAX_POLL_ROUNDS) {
            return setStatus({ kind: "info", text: "La DGII sigue procesando documentos. Consultá el estado más tarde y volvé a enviar." });
          }
          setStatus({ kind: "info", text: "Esperando que la DGII acepte el documento referenciado por una nota..." });
          await wait(POLL_DELAY_MS);
          if (stopRef.current) break;
          if (!(await poll(run.runId))) return;
        }
      }
      setStatus({ kind: "info", text: "Envío detenido. Podés continuar cuando quieras." });
    } catch {
      setStatus({ kind: "error", text: describeRunError(undefined, undefined, runType) });
    } finally {
      setBusy(null);
    }
  }

  async function refreshStatus() {
    if (!run) return;
    setBusy("status");
    try {
      const updated = await poll(run.runId);
      if (updated) setStatus({ kind: "success", text: describeProgress(updated).label });
    } catch {
      setStatus({ kind: "error", text: describeRunError(undefined, undefined, runType) });
    } finally {
      setBusy(null);
    }
  }

  async function download(caseId: string): Promise<boolean> {
    if (!run) return false;
    const { data, error } = await invoke(buildDownloadRequest(run.runId, caseId, tenantId), runType);
    const body = (data ?? {}) as { fileName?: unknown; signedXml?: unknown; code?: unknown };
    if (error || typeof body.signedXml !== "string") {
      setStatus({ kind: "error", text: error?.message ?? describeRunError(typeof body.code === "string" ? body.code : undefined, undefined, runType) });
      return false;
    }
    saveXml(safeDownloadName(typeof body.fileName === "string" ? body.fileName : "", caseId), body.signedXml);
    return true;
  }

  async function downloadAll(caseIds: string[]) {
    setBusy("download");
    try {
      let saved = 0;
      for (const caseId of caseIds) {
        if (!(await download(caseId))) return;
        saved++;
      }
      setStatus({ kind: "success", text: `Se descargaron ${saved} XML firmados.` });
    } catch {
      setStatus({ kind: "error", text: describeRunError(undefined, undefined, runType) });
    } finally {
      setBusy(null);
    }
  }

  const progress = run ? describeProgress(run) : null;
  const downloads = run && hasPortalUploads ? portalDownloads(run) : [];
  const quotas = run && isSimulation ? simulationQuotaSummary(run) : [];
  const signedDocuments = run && isSimulation ? signedEcfDownloads(run) : [];

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-dashed border-primary/35 bg-muted/20 p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground"><FileKey2 className="size-4 text-primary" /> {title ?? copy.title}</div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description ?? copy.description}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm">
          <Upload className="size-4" /> Seleccionar archivo
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        </label>
        <span className="text-xs text-muted-foreground">{file ? file.name : "Ningún archivo seleccionado"}</span>
        <button type="button" disabled={!file || busy !== null} onClick={() => void start()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
          <Upload className="size-4" /> {busy === "start" ? "Procesando..." : "Cargar Set"}
        </button>
      </div>

      {run && progress && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-xs font-semibold text-foreground">{progress.label}</p>
            <div className="flex gap-2 sm:ml-auto">
              {busy === "send" ? (
                <button type="button" onClick={() => { stopRef.current = true; }} className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-xs font-bold text-destructive hover:bg-destructive/10">
                  <Square className="size-4" /> Detener
                </button>
              ) : (
                <button type="button" disabled={busy !== null || run.sendComplete} onClick={() => void sendAll()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                  <Send className="size-4" /> Enviar a la DGII
                </button>
              )}
              <button type="button" disabled={busy !== null} onClick={() => void refreshStatus()} className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className="size-4" /> {busy === "status" ? "Consultando..." : "Consultar estado"}
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-auto rounded-xl border border-border bg-background">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Caso</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Envío</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Mensajes DGII</th>
                </tr>
              </thead>
              <tbody>
                {run.items.map((item) => (
                  <tr key={`${item.caseId}-${item.kind}`} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-muted-foreground">{item.sequenceOrder + 1}</td>
                    <td className="px-3 py-2 font-mono">{item.encf}</td>
                    <td className="px-3 py-2">E{item.tipoEcf}</td>
                    <td className="px-3 py-2">{KIND_LABELS[item.kind]}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 font-bold ${TONE_CLASSES[statusTone(item.status)]}`}>{STATUS_LABELS[item.status]}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{item.messages.map((message) => (message.codigo ? `${message.codigo}: ${message.valor}` : message.valor)).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {quotas.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-xs font-bold text-foreground">Cupos de la simulación (lista del portal de la DGII)</div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {quotas.map((quota) => (
                  <div key={quota.label} className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                    <div className="text-muted-foreground">{quota.label}</div>
                    <div className={`font-bold ${quota.accepted >= quota.expected ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                      {quota.accepted} de {quota.expected} aceptados
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {downloads.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground"><Download className="size-4 text-primary" /> Facturas de consumo menores a 250 mil</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Subí estas facturas en el portal (Facturas de consumo &lt; 250Mil) cuando los resúmenes estén aceptados.
                {summariesAccepted(run) ? " Los resúmenes ya fueron aceptados." : " Todavía hay resúmenes sin aceptar."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {downloads.map((item) => (
                  <button key={item.caseId} type="button" onClick={() => void download(item.caseId)} className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10">
                    <Download className="size-3.5" /> {item.encf}.xml
                  </button>
                ))}
              </div>
            </div>
          )}

          {signedDocuments.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground"><Download className="size-4 text-primary" /> XML firmados de la simulación</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Guardá todos los e-CF firmados: los vas a necesitar para la representación impresa (Paso 5).
              </p>
              <button type="button" disabled={busy !== null} onClick={() => void downloadAll(signedDocuments.map((item) => item.caseId))} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                <Download className="size-4" /> {busy === "download" ? "Descargando..." : `Descargar todos los XML firmados (${signedDocuments.length})`}
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                {signedDocuments.map((item) => (
                  <button key={`${item.caseId}-${item.kind}`} type="button" disabled={busy !== null} onClick={() => void download(item.caseId)} className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">
                    <Download className="size-3.5" /> {item.encf}.xml
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <button type="button" disabled={busy !== null} onClick={() => void checkConnection()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-5 py-3.5 text-sm font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">
        <RefreshCw className="size-4" /> {busy === "auth" ? "Probando..." : "Probar conexión con la DGII"}
      </button>

      {status && (
        <p role="status" className={`text-xs font-semibold ${status.kind === "success" ? "text-green-600" : status.kind === "error" ? "text-red-500" : "text-muted-foreground"}`}>{status.text}</p>
      )}
    </div>
  );
}
