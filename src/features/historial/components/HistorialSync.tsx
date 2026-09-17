import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  CloudDownload,
  Database,
  HardDrive,
  Layers,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { supabase } from "../../../shared/lib/supabase";
import {
  exportLegacyIndexedDbImportPayload,
  importLegacyIndexedDbThroughDesktop,
  readLocalMirror,
} from "../../../shared/lib/localFirst";
import { resolveSyncHealth } from "../lib/syncHealth";

interface OutboxSummaryItem {
  tableName: string;
  status: string;
  count: number;
  errorCount: number;
}

interface TableCountItem {
  table: string;
  count: number;
}

interface SyncErrorItem {
  id: string;
  tableName: string;
  rowId: string;
  operation: string;
  status: string;
  errorJson: string | null;
  payloadJson: string;
}

interface PendingQueueItem {
  id: string;
  tableName: string;
  rowId: string;
  operation: string;
  status: string;
}

interface PullStateGlobal {
  lastPullAt: string | null;
  lastBatchCount: number;
  cursor: string | null;
}

interface PullStateTableItem {
  table: string;
  mirroredRows: number;
  lastPullAt: string | null;
}

interface DiagnosticReport {
  tenantId: string;
  databasePath: string;
  walMode: boolean;
  tableCounts: TableCountItem[];
  outboxSummary: OutboxSummaryItem[];
  recentErrors: SyncErrorItem[];
  pendingQueue: PendingQueueItem[];
  pullState?: {
    global: PullStateGlobal | null;
    perTable: PullStateTableItem[];
  };
}

/** Tables whose cloud name matches the local name, so a direct count comparison
 * (cloud vs local) approximates "pending to download". Payroll (nomina_*) is
 * intentionally excluded because its remote names differ. */
const CLOUD_COMPARABLE_TABLES = [
  "cierres_operativos", "facturas", "gastos", "gasto_categorias", "customers",
  "cuentas_cobrar", "cxc_pagos", "cuentas_pagar", "cxp_pagos", "compras",
];

/** Per-table cloud counts via a single authorized-once RPC. PostgREST
 * `count=exact` re-evaluates the OR-combined RLS SELECT policies per row, and on
 * large tables (facturas) that scan crosses the authenticated statement_timeout
 * (8s) and returns an error. `cloudix_tenant_table_counts` checks tenant access
 * once, then counts through the tenant index — one round trip, milliseconds. */
async function fetchCloudCountsViaRpc(tenantId: string): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.rpc("cloudix_tenant_table_counts", { p_tenant_id: tenantId });
  if (error || !Array.isArray(data)) return null;
  const counts: Record<string, number> = {};
  for (const row of data as Array<{ tabla: string; total: number | string }>) {
    counts[row.tabla] = Number(row.total) || 0;
  }
  return counts;
}

/** Legacy fallback: head-count each comparable cloud table individually. Kept so
 * the monitor still works if the RPC has not been deployed yet. A table that
 * errors is recorded as -1 so callers can tell "0 rows" apart from "could not
 * verify". */
async function fetchCloudCountsPerTable(tenantId: string): Promise<Record<string, number>> {
  const entries = await Promise.all(
    CLOUD_COMPARABLE_TABLES.map(async (table) => {
      try {
        const { count, error } = await supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId);
        return [table, error ? -1 : count ?? 0] as const;
      } catch {
        return [table, -1] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Head-count each comparable cloud table for the tenant. Prefers the fast RPC and
 * falls back to per-table counts when it is unavailable. */
async function fetchCloudCounts(tenantId: string): Promise<Record<string, number>> {
  const viaRpc = await fetchCloudCountsViaRpc(tenantId);
  if (viaRpc) return viaRpc;
  return fetchCloudCountsPerTable(tenantId);
}

/** Count rows in the IndexedDB mirror for each comparable table. Tables not yet
 * migrated to SQLite (e.g. compras) still live here, so "local presence" must
 * consider this engine too, or the monitor falsely reports rows as missing. */
async function fetchMirrorCounts(tenantId: string): Promise<Record<string, number>> {
  const entries = await Promise.all(
    CLOUD_COMPARABLE_TABLES.map(async (table) => {
      try {
        const rows = await readLocalMirror<Record<string, unknown>>(tenantId, table as never);
        return [table, Array.isArray(rows) ? rows.length : 0] as const;
      } catch {
        return [table, 0] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  const then = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(then)) return String(iso);
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 10) return "Hace instantes";
  if (secs < 60) return `Hace ${secs}s`;
  if (secs < 3600) return `Hace ${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `Hace ${Math.floor(secs / 3600)} h`;
  return `Hace ${Math.floor(secs / 86400)} d`;
}

export function HistorialSync() {
  const { tenantId } = useAuth();
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [activeTab, setActiveTab] = useState<"resumen" | "bajada" | "errores" | "tablas" | "cola" | "migracion">("resumen");
  const [selectedError, setSelectedError] = useState<SyncErrorItem | null>(null);
  const [cloudCounts, setCloudCounts] = useState<Record<string, number> | null>(null);
  const [mirrorCounts, setMirrorCounts] = useState<Record<string, number>>({});
  const [comparing, setComparing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"checking" | "online" | "offline">("checking");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("");
  const [migrationStatus, setMigrationStatus] = useState<{
    completed: boolean;
    importedRows?: number;
    recoveredOutbox?: number;
  }>({ completed: false });

  useEffect(() => {
    if (tenantId) {
      const key = `cloudix_sqlite_imported_v1_${tenantId}`;
      setMigrationStatus({ completed: localStorage.getItem(key) === "true" });
    }
  }, [tenantId]);

  const checkCloudHealth = useCallback(async () => {
    const start = performance.now();
    try {
      const { error } = await supabase.from("tenants").select("id").limit(1);
      const end = performance.now();
      if (!error) {
        setCloudStatus("online");
        setLatencyMs(Math.round(end - start));
      } else {
        setCloudStatus("offline");
      }
    } catch {
      setCloudStatus("offline");
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      if (window.electronAPI?.getSyncDiagnosticReport) {
        const res = await window.electronAPI.getSyncDiagnosticReport(tenantId ?? undefined);
        if (res?.ok && res.data) {
          setReport(res.data);
        }
      }
      await checkCloudHealth();
      // Verify the download side against the cloud each poll so "Salud del
      // Sistema" cannot claim "al día con la nube" without having checked it.
      // Local presence spans BOTH engines (SQLite + IndexedDB mirror) so a table
      // still living in IndexedDB (e.g. compras) is not falsely reported missing.
      if (tenantId) {
        const [cloud, mirror] = await Promise.all([fetchCloudCounts(tenantId), fetchMirrorCounts(tenantId)]);
        setCloudCounts(cloud);
        setMirrorCounts(mirror);
      }
    } catch (e: any) {
      setMessage(`Error al consultar diagnóstico: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [tenantId, checkCloudHealth]);

  useEffect(() => {
    void loadReport();
    const interval = setInterval(() => {
      void loadReport();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadReport]);

  const handleTriggerSync = async () => {
    setSyncing(true);
    setMessage("");
    try {
      if (window.electronAPI?.triggerSync) {
        await window.electronAPI.triggerSync();
        setMessage("Sincronización disparada exitosamente.");
      }
      await loadReport();
    } catch (e: any) {
      setMessage(`Fallo al sincronizar: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryErrors = async () => {
    setRetrying(true);
    setMessage("");
    try {
      if (window.electronAPI?.retryFailedSyncErrors) {
        const res = await window.electronAPI.retryFailedSyncErrors(tenantId ?? undefined);
        setMessage(`Se resetearon ${res.data.count} operaciones fallidas a estado pendiente para reintento.`);
      }
      await loadReport();
    } catch (e: any) {
      setMessage(`Error al reintentar: ${e.message}`);
    } finally {
      setRetrying(false);
    }
  };

  const handleRunMigration = async () => {
    if (!tenantId) {
      setMessage("Se requiere estar autenticado para migrar los datos del negocio.");
      return;
    }
    setMigrating(true);
    setMessage("");
    try {
      const payload = await exportLegacyIndexedDbImportPayload(tenantId);
      const totalIndexedDbRows = payload.chunks.reduce((acc, c) => acc + c.rows.length, 0);
      if (totalIndexedDbRows === 0) {
        setMessage("IndexedDB no contiene registros pendientes de migrar para este negocio.");
        setMigrationStatus({ completed: true });
        localStorage.setItem(`cloudix_sqlite_imported_v1_${tenantId}`, "true");
        return;
      }
      const res = await importLegacyIndexedDbThroughDesktop(payload);
      localStorage.setItem(`cloudix_sqlite_imported_v1_${tenantId}`, "true");
      setMigrationStatus({
        completed: true,
        importedRows: res.importedRows,
        recoveredOutbox: res.recoveredOutbox,
      });
      setMessage(`✔ Migración exitosa: ${res.importedRows} filas y ${res.recoveredOutbox} outbox transferidos a SQLite.`);
      await loadReport();
    } catch (err: any) {
      setMessage(`Error en la migración de IndexedDB a SQLite: ${err.message}`);
    } finally {
      setMigrating(false);
    }
  };

  const compareWithCloud = useCallback(async () => {
    if (!tenantId) {
      setMessage("Se requiere estar autenticado para comparar con la nube.");
      return;
    }
    setComparing(true);
    setMessage("");
    try {
      const [cloud, mirror] = await Promise.all([fetchCloudCounts(tenantId), fetchMirrorCounts(tenantId)]);
      setCloudCounts(cloud);
      setMirrorCounts(mirror);
    } catch (e: any) {
      setCloudCounts(null);
      setMessage(`Error comparando con la nube: ${e.message}`);
    } finally {
      setComparing(false);
    }
  }, [tenantId]);

  // The goal is SQLite as the single source of truth, so the comparison is
  // strictly SQLite vs cloud: "Pendiente ↓" is what SQLite still needs to hold
  // what the cloud has. The IndexedDB column stays only as informational context
  // (where the data currently lives) and never feeds the pending math or health.
  const sqliteCountFor = useCallback(
    (table: string) => report?.tableCounts.find((t) => t.table === table)?.count ?? 0,
    [report],
  );

  const totalPending = useMemo(() => {
    if (!report?.outboxSummary) return 0;
    return report.outboxSummary
      .filter((s) => s.status === "pending" || s.status === "syncing")
      .reduce((acc, curr) => acc + curr.count, 0);
  }, [report]);

  const totalPendingDownload = useMemo(() => {
    if (!cloudCounts) return null;
    // Honest verification: if ANY comparable table could not be read from the
    // cloud, the download side is not fully verified → report null, never 0.
    let sum = 0;
    for (const table of CLOUD_COMPARABLE_TABLES) {
      const cloud = cloudCounts[table];
      if (typeof cloud !== "number" || cloud < 0) return null;
      sum += Math.max(cloud - sqliteCountFor(table), 0);
    }
    return sum;
  }, [cloudCounts, sqliteCountFor]);

  const totalErrors = useMemo(() => {
    if (!report?.recentErrors) return 0;
    return report.recentErrors.length;
  }, [report]);

  const totalLocalRecords = useMemo(() => {
    if (!report?.tableCounts) return 0;
    return report.tableCounts.reduce((acc, curr) => acc + curr.count, 0);
  }, [report]);

  const syncHealth = resolveSyncHealth({ pendingUpload: totalPending, blocked: totalErrors, pendingDownload: totalPendingDownload });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8 lg:p-10 overflow-y-auto min-h-0 text-foreground">
      <div className="max-w-[1500px] mx-auto flex flex-col gap-6">
        {/* Header */}
        <section className="rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-primary text-[11px] font-bold uppercase tracking-[0.25em]">
                  Modo Desarrollador & Diagnóstico
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Database size={10} /> SQLite Local-First
                </span>
              </div>
              <h1 className="font-['Space_Grotesk',sans-serif] text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                Historial & Monitor de Sincronización
              </h1>
              <p className="font-['Inter',sans-serif] text-sm text-muted-foreground max-w-3xl">
                Supervisión del motor SQLite local, outbox durable, detección de anomalías y sincronización bidireccional con Supabase.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleRunMigration}
                disabled={migrating || loading}
                className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Database size={14} className={migrating ? "animate-spin" : ""} />
                {migrating ? "Migrando datos..." : "Migrar IndexedDB → SQLite"}
              </button>

              <button
                type="button"
                onClick={handleTriggerSync}
                disabled={syncing || loading}
                className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Sincronizando..." : "Sincronizar Ahora"}
              </button>

              {totalErrors > 0 && (
                <button
                  type="button"
                  onClick={handleRetryErrors}
                  disabled={retrying || loading}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RotateCw size={14} className={retrying ? "animate-spin" : ""} />
                  {retrying ? "Reintentando..." : `Reintentar Errores (${totalErrors})`}
                </button>
              )}

              <button
                type="button"
                onClick={() => void loadReport()}
                disabled={loading}
                className="rounded-xl border border-black/10 dark:border-white/10 bg-muted/40 px-3.5 py-2.5 text-xs font-bold text-foreground hover:bg-muted/60 transition-all cursor-pointer"
                title="Recargar reporte"
              >
                <RotateCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {message && (
            <div className="mt-4 p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
              {message}
            </div>
          )}
        </section>

        {/* Global KPI Cards */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Estado General */}
          <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-bold tracking-wider">
              <span>Salud del Sistema</span>
              {syncHealth.tone === "healthy" ? (
                <CheckCircle2 className="size-4 text-emerald-500" />
              ) : (
                <AlertCircle className={`size-4 ${syncHealth.tone === "blocked" ? "text-rose-500" : syncHealth.tone === "unknown" ? "text-slate-400" : "text-amber-500"}`} />
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={`text-2xl font-bold font-['Space_Grotesk'] ${syncHealth.tone === "healthy" ? "text-emerald-500" : syncHealth.tone === "blocked" ? "text-rose-500" : syncHealth.tone === "unknown" ? "text-slate-400" : "text-amber-500"}`}>
                {syncHealth.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {syncHealth.detail}
            </p>
          </div>

          {/* Card 2: Cola de Salida */}
          <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-bold tracking-wider">
              <span>Cola Outbox Local</span>
              <ArrowUpCircle className="size-4 text-amber-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-['Space_Grotesk'] text-foreground">
                {totalPending}
              </span>
              <span className="text-xs text-muted-foreground">pendientes</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Transacciones locales almacenadas en SQLite
            </p>
          </div>

          {/* Card 3: Base SQLite */}
          <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-bold tracking-wider">
              <span>Motor SQLite Local</span>
              <HardDrive className="size-4 text-cyan-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-['Space_Grotesk'] text-foreground">
                {totalLocalRecords}
              </span>
              <span className="text-xs text-muted-foreground">filas totales</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate" title={report?.databasePath}>
              {report?.walMode ? "Modo WAL · Alto rendimiento" : "Modo estándar"}
            </p>
          </div>

          {/* Card 4: Nube Supabase */}
          <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-bold tracking-wider">
              <span>Conexión Supabase</span>
              <Server className={`size-4 ${cloudStatus === "online" ? "text-emerald-500" : "text-rose-500"}`} />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={`text-2xl font-bold font-['Space_Grotesk'] ${cloudStatus === "online" ? "text-emerald-500" : "text-rose-500"}`}>
                {cloudStatus === "online" ? "En Línea" : "Desconectado"}
              </span>
              {latencyMs !== null && cloudStatus === "online" && (
                <span className="text-xs text-emerald-500 font-mono">{latencyMs}ms</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {cloudStatus === "online" ? "Backend PostgreSQL respondiendo" : "Sin conexión al servidor central"}
            </p>
          </div>
        </section>

        {/* Tab Navigation */}
        <section className="flex border-b border-black/10 dark:border-white/10 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("resumen")}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
              activeTab === "resumen"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Resumen General
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bajada")}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === "bajada"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowDownCircle size={13} /> Bajada (Pull)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("errores")}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === "errores"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Errores & Conflictos
            {totalErrors > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-500">
                {totalErrors}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tablas")}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
              activeTab === "tablas"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Tablas del Sistema ({report?.tableCounts.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cola")}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
              activeTab === "cola"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Cola Pendiente ({report?.pendingQueue.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("migracion")}
            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === "migracion"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Migración IndexedDB
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              migrationStatus.completed ? "bg-emerald-500/20 text-emerald-400" : "bg-cyan-500/20 text-cyan-400"
            }`}>
              {migrationStatus.completed ? "Al día" : "Disponible"}
            </span>
          </button>
        </section>

        {/* Tab Content */}
        {activeTab === "resumen" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Outbox Status breakdown */}
            <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-6">
              <h3 className="font-['Space_Grotesk'] text-lg font-bold mb-4 flex items-center gap-2">
                <Layers className="size-5 text-primary" />
                Estado del Outbox por Módulo
              </h3>
              {report?.outboxSummary && report.outboxSummary.length > 0 ? (
                <div className="divide-y divide-black/5 dark:divide-white/5">
                  {report.outboxSummary.map((item, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-foreground">{item.tableName}</span>
                        <span className="ml-2 px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-muted text-muted-foreground">
                          {item.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono">{item.count} items</span>
                        {item.errorCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-500 font-bold">
                            {item.errorCount} fallidos
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="size-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                  No hay operaciones en cola. Todas las tablas locales están sincronizadas.
                </div>
              )}
            </div>

            {/* Persistence Engine Info */}
            <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-6">
              <h3 className="font-['Space_Grotesk'] text-lg font-bold mb-4 flex items-center gap-2">
                <HardDrive className="size-5 text-cyan-500" />
                Información Técnica de Almacenamiento
              </h3>
              <dl className="grid grid-cols-1 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-muted/30">
                  <dt className="text-muted-foreground font-bold uppercase text-[10px]">Tenant ID Activo</dt>
                  <dd className="font-mono mt-1 text-foreground break-all">{report?.tenantId ?? tenantId ?? "No autenticado"}</dd>
                </div>
                <div className="p-3 rounded-xl bg-muted/30">
                  <dt className="text-muted-foreground font-bold uppercase text-[10px]">Ruta de la Base SQLite</dt>
                  <dd className="font-mono mt-1 text-foreground break-all">{report?.databasePath ?? "En memoria / no disponible"}</dd>
                </div>
                <div className="p-3 rounded-xl bg-muted/30">
                  <dt className="text-muted-foreground font-bold uppercase text-[10px]">Modo de Transacciones</dt>
                  <dd className="font-mono mt-1 text-foreground">SQLite WAL (Write-Ahead Logging) con verificación de llaves foráneas</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {activeTab === "bajada" && (
          <div className="flex flex-col gap-6">
            {/* Global pull status + compare action */}
            <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                <h3 className="font-['Space_Grotesk'] text-lg font-bold flex items-center gap-2">
                  <ArrowDownCircle className="size-5 text-sky-500" />
                  Descarga desde la nube (Pull)
                </h3>
                <button
                  type="button"
                  onClick={() => void compareWithCloud()}
                  disabled={comparing}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs font-bold text-sky-500 hover:bg-sky-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <CloudDownload size={14} className={comparing ? "animate-pulse" : ""} />
                  {comparing ? "Comparando..." : "Comparar con la nube"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                  <div className="text-muted-foreground font-bold uppercase text-[10px]">Última bajada</div>
                  <div className="mt-2 font-bold text-sm font-['Space_Grotesk'] text-foreground">
                    {formatRelativeTime(report?.pullState?.global?.lastPullAt)}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {report?.pullState?.global?.lastBatchCount ?? 0} fila(s) en el último lote
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                  <div className="text-muted-foreground font-bold uppercase text-[10px]">Pendiente por bajar (aprox.)</div>
                  <div className={`mt-2 font-bold text-sm font-['Space_Grotesk'] ${totalPendingDownload && totalPendingDownload > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                    {totalPendingDownload === null ? "Sin comparar" : `${totalPendingDownload} fila(s)`}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {totalPendingDownload === null ? "Tocá \"Comparar con la nube\"" : "Estimado: nube − SQLite por tabla (lo que falta migrar)"}
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                  <div className="text-muted-foreground font-bold uppercase text-[10px]">Cursor de sincronización</div>
                  <div className="mt-2 font-mono text-[11px] text-foreground break-all">
                    {report?.pullState?.global?.cursor ?? "Sin cursor (pull completo pendiente)"}
                  </div>
                </div>
              </div>
            </div>

            {/* Per-table cloud vs local comparison */}
            <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-6">
              <h3 className="font-['Space_Grotesk'] text-lg font-bold mb-4 flex items-center gap-2">
                <Layers className="size-5 text-sky-500" />
                Local vs. Nube por tabla
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-black/10 dark:border-white/10 text-muted-foreground font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Tabla</th>
                      <th className="py-2.5 px-3 text-right">SQLite</th>
                      <th className="py-2.5 px-3 text-right">IndexedDB</th>
                      <th className="py-2.5 px-3 text-right">Nube</th>
                      <th className="py-2.5 px-3 text-right">Pendiente ↓</th>
                      <th className="py-2.5 px-3">Última bajada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono">
                    {CLOUD_COMPARABLE_TABLES.map((table) => {
                      const sqliteCount = sqliteCountFor(table);
                      const mirrorCount = mirrorCounts[table] ?? 0;
                      const cloud = cloudCounts?.[table];
                      const cloudKnown = typeof cloud === "number" && cloud >= 0;
                      const pending = cloudKnown ? Math.max((cloud as number) - sqliteCount, 0) : null;
                      const lastPull = report?.pullState?.perTable.find((t) => t.table === table)?.lastPullAt ?? null;
                      return (
                        <tr key={table} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-foreground">{table}</td>
                          <td className="py-2.5 px-3 text-right">{sqliteCount}</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">{mirrorCount}</td>
                          <td className="py-2.5 px-3 text-right">{cloudKnown ? cloud : cloudCounts ? "error" : "—"}</td>
                          <td className={`py-2.5 px-3 text-right font-bold ${pending && pending > 0 ? "text-amber-500" : pending === 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                            {pending === null ? "—" : pending}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">{formatRelativeTime(lastPull)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                "Pendiente ↓" = <span className="font-semibold">nube − SQLite</span>: lo que le falta a SQLite para igualar la nube (o sea, lo que queda por migrar a SQLite). La columna <span className="font-semibold">IndexedDB</span> es solo informativa — muestra dónde vive el dato hoy — y no entra en el cálculo. Detalle real del flujo en la consola del proceso principal (<span className="font-mono">[sync↓]</span> / <span className="font-mono">[sync↑]</span>).
              </p>
            </div>
          </div>
        )}

        {activeTab === "errores" && (
          <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-['Space_Grotesk'] text-lg font-bold text-foreground flex items-center gap-2">
                <AlertCircle className="size-5 text-rose-500" />
                Detalle de Errores & Bloqueos de Sincronización
              </h3>
              {report?.recentErrors && report.recentErrors.length > 0 && (
                <button
                  type="button"
                  onClick={handleRetryErrors}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all cursor-pointer"
                >
                  Reintentar Todos
                </button>
              )}
            </div>

            {report?.recentErrors && report.recentErrors.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-black/10 dark:border-white/10 text-muted-foreground font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Tabla</th>
                      <th className="py-2.5 px-3">Operación</th>
                      <th className="py-2.5 px-3">ID Registro</th>
                      <th className="py-2.5 px-3">Motivo del Error</th>
                      <th className="py-2.5 px-3 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono">
                    {report.recentErrors.map((err) => {
                      let parsedReason = err.errorJson;
                      try {
                        const obj = JSON.parse(err.errorJson || "{}");
                        parsedReason = obj.reason || obj.message || err.errorJson;
                      } catch {}
                      return (
                        <tr key={err.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-3 font-bold text-rose-500">{err.tableName}</td>
                          <td className="py-3 px-3 uppercase text-[10px]">{err.operation}</td>
                          <td className="py-3 px-3 text-muted-foreground truncate max-w-[120px]">{err.rowId}</td>
                          <td className="py-3 px-3 text-foreground break-all max-w-[350px]">{parsedReason}</td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedError(err)}
                              className="px-2.5 py-1 rounded bg-muted/60 hover:bg-muted text-[10px] font-bold uppercase transition-colors"
                            >
                              Ver JSON
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-muted-foreground">
                <ShieldCheck className="size-10 mx-auto text-emerald-500 mb-2 opacity-80" />
                <p className="font-bold text-foreground text-sm">Cero Errores Registrados</p>
                <p className="mt-1">Todas las operaciones de la cola outbox están en perfecto estado o ya fueron sincronizadas.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "tablas" && (
          <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-6">
            <h3 className="font-['Space_Grotesk'] text-lg font-bold mb-4 flex items-center gap-2">
              <Database className="size-5 text-primary" />
              Inventario de Registros en SQLite Local
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {report?.tableCounts.map((t) => (
                <div key={t.table} className="p-3.5 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20 flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-foreground">{t.table}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary">
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "cola" && (
          <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-6">
            <h3 className="font-['Space_Grotesk'] text-lg font-bold mb-4 flex items-center gap-2">
              <Clock className="size-5 text-amber-500" />
              Cola de Operaciones Pendientes ({report?.pendingQueue.length ?? 0})
            </h3>
            {report?.pendingQueue && report.pendingQueue.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-black/10 dark:border-white/10 text-muted-foreground font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">ID Outbox</th>
                      <th className="py-2.5 px-3">Tabla</th>
                      <th className="py-2.5 px-3">ID Fila</th>
                      <th className="py-2.5 px-3">Operación</th>
                      <th className="py-2.5 px-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono">
                    {report.pendingQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[150px]">{item.id}</td>
                        <td className="py-2.5 px-3 font-bold text-foreground">{item.tableName}</td>
                        <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[150px]">{item.rowId}</td>
                        <td className="py-2.5 px-3 uppercase text-[10px]">{item.operation}</td>
                        <td className="py-2.5 px-3 text-amber-500 font-bold">{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="size-10 mx-auto text-emerald-500 mb-2 opacity-80" />
                <p className="font-bold text-foreground text-sm">Cola Vacía</p>
                <p className="mt-1">No hay transacciones pendientes por enviar a la nube.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "migracion" && (
          <div className="rounded-[20px] border border-black/10 dark:border-white/10 bg-card p-6 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-4">
              <div>
                <h3 className="font-['Space_Grotesk'] text-lg font-bold flex items-center gap-2">
                  <Database className="size-5 text-cyan-400" />
                  Transición Segura: IndexedDB → SQLite
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Mapeo y consolidación de datos locales históricos hacia el motor transaccional SQLite de la aplicación de escritorio.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunMigration}
                disabled={migrating}
                className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-5 py-2.5 text-xs font-bold hover:bg-cyan-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw size={14} className={migrating ? "animate-spin" : ""} />
                {migrating ? "Ejecutando migración..." : "Migrar IndexedDB a SQLite"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                <div className="text-muted-foreground font-bold uppercase text-[10px]">Estado de la Migración</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${migrationStatus.completed ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="font-bold text-sm font-['Space_Grotesk'] text-foreground">
                    {migrationStatus.completed ? "Consolidado en SQLite" : "Pendiente de Migrar"}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {migrationStatus.completed
                    ? "Los datos históricos de este negocio ya fueron transferidos de forma segura a SQLite."
                    : "Hay datos en IndexedDB que aún no se han transferido a la base SQLite local."}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                <div className="text-muted-foreground font-bold uppercase text-[10px]">Arquitectura Objetivo</div>
                <div className="mt-2 font-bold text-sm font-['Space_Grotesk'] text-cyan-400">
                  SQLite Local-First + Outbox
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Alimentación de un solo archivo local con soporte ACID, eliminando la volatilidad de la memoria web de IndexedDB.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
                <div className="text-muted-foreground font-bold uppercase text-[10px]">Garantía Anti-Pérdida</div>
                <div className="mt-2 font-bold text-sm font-['Space_Grotesk'] text-emerald-400">
                  Zero Data Loss
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  IndexedDB se lee en lotes validados con hash y se escribe en SQLite en una sola transacción sin tocar la nube destructivamente.
                </p>
              </div>
            </div>

            {migrationStatus.importedRows !== undefined && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                <div className="font-bold mb-1">Último reporte de importación:</div>
                <div>Filas importadas a SQLite: <strong>{migrationStatus.importedRows}</strong></div>
                <div>Operaciones de outbox recuperadas: <strong>{migrationStatus.recoveredOutbox}</strong></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Error Detail */}
      {selectedError && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-black/10 dark:border-white/10 rounded-[24px] max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
              <h3 className="text-base font-bold font-['Space_Grotesk'] text-rose-500 flex items-center gap-2">
                <AlertCircle className="size-5" />
                Diagnóstico de Error: {selectedError.tableName}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedError(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold uppercase text-muted-foreground text-[10px]">Error JSON:</span>
                <pre className="mt-1 p-3 rounded-xl bg-black/40 text-rose-400 font-mono text-[11px] overflow-x-auto max-h-[160px]">
                  {selectedError.errorJson || "Sin errorJson registrado"}
                </pre>
              </div>
              <div>
                <span className="font-bold uppercase text-muted-foreground text-[10px]">Payload Original:</span>
                <pre className="mt-1 p-3 rounded-xl bg-black/40 text-muted-foreground font-mono text-[11px] overflow-x-auto max-h-[160px]">
                  {selectedError.payloadJson}
                </pre>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedError(null)}
                className="px-4 py-2 rounded-xl bg-muted text-xs font-bold hover:bg-muted/80 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
