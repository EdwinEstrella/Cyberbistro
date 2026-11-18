import { useState } from "react";
import { CheckCircle, Download, Upload } from "lucide-react";
import { supabase } from "../../../shared/lib/supabase";
import {
  ECF_SIGN_FUNCTION,
  buildSignRequest,
  extractSignInvokeError,
  interpretSignResponse,
  resolveSignedFileName,
  validateXmlFile,
  type EcfSignDocumentType,
  type EcfSignEnvironment,
} from "../lib/ecfDocumentSigning";

function saveXml(fileName: string, text: string) {
  // Same browser download path used by other exports (works in the Electron renderer and the web).
  const url = URL.createObjectURL(new Blob([text], { type: "application/xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

interface DocumentSignerProps {
  tenantId: string | null | undefined;
  environment: EcfSignEnvironment;
  documentType: EcfSignDocumentType;
  title: string;
  helperText: string;
}

/** Select a DGII XML, sign it with the tenant certificate in the cloud and download the signed file. */
export function DocumentSigner({ tenantId, environment, documentType, title, helperText }: DocumentSignerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function selectFile(selected: File | null) {
    setStatus(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const problem = validateXmlFile(selected);
    if (problem) {
      setFile(null);
      setStatus({ kind: "error", text: problem });
      return;
    }
    setFile(selected);
  }

  async function signAndDownload() {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const xml = await file.text();
      const { data, error } = await supabase.functions.invoke(ECF_SIGN_FUNCTION, {
        body: buildSignRequest({ environment, documentType, xml, tenantId: tenantId ?? undefined }),
      });
      const outcome = error ? await extractSignInvokeError(error) : interpretSignResponse(data);
      if (!outcome.ok) {
        setStatus({ kind: "error", text: outcome.message });
        return;
      }
      const fileName = resolveSignedFileName(outcome.fileName, file.name);
      saveXml(fileName, outcome.signedXml);
      setStatus({ kind: "success", text: `Documento firmado y descargado como ${fileName}. Subilo al portal de la DGII.` });
    } catch {
      setStatus({ kind: "error", text: "No se pudo firmar el documento." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-primary/35 bg-muted/20 p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground"><Download className="size-4 text-primary" /> {title}</div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{helperText}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* `relative` anchors the sr-only (absolute) input here; without it focusing the input scrolls the page to a distant ancestor. */}
        <label className="relative inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm">
          <Upload className="size-4" /> Seleccionar archivo
          <input type="file" accept=".xml,application/xml,text/xml" className="sr-only" onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        </label>
        <span className="text-xs text-muted-foreground">{file ? file.name : "Ningún archivo seleccionado"}</span>
        <button type="button" disabled={!file || busy} onClick={() => void signAndDownload()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
          <CheckCircle className="size-4" /> {busy ? "Firmando..." : "Firmar y descargar"}
        </button>
      </div>
      {status && (
        <p role="status" className={`mt-3 text-xs font-semibold ${status.kind === "success" ? "text-green-600" : "text-red-500"}`}>{status.text}</p>
      )}
    </div>
  );
}
