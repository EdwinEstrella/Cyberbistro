import { useEffect, useState, useRef, useCallback } from "react";
import { fetchTenantOverview } from "../lib/tenantOverviewRepo";
import { evaluateTenantHealth } from "../lib/healthIndicator";
import { formatSupportSummary } from "../lib/supportSummary";
import type { TenantOverviewData, HealthEvaluation, TenantCard } from "../lib/types";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import {
  Copy,
  Check,
  RefreshCw,
  ShieldAlert,
  GitBranch,
  Activity,
  FileCheck,
  Landmark,
} from "lucide-react";

interface TenantOverviewPanelProps {
  card: TenantCard;
  embedded?: boolean;
}

export function TenantOverviewPanel({
  card,
}: TenantOverviewPanelProps) {
  const [data, setData] = useState<TenantOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestTokenRef = useRef(0);

  const tenantId = card.tenant.id;

  const loadOverview = useCallback(async () => {
    const currentToken = ++requestTokenRef.current;
    setLoading(true);
    setError(null);

    const res = await fetchTenantOverview(tenantId);
    if (currentToken !== requestTokenRef.current) {
      // Ignore stale response from a previously selected tenant
      return;
    }

    if (res.error) {
      setError(res.error.message);
    } else if (res.data) {
      // Synchronize tenant identity from props so plan, status, and identity are always in sync
      const synchronizedData: TenantOverviewData = {
        ...res.data,
        tenant: {
          ...res.data.tenant,
          id: card.tenant.id,
          nombre_negocio: card.tenant.nombre_negocio ?? null,
          rnc: card.tenant.rnc ?? null,
          plan: card.tenant.plan ?? null,
          activa: card.tenant.activa ?? null,
          payment_day_of_month: card.tenant.payment_day_of_month ?? null,
          created_at: card.tenant.created_at ?? res.data.tenant.created_at ?? null,
        },
      };
      setData(synchronizedData);
    }
    setLoading(false);
  }, [tenantId, card.tenant]);

  useEffect(() => {
    // Immediately clear data on selection change to prevent any stale metrics from lingering
    setData(null);
    void loadOverview();
  }, [loadOverview]);

  const health: HealthEvaluation | null = data ? evaluateTenantHealth(data) : null;

  async function handleCopySupportSummary() {
    if (!data || !health) return;
    const summary = formatSupportSummary(data, health);
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  }

  return (
    <div className="flex flex-col gap-5 text-foreground">
      {/* Resumen Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          {health ? (
            <Badge
              variant="outline"
              className={`gap-1.5 px-2.5 py-1 text-xs font-medium ${
                health.status === "green"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : health.status === "amber"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-400"
              }`}
              title={health.reasons.join("\n")}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  health.status === "green"
                    ? "bg-emerald-500"
                    : health.status === "amber"
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
              />
              Salud: {health.badgeText}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Cargando diagnóstico...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCopySupportSummary()}
            disabled={!data || loading}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            title="Copia un informe completo estructurado para el equipo de soporte técnico"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copiar resumen para soporte</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </Button>
        </div>
      </div>

      {/* Main Section Cards Content */}
      {loading && !data ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">
            Cargando datos consolidados del restaurante...
          </span>
        </div>
      ) : error ? (
        <Card className="border-destructive/30 bg-destructive/10 p-5">
          <h4 className="text-sm font-semibold text-destructive">
            Error al cargar la información del restaurante
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadOverview()}
            className="mt-3 text-xs"
          >
            Reintentar
          </Button>
        </Card>
      ) : data ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Card 1: Salud + diagnóstico (spans full width) */}
          <Card className="xl:col-span-2 border-border/60 bg-card/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert
                className={`h-4 w-4 shrink-0 ${
                  health?.status === "green"
                    ? "text-emerald-400"
                    : health?.status === "amber"
                    ? "text-amber-400"
                    : "text-rose-400"
                }`}
              />
              <h4 className="text-sm font-semibold text-foreground">
                Salud operativa y diagnóstico
              </h4>
            </div>

            {health && (
              <ul className="list-disc pl-5 text-xs space-y-1 text-muted-foreground">
                {health.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}

            {/* Operational parameters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Día de pago</span>
                <span className="mt-0.5 text-sm font-semibold text-foreground block font-mono tabular-nums">
                  {card.tenant.payment_day_of_month
                    ? `Día ${card.tenant.payment_day_of_month}`
                    : "Sin configurar"}
                </span>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Límite sucursales</span>
                <span className="mt-0.5 text-sm font-semibold text-foreground block font-mono tabular-nums">
                  {card.tenant.sucursal_limit_enabled
                    ? card.tenant.sucursal_limit ?? "Ilimitado"
                    : "Sin control"}
                </span>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Control de cuotas</span>
                <span className="mt-0.5 text-sm font-semibold text-foreground block">
                  {card.tenant.user_limit_enabled ? "Activo" : "Desactivado"}
                </span>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Fecha de registro</span>
                <span className="mt-0.5 text-xs font-medium text-foreground block font-mono">
                  {data.tenant.created_at
                    ? new Date(data.tenant.created_at).toLocaleDateString("es-DO", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "Sin datos"}
                </span>
              </div>
            </div>
          </Card>

          {/* Card 2: Actividad y sincronización */}
          <Card className="border-border/60 bg-card/60 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">
                Actividad y sincronización
              </h4>
            </div>

            {/* Activity stamps */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Última factura</span>
                <span className="mt-0.5 text-xs font-medium text-foreground block font-mono">
                  {data.activity.latest_factura_at
                    ? new Date(data.activity.latest_factura_at).toLocaleString()
                    : "Sin datos"}
                </span>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Última comanda</span>
                <span className="mt-0.5 text-xs font-medium text-foreground block font-mono">
                  {data.activity.latest_comanda_at
                    ? new Date(data.activity.latest_comanda_at).toLocaleString()
                    : "Sin datos"}
                </span>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Última sincronización</span>
                <span className="mt-0.5 text-xs font-medium text-foreground block font-mono">
                  {data.activity.latest_sync_at
                    ? new Date(data.activity.latest_sync_at).toLocaleString()
                    : "Sin datos"}
                </span>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Actividad general</span>
                <span className="mt-0.5 text-xs font-medium text-foreground block font-mono">
                  {data.activity.latest_activity_at
                    ? new Date(data.activity.latest_activity_at).toLocaleString()
                    : "Sin datos"}
                </span>
              </div>
            </div>

            {/* Sync status counters */}
            <div className="rounded-lg bg-background/40 border border-border/40 p-3">
              <span className="text-xs font-medium text-muted-foreground block mb-2">
                Estado de sincronización local (Local Sync)
              </span>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <span className="text-[11px] text-muted-foreground block">Pendientes</span>
                  <span className="text-base font-semibold text-foreground font-mono tabular-nums">
                    {data.sync.pending_count}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] text-muted-foreground block">Conflictos</span>
                  <span className={`text-base font-semibold font-mono tabular-nums ${data.sync.conflicted_count > 0 ? "text-rose-400" : "text-foreground"}`}>
                    {data.sync.conflicted_count}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] text-muted-foreground block">Rechazados</span>
                  <span className={`text-base font-semibold font-mono tabular-nums ${data.sync.rejected_count > 0 ? "text-rose-400" : "text-foreground"}`}>
                    {data.sync.rejected_count}
                  </span>
                </div>
              </div>
            </div>

            {/* Devices summary */}
            {data.devices.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-medium text-muted-foreground block">
                  Dispositivos registrados ({data.devices.length})
                </span>
                <div className="divide-y divide-border/30 rounded-lg border border-border/40 bg-background/30 px-3">
                  {data.devices.map((dev) => (
                    <div key={dev.device_id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="font-mono text-[11px] text-foreground block truncate">ID: {dev.device_id}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {dev.app_version ? `v${dev.app_version} • ` : ""}Visto: {dev.last_seen_at ? new Date(dev.last_seen_at).toLocaleTimeString() : "Sin datos"}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-medium ${
                          dev.disabled_at
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        {dev.disabled_at ? "Deshabilitado" : "Habilitado"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Card 3: Facturación electrónica */}
          <Card className="border-border/60 bg-card/60 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">
                Facturación electrónica (e-CF)
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Modo fiscal</span>
                <span className="mt-0.5 text-xs font-semibold text-foreground block uppercase font-mono">
                  {data.tenant.fiscal_mode || "Sin datos"}
                </span>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Ambiente e-CF</span>
                <span className="mt-0.5 text-xs font-semibold text-foreground block capitalize">
                  {data.tenant.ecf_environment || "Sin datos"}
                </span>
              </div>
            </div>

            {/* Fiscal outbox status */}
            <div className="rounded-lg bg-background/40 border border-border/40 p-3">
              <span className="text-xs font-medium text-muted-foreground block mb-2">
                Cola de emisión fiscal (Outbox)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div>
                  <span className="text-[10px] text-muted-foreground block">En cola</span>
                  <span className="text-sm font-semibold text-foreground font-mono tabular-nums">
                    {data.fiscal.outbox.queued_count}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Procesando</span>
                  <span className="text-sm font-semibold text-foreground font-mono tabular-nums">
                    {data.fiscal.outbox.processing_count}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Reintentables</span>
                  <span className={`text-sm font-semibold font-mono tabular-nums ${data.fiscal.outbox.retryable_count > 0 ? "text-amber-400" : "text-foreground"}`}>
                    {data.fiscal.outbox.retryable_count}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Errores</span>
                  <span className={`text-sm font-semibold font-mono tabular-nums ${data.fiscal.outbox.error_count > 0 ? "text-rose-400" : "text-foreground"}`}>
                    {data.fiscal.outbox.error_count}
                  </span>
                </div>
              </div>
            </div>

            {/* e-CF 30d counts */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground block">Comprobantes emitidos (30 días)</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(data.fiscal.ecf_counts_30d).length === 0 ? (
                  <span className="text-xs text-muted-foreground">Sin emisiones recientes</span>
                ) : (
                  Object.entries(data.fiscal.ecf_counts_30d).map(([type, count]) => (
                    <Badge key={type} variant="secondary" className="font-mono text-xs gap-1.5 font-normal">
                      <span>{type}:</span>
                      <span className="font-semibold tabular-nums">{count}</span>
                    </Badge>
                  ))
                )}
              </div>
            </div>

            {data.fiscal.latest_error_message && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs">
                <span className="font-semibold text-rose-400 block">Último error fiscal:</span>
                <span className="font-mono text-muted-foreground mt-1 block break-all">
                  {data.fiscal.latest_error_message}
                </span>
              </div>
            )}
          </Card>

          {/* Card 4: Cuentas y empresas */}
          <Card className="border-border/60 bg-card/60 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">
                Cuentas y empresas corporativas
              </h4>
            </div>

            {/* CxC Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">CxC Pendiente</span>
                <div className="mt-0.5 text-sm font-semibold text-foreground font-mono tabular-nums">
                  RD$ {data.cxc.total_pending.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-muted-foreground">{data.cxc.count_pending} facturas</span>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">CxC Vencido</span>
                <div className={`mt-0.5 text-sm font-semibold font-mono tabular-nums ${data.cxc.total_overdue > 0 ? "text-rose-400" : "text-foreground"}`}>
                  RD$ {data.cxc.total_overdue.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-muted-foreground">{data.cxc.count_overdue} vencidas</span>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">CxC Cobrado</span>
                <div className="mt-0.5 text-sm font-semibold text-emerald-400 font-mono tabular-nums">
                  RD$ {data.cxc.total_paid.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-muted-foreground">{data.cxc.count_total} cobradas</span>
              </div>
            </div>

            {/* Digital menu links & 7d orders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Menús digitales corporativos</span>
                <div className="mt-0.5 text-sm font-semibold text-foreground font-mono tabular-nums">
                  {data.corporate.menu_links.enabled}
                  <span className="text-xs text-muted-foreground ml-1.5 font-normal">
                    activos / {data.corporate.menu_links.total} creados
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-background/50 border border-border/40 p-2.5">
                <span className="text-[11px] text-muted-foreground block">Pedidos digitales (7 días)</span>
                <div className="mt-0.5 text-sm font-semibold text-foreground font-mono tabular-nums">
                  {data.corporate.digital_orders_7d.count}
                  <span className="text-xs text-muted-foreground ml-1.5 font-normal">
                    (RD$ {data.corporate.digital_orders_7d.total.toLocaleString("es-DO")})
                  </span>
                </div>
              </div>
            </div>

            {/* Corporate companies */}
            {data.corporate.companies.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-medium text-muted-foreground block">
                  Empresas con crédito ({data.corporate.companies.length})
                </span>
                <div className="divide-y divide-border/30 rounded-lg border border-border/40 bg-background/30 px-3">
                  {data.corporate.companies.map((c) => (
                    <div key={c.customer_id} className="py-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                        RD$ {c.credit_used !== null ? c.credit_used.toLocaleString("es-DO") : "0"} /{" "}
                        {c.credit_limit !== null ? `RD$ ${c.credit_limit.toLocaleString("es-DO")}` : "Sin límite"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Card 5: Sucursales */}
          <Card className="xl:col-span-2 border-border/60 bg-card/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">
                  Sucursales registradas ({data.sucursales.length})
                </h4>
              </div>
            </div>

            {data.sucursales.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                Este restaurante no tiene sucursales registradas.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {data.sucursales.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-border/40 bg-background/40 p-3 flex flex-col justify-between gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground text-xs">{s.nombre}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-medium ${
                          s.activa
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {s.activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground truncate">
                      ID: {s.id}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}