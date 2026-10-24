import { useState, useRef, useEffect } from "react";
import { supabase } from "../../../shared/lib/supabase";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  ECF_CERTIFICATE_BUCKET,
  ECF_CERTIFICATE_FUNCTION,
  buildCertificateStoragePath,
  buildValidateRequest,
  extractInvokeError,
  interpretValidateResponse,
  isCertificateReadyInCloud,
  validateCertificateFile,
} from "../lib/ecfCertificateUpload";
import {
  certificateMetadataFor,
  describeCertificateErrorCode,
  evaluateCertificateHealth,
  formatCertificateDate,
  formatCertificateHealth,
  type CertificateHealth,
  type LoadedCertificateMetadata,
} from "../lib/ecfCertificateHealth";

class CertificateUploadError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

export function CertificateUploader({ environment, onValidated }: { environment: string; onValidated?: () => void }) {
  const { tenantId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploadIssue, setUploadIssue] = useState<CertificateHealth | null>(null);
  const [loaded, setLoaded] = useState<LoadedCertificateMetadata<any> | null>(null);
  const [tenantRnc, setTenantRnc] = useState<string | null>(null);
  const [representativeId, setRepresentativeId] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const { loading, metadata } = certificateMetadataFor(loaded, environment);
  const health = evaluateCertificateHealth({ metadata, tenantRnc, representativeId, selectedEnvironment: environment });

  useEffect(() => {
    // Messages from the previous environment do not apply to the new selection.
    setMessage(null);
    setUploadIssue(null);
    if (tenantId) loadMetadata();
  }, [tenantId, environment]);

  async function loadMetadata() {
    const requestId = ++latestRequest.current;
    const requestedEnvironment = environment;
    const { data: tenant } = await supabase.from("tenants").select("rnc").eq("id", tenantId).maybeSingle();
    setTenantRnc(tenant?.rnc ?? null);
    // Separate, tolerant read: the column may not exist yet; "not set" is the safe default.
    try {
      const { data: rep, error: repError } = await supabase.from("tenants").select("ecf_representative_id").eq("id", tenantId).maybeSingle();
      setRepresentativeId(repError ? null : (rep?.ecf_representative_id ?? null));
    } catch {
      setRepresentativeId(null);
    }
    const { data } = await supabase
      .from("ecf_certificate_metadata")
      .select("id, environment, subject, issuer, valid_from, valid_until, is_ready, last_validation_error, created_at")
      .eq("tenant_id", tenantId)
      .eq("environment", requestedEnvironment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // A slower response for an earlier selection must not overwrite the current one.
    if (requestId !== latestRequest.current) return;
    setLoaded({ environment: requestedEnvironment, metadata: data });
  }

  async function handleUpload() {
    if (!file || !passphrase || !tenantId) return;
    setUploading(true);
    setMessage(null);
    setUploadIssue(null);

    try {
      const fileError = validateCertificateFile(file);
      if (fileError) throw new Error(fileError);

      // 1. Upload the .p12 to the private tenant-scoped bucket (works on web and desktop).
      const storagePath = buildCertificateStoragePath(tenantId, environment);
      const { error: uploadError } = await supabase.storage
        .from(ECF_CERTIFICATE_BUCKET)
        .upload(storagePath, file, { contentType: "application/x-pkcs12", upsert: false });
      if (uploadError) throw new Error("No se pudo subir el certificado: " + uploadError.message);

      // 2. The edge function validates, encrypts the passphrase and marks the row ready.
      const { data, error: invokeError } = await supabase.functions.invoke(ECF_CERTIFICATE_FUNCTION, {
        body: buildValidateRequest({ environment, storagePath, passphrase }),
      });
      if (invokeError) {
        const failure = await extractInvokeError(invokeError);
        throw new CertificateUploadError(failure.message, failure.code);
      }
      const outcome = interpretValidateResponse(data);
      if (!outcome.ok) throw new CertificateUploadError(outcome.message, outcome.code);

      setMessage({ type: "success", text: outcome.message });
      setFile(null);
      setPassphrase("");
      await loadMetadata();
      onValidated?.();
    } catch (err: any) {
      if (err instanceof CertificateUploadError) {
        const issue = describeCertificateErrorCode(err.code, { fallbackMessage: err.message });
        setUploadIssue(issue);
      } else {
        setMessage({ type: "error", text: err.message || "Ocurrió un error inesperado." });
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-background rounded-[16px] border border-black/5 dark:border-white/5 p-5 mt-4">
      <h4 className="text-sm font-bold text-foreground mb-4">Certificado Digital (.p12)</h4>
      
      {!uploadIssue && loading ? (
        <div role="status" className="border border-border rounded-xl p-4 mb-4 bg-muted/40">
          <p className="text-sm text-muted-foreground">Verificando certificado…</p>
        </div>
      ) : (() => {
        const shown = uploadIssue ?? health;
        const tone = shown.status === "error"
          ? { box: "bg-red-500/10 border-red-500/20", text: "text-red-600 dark:text-red-400", icon: "❌" }
          : shown.status === "warning"
            ? { box: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-600 dark:text-yellow-400", icon: "⚠️" }
            : { box: "bg-green-500/10 border-green-500/20", text: "text-green-600 dark:text-green-400", icon: "✅" };
        return (
          <div role={shown.status === "error" ? "alert" : "status"} className={`border rounded-xl p-4 mb-4 ${tone.box}`}>
            <p className={`text-sm font-bold mb-1 ${tone.text}`}>{tone.icon} {formatCertificateHealth(shown)}</p>
            {!uploadIssue && metadata && isCertificateReadyInCloud(metadata) && (
              <ul className="text-xs text-muted-foreground space-y-1">
                <li><strong>Titular:</strong> {metadata.subject}</li>
                <li><strong>Emisor:</strong> {metadata.issuer}</li>
                <li><strong>Válido hasta:</strong> {formatCertificateDate(metadata.valid_until)}</li>
              </ul>
            )}
          </div>
        );
      })()}

      <div className="flex flex-col gap-3">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Archivo .p12</label>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="bg-muted text-foreground px-4 py-2 rounded-lg text-xs font-bold transition-all border border-border hover:bg-black/5"
          >
            {file ? file.name : "Seleccionar Archivo"}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".p12,application/x-pkcs12,application/pkcs12"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2">Contraseña del Certificado</label>
        <input 
          type="password" 
          value={passphrase} 
          onChange={(e) => setPassphrase(e.target.value)} 
          placeholder="********"
          className="input-field"
        />

        <button 
          onClick={handleUpload} 
          disabled={uploading || !file || !passphrase} 
          className="bg-primary text-primary-foreground rounded-lg py-3 mt-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50 transition-all cursor-pointer"
        >
          {uploading ? "Subiendo y Validando..." : "Subir Certificado"}
        </button>

        {message && (
          <p className={`text-xs mt-2 ${message.type === "success" ? "text-green-500" : "text-red-500"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
