import { useEffect, useState, useId } from "react";
import { type Plan, PLAN_ORDER, PLAN_LABELS } from "../../../shared/lib/planFeatures";
import { fetchTenantOverview } from "../lib/tenantOverviewRepo";
import { evaluateTenantHealth } from "../lib/healthIndicator";
import { formatSupportSummary } from "../lib/supportSummary";
import type { TenantOverviewData, HealthEvaluation } from "../lib/types";

interface TenantOverviewPanelProps {
  tenantId: string;
  onClose: () => void;
  onUpdatePlan: (tenantId: string, newPlan: Plan) => Promise<void>;
  onToggleBlock: (tenantId: string, currentActiva: boolean) => Promise<void>;
  onDeleteUser?: (userId: string, email: string) => Promise<void>;
  savingPlanId: string | null;
  rowActionId: string | null;
}

export function TenantOverviewPanel({
  tenantId,
  onClose,
  onUpdatePlan,
  onToggleBlock,
  onDeleteUser,
  savingPlanId,
  rowActionId,
}: TenantOverviewPanelProps) {
  const [data, setData] = useState<TenantOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "resumen" | "sucursales" | "usuarios" | "actividad" | "fiscal" | "corporativo"
  >("resumen");

  const titleId = useId();

  async function loadOverview() {
    setLoading(true);
    setError(null);
    const res = await fetchTenantOverview(tenantId);
    if (res.error) {
      setError(res.error.message);
    } else {
      setData(res.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadOverview();
  }, [tenantId]);

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

  const isBlocked = data?.tenant.activa === false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm transition-opacity"
    >
      <div className="relative flex h-full w-full max-w-4xl flex-col bg-[#111111] border-l border-[rgba(72,72,71,0.25)] shadow-2xl text-white">
        {/* Panel Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(72,72,71,0.2)] bg-[#141414] px-6 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 id={titleId} className="font-['Space_Grotesk',sans-serif] text-xl font-bold tracking-tight text-white truncate">
                {data?.tenant.nombre_negocio || "Ficha 360 del Restaurante"}
              </h2>
              {health && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-['Space_Grotesk',sans-serif] text-[11px] font-bold uppercase tracking-[0.5px] ${
                    health.status === "green"
                      ? "bg-[rgba(89,238,80,0.12)] text-[#59ee50] border border-[rgba(89,238,80,0.3)]"
                      : health.status === "amber"
                      ? "bg-[rgba(255,176,32,0.15)] text-[#ffb020] border border-[rgba(255,176,32,0.3)]"
                      : "bg-[rgba(255,113,108,0.15)] text-[#ff716c] border border-[rgba(255,113,108,0.3)]"
                  }`}
                  title={health.reasons.join("\n")}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      health.status === "green"
                        ? "bg-[#59ee50]"
                        : health.status === "amber"
                        ? "bg-[#ffb020]"
                        : "bg-[#ff716c]"
                    }`}
                  />
                  {health.badgeText}
                </span>
              )}
              {data && (
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 font-['Space_Grotesk',sans-serif] text-[10px] font-bold uppercase tracking-[0.6px] ${
                    !isBlocked
                      ? "bg-[rgba(89,238,80,0.1)] text-[#59ee50]"
                      : "bg-[rgba(255,113,108,0.1)] text-[#ff716c]"
                  }`}
                >
                  {!isBlocked ? "Activo" : "Bloqueado"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 font-['Inter',sans-serif] text-xs text-[#adaaaa]">
              <span>ID: <code className="text-[#888888] font-mono">{tenantId}</code></span>
              {data?.tenant.rnc ? <span>RNC: <strong className="text-white">{data.tenant.rnc}</strong></span> : null}
              {data?.tenant.plan ? (
                <span className="capitalize">Plan: <strong className="text-[#ff906d]">{PLAN_LABELS[data.tenant.plan as Plan] || data.tenant.plan}</strong></span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopySupportSummary()}
              disabled={!data || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(72,72,71,0.3)] bg-[#1e1e1e] px-3 py-1.5 font-['Space_Grotesk',sans-serif] text-xs font-medium text-white transition hover:bg-[#282828] disabled:opacity-50 cursor-pointer"
              title="Copia un informe completo estructurado para el equipo de soporte técnico"
            >
              {copied ? (
                <>
                  <span className="text-[#59ee50]">✓</span>
                  <span className="text-[#59ee50]">¡Copiado!</span>
                </>
              ) : (
                <>
                  <span>📋</span>
                  <span>Copiar para soporte</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading}
              className="rounded-lg border border-[rgba(72,72,71,0.3)] bg-[#1e1e1e] px-3 py-1.5 font-['Space_Grotesk',sans-serif] text-xs font-medium text-[#adaaaa] transition hover:text-white hover:bg-[#282828] disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Cargando..." : "Actualizar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-transparent p-1.5 text-[#adaaaa] transition hover:bg-[#222222] hover:text-white cursor-pointer"
              aria-label="Cerrar ficha"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[rgba(72,72,71,0.18)] bg-[#141414] px-6">
          <nav className="flex space-x-4 overflow-x-auto" aria-label="Secciones de la ficha">
            {[
              { id: "resumen", label: "Resumen" },
              { id: "sucursales", label: `Sucursales (${data?.sucursales.length ?? 0})` },
              { id: "usuarios", label: `Usuarios (${data?.users.stats.total ?? 0})` },
              { id: "actividad", label: "Actividad y Sync" },
              { id: "fiscal", label: "Facturación (e-CF)" },
              { id: "corporativo", label: "Cuentas y Empresas" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-3 px-2 border-b-2 font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? "border-[#ff906d] text-[#ff906d]"
                    : "border-transparent text-[#888888] hover:text-[#cccccc]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading && !data ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#ff906d] border-t-transparent" />
              <span className="font-['Inter',sans-serif] text-sm text-[#888888]">
                Cargando datos consolidados del restaurante...
              </span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-[rgba(255,113,108,0.25)] bg-[rgba(255,113,108,0.08)] p-6">
              <h3 className="font-['Space_Grotesk',sans-serif] text-sm font-bold text-[#ff716c] uppercase">
                Error al cargar la ficha 360
              </h3>
              <p className="mt-1 font-['Inter',sans-serif] text-xs text-[#adaaaa]">{error}</p>
              <button
                type="button"
                onClick={() => void loadOverview()}
                className="mt-4 rounded-lg bg-[#ff716c]/20 px-3 py-1.5 font-['Space_Grotesk',sans-serif] text-xs font-bold text-[#ff716c] hover:bg-[#ff716c]/30 cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Tab: RESUMEN */}
              {activeTab === "resumen" && (
                <div className="space-y-6">
                  {/* Plan change & status actions */}
                  <div className="rounded-xl border border-[rgba(72,72,71,0.2)] bg-[#161616] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[rgba(72,72,71,0.15)]">
                      <div>
                        <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                          Plan de Suscripción Actual
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-['Space_Grotesk',sans-serif] text-lg font-bold text-white capitalize">
                            {PLAN_LABELS[data.tenant.plan as Plan] || data.tenant.plan || "Básico"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {PLAN_ORDER.map((planKey) => {
                          const isCurrent = (data.tenant.plan || "basico") === planKey;
                          const isSaving = savingPlanId === data.tenant.id;
                          return (
                            <button
                              key={planKey}
                              type="button"
                              onClick={async () => {
                                await onUpdatePlan(data.tenant.id, planKey);
                                void loadOverview();
                              }}
                              disabled={isCurrent || isSaving}
                              className={`rounded-lg px-3 py-2 font-['Space_Grotesk',sans-serif] text-[11px] font-bold uppercase tracking-[0.5px] border transition-all cursor-pointer ${
                                isCurrent
                                  ? planKey === "corporativo"
                                    ? "bg-[rgba(59,130,246,0.18)] border-[#3b82f6] text-[#60a5fa]"
                                    : planKey === "empresarial"
                                    ? "bg-[rgba(139,92,246,0.18)] border-[#8b5cf6] text-[#a78bfa]"
                                    : planKey === "profesional"
                                    ? "bg-[rgba(255,144,109,0.18)] border-[#ff906d] text-[#ff906d]"
                                    : "bg-[#252525] border-[rgba(72,72,71,0.4)] text-white"
                                  : "bg-[#1d1d1d] border-[rgba(72,72,71,0.2)] text-[#888888] hover:border-[rgba(255,144,109,0.3)] hover:text-white"
                              } disabled:opacity-50`}
                            >
                              {PLAN_LABELS[planKey]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="font-['Inter',sans-serif] text-xs text-[#888888]">
                          Estado operacional:
                        </span>
                        <span
                          className={`font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase ${
                            !isBlocked ? "text-[#59ee50]" : "text-[#ff716c]"
                          }`}
                        >
                          {!isBlocked ? "Activo y Operando" : "Restaurante Bloqueado"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await onToggleBlock(data.tenant.id, data.tenant.activa !== false);
                          void loadOverview();
                        }}
                        disabled={rowActionId === `tenant:${data.tenant.id}`}
                        className={`rounded-lg px-3 py-1.5 font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase cursor-pointer border transition ${
                          isBlocked
                            ? "border-[rgba(89,238,80,0.3)] bg-[rgba(89,238,80,0.1)] text-[#59ee50] hover:bg-[rgba(89,238,80,0.18)]"
                            : "border-[rgba(255,176,32,0.3)] bg-[rgba(255,176,32,0.1)] text-[#ffb020] hover:bg-[rgba(255,176,32,0.18)]"
                        }`}
                      >
                        {rowActionId === `tenant:${data.tenant.id}`
                          ? "Procesando..."
                          : isBlocked
                          ? "Desbloquear Restaurante"
                          : "Bloquear Restaurante"}
                      </button>
                    </div>
                  </div>

                  {/* Operational parameters grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Día de Pago Mensual
                      </div>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-lg font-bold text-white">
                        {data.tenant.payment_day_of_month
                          ? `Día ${data.tenant.payment_day_of_month}`
                          : "Sin configurar"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Límite Sucursales
                      </div>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-lg font-bold text-white">
                        {data.tenant.limits.sucursal_limit_enabled
                          ? data.tenant.limits.sucursal_limit ?? "Ilimitado"
                          : "Sin control"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Control de Cuotas
                      </div>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-lg font-bold text-white">
                        {data.tenant.limits.user_limit_enabled ? "Activo" : "Desactivado"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <div className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Fecha de Registro
                      </div>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-xs font-medium text-[#cccccc]">
                        {data.tenant.created_at
                          ? new Date(data.tenant.created_at).toLocaleDateString("es-DO", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "Sin datos"}
                      </div>
                    </div>
                  </div>

                  {/* Health summary banner */}
                  {health && (
                    <div
                      className={`rounded-xl border p-4 ${
                        health.status === "green"
                          ? "border-[rgba(89,238,80,0.25)] bg-[rgba(89,238,80,0.06)]"
                          : health.status === "amber"
                          ? "border-[rgba(255,176,32,0.25)] bg-[rgba(255,176,32,0.08)]"
                          : "border-[rgba(255,113,108,0.25)] bg-[rgba(255,113,108,0.08)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px]">
                          Diagnóstico Operativo: {health.badgeText}
                        </span>
                      </div>
                      <ul className="mt-2 list-disc pl-5 font-['Inter',sans-serif] text-xs space-y-1 text-[#cccccc]">
                        {health.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: SUCURSALES */}
              {activeTab === "sucursales" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                      Sucursales Asociadas ({data.sucursales.length})
                    </span>
                  </div>

                  {data.sucursales.length === 0 ? (
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-8 text-center text-[#888888] font-['Inter',sans-serif] text-xs">
                      Este restaurante no tiene sucursales registradas.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.sucursales.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4 flex flex-col justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-['Space_Grotesk',sans-serif] text-sm font-bold text-white">
                                {s.nombre}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  s.activa
                                    ? "bg-[rgba(89,238,80,0.1)] text-[#59ee50]"
                                    : "bg-[rgba(255,113,108,0.1)] text-[#ff716c]"
                                }`}
                              >
                                {s.activa ? "Activa" : "Inactiva"}
                              </span>
                            </div>
                            <span className="mt-1 block font-mono text-[11px] text-[#777777] break-all">
                              ID: {s.id}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: USUARIOS */}
              {activeTab === "usuarios" && (
                <div className="space-y-4">
                  {/* Summary counts */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-3 text-center">
                      <div className="font-['Inter',sans-serif] text-[10px] uppercase text-[#888888]">Total</div>
                      <div className="font-['Space_Grotesk',sans-serif] text-base font-bold text-white">
                        {data.users.stats.total}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-3 text-center">
                      <div className="font-['Inter',sans-serif] text-[10px] uppercase text-[#888888]">Activos</div>
                      <div className="font-['Space_Grotesk',sans-serif] text-base font-bold text-[#59ee50]">
                        {data.users.stats.active}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-3 text-center">
                      <div className="font-['Inter',sans-serif] text-[10px] uppercase text-[#888888]">Inactivos</div>
                      <div className="font-['Space_Grotesk',sans-serif] text-base font-bold text-[#ff716c]">
                        {data.users.stats.inactive}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-3 text-center col-span-2 sm:col-span-2">
                      <div className="font-['Inter',sans-serif] text-[10px] uppercase text-[#888888]">Por Rol</div>
                      <div className="font-['Space_Grotesk',sans-serif] text-xs font-bold text-[#adaaaa] truncate">
                        {Object.entries(data.users.stats.by_role)
                          .map(([r, c]) => `${r}: ${c}`)
                          .join(" | ") || "Sin roles"}
                      </div>
                    </div>
                  </div>

                  {/* Users table */}
                  <div className="overflow-x-auto rounded-xl border border-[rgba(72,72,71,0.18)]">
                    <table className="w-full border-collapse text-left font-['Inter',sans-serif] text-xs">
                      <thead>
                        <tr className="bg-[#181818] text-[#888888] uppercase tracking-[0.5px] text-[10px]">
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Nombre</th>
                          <th className="px-4 py-3">Rol</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3">Auth / Sesión</th>
                          <th className="px-4 py-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(72,72,71,0.12)] bg-[#121212]">
                        {data.users.list.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-[#777777]">
                              Sin usuarios registrados para este restaurante.
                            </td>
                          </tr>
                        ) : (
                          data.users.list.map((u) => (
                            <tr key={u.id} className="hover:bg-[#181818]/50">
                              <td className="px-4 py-3 font-medium text-white">{u.email}</td>
                              <td className="px-4 py-3 text-[#adaaaa]">{u.nombre || "-"}</td>
                              <td className="px-4 py-3 capitalize text-[#cccccc]">
                                {u.rol === "admin" ? "Admin dueño" : u.rol}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    u.activo !== false
                                      ? "bg-[rgba(89,238,80,0.1)] text-[#59ee50]"
                                      : "bg-[rgba(255,113,108,0.1)] text-[#ff716c]"
                                  }`}
                                >
                                  {u.activo !== false ? "Activo" : "Inactivo"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[11px] text-[#888888]">
                                {u.last_sign_in_at
                                  ? `Último: ${new Date(u.last_sign_in_at).toLocaleString()}`
                                  : u.auth_user_id
                                  ? "Vinculado (sin login)"
                                  : "Pendiente de registro"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {u.rol === "admin" ? (
                                  <span className="text-[11px] text-[#666666]">Protegido</span>
                                ) : onDeleteUser ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onDeleteUser(u.id, u.email);
                                      void loadOverview();
                                    }}
                                    disabled={rowActionId === u.id}
                                    className="rounded border border-[rgba(255,113,108,0.25)] bg-[rgba(255,113,108,0.1)] px-2 py-1 text-[10px] font-bold uppercase text-[#ff716c] hover:bg-[rgba(255,113,108,0.2)] disabled:opacity-40 cursor-pointer"
                                  >
                                    {rowActionId === u.id ? "Eliminando..." : "Eliminar"}
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab: ACTIVIDAD Y SYNC */}
              {activeTab === "actividad" && (
                <div className="space-y-5">
                  {/* Activity Timestamps */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <span className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Última Factura
                      </span>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-sm font-bold text-white">
                        {data.activity.latest_factura_at
                          ? new Date(data.activity.latest_factura_at).toLocaleString()
                          : "Sin datos"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <span className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Última Comanda
                      </span>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-sm font-bold text-white">
                        {data.activity.latest_comanda_at
                          ? new Date(data.activity.latest_comanda_at).toLocaleString()
                          : "Sin datos"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <span className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Última Sincronización
                      </span>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-sm font-bold text-white">
                        {data.activity.latest_sync_at
                          ? new Date(data.activity.latest_sync_at).toLocaleString()
                          : "Sin datos"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <span className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Actividad Consolidada
                      </span>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-sm font-bold text-white">
                        {data.activity.latest_activity_at
                          ? new Date(data.activity.latest_activity_at).toLocaleString()
                          : "Sin datos"}
                      </div>
                    </div>
                  </div>

                  {/* Sync operations diagnostics */}
                  <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                    <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                      Estado de Sincronización (Local Sync)
                    </span>
                    <div className="mt-3 grid grid-cols-3 gap-4">
                      <div className="rounded-lg bg-[#111111] p-3 text-center">
                        <div className="text-[10px] uppercase text-[#888888]">Pendientes</div>
                        <div className="text-base font-bold text-white">{data.sync.pending_count}</div>
                      </div>
                      <div className="rounded-lg bg-[#111111] p-3 text-center">
                        <div className="text-[10px] uppercase text-[#888888]">Conflictos</div>
                        <div className={`text-base font-bold ${data.sync.conflicted_count > 0 ? "text-[#ff716c]" : "text-white"}`}>
                          {data.sync.conflicted_count}
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#111111] p-3 text-center">
                        <div className="text-[10px] uppercase text-[#888888]">Rechazados</div>
                        <div className={`text-base font-bold ${data.sync.rejected_count > 0 ? "text-[#ff716c]" : "text-white"}`}>
                          {data.sync.rejected_count}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Devices & App versions */}
                  <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                    <div className="flex items-center justify-between pb-2">
                      <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                        Dispositivos Registrados ({data.devices.length})
                      </span>
                      <span className="text-[11px] text-[#666666]">
                        Versión de app: no persistida en esquema remoto ("Sin datos")
                      </span>
                    </div>

                    {data.devices.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[#777777]">
                        Sin dispositivos registrados para este restaurante en sync_devices.
                      </div>
                    ) : (
                      <div className="divide-y divide-[rgba(72,72,71,0.1)]">
                        {data.devices.map((dev) => (
                          <div key={dev.device_id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="min-w-0">
                              <span className="font-mono text-white block truncate">ID: {dev.device_id}</span>
                              <span className="text-[#888888] text-[11px]">
                                Última conexión: {dev.last_seen_at ? new Date(dev.last_seen_at).toLocaleString() : "Sin datos"}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-[#888888]">
                                Versión: <span className="text-[#666666]">{dev.app_version || "Sin datos"}</span>
                              </span>
                              <span className="text-[11px] text-[#888888]">
                                Cursor: {dev.last_ack_cursor}
                              </span>
                              {dev.disabled_at ? (
                                <span className="rounded bg-[rgba(255,113,108,0.1)] px-2 py-0.5 text-[10px] font-bold text-[#ff716c] uppercase">
                                  Deshabilitado
                                </span>
                              ) : (
                                <span className="rounded bg-[rgba(89,238,80,0.1)] px-2 py-0.5 text-[10px] font-bold text-[#59ee50] uppercase">
                                  Habilitado
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: FACTURACIÓN ELECTRÓNICA (e-CF) */}
              {activeTab === "fiscal" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <span className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Modo Fiscal Configurado
                      </span>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-base font-bold text-white">
                        {data.tenant.fiscal_mode || "Sin datos"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <span className="font-['Inter',sans-serif] text-[11px] uppercase tracking-[0.5px] text-[#888888]">
                        Ambiente e-CF
                      </span>
                      <div className="mt-1 font-['Space_Grotesk',sans-serif] text-base font-bold text-white capitalize">
                        {data.tenant.ecf_environment || "Sin datos"}
                      </div>
                    </div>
                  </div>

                  {/* 30 days e-CF document counts */}
                  <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                    <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                      Comprobantes Emitidos (Últimos 30 días)
                    </span>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {Object.keys(data.fiscal.ecf_counts_30d).length === 0 ? (
                        <span className="text-xs text-[#777777]">Sin comprobantes emitidos en los últimos 30 días.</span>
                      ) : (
                        Object.entries(data.fiscal.ecf_counts_30d).map(([st, count]) => (
                          <div
                            key={st}
                            className="rounded-lg border border-[rgba(72,72,71,0.2)] bg-[#111111] px-4 py-2 text-center"
                          >
                            <span className="block text-[10px] font-bold uppercase tracking-[0.5px] text-[#888888]">
                              {st}
                            </span>
                            <span className="text-base font-bold text-white">{count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Outbox status & last error */}
                  <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                    <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                      Cola Fiscal (Fiscal Outbox)
                    </span>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-lg bg-[#111111] p-3 text-center">
                        <span className="text-[10px] uppercase text-[#888888]">En cola</span>
                        <div className="text-base font-bold text-white">{data.fiscal.outbox.queued_count}</div>
                      </div>
                      <div className="rounded-lg bg-[#111111] p-3 text-center">
                        <span className="text-[10px] uppercase text-[#888888]">Procesando</span>
                        <div className="text-base font-bold text-white">{data.fiscal.outbox.processing_count}</div>
                      </div>
                      <div className="rounded-lg bg-[#111111] p-3 text-center">
                        <span className="text-[10px] uppercase text-[#888888]">Reintentables</span>
                        <div className={`text-base font-bold ${data.fiscal.outbox.retryable_count > 0 ? "text-[#ffb020]" : "text-white"}`}>
                          {data.fiscal.outbox.retryable_count}
                        </div>
                      </div>
                      <div className="rounded-lg bg-[#111111] p-3 text-center">
                        <span className="text-[10px] uppercase text-[#888888]">Errores</span>
                        <div className={`text-base font-bold ${data.fiscal.outbox.error_count > 0 ? "text-[#ff716c]" : "text-white"}`}>
                          {data.fiscal.outbox.error_count}
                        </div>
                      </div>
                    </div>

                    {data.fiscal.latest_error_message && (
                      <div className="mt-4 rounded-lg border border-[rgba(255,113,108,0.25)] bg-[rgba(255,113,108,0.08)] p-3 text-xs">
                        <span className="font-bold text-[#ff716c] block">Último error registrado:</span>
                        <span className="text-[#adaaaa] font-mono mt-1 block">{data.fiscal.latest_error_message}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: CUENTAS Y EMPRESAS */}
              {activeTab === "corporativo" && (
                <div className="space-y-5">
                  {/* CxC Totals */}
                  <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                    <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                      Cuentas por Cobrar (CxC)
                    </span>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-lg bg-[#111111] p-3">
                        <span className="text-[10px] uppercase text-[#888888]">Total Pendiente</span>
                        <div className="text-lg font-bold text-white">
                          RD$ {data.cxc.total_pending.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                        </div>
                        <span className="text-[11px] text-[#888888]">{data.cxc.count_pending} facturas por cobrar</span>
                      </div>

                      <div className="rounded-lg bg-[#111111] p-3">
                        <span className="text-[10px] uppercase text-[#888888]">Total Vencido</span>
                        <div className={`text-lg font-bold ${data.cxc.total_overdue > 0 ? "text-[#ff716c]" : "text-white"}`}>
                          RD$ {data.cxc.total_overdue.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                        </div>
                        <span className="text-[11px] text-[#888888]">{data.cxc.count_overdue} facturas vencidas</span>
                      </div>

                      <div className="rounded-lg bg-[#111111] p-3">
                        <span className="text-[10px] uppercase text-[#888888]">Total Cobrado Histórico</span>
                        <div className="text-lg font-bold text-[#59ee50]">
                          RD$ {data.cxc.total_paid.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                        </div>
                        <span className="text-[11px] text-[#888888]">{data.cxc.count_total} transacciones</span>
                      </div>
                    </div>
                  </div>

                  {/* Corporate Menu Links & Orders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                        Enlaces Menú Corporativo
                      </span>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">
                          {data.corporate.menu_links.enabled}
                        </span>
                        <span className="text-xs text-[#888888]">
                          activos / {data.corporate.menu_links.total} creados
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#adaaaa]">
                        Límite del plan ({data.tenant.plan}):{" "}
                        <strong className="text-white">
                          {data.corporate.menu_links.plan_limit === 0
                            ? "No disponible"
                            : `${data.corporate.menu_links.plan_limit} enlaces`}
                        </strong>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                      <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                        Pedidos Digitales (Últimos 7 días)
                      </span>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">
                          {data.corporate.digital_orders_7d.count}
                        </span>
                        <span className="text-xs text-[#888888]">pedidos registrados</span>
                      </div>
                      <div className="mt-1 text-xs text-[#adaaaa]">
                        Volumen total:{" "}
                        <strong className="text-white">
                          RD$ {data.corporate.digital_orders_7d.total.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Companies with credit limit */}
                  <div className="rounded-xl border border-[rgba(72,72,71,0.18)] bg-[#161616] p-4">
                    <span className="font-['Space_Grotesk',sans-serif] text-xs font-bold uppercase tracking-[0.5px] text-[#888888]">
                      Empresas con Límite de Crédito ({data.corporate.companies.length})
                    </span>

                    {data.corporate.companies.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[#777777]">
                        No hay clientes empresariales con límite de crédito configurado.
                      </div>
                    ) : (
                      <div className="mt-3 divide-y divide-[rgba(72,72,71,0.12)]">
                        {data.corporate.companies.map((comp) => {
                          const limit = comp.credit_limit ?? 0;
                          const used = comp.credit_used ?? 0;
                          const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                          return (
                            <div key={comp.customer_id} className="py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
                              <div>
                                <span className="font-bold text-white block">{comp.name}</span>
                                <span className="text-[11px] text-[#888888]">
                                  Límite: RD$ {limit.toLocaleString("es-DO")} | Usado: RD$ {used.toLocaleString("es-DO")}
                                </span>
                              </div>
                              <div className="w-32">
                                <div className="flex justify-between text-[10px] text-[#888888] mb-1">
                                  <span>Uso</span>
                                  <span>{pct}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-[#222222] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      pct >= 100
                                        ? "bg-[#ff716c]"
                                        : pct >= 80
                                        ? "bg-[#ffb020]"
                                        : "bg-[#59ee50]"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
