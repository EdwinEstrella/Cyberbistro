import { Check, Sparkles, Building2, Store, Crown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../../../shared/ui/card";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { type Plan, PLAN_ORDER } from "../../../shared/lib/planFeatures";
import { PLAN_TIERS } from "../lib/planPricing";

interface PlanSelectorProps {
  currentPlan: Plan | string | null | undefined;
  savingPlanId: string | null;
  tenantId: string;
  onSelectPlan: (plan: Plan) => void;
}

export function PlanSelector({
  currentPlan,
  savingPlanId,
  tenantId,
  onSelectPlan,
}: PlanSelectorProps) {
  const currentKey = (currentPlan?.toLowerCase() ?? "basico") as Plan;
  const isSaving = savingPlanId === tenantId;

  const getPlanIcon = (plan: Plan) => {
    switch (plan) {
      case "corporativo":
        return Building2;
      case "empresarial":
        return Crown;
      case "profesional":
        return Sparkles;
      case "basico":
      default:
        return Store;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-base uppercase tracking-[0.5px] text-white">
          Planes de suscripción
        </h3>
        <p className="text-xs text-[#adaaaa]">
          Selecciona un plan para ajustar las capacidades operativas del restaurante.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {PLAN_ORDER.map((planKey) => {
          const tier = PLAN_TIERS[planKey];
          const isCurrent = currentKey === planKey;
          const Icon = getPlanIcon(planKey);

          return (
            <Card
              key={planKey}
              className={`relative flex flex-col justify-between transition-all duration-200 rounded-[16px] border ${
                isCurrent
                  ? "border-[#ff906d]/70 bg-[rgba(255,144,109,0.06)] shadow-[0_0_16px_rgba(255,144,109,0.08)]"
                  : "border-[rgba(72,72,71,0.18)] bg-[#131313] hover:border-[rgba(72,72,71,0.35)] hover:bg-[#1a1a1a]"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] p-2.5 ${
                      isCurrent
                        ? "bg-[rgba(255,144,109,0.15)] text-[#ff906d]"
                        : "bg-[rgba(255,255,255,0.05)] text-[#adaaaa]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="font-['Space_Grotesk',sans-serif] font-bold text-base text-white truncate">
                    {tier.name}
                  </CardTitle>
                </div>

                {/* Badge ribbon row under the title */}
                <div className="h-6 flex items-center mt-2">
                  {isCurrent ? (
                    <Badge className="text-[11px] gap-1 font-bold rounded-full bg-[#ff906d] text-black">
                      <Check className="h-3 w-3 stroke-[3]" />
                      Plan actual
                    </Badge>
                  ) : tier.recommended ? (
                    <Badge variant="outline" className="border border-[#ff906d]/40 bg-[rgba(255,144,109,0.1)] text-[#ff906d] text-[11px] font-medium rounded-full">
                      Recomendado
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-2xl tracking-tight text-white tabular-nums">
                    US$ {tier.priceMonthlyUsd}
                  </span>
                  <span className="text-xs text-[#adaaaa]">/ mes</span>
                </div>

                <CardDescription className="text-xs text-[#adaaaa] line-clamp-2 mt-1 min-h-[32px]">
                  {tier.tagline}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 pb-4">
                <ul className="space-y-2 text-xs text-[#adaaaa]">
                  {tier.bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#59ee50] mt-0.5" />
                      <span className="text-white/90">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-0">
                <Button
                  variant={isCurrent ? "secondary" : "default"}
                  size="sm"
                  disabled={isCurrent || isSaving}
                  onClick={() => onSelectPlan(planKey)}
                  className={`w-full text-xs font-bold rounded-[10px] cursor-pointer transition-colors ${
                    isCurrent
                      ? "border border-[rgba(72,72,71,0.3)] text-[#adaaaa] bg-transparent"
                      : "bg-[#ff906d] text-black hover:bg-[#ff8059]"
                  }`}
                >
                  {isSaving
                    ? "Actualizando..."
                    : isCurrent
                    ? "Plan activo"
                    : `Cambiar a ${tier.name}`}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
