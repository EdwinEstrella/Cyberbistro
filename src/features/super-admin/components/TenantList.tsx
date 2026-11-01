import { useMemo } from "react";
import { Skeleton } from "../../../shared/ui/skeleton";
import { Button } from "../../../shared/ui/button";
import { TenantListItem } from "./TenantListItem";
import type { TenantCard, TenantFilterState } from "../lib/types";
import { filterTenants } from "../lib/filtering";
import { type Plan, PLAN_LABELS, PLAN_ORDER } from "../../../shared/lib/planFeatures";
import { Filter, Store } from "lucide-react";

interface TenantListProps {
  cards: TenantCard[];
  selectedTenantId: string | null;
  onSelectTenant: (tenantId: string) => void;
  filterState: TenantFilterState;
  onFilterChange: (update: Partial<TenantFilterState>) => void;
  loading?: boolean;
}

export function TenantList({
  cards,
  selectedTenantId,
  onSelectTenant,
  filterState,
  onFilterChange,
  loading = false,
}: TenantListProps) {
  const filteredCards = useMemo(
    () => filterTenants(cards, filterState),
    [cards, filterState]
  );

  const statusOptions: { id: TenantFilterState["status"]; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "active", label: "Activos" },
    { id: "blocked", label: "Bloqueados" },
  ];

  const planOptions: { id: "all" | Plan; label: string }[] = [
    { id: "all", label: "Todos los planes" },
    ...PLAN_ORDER.map((plan) => ({ id: plan, label: PLAN_LABELS[plan] })),
  ];

  const hasActiveFilters =
    filterState.status !== "all" ||
    filterState.plan !== "all" ||
    filterState.search.trim().length > 0;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Filters strip */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-card/60 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => onFilterChange({ status: "all", plan: "all", search: "" })}
              className="text-[11px] text-primary hover:underline"
            >
              Restablecer
            </button>
          )}
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-1">
          {statusOptions.map((opt) => {
            const isSelected = filterState.status === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onFilterChange({ status: opt.id })}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Plan chips */}
        <div className="flex flex-wrap gap-1">
          {planOptions.map((opt) => {
            const isSelected = filterState.plan === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onFilterChange({ plan: opt.id })}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-secondary text-secondary-foreground shadow-sm font-semibold"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Header with count */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          Mostrando {filteredCards.length} de {cards.length} restaurantes
        </span>
      </div>

      {/* List content */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/30 p-3.5"
            >
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))
        ) : filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 p-8 text-center">
            <Store className="h-8 w-8 text-muted-foreground/60" />
            <h5 className="text-sm font-semibold text-foreground">
              No se encontraron restaurantes
            </h5>
            <p className="max-w-[240px] text-xs text-muted-foreground">
              Intenta cambiar los términos de búsqueda o los filtros activos.
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => onFilterChange({ status: "all", plan: "all", search: "" })}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          filteredCards.map((card) => (
            <TenantListItem
              key={card.tenant.id}
              card={card}
              selected={selectedTenantId === card.tenant.id}
              onSelect={onSelectTenant}
            />
          ))
        )}
      </div>
    </div>
  );
}
