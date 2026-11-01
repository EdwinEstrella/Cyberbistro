import {
  MoreVertical,
  Ban,
  CheckCircle2,
  Trash2,
  Phone,
  MapPin,
  Users,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { Avatar, AvatarFallback } from "../../../shared/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../../shared/ui/dropdown-menu";
import type { TenantCard } from "../lib/types";
import { formatRnc, getTenantInitials } from "../lib/formatters";
import { PLAN_LABELS, type Plan } from "../../../shared/lib/planFeatures";

interface TenantDetailHeaderProps {
  card: TenantCard;
  onBlockTenant: () => void;
  onUnblockTenant: () => void;
  onDeleteTenant: () => void;
  rowActionId: string | null;
}

export function TenantDetailHeader({
  card,
  onBlockTenant,
  onUnblockTenant,
  onDeleteTenant,
  rowActionId,
}: TenantDetailHeaderProps) {
  const { tenant, users, admins } = card;
  const isBlocked = tenant.activa === false;
  const name = tenant.nombre_negocio?.trim() || "Restaurante sin nombre";
  const rncDisplay = formatRnc(tenant.rnc);
  const initials = getTenantInitials(name);
  const planKey = (tenant.plan?.toLowerCase() ?? "basico") as Plan;

  const isBusy =
    rowActionId === `tenant:${tenant.id}` ||
    rowActionId === `delete-tenant:${tenant.id}`;

  const getPlanBadgeClass = (plan: Plan) => {
    switch (plan) {
      case "corporativo":
        return "border border-blue-500/30 bg-blue-500/10 text-blue-400 rounded-full";
      case "empresarial":
        return "border border-purple-500/30 bg-purple-500/10 text-purple-400 rounded-full";
      case "profesional":
        return "border border-[#ff906d]/30 bg-[rgba(255,144,109,0.1)] text-[#ff906d] rounded-full";
      case "basico":
      default:
        return "border border-[rgba(72,72,71,0.3)] bg-[rgba(255,255,255,0.05)] text-[#adaaaa] rounded-full";
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313] p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Info Left */}
        <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 min-w-0 flex-1 w-full">
          {/* Mobile Top Row: Avatar + Full-width Restaurant Name */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Avatar className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-[12px] border border-[rgba(72,72,71,0.3)] bg-[#1a1a1a] font-semibold text-white">
              <AvatarFallback className="rounded-[12px] text-sm font-bold tracking-wider text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 sm:hidden">
              <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-lg uppercase tracking-[0.5px] text-white break-words leading-snug">
                {name}
              </h2>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2 sm:space-y-1.5 w-full">
            {/* Desktop Name and Badges */}
            <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
              <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-xl uppercase tracking-[0.5px] text-white break-words">
                {name}
              </h2>
              <Badge
                variant="outline"
                className={`gap-1.5 text-xs font-medium rounded-full ${
                  isBlocked
                    ? "border border-[rgba(255,113,108,0.3)] bg-[rgba(255,113,108,0.1)] text-[#ff716c]"
                    : "border border-[rgba(89,238,80,0.3)] bg-[rgba(89,238,80,0.1)] text-[#59ee50]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isBlocked ? "bg-[#ff716c]" : "bg-[#59ee50]"
                  }`}
                />
                {isBlocked ? "Bloqueado" : "Activo"}
              </Badge>

              <Badge
                variant="outline"
                className={`text-xs font-medium px-2.5 ${getPlanBadgeClass(
                  planKey
                )}`}
              >
                {PLAN_LABELS[planKey] || planKey}
              </Badge>
            </div>

            {/* Mobile Badges Row */}
            <div className="flex sm:hidden flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`gap-1.5 text-xs font-medium rounded-full ${
                  isBlocked
                    ? "border border-[rgba(255,113,108,0.3)] bg-[rgba(255,113,108,0.1)] text-[#ff716c]"
                    : "border border-[rgba(89,238,80,0.3)] bg-[rgba(89,238,80,0.1)] text-[#59ee50]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isBlocked ? "bg-[#ff716c]" : "bg-[#59ee50]"
                  }`}
                />
                {isBlocked ? "Bloqueado" : "Activo"}
              </Badge>

              <Badge
                variant="outline"
                className={`text-xs font-medium px-2.5 ${getPlanBadgeClass(
                  planKey
                )}`}
              >
                {PLAN_LABELS[planKey] || planKey}
              </Badge>
            </div>

            {/* Desktop Meta with bullet separators */}
            <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 text-xs text-[#adaaaa]">
              <span>
                RNC: <strong className="font-mono text-white">{rncDisplay}</strong>
              </span>
              <span>•</span>
              <span>{users.length} {users.length === 1 ? "usuario" : "usuarios"} ({admins.length} admin)</span>
              {tenant.telefono && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-[#adaaaa]" />
                    {tenant.telefono}
                  </span>
                </>
              )}
              {tenant.direccion && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 text-[#adaaaa] break-words min-w-0">
                    <MapPin className="h-3 w-3 shrink-0 text-[#adaaaa]" />
                    <span>{tenant.direccion}</span>
                  </span>
                </>
              )}
            </div>

            {/* Mobile Meta: vertical list WITHOUT bullet separators (icons only) */}
            <div className="flex sm:hidden flex-col gap-1.5 text-xs text-[#adaaaa] pt-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[#adaaaa]">RNC:</span>
                <strong className="font-mono text-white">{rncDisplay}</strong>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-[#adaaaa]" />
                <span>{users.length} {users.length === 1 ? "usuario" : "usuarios"} ({admins.length} admin)</span>
              </div>
              {tenant.telefono && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-[#adaaaa]" />
                  <span>{tenant.telefono}</span>
                </div>
              )}
              {tenant.direccion && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#adaaaa] mt-0.5" />
                  <span className="break-words leading-tight">{tenant.direccion}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons Right / Full width on mobile */}
        <div className="w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t border-[rgba(72,72,71,0.18)] sm:border-none">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                className="w-full sm:w-auto h-9 sm:h-8 justify-center gap-1.5 text-xs rounded-[10px] border border-[rgba(72,72,71,0.3)] text-[#adaaaa] hover:border-white hover:text-white bg-transparent cursor-pointer"
                aria-label="Más acciones del restaurante"
              >
                <span>Más acciones</span>
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="super-admin-scope w-56 rounded-[12px] border border-[rgba(72,72,71,0.18)] bg-[#131313] text-white p-1">
              {isBlocked ? (
                <DropdownMenuItem
                  onClick={onUnblockTenant}
                  className="gap-2 text-[#59ee50] focus:text-[#59ee50] rounded-[8px] cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Desbloquear restaurante
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={onBlockTenant}
                  className="gap-2 text-amber-400 focus:text-amber-400 rounded-[8px] cursor-pointer"
                >
                  <Ban className="h-4 w-4" />
                  Bloquear restaurante
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-[rgba(72,72,71,0.18)]" />

              <DropdownMenuItem
                onClick={onDeleteTenant}
                className="gap-2 text-[#ff716c] focus:text-[#ff716c] focus:bg-[rgba(255,113,108,0.1)] rounded-[8px] cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar restaurante
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
