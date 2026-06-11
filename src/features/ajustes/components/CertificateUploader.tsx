import { useState, useRef, useEffect } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";

export function CertificateUploader({ environment }: { environment: string }) {
  const { tenantId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [metadata, setMetadata] = useState<any>(null);

  const isExpired = metadata ? new Date() > new Date(metadata.valid_until) : false;
  const isExpiringSoon = metadata && !isExpired ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) > new Date(metadata.valid_until) : false;

  useEffect(() => {
    if (tenantId) loadMetadata();
  }, [tenantId, environment]);

  async function loadMetadata() {
    const { data } = await insforgeClient.database
      .from("ecf_certificate_metadata")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setMetadata(data);
  }

  async function handleUpload() {
    if (!file || !passphrase || !tenantId) return;
    setUploading(true);
    setMessage(null);

    try {
      // 1. Upload to fiscal_certificates bucket
      const filePath = `${tenantId}/${environment}_${Date.now()}.p12`;
      const { error: uploadError } = await (insforgeClient.storage
        .from("fiscal_certificates")
        .upload as any)(filePath, file, { contentType: "application/pkcs12", upsert: true });

      if (uploadError) throw new Error("Error al subir archivo: " + uploadError.message);

      // 2. Call Edge Function / RPC to validate
      const { error: validateError } = await insforgeClient.functions.invoke("validate-ecf-certificate", {
        body: {
          tenant_id: tenantId,
          environment,
          storage_path: filePath,
          passphrase
        }
      });

      if (validateError) throw new Error("Error al validar certificado: " + validateError.message);

      setMessage({ type: "success", text: "Certificado validado y guardado correctamente." });
      setFile(null);
      setPassphrase("");
      await loadMetadata();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Ocurrió un error inesperado." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-background rounded-[16px] border border-black/5 dark:border-white/5 p-5 mt-4">
      <h4 className="text-sm font-bold text-foreground mb-4">Certificado Digital (.p12)</h4>
      
      {metadata?.is_ready ? (
        <div className={`border rounded-xl p-4 mb-4 ${isExpired ? "bg-red-500/10 border-red-500/20" : isExpiringSoon ? "bg-yellow-500/10 border-yellow-500/20" : "bg-green-500/10 border-green-500/20"}`}>
          <p className={`text-sm font-bold mb-1 ${isExpired ? "text-red-600 dark:text-red-400" : isExpiringSoon ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}`}>
            {isExpired ? "❌ Certificado Vencido" : isExpiringSoon ? "⚠️ Certificado por Vencer" : "✅ Certificado Configurado y Listo"}
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li><strong>Titular:</strong> {metadata.subject}</li>
            <li><strong>Emisor:</strong> {metadata.issuer}</li>
            <li><strong>Válido hasta:</strong> {new Date(metadata.valid_until).toLocaleDateString()}</li>
          </ul>
        </div>
      ) : (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-4">
          <p className="text-sm text-yellow-600 dark:text-yellow-400 font-bold">⚠️ No hay certificado configurado para este entorno.</p>
        </div>
      )}

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
