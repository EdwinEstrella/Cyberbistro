import { useState, useEffect, useRef, useMemo } from "react";
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
  buildTenantNcfUpdatePayload,
  DEFAULT_NCF_B_CODE,
  NCF_B_SEQUENCE_FIELDS_SELECT,
  construirCadenaNcf,
  etiquetaTipoNcf,
  isNcfBCode,
  NCF_B_TIPO_OPCIONES,
  type NcfBCode,
} from "../../../shared/lib/ncf";

interface Config {
  nombre_empresa: string;
  rnc: string;
  logo_url: string;
  logo_size_px: number;
  logo_offset_x: number;
  logo_offset_y: number;
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

const SAMPLE_FACTURA_THERMAL_PREVIEW: Parameters<typeof buildFacturaReceiptHtml>[1] = {
  items: [
    { nombre: "Plato del menú (ejemplo)", categoria: "General", cantidad: 2, precio_unitario: 275.5, subtotal: 551 },
    { nombre: "Bebida (ejemplo)", categoria: "Bebidas", cantidad: 1, precio_unitario: 85, subtotal: 85 },
  ],
  subtotal: 636,
  itbis: 114.48,
  total: 750.48,
  metodo_pago: "efectivo",
  mesa_numero: 4,
  notas: "Vista previa.",
  estado: "pagada",
  propina: 0
};

const SAMPLE_COMANDA_THERMAL: Parameters<typeof buildComandaReceiptHtml>[1] = {
  id: "preview-comanda",
  numero_comanda: 42,
  mesa_numero: 4,
  items: [
    { nombre: "Plato del menú (ejemplo)", cantidad: 2, categoria: "General" },
    { nombre: "Bebida (ejemplo)", cantidad: 1, categoria: "Bebidas" },
  ],
  notas: "Nota de ejemplo.",
  created_at: new Date().toISOString()
};

const SAMPLE_CIERRE_THERMAL_BASE: Omit<CierreDiaThermalData, "generadoEn" | "generadoAtIso"> = {
  fechaOperacion: "12/04/2026",
  facturasPagadas: 14,
  facturasPendientes: 2,
  totalPagado: 12450.75,
  subtotalPagado: 10551.48,
  itbisPagado: 1899.27,
  gastosTotal: 2750,
  gastosCantidad: 3,
  netoOperativo: 9700.75,
  porMetodo: [
    { etiqueta: "Efectivo", cantidad: 8, total: 6200 },
    { etiqueta: "Tarjeta", cantidad: 5, total: 5250.75 },
    { etiqueta: "Digital", cantidad: 1, total: 1000 },
  ],
  ticketPromedioPagado: 889.34,
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
  const [config, setConfig] = useState<Config>({
    nombre_empresa: "",
    rnc: "",
    logo_url: "",
    logo_size_px: 52,
    logo_offset_x: 0,
    logo_offset_y: 0,
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
  const [thermalPreviewKind, setThermalPreviewKind] = useState<ThermalPreviewKind>("factura");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const TENANT_FIELDS_BASE = "nombre_negocio, rnc, logo_url, logo_size_px, logo_offset_x, logo_offset_y, direccion, telefono";
  const TENANT_FIELDS_CURRENCY = "moneda";
  const TENANT_FIELDS_NCF = `itbis_cobro_por_defecto, ncf_fiscal_activo, ncf_tipo_default, ncf_secuencia_siguiente, ncf_secuencias_por_tipo, ${NCF_B_SEQUENCE_FIELDS_SELECT}`;

  useEffect(() => {
    if (authLoading || !tenantId) { if (!authLoading) setLoading(false); return; }
    let cancelled = false;
    void (async () => {
      const res = await insforgeClient.database.from("tenants").select(`${TENANT_FIELDS_BASE}, ${TENANT_FIELDS_CURRENCY}, ${TENANT_FIELDS_NCF}`).eq("id", tenantId).maybeSingle();
      if (cancelled) return;
      if (res.error) { console.error(res.error.message); setLoading(false); return; }
      if (res.data) {
        const data = res.data as any;
        const defaultType: NcfBCode = isNcfBCode(data.ncf_tipo_default) ? data.ncf_tipo_default : DEFAULT_NCF_B_CODE;
        const ncfSequences = buildBSequenceMapFromRow(data);
        setConfig({
          nombre_empresa: data.nombre_negocio ?? "",
          rnc: data.rnc ?? "",
          logo_url: data.logo_url ?? "",
          logo_size_px: Math.min(90, Math.max(32, Number(data.logo_size_px ?? 52))),
          logo_offset_x: Math.min(28, Math.max(-28, Number(data.logo_offset_x ?? 0))),
          logo_offset_y: Math.min(18, Math.max(-12, Number(data.logo_offset_y ?? 0))),
          direccion: data.direccion ?? "",
          telefono: data.telefono ?? "",
          currency_code: (data.moneda || "DOP") as any,
          itbis_cobro_por_defecto: Boolean(data.itbis_cobro_por_defecto),
          ncf_fiscal_activo: Boolean(data.ncf_fiscal_activo),
          ncf_tipo_default: defaultType,
          ncf_secuencia_siguiente: ncfSequences[defaultType] ?? 1,
          ncf_secuencias_por_tipo: ncfSequences,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, tenantId]);

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true);
    const nextBSequences = Object.fromEntries(NCF_B_TIPO_OPCIONES.map(o => [o.codigo, Math.floor(Number(config.ncf_secuencias_por_tipo[o.codigo] || 1))])) as Record<NcfBCode, number>;
    const ncfUpdate = buildTenantNcfUpdatePayload(config.ncf_fiscal_activo, config.ncf_tipo_default, nextBSequences, config.ncf_secuencias_por_tipo);
    const payload = {
      nombre_negocio: config.nombre_empresa.trim(),
      rnc: config.rnc.trim() || null,
      logo_url: config.logo_url.trim() || null,
      logo_size_px: Math.min(90, Math.max(32, Math.round(Number(config.logo_size_px) || 52))),
      logo_offset_x: Math.min(28, Math.max(-28, Math.round(Number(config.logo_offset_x) || 0))),
      logo_offset_y: Math.min(18, Math.max(-12, Math.round(Number(config.logo_offset_y) || 0))),
      direccion: config.direccion.trim() || null,
      telefono: config.telefono.trim() || null,
      moneda: config.currency_code,
      itbis_cobro_por_defecto: config.itbis_cobro_por_defecto,
      ...ncfUpdate,
      updated_at: new Date().toISOString()
    };
    const { error } = await insforgeClient.database.from("tenants").update(payload).eq("id", tenantId);
    if (error) { console.error(error.message); }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !tenantId) return;
    const uploaded = await uploadTenantLogoFile(tenantId, file);
    if (!uploaded.ok) { return; }
    const saved = await saveTenantLogoUrl(tenantId, uploaded.publicUrl);
    if (!saved.ok) { return; }
    setConfig(p => ({ ...p, logo_url: uploaded.publicUrl }));
  }

  const tenantPreview: TenantReceiptInfo = useMemo(() => ({
    nombre_negocio: config.nombre_empresa.trim() || "Tu negocio",
    rnc: config.rnc.trim() || null,
    direccion: config.direccion.trim() || null,
    telefono: config.telefono.trim() || null,
    logo_url: config.logo_url.trim() || null,
    logo_size_px: config.logo_size_px,
    logo_offset_x: config.logo_offset_x,
    logo_offset_y: config.logo_offset_y,
    moneda: config.currency_code,
  }), [config]);

  const thermalPreviewHtml = useMemo(() => {
    const { paperWidthMm } = getThermalPrintSettings();
    const nowIso = new Date().toISOString();
    switch (thermalPreviewKind) {
      case "factura":
        let sample = { ...SAMPLE_FACTURA_THERMAL_PREVIEW, pagada_at: nowIso };
        if (config.ncf_fiscal_activo) {
          const ncf = construirCadenaNcf(config.ncf_tipo_default, config.ncf_secuencia_siguiente);
          if (ncf) sample = { ...sample, ncf, ncf_tipo: etiquetaTipoNcf(config.ncf_tipo_default) };
        }
        return buildFacturaReceiptHtml(tenantPreview, sample, 1, paperWidthMm);
      case "comanda": return buildComandaReceiptHtml(tenantPreview, { ...SAMPLE_COMANDA_THERMAL, created_at: nowIso }, paperWidthMm);
      case "cierre": return buildCierreDiaReceiptHtml(tenantPreview, { ...SAMPLE_CIERRE_THERMAL_BASE, generadoAtIso: nowIso, generadoEn: new Date().toLocaleString() }, paperWidthMm);
      case "split":
        const splitSymbol = config.currency_code === "ARS" ? "AR$" : "RD$";
        const rows = buildThermalSplitLineHtml("Plato ejemplo", 1, 350, config.currency_code);
        return buildSplitTicketHtml(tenantPreview, [{ personIndex: 1, splitParts: 1, rowsHtml: rows, totalLine: `${splitSymbol} 350.00` }], 4, paperWidthMm);
      default: return "";
    }
  }, [tenantPreview, thermalPreviewNonce, thermalPreviewKind, config]);

  if (authLoading || loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando...</div>;

  return (
    <div className="flex-1 min-h-0 p-4 sm:p-8 bg-background transition-colors duration-300 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
        <div className="flex flex-col gap-6">
          <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-10 shadow-sm">
            <span className="text-primary text-[11px] font-bold uppercase tracking-[0.2em] mb-2 block">Ajustes</span>
            <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold text-foreground mb-4">Configuración del Negocio</h1>
            <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">Administra la información pública de tu negocio, los comprobantes fiscales y la configuración de impresión térmica.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 flex flex-col gap-6">
              <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Información Básica</h2>
              <div className="space-y-4">
                <Field label="Nombre Comercial"><input type="text" value={config.nombre_empresa} onChange={e => setConfig(p => ({ ...p, nombre_empresa: e.target.value }))} className="input-field" /></Field>
                <Field label="RNC / Identificación"><input type="text" value={config.rnc} onChange={e => setConfig(p => ({ ...p, rnc: e.target.value }))} className="input-field" /></Field>
                <Field label="Dirección"><input type="text" value={config.direccion} onChange={e => setConfig(p => ({ ...p, direccion: e.target.value }))} className="input-field" /></Field>
                <div className="grid grid-cols-2 gap-4">
                   <Field label="Teléfono"><input type="text" value={config.telefono} onChange={e => setConfig(p => ({ ...p, telefono: e.target.value }))} className="input-field" /></Field>
                   <Field label="Divisa">
                     <select value={config.currency_code} onChange={e => setConfig(p => ({ ...p, currency_code: e.target.value as any }))} className="input-field cursor-pointer">
                       {CURRENCY_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                     </select>
                   </Field>
                </div>
              </div>
            </section>

            <section className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 flex flex-col gap-6">
              <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Configuración Fiscal</h2>
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={config.itbis_cobro_por_defecto} onChange={e => setConfig(p => ({ ...p, itbis_cobro_por_defecto: e.target.checked }))} className="size-4 rounded accent-primary" />
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Cobrar ITBIS por defecto</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group border-t border-border pt-4">
                  <input type="checkbox" checked={config.ncf_fiscal_activo} onChange={e => setConfig(p => ({ ...p, ncf_fiscal_activo: e.target.checked }))} className="size-4 rounded accent-primary" />
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Activar emisión de NCF</span>
                </label>
                {config.ncf_fiscal_activo && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col gap-4">
                    <Field label="Tipo Predeterminado">
                      <select value={config.ncf_tipo_default} onChange={e => setConfig(p => ({ ...p, ncf_tipo_default: e.target.value as any }))} className="input-field cursor-pointer">
                        {NCF_B_TIPO_OPCIONES.map(o => <option key={o.codigo} value={o.codigo}>{o.descripcion}</option>)}
                      </select>
                    </Field>
                    <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Secuencias Configuradas por Tipo B</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {NCF_B_TIPO_OPCIONES.map(o => (
                          <div key={o.codigo} className="bg-background rounded-[16px] border border-black/5 dark:border-white/5 p-4 flex flex-col gap-3 hover:border-primary/20 transition-colors">
                             <div className="flex justify-between items-center">
                               <span className="font-bold font-['Space_Grotesk'] text-foreground text-lg">{o.codigo}</span>
                               <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{o.codigo === config.ncf_tipo_default ? "Predeterminado" : "Disponible"}</span>
                             </div>
                             <input type="number" min="1" value={config.ncf_secuencias_por_tipo[o.codigo] || 1} onChange={e => setConfig(p => ({ ...p, ncf_secuencias_por_tipo: { ...p.ncf_secuencias_por_tipo, [o.codigo]: Math.max(1, parseInt(e.target.value) || 1) } }))} className="bg-muted/30 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 font-mono text-foreground font-bold outline-none focus:border-primary/50 transition-all" />
                             <span className="text-[11px] text-muted-foreground/80 leading-relaxed">{o.codigo} - {o.descripcion}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-[13px] font-bold text-green-500/90 tracking-wide">
                        Vista previa — próximo NCF: {construirCadenaNcf(config.ncf_tipo_default, config.ncf_secuencias_por_tipo[config.ncf_tipo_default] || 1) || "---"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6">
            <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground mb-6">Vista Previa Impresión</h2>
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {THERMAL_PREVIEW_TABS.map(t => (
                <button key={t.id} onClick={() => setThermalPreviewKind(t.id)} className={`px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-widest transition-all cursor-pointer border-none ${thermalPreviewKind === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"}`}>{t.label}</button>
              ))}
            </div>
            <div className="bg-muted/30 rounded-2xl p-8 flex justify-center border border-dashed border-border min-h-[400px]">
               <iframe srcDoc={thermalPreviewHtml} className="bg-white rounded shadow-2xl border-none w-[80mm] min-h-[500px] scale-95 origin-top" title="Thermal Preview" />
            </div>
          </section>

          <button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground rounded-xl py-4 font-bold uppercase text-sm tracking-[0.2em] shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer w-full md:w-fit md:px-12 self-end">
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-8">
           <section className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 flex flex-col gap-6">
              <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Identidad Visual</h2>
              <div className="aspect-video bg-muted/50 rounded-2xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden relative group">
                {config.logo_url ? <img src={config.logo_url} className="max-h-[80%] object-contain" /> : <span className="text-muted-foreground text-xs font-['Inter']">Sin Logo</span>}
                <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <button onClick={() => fileInputRef.current?.click()} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-xs font-bold uppercase border-none cursor-pointer">Cambiar</button>
                </div>
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleLogoUpload} />
              <Field label="URL Remota"><input type="text" value={config.logo_url} onChange={e => setConfig(p => ({ ...p, logo_url: e.target.value }))} className="input-field" /></Field>
              <div className="border-t border-border pt-5 flex flex-col gap-4">
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Logo en recibos</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">Se guarda en InsForge al presionar Guardar Cambios.</p>
                </div>
                <Field label={`Tamaño (${config.logo_size_px}px)`}>
                  <input type="range" min="32" max="90" value={config.logo_size_px} onChange={e => setConfig(p => ({ ...p, logo_size_px: Number(e.target.value) }))} className="w-full accent-primary" />
                </Field>
                <Field label={`Izquierda / Derecha (${config.logo_offset_x}px)`}>
                  <input type="range" min="-28" max="28" value={config.logo_offset_x} onChange={e => setConfig(p => ({ ...p, logo_offset_x: Number(e.target.value) }))} className="w-full accent-primary" />
                </Field>
                <Field label={`Arriba / Abajo (${config.logo_offset_y}px)`}>
                  <input type="range" min="-12" max="18" value={config.logo_offset_y} onChange={e => setConfig(p => ({ ...p, logo_offset_y: Number(e.target.value) }))} className="w-full accent-primary" />
                </Field>
              </div>
           </section>

           <ThermalPrintSettingsCard onThermalSaved={() => setThermalPreviewNonce(n => n + 1)} />
           <AppDesktopUpdateCard />
        </aside>
      </div>
      <style>{`
        .input-field {
          width: 100%;
          background: var(--muted);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 14px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: var(--primary);
          background: transparent;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">{label}</label>{children}</div>;
}

function AppDesktopUpdateCard() {
  const { phase, checkForUpdates } = useAppUpdate();
  const isElectron = Boolean(window.electronAPI?.checkForUpdates);
  return (
    <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 flex flex-col gap-4">
      <h3 className="font-['Space_Grotesk'] text-lg font-bold text-foreground">Actualización</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">Versión actual: <span className="text-foreground font-bold">{__APP_VERSION__}</span>. Las actualizaciones automáticas están optimizadas para la versión nativa.</p>
      {isElectron && (
        <button onClick={checkForUpdates} disabled={phase === "checking"} className="bg-muted text-foreground border border-border rounded-lg py-2.5 text-[11px] font-bold uppercase tracking-widest hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 transition-all cursor-pointer">
          {phase === "checking" ? "Buscando..." : "Buscar Actualización"}
        </button>
      )}
    </div>
  );
}

function ThermalPrintSettingsCard({ onThermalSaved }: { onThermalSaved?: () => void }) {
  const initialThermalSettings = useMemo(() => getThermalPrintSettings(), []);
  const [paperWidthMm, setPaperWidthMm] = useState<PaperWidthMm>(initialThermalSettings.paperWidthMm);
  const [printerName, setPrinterName] = useState(initialThermalSettings.printerName);
  const [printers, setPrinters] = useState<ThermalPrinterInfo[]>([]);
  useEffect(() => {
    if (window.electronAPI?.listPrinters) {
      window.electronAPI.listPrinters().then(setPrinters).catch(() => {});
    }
  }, []);
  function handleSave() {
    saveThermalPrintSettings({ ...getThermalPrintSettings(), paperWidthMm, printerName });
    onThermalSaved?.();
    alert("Configuración de impresión guardada.");
  }
  return (
    <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 flex flex-col gap-6 shadow-sm">
      <h3 className="font-['Space_Grotesk'] text-lg font-bold text-foreground">Impresora Térmica</h3>
      <div className="flex gap-2">
        {([80, 88] as const).map(w => (
          <button key={w} onClick={() => setPaperWidthMm(w)} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${paperWidthMm === w ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground"}`}>{w}mm</button>
        ))}
      </div>
      <Field label="Seleccionar Impresora">
        <select value={printerName} onChange={e => setPrinterName(e.target.value)} className="input-field cursor-pointer">
          <option value="">Predeterminada</option>
          {printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
        </select>
      </Field>
      <button onClick={handleSave} className="bg-muted text-foreground border border-border rounded-lg py-3 text-[11px] font-bold uppercase tracking-widest hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer">Guardar Local</button>
    </div>
  );
}
