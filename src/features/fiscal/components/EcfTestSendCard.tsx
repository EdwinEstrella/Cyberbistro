import { useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { supabase } from "../../../shared/lib/supabase";
import { ECF_CERTIFICATION_FUNCTION, type DgiiMessageView, type StatusTone } from "../lib/ecfCertificationRun";
import {
  NO_TEST_CERTIFICATE_MESSAGE,
  TEST_SEND_FALLBACK,
  buildSendTestRequest,
  buildTestStatusRequest,
  extractTestSendInvokeError,
  testEstadoView,
  toTestSendFailure,
  toTestSendResult,
  type TestSendFailure,
  type TestSendResult,
} from "../lib/ecfTestSend";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  progress: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  success: "bg-green-500/15 text-green-600 dark:text-green-400",
  warning: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  danger: "bg-red-500/15 text-red-600 dark:text-red-400",
};

type Busy = "send" | "status" | null;

const formatMessages = (messages: DgiiMessageView[]) =>
  messages.map((message) => (message.codigo ? `${message.codigo}: ${message.valor}` : message.valor)).join(" · ");

export interface EcfTestSendViewProps {
  certificateReady: boolean;
  busy: Busy;
  result: TestSendResult | null;
  failure: TestSendFailure | null;
  onSend(): void;
  onCheckStatus(): void;
}

export function EcfTestSendView({ certificateReady, busy, result, failure, onSend, onCheckStatus }: EcfTestSendViewProps) {
  const estado = result ? testEstadoView(result.estado) : null;
  return (
    <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/5 p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground"><Send className="size-4 text-primary" /> Factura de prueba en TesteCF</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Envía una Factura de Crédito Fiscal (E31) de prueba a la DGII con tu certificado y los datos de tu empresa, para comprobar que todo funciona antes de producción. No afecta la certificación ni producción.
      </p>

      {!certificateReady && <p className="mt-3 text-xs font-semibold text-yellow-700 dark:text-yellow-300">{NO_TEST_CERTIFICATE_MESSAGE}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={!certificateReady || busy !== null} onClick={onSend} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="size-4" /> {busy === "send" ? "Enviando..." : "Enviar factura de prueba a TesteCF"}
        </button>
        {result && (
          <button type="button" disabled={busy !== null} onClick={onCheckStatus} className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw className="size-4" /> {busy === "status" ? "Consultando..." : "Consultar estado"}
          </button>
        )}
      </div>

      {result && estado && (
        <dl className="mt-4 grid gap-2 rounded-xl border border-border bg-background p-4 text-xs sm:grid-cols-2">
          <div><dt className="text-muted-foreground">e-NCF</dt><dd className="font-mono font-bold text-foreground">{result.encf ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">TrackId</dt><dd className="break-all font-mono text-foreground">{result.trackId}</dd></div>
          <div><dt className="text-muted-foreground">Estado DGII</dt><dd><span className={`rounded-full px-2 py-0.5 font-bold ${TONE_CLASSES[estado.tone]}`}>{estado.label}</span></dd></div>
          {result.codigoSeguridad && <div><dt className="text-muted-foreground">Código de seguridad</dt><dd className="font-mono text-foreground">{result.codigoSeguridad}</dd></div>}
          <div className="sm:col-span-2"><dt className="text-muted-foreground">Mensajes DGII</dt><dd className="text-foreground">{formatMessages(result.mensajes) || "—"}</dd></div>
        </dl>
      )}

      {failure && (
        <div role="status" className="mt-3 text-xs font-semibold text-red-500">
          <p>{failure.message}{failure.encf ? ` (e-NCF ${failure.encf})` : ""}</p>
          {failure.mensajes.length > 0 && <p className="mt-1 font-normal">Mensajes DGII: {formatMessages(failure.mensajes)}</p>}
        </div>
      )}
    </div>
  );
}

async function invoke(body: Record<string, unknown>): Promise<{ data: unknown; failure: TestSendFailure | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(ECF_CERTIFICATION_FUNCTION, { body });
    if (error) return { data: null, failure: await extractTestSendInvokeError(error) };
    return { data, failure: null };
  } catch {
    return { data: null, failure: { message: TEST_SEND_FALLBACK, mensajes: [] } };
  }
}

interface EcfTestSendCardProps {
  tenantId: string | null | undefined;
  certificateReady: boolean;
}

/** Activation step 2, environment "Pruebas (TesteCF)": send one test E31 and re-check its DGII status. */
export function EcfTestSendCard({ tenantId, certificateReady }: EcfTestSendCardProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<TestSendResult | null>(null);
  const [failure, setFailure] = useState<TestSendFailure | null>(null);

  async function run(kind: Exclude<Busy, null>, body: Record<string, unknown>) {
    setBusy(kind);
    setFailure(null);
    try {
      const { data, failure: invokeFailure } = await invoke(body);
      if (invokeFailure) return setFailure(invokeFailure);
      const next = toTestSendResult(data, kind === "status" ? result : null);
      if (next) setResult(next);
      else setFailure(toTestSendFailure(data));
    } finally {
      setBusy(null);
    }
  }

  return (
    <EcfTestSendView
      certificateReady={certificateReady}
      busy={busy}
      result={result}
      failure={failure}
      onSend={() => void run("send", buildSendTestRequest(tenantId))}
      onCheckStatus={() => result && void run("status", buildTestStatusRequest(result.trackId, tenantId))}
    />
  );
}
