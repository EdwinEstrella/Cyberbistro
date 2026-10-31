import { useState, useMemo } from "react";
import { History, RefreshCw, Filter } from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../../shared/ui/table";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import type { SuperAdminAuditLogRow, TenantRow } from "../lib/types";
import { formatDateTime } from "../lib/formatters";

interface AuditTabProps {
  logs: SuperAdminAuditLogRow[];
  tenants: TenantRow[];
  selectedTenantId: string | null;
  loading: boolean;
  onRefresh: () => void;
}

export function AuditTab({
  logs,
  tenants,
  selectedTenantId,
  loading,
  onRefresh,
}: AuditTabProps) {
  const [filterMode, setFilterMode] = useState<"current" | "all">("current");

  const displayedLogs = useMemo(() => {
    if (filterMode === "current" && selectedTenantId) {
      return logs.filter((log) => log.tenant_id === selectedTenantId);
    }
    return logs;
  }, [logs, filterMode, selectedTenantId]);

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Mostrar eventos:</span>
          <div className="flex rounded-lg bg-muted/60 p-0.5">
            <button
              type="button"
              onClick={() => setFilterMode("current")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filterMode === "current"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Este restaurante
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filterMode === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos los restaurantes
            </button>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={onRefresh}
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Cargando..." : "Actualizar auditoría"}
        </Button>
      </div>

      {/* Logs Table */}
      {displayedLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 p-10 text-center bg-card/20">
          <History className="h-8 w-8 text-muted-foreground/60" />
          <h5 className="text-sm font-semibold text-foreground">
            No hay registros de auditoría
          </h5>
          <p className="max-w-xs text-xs text-muted-foreground">
            {filterMode === "current"
              ? "No se han registrado acciones recientes para este restaurante."
              : "No se encontraron eventos en el historial de auditoría."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[170px] text-xs font-semibold text-foreground">Fecha y hora</TableHead>
                <TableHead className="w-[190px] text-xs font-semibold text-foreground">Acción</TableHead>
                <TableHead className="w-[180px] text-xs font-semibold text-foreground">Restaurante</TableHead>
                <TableHead className="text-xs font-semibold text-foreground">Detalle del evento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedLogs.map((log) => {
                const restaurantName =
                  tenants.find((t) => t.id === log.tenant_id)?.nombre_negocio ??
                  log.tenant_id ??
                  "Sistema global";

                return (
                  <TableRow key={log.id} className="border-border/40 hover:bg-muted/20">
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="font-mono text-[11px] font-medium"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-foreground">
                      {restaurantName}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <code
                        className="block truncate rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground"
                        title={JSON.stringify(log.details, null, 2)}
                      >
                        {JSON.stringify(log.details)}
                      </code>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
