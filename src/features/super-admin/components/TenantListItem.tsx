import React from "react";
import { Avatar, AvatarFallback } from "../../../shared/ui/avatar";
import { Badge } from "../../../shared/ui/badge";
import type { TenantCard } from "../lib/types";
import { formatRnc, getTenantInitials } from "../lib/formatters";
import { PLAN_LABELS, type Plan } from "../../../shared/lib/planFeatures";

interface TenantListItemProps {
  card: TenantCard;
  selected: boolean;
  onSelect: (tenantId: string) => void;
}

export function TenantListItem({ card, selected, onSelect }: TenantListItemProps) {
  const { tenant, users, counts } = card;
  const isBlocked = tenant.activa === false;
  const name = tenant.nombre_negocio?.trim() || "Restaurante sin nombre";
  const rncDisplay = formatRnc(tenant.rnc);
  const initials = getTenantInitials(name);
  const planKey = (tenant.plan?.toLowerCase() ?? "basico") as Plan;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(tenant.id);
    }
  };

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
    <div
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(tenant.id)}
      onKeyDown={handleKeyDown}
      className={`group relative flex w-full cursor-pointer items-start gap-3 rounded-[12px] border p-3.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#ff906d] ${
        selected
          ? "border-[#ff906d]/70 bg-[rgba(255,144,109,0.08)] shadow-[0_0_12px_rgba(255,144,109,0.08)]"
          : "border-[rgba(72,72,71,0.18)] bg-[#131313] hover:border-[rgba(72,72,71,0.35)] hover:bg-[#1a1a1a]"
      }`}
    >
      <Avatar className="h-10 w-10 shrink-0 rounded-[10px] border border-[rgba(72,72,71,0.3)] bg-[#1a1a1a] font-semibold text-white">
        <AvatarFallback className="rounded-[10px] text-xs font-bold tracking-wider text-white">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="line-clamp-2 font-['Space_Grotesk',sans-serif] font-bold text-sm text-white group-hover:text-[#ff906d] transition-colors"
            title={name}
          >
            {name}
          </h4>
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
              isBlocked ? "bg-[#ff716c] ring-2 ring-[#ff716c]/20" : "bg-[#59ee50] ring-2 ring-[#59ee50]/20"
            }`}
            title={isBlocked ? "Restaurante bloqueado" : "Restaurante activo"}
          />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#adaaaa]">
          <span className="font-mono text-[11px] text-[#adaaaa]">
            {rncDisplay}
          </span>
          <span className="text-[#adaaaa]/40">•</span>
          <Badge
            variant="outline"
            className={`h-4 px-2 text-[10px] font-medium ${getPlanBadgeClass(
              planKey
            )}`}
          >
            {PLAN_LABELS[planKey] || planKey}
          </Badge>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#adaaaa]">
          <span>
            {users.length} {users.length === 1 ? "usuario" : "usuarios"}
            {counts.admin > 0 ? ` (${counts.admin} admin)` : ""}
          </span>
          {isBlocked && (
            <span className="font-medium text-[#ff716c] text-[10px]">Bloqueado</span>
          )}
        </div>
      </div>
    </div>
  );
}
