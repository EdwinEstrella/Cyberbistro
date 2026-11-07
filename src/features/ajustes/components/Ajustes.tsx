import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { supabase } from "../../../shared/lib/supabase";
import { useAuth, ensureAuthSessionFresh } from "../../../shared/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../shared/ui/tabs";

import {
  getThermalPrintSettings,
} from "../../../shared/lib/thermalStorage";
import {
  shouldReadLocalFirst,
  readLocalMirror,
  enqueueLocalWrite,
  getDeviceId,
} from "../../../shared/lib/localFirst";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import {
  buildFacturaReceiptHtml,
  buildComandaReceiptHtml,
  buildSplitTicketHtml,
  buildThermalSplitLineHtml,
  buildCierreDiaReceiptHtml,
  buildNominaReceiptHtml,
  type TenantReceiptInfo,
  type CierreDiaThermalData,
  type NominaReceiptData,
} from "../../../shared/lib/receiptTemplates";
import {
  saveTenantLogoUrl,
  uploadTenantLogoFile,
} from "../../../shared/lib/tenantLogoStorage";
import { cacheLogoFromUrl, refreshLogoCache } from "../../../shared/lib/logoCache";
import {
  buildBSequenceMapFromRow,
  DEFAULT_NCF_B_CODE,
  NCF_B_SEQUENCE_FIELDS_SELECT,
  construirCadenaNcf,
  etiquetaTipoNcf,
  normalizeNcfActiveMap,
  normalizeNcfSequenceMap,
  normalizeNcfTypeForFiscalMode,
} from "../../../shared/lib/ncf";
import { buildAjustesSavePayload } from "../lib/ajustesPayload";
import { AjustesGeneralTab } from "./AjustesGeneralTab";
import { AjustesFacturacionTab } from "./AjustesFacturacionTab";
import { ActivationPanel } from "../../fiscal/components/ActivationPanel";
import { FeatureGuard } from "../../../app/components/FeatureGuard";
import type { AjustesConfig, ThermalPreviewKind } from "../types";

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
  notas: null,
  estado: "pagada",
  propina: 0,
  cliente_nombre: "Juan Pérez (Ejemplo)",
  cliente_rnc: "101-00123-4",
  ncf: "B0100000005"
};

const SAMPLE_NOTA_CREDITO_THERMAL_PREVIEW: Parameters<typeof buildFacturaReceiptHtml>[1] = {
  items: [
    { nombre: "Plato del menú (devolución)", categoria: "General", cantidad: 1, precio_unitario: 275.5, subtotal: 275.5 },
  ],
  subtotal: 275.5,
  itbis: 49.59,
  total: 325.09,
  metodo_pago: "efectivo",
  mesa_numero: 4,
  notas: null,
  estado: "nota_credito",
  propina: 0,
  cliente_nombre: "Juan Pérez (Ejemplo)",
  cliente_rnc: "101-00123-4",
  ncf: "E340000000001",
  ncf_tipo: "E34",
  credit_note_of: "00000000-0000-0000-0000-000000000001",
  ref_ncf: "E310000000045",
  ref_fecha_emision: "2026-11-06",
  ref_codigo_modificacion: 1,
  ref_razon_modificacion: "Devolución de producto",
  ecf_status: "accepted",
  ecf_security_code: "AbC123",
  ecf_submitted_at: new Date().toISOString(),
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
  totalPagado: 12450.75,
  subtotalPagado: 10551.48,
  itbisPagado: 1899.27,
  propinaPagado: 0,
  gastosTotal: 2750,
  gastosCantidad: 3,
  netoOperativo: 9700.75,
  efectivoInicial: 1500,
  cajaEsperada: 4950,
  porMetodo: [
    { etiqueta: "Efectivo", cantidad: 8, total: 6200 },
    { etiqueta: "Tarjeta", cantidad: 5, total: 5250.75 },
    { etiqueta: "Digital", cantidad: 1, total: 1000 },
  ],
};

const SAMPLE_NOMINA_THERMAL: NominaReceiptData = {
  empleadoNombre: "Carlos Manuel De La Rosa",
  empleadoCargo: "Chef Principal",
  empleadoIdentificacion: "001-1234567-8",
  periodo: "2026-08 (Quincena 2)",
  frecuencia: "Quincenal",
  fechaPagoIso: new Date().toISOString(),
  metodoPago: "transferencia",
  salarioBase: 25000,
  adicionales: 3500,
  deducciones: 1200,
  totalDebido: 27300,
  montoPagado: 27300,
  balancePendiente: 0,
  notas: "Incluye bono por desempeño y horas extra.",
  ajustesDetalle: [
    { descripcion: "Bono desempeño", monto: 3500, tipo: "adicion" },
    { descripcion: "Adelanto de quincena", monto: 1200, tipo: "deduccion" },
  ],
};


export function Ajustes() {
  const { tenantId, loading: authLoading, plan } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "general";

  const [config, setConfig] = useState<AjustesConfig>({
    nombre_empresa: "",
    rnc: "",
    logo_url: "",
    logo_size_px: 52,
    logo_offset_x: 0,
    logo_offset_y: 0,
    menu_url: "",
    direccion: "",
    telefono: "",
    currency_code: "DOP",
    itbis_cobro_por_defecto: false,
    itbis_incluido_en_precio: false,
    propina_cobro_por_defecto: false,
    ncf_fiscal_activo: false,
    fiscal_mode: "internal_receipt",
    fiscal_mode_fallback: "internal_receipt",
    ecf_environment: "certification",
    ncf_tipo_default: DEFAULT_NCF_B_CODE,
    ncf_secuencia_siguiente: 1,
    ncf_secuencias_por_tipo: buildBSequenceMapFromRow(null),
    ncf_tipos_activos: {},
  });
  const [thermalPreviewKind, setThermalPreviewKind] = useState<ThermalPreviewKind>("factura");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printingTest, setPrintingTest] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const existingTenantRef = useRef<any>(null);

  const TENANT_FIELDS_BASE = "nombre_negocio, rnc, logo_url, logo_size_px, logo_offset_x, logo_offset_y, menu_url, direccion, telefono";
  const TENANT_FIELDS_CURRENCY = "moneda";
  const TENANT_FIELDS_NCF = `itbis_cobro_por_defecto, itbis_incluido_en_precio, propina_cobro_por_defecto, ncf_fiscal_activo, fiscal_mode, fiscal_mode_fallback, ecf_environment, ncf_tipo_default, ncf_secuencia_siguiente, ncf_secuencias_por_tipo, ncf_tipos_activos, ${NCF_B_SEQUENCE_FIELDS_SELECT}`;

  useEffect(() => {
    if (authLoading || !tenantId) { if (!authLoading) setLoading(false); return; }
    let cancelled = false;
    void (async () => {
      await ensureAuthSessionFresh();
      
      const useLocal = await shouldReadLocalFirst(tenantId, ["tenants"]);
      let data: any = null;

      if (useLocal) {
        const localTenants = await readLocalMirror<any>(tenantId, "tenants").catch(() => []);
        data = localTenants.find((t) => t.id === tenantId);
        if (!data && navigator.onLine) {
          const res = await supabase.from("tenants").select(`${TENANT_FIELDS_BASE}, ${TENANT_FIELDS_CURRENCY}, ${TENANT_FIELDS_NCF}`).eq("id", tenantId).maybeSingle();
          data = res.data;
        }
      } else {
        let res = await supabase.from("tenants").select(`${TENANT_FIELDS_BASE}, ${TENANT_FIELDS_CURRENCY}, ${TENANT_FIELDS_NCF}`).eq("id", tenantId).maybeSingle();
        if (res.error) {
          res = await supabase.from("tenants").select(`${TENANT_FIELDS_BASE}, ${TENANT_FIELDS_CURRENCY}, ${TENANT_FIELDS_NCF.replace(" itbis_incluido_en_precio,", "")}`).eq("id", tenantId).maybeSingle();
        }
        if (res.error) console.error(res.error.message);
        data = res.data;
      }

      if (cancelled) return;
      if (data) {
        existingTenantRef.current = data;
        const fiscalMode = data.fiscal_mode || "internal_receipt";
        const defaultType = normalizeNcfTypeForFiscalMode(data.ncf_tipo_default, fiscalMode);
        const bSequences = buildBSequenceMapFromRow(data);
        const ncfSequences: Record<string, number> = {
          ...normalizeNcfSequenceMap(data.ncf_secuencias_por_tipo),
          ...bSequences,
        };
        setConfig({
          nombre_empresa: data.nombre_negocio ?? "",
          rnc: data.rnc ?? "",
          logo_url: data.logo_url ?? "",
          logo_size_px: Math.min(90, Math.max(32, Number(data.logo_size_px ?? 52))),
          logo_offset_x: Math.min(28, Math.max(-28, Number(data.logo_offset_x ?? 0))),
          logo_offset_y: Math.min(18, Math.max(-12, Number(data.logo_offset_y ?? 0))),
          menu_url: data.menu_url || "",
          direccion: data.direccion ?? "",
          telefono: data.telefono ?? "",
          currency_code: (data.moneda || "DOP") as any,
          itbis_cobro_por_defecto: Boolean(data.itbis_cobro_por_defecto),
          itbis_incluido_en_precio: Boolean(data.itbis_incluido_en_precio),
          propina_cobro_por_defecto: Boolean(data.propina_cobro_por_defecto),
          ncf_fiscal_activo: Boolean(data.ncf_fiscal_activo) || fiscalMode === "ncf_legacy" || fiscalMode === "dgii_ecf",
          fiscal_mode: fiscalMode,
          fiscal_mode_fallback: data.fiscal_mode_fallback || "internal_receipt",
          ecf_environment: data.ecf_environment || "certification",
          ncf_tipo_default: defaultType,
          ncf_secuencia_siguiente: ncfSequences[defaultType] ?? 1,
          ncf_secuencias_por_tipo: ncfSequences,
          ncf_tipos_activos: normalizeNcfActiveMap(data.ncf_tipos_activos),
        });
      }
      if (data && data.logo_url) {
        void cacheLogoFromUrl(data.logo_url);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, tenantId]);

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true);
    setSaveMessage(null);

    const payload = buildAjustesSavePayload({
      config,
      existingTenant: existingTenantRef.current,
    });
    
    try {
      await enqueueLocalWrite({
        tenantId,
        tableName: "tenants",
        rowId: tenantId,
        op: "update",
        payload,
        deviceId: await getDeviceId(),
      });
      // Update our cached reference so subsequent saves retain the updated values
      existingTenantRef.current = {
        ...existingTenantRef.current,
        ...payload,
      };
      setSaveMessage({ type: "success", text: "Configuración guardada." });
    } catch (error) {
      console.error(error);
      setSaveMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo guardar la configuración." });
    }
    setSaving(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !tenantId) return;
    const uploaded = await uploadTenantLogoFile(tenantId, file);
    if (!uploaded.ok) { return; }
    const saved = await saveTenantLogoUrl(tenantId, uploaded.publicUrl);
    if (!saved.ok) { return; }
    setConfig(p => ({ ...p, logo_url: uploaded.publicUrl }));
    void refreshLogoCache(uploaded.publicUrl);
  }

  async function handlePrintTest() {
    setPrintingTest(true);
    setSaveMessage(null);
    try {
      const res = await printThermalHtml(thermalPreviewHtml);
      if (!res.ok) {
        setSaveMessage({ type: "error", text: "Error al imprimir la prueba: " + (res.error || "Desconocido") });
      } else {
        setSaveMessage({ type: "success", text: "Prueba de impresión enviada exitosamente." });
      }
    } catch (e: any) {
      setSaveMessage({ type: "error", text: "Error de conexión al intentar imprimir: " + e.message });
    }
    setPrintingTest(false);
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
    menu_url: config.menu_url.trim() || null,
    moneda: config.currency_code,
  }), [config]);

  const [thermalPreviewHtml, setThermalPreviewHtml] = useState<string>("");

  useEffect(() => {
    let active = true;
    const generatePreview = async () => {
      const { paperWidthMm } = getThermalPrintSettings();
      const nowIso = new Date().toISOString();
      let html = "";
      switch (thermalPreviewKind) {
        case "factura":
          let sample = { ...SAMPLE_FACTURA_THERMAL_PREVIEW, pagada_at: nowIso };
          sample.itbis = sample.subtotal * 0.18;
          sample.propina = sample.subtotal * 0.10;
          sample.total = sample.subtotal + sample.itbis + sample.propina;
          
          if (config.ncf_fiscal_activo) {
            const ncf = construirCadenaNcf(config.ncf_tipo_default, config.ncf_secuencia_siguiente);
            if (ncf) sample = { ...sample, ncf, ncf_tipo: etiquetaTipoNcf(config.ncf_tipo_default) };
          }
          html = await buildFacturaReceiptHtml(tenantPreview, sample, 1, paperWidthMm);
          break;
        case "nota_credito": {
          let sample = {
            ...SAMPLE_NOTA_CREDITO_THERMAL_PREVIEW,
            created_at: nowIso,
            ecf_submitted_at: nowIso,
          };
          if (config.ncf_fiscal_activo) {
            const nextSeq = config.ncf_secuencias_por_tipo?.E34 ?? config.ncf_secuencia_siguiente;
            const ncf = construirCadenaNcf("E34", nextSeq);
            if (ncf) sample = { ...sample, ncf };
          }
          html = await buildFacturaReceiptHtml(tenantPreview, sample, 1, paperWidthMm);
          break;
        }
        case "comanda": 
          html = buildComandaReceiptHtml(tenantPreview, { ...SAMPLE_COMANDA_THERMAL, created_at: nowIso }, paperWidthMm);
          break;
        case "cierre": 
          html = buildCierreDiaReceiptHtml(tenantPreview, { ...SAMPLE_CIERRE_THERMAL_BASE, generadoAtIso: nowIso, generadoEn: new Date().toLocaleString() }, paperWidthMm);
          break;
        case "split":
          const splitSymbol = config.currency_code === "ARS" ? "AR$" : "RD$";
          const rows = buildThermalSplitLineHtml("Plato ejemplo", 1, 350, config.currency_code);
          html = buildSplitTicketHtml(tenantPreview, [{ personIndex: 1, splitParts: 1, rowsHtml: rows, totalLine: `${splitSymbol} 350.00` }], 4, paperWidthMm);
          break;
        case "nomina":
          html = buildNominaReceiptHtml(tenantPreview, { ...SAMPLE_NOMINA_THERMAL, fechaPagoIso: nowIso }, paperWidthMm);
          break;
      }
      if (active) setThermalPreviewHtml(html);
    };
    generatePreview();
    return () => { active = false; };
  }, [tenantPreview, thermalPreviewKind, config]);

  function handleTabChange(tab: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === "general") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      return next;
    }, { replace: true });
  }

  if (authLoading || loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando...</div>;

  return (
    <div className="flex-1 min-h-0 p-4 sm:p-8 bg-background transition-colors duration-300 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 gap-8">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border shrink-0">
            <div>
              <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] uppercase tracking-[0.5px]">
                Configuración del Sistema
              </span>
              <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[24px] uppercase tracking-[0.5px] mt-0.5">
                Ajustes
              </h1>
            </div>
            <TabsList className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.18)] rounded-[10px] p-1 h-auto flex gap-1.5 shrink-0">
              <TabsTrigger
                value="general"
                className="px-4 py-2 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)] border border-transparent transition-all cursor-pointer"
              >
                General
              </TabsTrigger>
              <TabsTrigger
                value="facturacion"
                className="px-4 py-2 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)] border border-transparent transition-all cursor-pointer"
              >
                Facturación
              </TabsTrigger>
              <TabsTrigger
                value="facturacion-electronica"
                className="px-4 py-2 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)] border border-transparent transition-all cursor-pointer"
              >
                Facturación electrónica
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general" className="outline-none">
            <AjustesGeneralTab
              config={config}
              setConfig={setConfig}
              handleLogoUpload={handleLogoUpload}
              thermalPreviewKind={thermalPreviewKind}
              setThermalPreviewKind={setThermalPreviewKind}
              thermalPreviewHtml={thermalPreviewHtml}
              printingTest={printingTest}
              handlePrintTest={handlePrintTest}
            />
          </TabsContent>

          <TabsContent value="facturacion" className="outline-none">
            <AjustesFacturacionTab
              config={config}
              setConfig={setConfig}
              plan={plan}
              tenantId={tenantId}
              setSaveMessage={setSaveMessage}
              onNavigateToEcf={() => handleTabChange("facturacion-electronica")}
            />
          </TabsContent>

          <TabsContent value="facturacion-electronica" className="outline-none">
            <FeatureGuard feature="dgii_ecf">
              <ActivationPanel onNavigateToGeneral={() => handleTabChange("general")} />
            </FeatureGuard>
          </TabsContent>

          {currentTab !== "facturacion-electronica" && (
            <div className="flex flex-col gap-4 mt-2">
              {saveMessage && (
                <div className={`rounded-xl border p-4 text-sm font-medium ${saveMessage.type === "error" ? "border-destructive/20 bg-destructive/10 text-destructive" : saveMessage.type === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400"}`}>
                  {saveMessage.text}
                </div>
              )}

              <button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground rounded-xl py-4 font-bold uppercase text-sm tracking-[0.2em] shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer w-full md:w-fit md:px-12 self-end">
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          )}
        </Tabs>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          background-color: var(--muted);
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
          background-color: transparent;
        }
      `}</style>
    </div>
  );
}
