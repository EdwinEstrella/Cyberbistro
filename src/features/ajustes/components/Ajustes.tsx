import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import type { ThermalPrinterInfo } from "../../../shared/types/electron";
import type { PaperWidthMm } from "../../../shared/lib/thermalStorage";
import {
  getThermalPrintSettings,
  saveThermalPrintSettings,
} from "../../../shared/lib/thermalStorage";
import {
  buildFacturaReceiptHtml,
  buildComandaReceiptHtml,
  buildSplitTicketHtml,
  buildThermalSplitLineHtml,
  buildCierreDiaReceiptHtml,
  type TenantReceiptInfo,
  type CierreDiaThermalData,
} from "../../../shared/lib/receiptTemplates";
import {
  saveTenantLogoUrl,
  uploadTenantLogoFile,
} from "../../../shared/lib/tenantLogoStorage";
import { useAppUpdate } from "../../updates/AppUpdateContext";
import {
  buildBSequenceMapFromRow,
  DEFAULT_NCF_B_CODE,
  NCF_B_SEQUENCE_FIELDS_SELECT,
  construirCadenaNcf,
  etiquetaTipoNcf,
  isNcfBCode,
  NCF_B_TIPO_OPCIONES,
  type NcfBCode,
  type TenantNcfRow,
} from "../../../shared/lib/ncf";
import { useTheme } from "../../../shared/context/ThemeContext";

interface Config {
  nombre_empresa: string;
  rnc: string;
  logo_url: string;
  direccion: string;
  telefono: string;
  currency_code: "DOP" | "ARS";
  itbis_cobro_por_defecto: boolean;
  ncf_fiscal_activo: boolean;
  ncf_tipo_default: NcfBCode;
  ncf_secuencia_siguiente: number;
  ncf_secuencias_por_tipo: Record<NcfBCode, number>;
}

const CURRENCY_OPTIONS: Array<{ code: Config["currency_code"]; label: string }> = [
  { code: "DOP", label: "Peso dominicano (RD$)" },
  { code: "ARS", label: "Peso argentino (AR$)" },
];

/** Factura de ejemplo: solo para vista previa en Ajustes (mismos campos que un cobro real). */
const SAMPLE_FACTURA_THERMAL: Parameters<typeof buildFacturaReceiptHtml>[1] = {
  items: [
    { nombre: "Plato del menú (ejemplo)", cantidad: 2, precio_unitario: 275.5, subtotal: 551 },
    { nombre: "Bebida (ejemplo)", cantidad: 1, precio_unitario: 85, subtotal: 85 },
  ],
  subtotal: 636,
  itbis: 114.48,
  total: 750.48,
  metodo_pago: "efectivo",
  mesa_numero: 4,
  notas: "Vista previa — ítems y totales son de ejemplo.",
  estado: "pagada",
};

const SAMPLE_COMANDA_THERMAL: Parameters<typeof buildComandaReceiptHtml>[1] = {
  id: "preview-comanda",
  numero_comanda: 42,
  mesa_numero: 4,
  items: [
    { nombre: "Plato del menú (ejemplo)", cantidad: 2, categoria: "General" },
    { nombre: "Bebida (ejemplo)", cantidad: 1, categoria: "Bebidas" },
  ],
  notas: "Vista previa — nota de cocina de ejemplo.",
};

const SAMPLE_CIERRE_THERMAL_BASE: Omit<CierreDiaThermalData, "generadoEn" | "generadoAtIso"> = {
  fechaOperacion: "12/04/2026",
  facturasPagadas: 14,
  facturasPendientes: 2,
  facturasCanceladas: 0,
  totalPagado: 12450.75,
  subtotalPagado: 10551.48,
  itbisPagado: 1899.27,
  porMetodo: [
    { etiqueta: "Efectivo", cantidad: 8, total: 6200 },
    { etiqueta: "Tarjeta", cantidad: 5, total: 5250.75 },
    { etiqueta: "Digital", cantidad: 1, total: 1000 },
  ],
  ticketPromedioPagado: 889.34,
  cuentasAbiertasLineas: 5,
  cuentasAbiertasMesas: 2,
  cuentasAbiertasSubtotal: 450,
  cuentasAbiertasItbisEst: 81,
  cuentasAbiertasTotalEst: 531,
};

type ThermalPreviewKind = "factura" | "comanda" | "cierre" | "split";

const THERMAL_PREVIEW_TABS: { id: ThermalPreviewKind; label: string }[] = [
  { id: "factura", label: "Factura" },
  { id: "comanda", label: "Comanda" },
  { id: "cierre", label: "Cierre" },
  { id: "split", label: "Separar cuenta" },
];

export function Ajustes() {
  const { tenantId, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [config, setConfig] = useState<Config>({
    nombre_empresa: "",
    rnc: "",
    logo_url: "",
    direccion: "",
    telefono: "",
    currency_code: "DOP",
    itbis_cobro_por_defecto: false,
    ncf_fiscal_activo: false,
    ncf_tipo_default: DEFAULT_NCF_B_CODE,
    ncf_secuencia_siguiente: 1,
    ncf_secuencias_por_tipo: buildBSequenceMapFromRow(null),
  });
  const [thermalPreviewNonce, setThermalPreviewNonce] = useState(0);
  const [thermalPreviewKind, setThermalPreviewKind] =
    useState<ThermalPreviewKind>("factura");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [partialSaveNote, setPartialSaveNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const TENANT_FIELDS_BASE =
    "nombre_negocio, rnc, logo_url, direccion, telefono";
  const TENANT_FIELDS_CURRENCY = "moneda";
  const TENANT_FIELDS_NCF =
    `itbis_cobro_por_defecto, ncf_fiscal_activo, ncf_tipo_default, ncf_secuencia_siguiente, ncf_secuencias_por_tipo, ${NCF_B_SEQUENCE_FIELDS_SELECT}`;

  useEffect(() => {
    if (authLoading) return;
    if (!tenantId) {
      setLoading(false);
      setLoadError("");
      return;
    }
    let cancelled = false;
    setLoadError("");
    void (async () => {
      let res = await insforgeClient.database
        .from("tenants")
        .select(`${TENANT_FIELDS_BASE}, ${TENANT_FIELDS_CURRENCY}, ${TENANT_FIELDS_NCF}`)
        .eq("id", tenantId)
        .maybeSingle();
      if (res.error && !cancelled) {
        res = await insforgeClient.database
          .from("tenants")
          .select(`${TENANT_FIELDS_BASE}, currency_code, ${TENANT_FIELDS_NCF}`)
          .eq("id", tenantId)
          .maybeSingle();
      }
      if (res.error && !cancelled) {
        res = await insforgeClient.database
          .from("tenants")
          .select(TENANT_FIELDS_BASE)
          .eq("id", tenantId)
          .maybeSingle();
      }
      if (cancelled) return;
      if (res.error) {
        setLoadError(res.error.message || "No se pudo cargar el negocio.");
        setLoading(false);
        return;
      }
      const data = res.data;
      if (data) {
        const defaultTypeRaw = data.ncf_tipo_default;
        const defaultType = isNcfBCode(defaultTypeRaw) ? defaultTypeRaw : DEFAULT_NCF_B_CODE;
        const ncfSequences = buildBSequenceMapFromRow(data as TenantNcfRow);
        const currencyRaw = (data.moneda || data.currency_code || "DOP").trim().toUpperCase();
        setConfig({
          nombre_empresa: data.nombre_negocio ?? "",
          rnc: data.rnc ?? "",
          logo_url: data.logo_url ?? "",
          direccion: data.direccion ?? "",
          telefono: data.telefono ?? "",
          currency_code: currencyRaw === "ARS" ? "ARS" : "DOP",
          itbis_cobro_por_defecto: data.itbis_cobro_por_defecto ?? false,
          ncf_fiscal_activo: data.ncf_fiscal_activo ?? false,
          ncf_tipo_default: defaultType,
          ncf_secuencia_siguiente: data.ncf_secuencia_siguiente ?? 1,
          ncf_secuencias_por_tipo: ncfSequences,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, tenantId]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!tenantId || !e.target.files?.[0]) return;
    setUploading(true);
    setLogoUploadError("");
    try {
      const file = e.target.files[0];
      const url = await uploadTenantLogoFile(tenantId, file);
      await saveTenantLogoUrl(tenantId, url);
      setConfig((prev) => ({ ...prev, logo_url: url }));
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err: any) {
      setLogoUploadError(err.message || "Error al subir logo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true);
    setSaveError("");
    setSavedOk(false);
    setPartialSaveNote("");

    const payload: any = {
      nombre_negocio: config.nombre_empresa,
      rnc: config.rnc,
      logo_url: config.logo_url,
      direccion: config.direccion,
      telefono: config.telefono,
      moneda: config.currency_code,
      itbis_cobro_por_defecto: config.itbis_cobro_por_defecto,
      ncf_fiscal_activo: config.ncf_fiscal_activo,
      ncf_tipo_default: config.ncf_tipo_default,
      ncf_secuencia_siguiente: config.ncf_secuencia_siguiente,
    };

    const ncfSub = buildTenantNcfUpdatePayload(config.ncf_secuencias_por_tipo);
    Object.assign(payload, ncfSub);

    const { error } = await insforgeClient.database
      .from("tenants")
      .update(payload)
      .eq("id", tenantId);

    if (error) {
      setSaveError(error.message);
    } else {
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    }
    setSaving(false);
  }

  const tenantPreview: TenantReceiptInfo = useMemo(() => ({
    nombre_negocio: config.nombre_empresa || "Tu Negocio",
    rnc: config.rnc || "000-00000-0",
    direccion: config.direccion || "Dirección del local",
    telefono: config.telefono || "809-000-0000",
    logo_url: config.logo_url || null,
    moneda: config.currency_code,
  }), [config]);

  const thermalPreviewHtml = useMemo(() => {
    const paperWidthMm = getThermalPrintSettings().paperWidthMm;
    const nowIso = new Date().toISOString();
    switch (thermalPreviewKind) {
      case "factura": {
        let sample = { ...SAMPLE_FACTURA_THERMAL, created_at: nowIso };
        if (config.ncf_fiscal_activo) {
          const ncf = construirCadenaNcf(config.ncf_tipo_default, config.ncf_secuencia_siguiente);
          if (ncf) {
            sample = { ...sample, ncf, ncf_tipo: etiquetaTipoNcf(config.ncf_tipo_default) } as any;
          }
        }
        return buildFacturaReceiptHtml(tenantPreview, sample as any, 1, paperWidthMm);
      }
      case "comanda":
        return buildComandaReceiptHtml(tenantPreview, { ...SAMPLE_COMANDA_THERMAL, created_at: nowIso }, paperWidthMm);
      case "cierre":
        return buildCierreDiaReceiptHtml(tenantPreview, { ...SAMPLE_CIERRE_THERMAL_BASE, generadoAtIso: nowIso, generadoEn: "12/04/2026 23:59" } as any, paperWidthMm);
      case "split": {
        const splitSymbol = config.currency_code === "ARS" ? "AR$" : "RD$";
        const rowsP1 = buildThermalSplitLineHtml("Plato del menú (ejemplo)", 1, 375.24, config.currency_code) + buildThermalSplitLineHtml("Bebida (ejemplo)", 1, 85, config.currency_code);
        return buildSplitTicketHtml(tenantPreview, [{ personIndex: 1, splitParts: 2, rowsHtml: rowsP1, totalLine: `${splitSymbol} 460.24` }], 4, paperWidthMm);
      }
    }
  }, [tenantPreview, thermalPreviewNonce, thermalPreviewKind, config]);

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[16px]">Cargando configuración...</span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <p className="font-['Inter',sans-serif] text-muted-foreground text-[14px] text-center max-w-md">Tu usuario no está vinculado a un negocio.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-4 sm:p-[32px] bg-background transition-colors duration-300 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 xl:gap-8 items-start">
        <div className="flex flex-col gap-[24px] min-w-0 order-2 xl:order-1">
          <div className={`rounded-[24px] border px-6 py-6 sm:px-8 sm:py-7 shadow-sm ${isDark ? "bg-card border-white/10" : "bg-white border-black"}`}>
            <div className="flex flex-col gap-2">
              <span className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.28em] text-primary font-bold">Configuración operativa</span>
              <h1 className={`font-['Space_Grotesk',sans-serif] font-bold text-[28px] sm:text-[34px] leading-none m-0 ${isDark ? "text-white" : "text-black"}`}>Ajustes del negocio</h1>
              <p className="font-['Inter',sans-serif] text-muted-foreground text-[14px] leading-relaxed max-w-3xl m-0">Organizá branding, NCF y configuración térmica.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-[24px] items-start">
            <div className={`rounded-[20px] border p-[28px] flex flex-col gap-[20px] h-full ${isDark ? "bg-card border-white/10" : "bg-white border-black"}`}>
              <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[18px] ${isDark ? "text-white" : "text-black"}`}>Información del Negocio</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                <div className="md:col-span-2">
                  <Field label="Nombre del Negocio"><input type="text" value={config.nombre_empresa} onChange={(e) => setConfig(p => ({ ...p, nombre_empresa: e.target.value }))} className={`input-field ${isDark ? "dark" : "light"}`} /></Field>
                </div>
                <Field label="RNC"><input type="text" value={config.rnc} onChange={(e) => setConfig(p => ({ ...p, rnc: e.target.value }))} className={`input-field ${isDark ? "dark" : "light"}`} /></Field>
                <Field label="Dirección"><input type="text" value={config.direccion} onChange={(e) => setConfig(p => ({ ...p, direccion: e.target.value }))} className={`input-field ${isDark ? "dark" : "light"}`} /></Field>
                <Field label="Teléfono"><input type="text" value={config.telefono} onChange={(e) => setConfig(p => ({ ...p, telefono: e.target.value }))} className={`input-field ${isDark ? "dark" : "light"}`} /></Field>
                <Field label="Divisa">
                  <select value={config.currency_code} onChange={(e) => setConfig(p => ({ ...p, currency_code: e.target.value as any }))} className={`input-field ${isDark ? "dark" : "light"}`}>
                    {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <div className={`rounded-[20px] border p-[28px] flex flex-col gap-[20px] h-full ${isDark ? "bg-card border-white/10" : "bg-white border-black"}`}>
              <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[18px] ${isDark ? "text-white" : "text-black"}`}>Comprobante fiscal (NCF)</span>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={config.itbis_cobro_por_defecto} onChange={(e) => setConfig(p => ({ ...p, itbis_cobro_por_defecto: e.target.checked }))} className="size-4 rounded border-border accent-primary" />
                <span className={`font-['Inter',sans-serif] text-[14px] ${isDark ? "text-white" : "text-black"}`}>Activar ITBIS por defecto</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={config.ncf_fiscal_activo} onChange={(e) => setConfig(p => ({ ...p, ncf_fiscal_activo: e.target.checked }))} className="size-4 rounded border-border accent-primary" />
                <span className={`font-['Inter',sans-serif] text-[14px] ${isDark ? "text-white" : "text-black"}`}>Asignar NCF automáticamente</span>
              </label>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground rounded-[12px] px-[28px] py-[14px] font-['Space_Grotesk',sans-serif] font-bold text-[15px] uppercase cursor-pointer border-none shadow-lg hover:opacity-90 transition-all disabled:opacity-50 self-start">
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>

        <aside className="min-w-0 order-1 xl:order-2 xl:sticky xl:top-4 xl:self-start flex flex-col gap-6">
          <div className={`rounded-[20px] border p-[28px] flex flex-col gap-[20px] ${isDark ? "bg-card border-white/10" : "bg-white border-black"}`}>
            <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[18px] ${isDark ? "text-white" : "text-black"}`}>Logo del Negocio</span>
            <div className={`rounded-[12px] p-[20px] flex items-center justify-center min-h-[100px] border ${isDark ? "bg-[#1a1a1a] border-white/10" : "bg-muted border-black/10"}`}>
              {config.logo_url ? <img src={config.logo_url} alt="Logo" className="max-h-[100px] max-w-full object-contain" /> : <span className="font-['Inter',sans-serif] text-muted-foreground text-[12px]">Sin logo</span>}
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={`rounded-[12px] border px-[24px] py-[12px] font-['Inter',sans-serif] font-bold text-[13px] cursor-pointer transition-all ${isDark ? "bg-muted border-white/10 text-white" : "bg-muted border-black/20 text-black hover:border-black"}`}>
              {uploading ? "Subiendo..." : "Cambiar logo"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </aside>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          border-radius: 10px;
          padding: 12px 16px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .input-field.dark {
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
        }
        .input-field.light {
          background: #f8fafc;
          border: 1px solid black;
          color: black;
        }
        .input-field:focus {
          border-color: var(--primary);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div className="flex flex-col gap-[8px]">
      <label className={`font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.8px] uppercase ${theme === "dark" ? "text-white/60" : "text-black/60"}`}>{label}</label>
      {children}
    </div>
  );
}
