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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313] p-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#adaaaa]" />
          <span className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.5px] text-[#adaaaa]">Mostrar eventos:</span>
          <div className="flex rounded-[10px] bg-[#1a1a1a] p-0.5 border border-[rgba(72,72,71,0.18)]">
            <button
              type="button"
              onClick={() => setFilterMode("current")}
              className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                filterMode === "current"
                  ? "bg-[rgba(255,144,109,0.15)] text-[#ff906d] border border-[#ff906d]/40 shadow-sm font-bold"
                  : "text-[#adaaaa] hover:text-white"
              }`}
            >
              Este restaurante
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                filterMode === "all"
                  ? "bg-[rgba(255,144,109,0.15)] text-[#ff906d] border border-[#ff906d]/40 shadow-sm font-bold"
                  : "text-[#adaaaa] hover:text-white"
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
          className="h-8 gap-1.5 text-xs rounded-[10px] border border-[rgba(72,72,71,0.3)] text-[#adaaaa] hover:border-white hover:text-white bg-transparent cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Cargando..." : "Actualizar auditoría"}
        </Button>
      </div>

      {/* Logs Table */}
      {displayedLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-[rgba(72,72,71,0.3)] p-10 text-center bg-[#131313]">
          <History className="h-8 w-8 text-[#adaaaa]" />
          <h5 className="font-['Space_Grotesk',sans-serif] font-bold text-sm text-white">
            No hay registros de auditoría
          </h5>
          <p className="max-w-xs text-xs text-[#adaaaa]">
            {filterMode === "current"
              ? "No se han registrado acciones recientes para este restaurante."
              : "No se encontraron eventos en el historial de auditoría."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313]">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[rgba(72,72,71,0.18)] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                <TableHead className="w-[170px] font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Fecha y hora</TableHead>
                <TableHead className="w-[190px] font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Acción</TableHead>
                <TableHead className="w-[180px] font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Restaurante</TableHead>
                <TableHead className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa] py-3.5">Detalle del evento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedLogs.map((log) => {
                const restaurantName =
                  tenants.find((t) => t.id === log.tenant_id)?.nombre_negocio ??
                  log.tenant_id ??
                  "Sistema global";

                return (
                  <TableRow key={log.id} className="border-b border-[rgba(72,72,71,0.15)] hover:bg-[#1a1a1a]/60 transition-colors">
                    <TableCell className="font-mono text-xs text-[#adaaaa] whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="font-mono text-[11px] font-medium rounded-full border border-[rgba(72,72,71,0.3)] bg-[rgba(255,255,255,0.05)] text-[#adaaaa] px-2.5"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-white">
                      {restaurantName}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <code
                        className="block truncate rounded-[6px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.18)] px-2 py-1 font-mono text-[11px] text-[#adaaaa]"
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
