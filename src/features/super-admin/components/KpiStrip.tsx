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
      chipClass: "bg-[rgba(89,238,80,0.1)] text-[#59ee50]",
    },
    {
      label: "Bloqueados",
      fullTitle: "Restaurantes bloqueados",
      value: kpis.blocked,
      icon: Ban,
      chipClass: "bg-[rgba(255,113,108,0.1)] text-[#ff716c]",
    },
    {
      label: "Plan Básico",
      fullTitle: "Plan Básico",
      value: kpis.byPlan.basico,
      icon: Store,
      chipClass: "bg-[rgba(255,255,255,0.05)] text-[#adaaaa]",
    },
    {
      label: "Plan Profesional",
      fullTitle: "Plan Profesional",
      value: kpis.byPlan.profesional,
      icon: Sparkles,
      chipClass: "bg-[rgba(255,144,109,0.1)] text-[#ff906d]",
    },
    {
      label: "Plan Empresarial",
      fullTitle: "Plan Empresarial",
      value: kpis.byPlan.empresarial,
      icon: Crown,
      chipClass: "bg-[rgba(168,85,247,0.1)] text-purple-400",
    },
    {
      label: "Plan Corporativo",
      fullTitle: "Plan Corporativo",
      value: kpis.byPlan.corporativo,
      icon: Building2,
      chipClass: "bg-[rgba(96,165,250,0.1)] text-blue-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313] p-3.5 backdrop-blur-sm transition-all hover:border-[rgba(72,72,71,0.35)]"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] p-2.5 ${item.chipClass}`}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-xl tracking-tight text-white tabular-nums">
                  {loading ? (
                    <span className="inline-block h-6 w-8 animate-pulse rounded-[4px] bg-[#1a1a1a]" />
                  ) : (
                    item.value
                  )}
                </div>
                <div
                  className="text-[10px] uppercase tracking-[0.5px] font-['Inter',sans-serif] text-[#adaaaa] leading-tight line-clamp-2 mt-0.5"
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
