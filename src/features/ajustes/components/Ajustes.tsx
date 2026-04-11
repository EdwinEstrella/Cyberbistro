import { useState, useEffect, useRef } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";

interface Config {
  nombre_empresa: string;
  rnc: string;
  logo_url: string;
}

export function Ajustes() {
  const { tenantId, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<Config>({
    nombre_empresa: "",
    rnc: "",
    logo_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!tenantId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    insforgeClient.database
      .from("tenants")
      .select("nombre_negocio, rnc, logo_url")
      .eq("id", tenantId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setConfig({
            nombre_empresa: data.nombre_negocio ?? "",
            rnc: data.rnc ?? "",
            logo_url: data.logo_url ?? "",
          });
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId]);

  async function handleSave() {
    if (!tenantId) {
      setSaveError("No hay negocio vinculado a tu cuenta.");
      return;
    }

    setSaving(true);
    setSavedOk(false);
    setSaveError("");

    const { error } = await insforgeClient.database
      .from("tenants")
      .update({
        nombre_negocio: config.nombre_empresa.trim() || "Mi negocio",
        rnc: config.rnc.trim() || null,
        logo_url: config.logo_url.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (error) {
      setSaveError(error.message || "Error al guardar. Intentá de nuevo.");
    } else {
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `logos/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error } = await insforgeClient.storage
      .from("configuracion")
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = insforgeClient.storage
        .from("configuracion")
        .getPublicUrl(path);
      setConfig((prev) => ({ ...prev, logo_url: data.publicUrl }));
    }
    setUploading(false);
    e.target.value = "";
  }

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando configuración...
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[14px] text-center max-w-md">
          Tu usuario no está vinculado a un negocio. Iniciá sesión con una cuenta de administrador o
          completá el registro de unidad.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-[32px] overflow-auto">
      <div className="max-w-[640px] flex flex-col gap-[28px]">
        <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px]">
          Ajustes
        </h1>

        {savedOk && (
          <div className="bg-[rgba(89,238,80,0.05)] border border-[rgba(89,238,80,0.2)] rounded-[12px] px-[20px] py-[12px]">
            <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">
              Configuración guardada correctamente.
            </span>
          </div>
        )}
        {saveError && (
          <div className="bg-[rgba(255,113,108,0.05)] border border-[rgba(255,113,108,0.2)] rounded-[12px] px-[20px] py-[12px]">
            <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">
              {saveError}
            </span>
          </div>
        )}

        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[4px]">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
              Información del Negocio
            </span>
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
              Datos de tu negocio (multitenant). Aparecen en comandas, facturas e impresiones.
            </span>
          </div>

          <div className="flex flex-col gap-[16px]">
            <Field label="Nombre del Negocio">
              <input
                type="text"
                value={config.nombre_empresa}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    nombre_empresa: e.target.value,
                  }))
                }
                placeholder="ej. CyberBistro"
                className="input-field"
              />
            </Field>
            <Field label="RNC">
              <input
                type="text"
                value={config.rnc}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, rnc: e.target.value }))
                }
                placeholder="000-00000-0"
                className="input-field"
              />
            </Field>
          </div>
        </div>

        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[4px]">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
              Logo del Negocio
            </span>
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
              Se imprime en el encabezado de todas las comandas y facturas.
            </span>
          </div>

          {config.logo_url ? (
            <div className="bg-[#1a1a1a] rounded-[12px] p-[20px] flex items-center justify-center min-h-[100px] border border-[rgba(72,72,71,0.2)]">
              <img
                src={config.logo_url}
                alt="Logo del negocio"
                className="max-h-[80px] max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <div className="bg-[#1a1a1a] rounded-[12px] p-[20px] flex items-center justify-center min-h-[100px] border border-dashed border-[rgba(72,72,71,0.3)]">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
                Sin logo configurado
              </span>
            </div>
          )}

          <Field label="URL del Logo">
            <input
              type="url"
              value={config.logo_url}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, logo_url: e.target.value }))
              }
              placeholder="https://ejemplo.com/logo.png"
              className="input-field"
            />
          </Field>

          <div className="flex items-center gap-[12px]">
            <div className="h-px flex-1 bg-[rgba(72,72,71,0.25)]" />
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px]">
              o subí un archivo
            </span>
            <div className="h-px flex-1 bg-[rgba(72,72,71,0.25)]" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-[#262626] rounded-[12px] border border-[rgba(72,72,71,0.3)] px-[24px] py-[12px] font-['Inter',sans-serif] text-[#adaaaa] text-[13px] cursor-pointer transition-colors disabled:opacity-50 text-center"
            style={{}}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = "rgba(255,144,109,0.3)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)")
            }
          >
            {uploading ? "Subiendo..." : "Seleccionar imagen"}
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#ff906d] rounded-[12px] px-[28px] py-[14px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[15px] tracking-[0.5px] uppercase cursor-pointer border-none shadow-[0px_0px_20px_0px_rgba(255,144,109,0.3)] transition-opacity disabled:opacity-50 self-start"
        >
          {saving ? "Guardando..." : "Guardar Cambios"}
        </button>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          background: #1a1a1a;
          border: 1px solid rgba(72,72,71,0.3);
          border-radius: 10px;
          padding: 12px 16px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: white;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .input-field:focus {
          border-color: rgba(255,144,109,0.4);
        }
        .input-field::placeholder {
          color: rgba(107,114,128,0.8);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[8px]">
      <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}
