import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/select";
import {
  isNcfTypeActive,
  normalizeNcfTypeForFiscalMode,
  NCF_B_TIPO_OPCIONES,
  NCF_E_TIPO_OPCIONES,
} from "../../../shared/lib/ncf";
import { Field } from "./Field";
import type { AjustesConfig } from "../types";

interface AjustesFacturacionTabProps {
  config: AjustesConfig;
  setConfig: React.Dispatch<React.SetStateAction<AjustesConfig>>;
  plan: any;
  tenantId: string | null;
  setSaveMessage: (msg: { type: "success" | "error" | "warning"; text: string } | null) => void;
  onNavigateToEcf?: () => void;
}

function formatEcfEnvironment(env: string): string {
  if (env === "production") return "Producción";
  if (env === "test") return "Test";
  return "Certificación";
}

export function AjustesFacturacionTab({
  config,
  setConfig,
  onNavigateToEcf,
}: AjustesFacturacionTabProps) {
  const isEcfActive = config.fiscal_mode === "dgii_ecf";
  const showBSequences =
    config.fiscal_mode === "ncf_legacy" ||
    (isEcfActive && config.fiscal_mode_fallback === "ncf_legacy");

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 flex flex-col gap-6">
        <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Configuración Fiscal</h2>

        {isEcfActive && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex size-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-3 bg-emerald-500" />
              </span>
              <div>
                <p className="font-['Space_Grotesk'] font-bold text-sm text-foreground">
                  Facturación electrónica activa — ambiente {formatEcfEnvironment(config.ecf_environment)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  El sistema emite comprobantes electrónicos fiscales (e-CF) validados con la DGII.
                </p>
              </div>
            </div>
            {onNavigateToEcf && (
              <button
                type="button"
                onClick={onNavigateToEcf}
                className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white font-['Space_Grotesk'] font-bold text-xs uppercase px-4 py-2 rounded-xl transition-colors cursor-pointer border-none"
              >
                Configuración e-CF
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={config.itbis_cobro_por_defecto}
              onChange={e => setConfig(p => ({ ...p, itbis_cobro_por_defecto: e.target.checked }))}
              className="size-4 rounded accent-primary"
            />
            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
              Cobrar ITBIS por defecto
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={config.itbis_incluido_en_precio}
              onChange={e => setConfig(p => ({ ...p, itbis_incluido_en_precio: e.target.checked }))}
              className="mt-0.5 size-4 rounded accent-primary"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                ITBIS incluido en el precio
              </span>
              <span className="text-xs text-muted-foreground">
                El precio del producto ya incluye el ITBIS (ej. 100 = 84.75 + 15.25 ITBIS).
              </span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={config.propina_cobro_por_defecto}
              onChange={e => setConfig(p => ({ ...p, propina_cobro_por_defecto: e.target.checked }))}
              className="size-4 rounded accent-primary"
            />
            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
              Cobrar propina legal 10% por defecto
            </span>
          </label>

          <div className="border-t border-border pt-4">
            <Field label="Modo Fiscal">
              <Select
                value={config.fiscal_mode}
                disabled={isEcfActive}
                onValueChange={val => {
                  const mode = val as any;
                  setConfig(p => ({
                    ...p,
                    fiscal_mode: mode,
                    ncf_tipo_default: normalizeNcfTypeForFiscalMode(p.ncf_tipo_default as any, mode),
                  }));
                }}
              >
                <SelectTrigger className="w-full rounded-xl disabled:opacity-60 disabled:cursor-not-allowed">
                  <SelectValue placeholder="Seleccionar modo fiscal" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {isEcfActive && (
                    <SelectItem value="dgii_ecf" disabled>
                      Facturación Electrónica (e-CF)
                    </SelectItem>
                  )}
                  <SelectItem value="internal_receipt">Recibo Interno (Sin NCF)</SelectItem>
                  <SelectItem value="ncf_legacy">NCF Tradicional</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {isEcfActive && (
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                El modo fiscal está gestionado por el asistente de facturación electrónica. Para cambiarlo o desactivarlo, usá el asistente en la pestaña Facturación electrónica.
              </p>
            )}
          </div>

          {isEcfActive && (
            <div className="animate-in fade-in flex flex-col gap-4 border-t border-border pt-4">
              <Field label="Modo de Respaldo (Fallback offline prolongado)">
                <Select
                  value={config.fiscal_mode_fallback}
                  onValueChange={val => setConfig(p => ({ ...p, fiscal_mode_fallback: val as any }))}
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue placeholder="Seleccionar modo de respaldo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="internal_receipt">Recibo Interno</SelectItem>
                    <SelectItem value="ncf_legacy">NCF Tradicional</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {isEcfActive && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col gap-4 border-t border-border pt-4">
              <Field label="Tipo Predeterminado e-CF">
                <Select value={config.ncf_tipo_default} disabled>
                  <SelectTrigger className="w-full rounded-xl disabled:opacity-80 disabled:cursor-not-allowed">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {NCF_E_TIPO_OPCIONES.map(o => (
                      <SelectItem key={o.codigo} value={o.codigo}>
                        {o.descripcion}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    Secuencias Configuradas por Tipo E
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                    Solo lectura
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {NCF_E_TIPO_OPCIONES.map(o => {
                    const isDefault = o.codigo === config.ncf_tipo_default;
                    const active = isDefault || isNcfTypeActive(config.ncf_tipos_activos, o.codigo);
                    return (
                      <div
                        key={o.codigo}
                        className={`bg-background rounded-[16px] border border-black/5 dark:border-white/5 p-4 flex flex-col gap-3 transition-colors ${
                          active ? "hover:border-primary/20" : "opacity-60"
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-bold font-['Space_Grotesk'] text-foreground text-lg">
                            {o.codigo}
                          </span>
                          <span
                            className={`text-[10px] uppercase font-bold tracking-widest ${
                              isDefault
                                ? "text-primary"
                                : active
                                ? "text-green-600 dark:text-green-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {isDefault ? "Predeterminado" : active ? "Activo" : "Apagado"}
                          </span>
                        </div>
                        <input
                          type="number"
                          disabled
                          value={config.ncf_secuencias_por_tipo[o.codigo] || 1}
                          className="bg-muted/30 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 font-mono text-foreground font-bold outline-none disabled:opacity-80 disabled:cursor-not-allowed"
                        />
                        <span className="text-[11px] text-muted-foreground/80 leading-relaxed">
                          {o.codigo} - {o.descripcion}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {showBSequences && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col gap-4 border-t border-border pt-4">
              <Field label="Tipo Predeterminado">
                <Select
                  value={config.ncf_tipo_default}
                  onValueChange={val => setConfig(p => ({ ...p, ncf_tipo_default: val as any }))}
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {NCF_B_TIPO_OPCIONES.map(o => (
                      <SelectItem key={o.codigo} value={o.codigo}>
                        {o.descripcion}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                  Secuencias Configuradas por Tipo B
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {NCF_B_TIPO_OPCIONES.map(o => {
                    const isDefault = o.codigo === config.ncf_tipo_default;
                    const active = isDefault || isNcfTypeActive(config.ncf_tipos_activos, o.codigo);
                    return (
                      <div
                        key={o.codigo}
                        className={`bg-background rounded-[16px] border border-black/5 dark:border-white/5 p-4 flex flex-col gap-3 transition-colors ${
                          active ? "hover:border-primary/20" : "opacity-60"
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-bold font-['Space_Grotesk'] text-foreground text-lg">
                            {o.codigo}
                          </span>
                          <label
                            className="flex items-center gap-2 cursor-pointer"
                            title={
                              isDefault
                                ? "El tipo predeterminado siempre está activo"
                                : "Activar o desactivar la emisión de este comprobante"
                            }
                          >
                            <span
                              className={`text-[10px] uppercase font-bold tracking-widest ${
                                isDefault
                                  ? "text-primary"
                                  : active
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {isDefault ? "Predeterminado" : active ? "Activo" : "Apagado"}
                            </span>
                            <input
                              type="checkbox"
                              checked={active}
                              disabled={isDefault}
                              onChange={e =>
                                setConfig(p => ({
                                  ...p,
                                  ncf_tipos_activos: { ...p.ncf_tipos_activos, [o.codigo]: e.target.checked },
                                }))
                              }
                              className="size-4 rounded accent-primary disabled:opacity-60 cursor-pointer"
                            />
                          </label>
                        </div>
                        <input
                          type="number"
                          min="1"
                          disabled={!active}
                          value={config.ncf_secuencias_por_tipo[o.codigo] || 1}
                          onChange={e =>
                            setConfig(p => ({
                              ...p,
                              ncf_secuencias_por_tipo: {
                                ...p.ncf_secuencias_por_tipo,
                                [o.codigo]: Math.max(1, parseInt(e.target.value) || 1),
                              },
                            }))
                          }
                          className="bg-muted/30 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 font-mono text-foreground font-bold outline-none focus:border-primary/50 transition-all disabled:opacity-50"
                        />
                        <span className="text-[11px] text-muted-foreground/80 leading-relaxed">
                          {o.codigo} - {o.descripcion}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
