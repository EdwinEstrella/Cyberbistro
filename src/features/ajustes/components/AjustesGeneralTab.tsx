import React, { useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/select";
import { Field } from "./Field";
import { lookupCompanyByRnc } from "../lib/companyLookup";
import {
  CURRENCY_OPTIONS,
  THERMAL_PREVIEW_TABS,
  type AjustesConfig,
  type ThermalPreviewKind,
} from "../types";

interface AjustesGeneralTabProps {
  config: AjustesConfig;
  setConfig: React.Dispatch<React.SetStateAction<AjustesConfig>>;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  thermalPreviewKind: ThermalPreviewKind;
  setThermalPreviewKind: (kind: ThermalPreviewKind) => void;
  thermalPreviewHtml: string;
  printingTest: boolean;
  handlePrintTest: () => Promise<void>;
  setSaveMessage: (message: { type: "success" | "error" | "warning"; text: string } | null) => void;
}

export function AjustesGeneralTab({
  config,
  setConfig,
  handleLogoUpload,
  thermalPreviewKind,
  setThermalPreviewKind,
  thermalPreviewHtml,
  printingTest,
  handlePrintTest,
  setSaveMessage,
}: AjustesGeneralTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  async function handleCompanyLookup() {
    if (!config.rnc?.trim()) return;
    setLookupLoading(true);
    setSaveMessage(null);
    const result = await lookupCompanyByRnc(config.rnc);
    setLookupLoading(false);
    if (result.success) {
      setConfig(prev => ({
        ...prev,
        rnc: result.data.rnc,
        nombre_empresa: result.data.nombre_empresa,
      }));
      setSaveMessage({ type: "success", text: result.message });
    } else {
      setSaveMessage({ type: "error", text: result.error });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 flex flex-col gap-6">
          <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Información Básica</h2>
          <div className="space-y-4">
            <Field label="Nombre Comercial">
              <input
                type="text"
                value={config.nombre_empresa}
                onChange={e => setConfig(p => ({ ...p, nombre_empresa: e.target.value }))}
                className="input-field"
              />
            </Field>
            <Field label="RNC / Identificación">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.rnc}
                  onChange={e => setConfig(p => ({ ...p, rnc: e.target.value }))}
                  className="input-field min-w-0 flex-1"
                  placeholder="22300691924"
                />
                <button
                  type="button"
                  onClick={() => void handleCompanyLookup()}
                  disabled={lookupLoading || !config.rnc?.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Search className="size-3.5" />
                  {lookupLoading ? "Consultando..." : "Consultar DGII"}
                </button>
              </div>
            </Field>
            <Field label="Dirección">
              <input
                type="text"
                value={config.direccion}
                onChange={e => setConfig(p => ({ ...p, direccion: e.target.value }))}
                className="input-field"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Teléfono">
                <input
                  type="text"
                  value={config.telefono}
                  onChange={e => setConfig(p => ({ ...p, telefono: e.target.value }))}
                  className="input-field"
                />
              </Field>
              <div className="col-span-2 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      Link del menú digital
                    </div>
                    <p className="break-all text-xs text-muted-foreground">
                      {config.menu_url.trim() || "Activá el menú desde Pedidos para generar el enlace público."}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!config.menu_url.trim()}
                    onClick={() => void navigator.clipboard?.writeText(config.menu_url.trim())}
                    className="rounded-lg bg-muted px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground border border-border disabled:opacity-40 cursor-pointer"
                  >
                    Copiar
                  </button>
                </div>
              </div>
              <Field label="Divisa">
                <Select
                  value={config.currency_code}
                  onValueChange={val => setConfig(p => ({ ...p, currency_code: val as any }))}
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue placeholder="Seleccionar divisa" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {CURRENCY_OPTIONS.map(o => (
                      <SelectItem key={o.code} value={o.code}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="border-t border-border pt-4">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={config.kitchen_enabled}
                  onChange={e => setConfig(p => ({ ...p, kitchen_enabled: e.target.checked }))}
                  className="mt-0.5 size-4 rounded accent-primary"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    Mi negocio tiene cocina
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Si lo desactivás, los pedidos no crean comandas para cocina. Se imprimirá un papelito de pedido por caja para quien despacha.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 flex flex-col gap-6">
          <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Identidad Visual</h2>
          <div className="aspect-video bg-muted/50 rounded-2xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden relative group">
            {config.logo_url ? (
              <img src={config.logo_url} alt="Logo" className="max-h-[80%] object-contain" />
            ) : (
              <span className="text-muted-foreground text-xs font-['Inter']">Sin Logo</span>
            )}
            <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-xs font-bold uppercase border-none cursor-pointer"
              >
                Cambiar
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleLogoUpload} />
          <Field label="URL Remota">
            <input
              type="text"
              value={config.logo_url}
              onChange={e => setConfig(p => ({ ...p, logo_url: e.target.value }))}
              className="input-field"
            />
          </Field>
          <div className="border-t border-border pt-5 flex flex-col gap-4">
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                Logo en recibos
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Se guarda en Supabase al presionar Guardar Cambios.
              </p>
            </div>
            <Field label={`Tamaño (${config.logo_size_px}px)`}>
              <input
                type="range"
                min="32"
                max="90"
                value={config.logo_size_px}
                onChange={e => setConfig(p => ({ ...p, logo_size_px: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={`X (${config.logo_offset_x}px)`}>
                <input
                  type="range"
                  min="-28"
                  max="28"
                  value={config.logo_offset_x}
                  onChange={e => setConfig(p => ({ ...p, logo_offset_x: Number(e.target.value) }))}
                  className="w-full accent-primary"
                />
              </Field>
              <Field label={`Y (${config.logo_offset_y}px)`}>
                <input
                  type="range"
                  min="-12"
                  max="18"
                  value={config.logo_offset_y}
                  onChange={e => setConfig(p => ({ ...p, logo_offset_y: Number(e.target.value) }))}
                  className="w-full accent-primary"
                />
              </Field>
            </div>
          </div>
        </section>
      </div>

      <section className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6">
        <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground mb-6">Vista Previa Impresión</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
            {THERMAL_PREVIEW_TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setThermalPreviewKind(t.id)}
                className={`px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-widest transition-all cursor-pointer border-none shrink-0 ${
                  thermalPreviewKind === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handlePrintTest}
            disabled={printingTest || !thermalPreviewHtml}
            className="shrink-0 px-4 py-2 bg-foreground text-background rounded-lg text-[12px] font-bold uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50 border-none"
          >
            {printingTest ? "Imprimiendo..." : "Imprimir Prueba"}
          </button>
        </div>
        <div className="bg-muted/30 rounded-2xl p-8 flex justify-center border border-dashed border-border min-h-[400px]">
          <iframe
            srcDoc={thermalPreviewHtml}
            className="bg-white rounded shadow-2xl border-none w-[80mm] min-h-[500px] scale-95 origin-top"
            title="Thermal Preview"
          />
        </div>
      </section>
    </div>
  );
}
