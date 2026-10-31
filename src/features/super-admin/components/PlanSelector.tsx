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
        <h3 className="text-base font-semibold text-foreground">Planes de suscripción</h3>
        <p className="text-xs text-muted-foreground">
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
              className={`relative flex flex-col justify-between transition-all duration-200 ${
                isCurrent
                  ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40 shadow-sm"
                  : "border-border/60 bg-card/50 hover:border-border hover:bg-card/80"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      isCurrent
                        ? "border-primary/40 bg-primary/20 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base font-bold text-foreground truncate">
                    {tier.name}
                  </CardTitle>
                </div>

                {/* Badge ribbon row under the title: guarantees badge stays inside card and equal card heights */}
                <div className="h-6 flex items-center mt-2">
                  {isCurrent ? (
                    <Badge variant="default" className="text-[11px] gap-1 font-medium">
                      <Check className="h-3 w-3" />
                      Plan actual
                    </Badge>
                  ) : tier.recommended ? (
                    <Badge variant="outline" className="border-primary/40 text-primary text-[11px] font-medium">
                      Recomendado
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
                    US$ {tier.priceMonthlyUsd}
                  </span>
                  <span className="text-xs text-muted-foreground">/ mes</span>
                </div>

                <CardDescription className="text-xs line-clamp-2 mt-1 min-h-[32px]">
                  {tier.tagline}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 pb-4">
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {tier.bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400 mt-0.5" />
                      <span className="text-foreground/90">{bullet}</span>
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
                  className="w-full text-xs font-semibold cursor-pointer"
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
