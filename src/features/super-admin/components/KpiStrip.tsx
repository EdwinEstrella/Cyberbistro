import {
  CheckCircle2,
  Ban,
  Store,
  Sparkles,
  Crown,
  Building2,
} from "lucide-react";
import type { SuperAdminKpis } from "../lib/types";

interface KpiStripProps {
  kpis: SuperAdminKpis;
  loading?: boolean;
}

export function KpiStrip({ kpis, loading = false }: KpiStripProps) {
  const items = [
    {
      label: "Activos",
      fullTitle: "Restaurantes activos",
      value: kpis.active,
      icon: CheckCircle2,
    },
    {
      label: "Bloqueados",
      fullTitle: "Restaurantes bloqueados",
      value: kpis.blocked,
      icon: Ban,
    },
    {
      label: "Plan Básico",
      fullTitle: "Plan Básico",
      value: kpis.byPlan.basico,
      icon: Store,
    },
    {
      label: "Plan Profesional",
      fullTitle: "Plan Profesional",
      value: kpis.byPlan.profesional,
      icon: Sparkles,
    },
    {
      label: "Plan Empresarial",
      fullTitle: "Plan Empresarial",
      value: kpis.byPlan.empresarial,
      icon: Crown,
    },
    {
      label: "Plan Corporativo",
      fullTitle: "Plan Corporativo",
      value: kpis.byPlan.corporativo,
      icon: Building2,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-xl border border-border/50 bg-card/60 p-3.5 backdrop-blur-sm transition-all hover:border-border hover:bg-card/90"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/60 text-muted-foreground"
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xl font-semibold tracking-tight text-foreground font-mono tabular-nums">
                  {loading ? (
                    <span className="inline-block h-6 w-8 animate-pulse rounded bg-muted" />
                  ) : (
                    item.value
                  )}
                </div>
                <div
                  className="text-xs text-muted-foreground leading-tight line-clamp-2"
                  title={item.fullTitle}
                >
                  {item.label}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
