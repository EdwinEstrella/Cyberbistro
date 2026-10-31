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
        return "border-blue-500/30 bg-blue-500/10 text-blue-400";
      case "empresarial":
        return "border-purple-500/30 bg-purple-500/10 text-purple-400";
      case "profesional":
        return "border-amber-500/30 bg-amber-500/10 text-amber-400";
      case "basico":
      default:
        return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(tenant.id)}
      onKeyDown={handleKeyDown}
      className={`group relative flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        selected
          ? "border-primary/50 bg-primary/10 shadow-sm"
          : "border-border/40 bg-card/40 hover:border-border hover:bg-card/70"
      }`}
    >
      <Avatar className="h-10 w-10 shrink-0 rounded-lg border border-border/60 bg-muted/40 font-semibold text-foreground">
        <AvatarFallback className="rounded-lg text-xs tracking-wider">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors"
            title={name}
          >
            {name}
          </h4>
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
              isBlocked ? "bg-rose-500 ring-2 ring-rose-500/20" : "bg-emerald-500 ring-2 ring-emerald-500/20"
            }`}
            title={isBlocked ? "Restaurante bloqueado" : "Restaurante activo"}
          />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-mono text-[11px] text-muted-foreground/90">
            {rncDisplay}
          </span>
          <span className="text-muted-foreground/40">•</span>
          <Badge
            variant="outline"
            className={`h-4 px-1.5 text-[10px] font-medium ${getPlanBadgeClass(
              planKey
            )}`}
          >
            {PLAN_LABELS[planKey] || planKey}
          </Badge>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {users.length} {users.length === 1 ? "usuario" : "usuarios"}
            {counts.admin > 0 ? ` (${counts.admin} admin)` : ""}
          </span>
          {isBlocked && (
            <span className="font-medium text-rose-400 text-[10px]">Bloqueado</span>
          )}
        </div>
      </div>
    </div>
  );
}
