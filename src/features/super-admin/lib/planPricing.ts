import { type Plan, PLAN_LABELS, PLAN_ORDER } from "../../../shared/lib/planFeatures";

export const PLAN_PRICES: Record<Plan, number> = {
  basico: 50,
  profesional: 90,
  empresarial: 175,
  corporativo: 299,
};

export interface PlanPricingTier {
  id: Plan;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  bullets: string[];
  recommended?: boolean;
}

export const PLAN_TIERS: Record<Plan, PlanPricingTier> = {
  basico: {
    id: "basico",
    name: PLAN_LABELS.basico,
    priceMonthlyUsd: PLAN_PRICES.basico,
    tagline: "Ideal para cafés, cafeterías o food trucks pequeños",
    bullets: [
      "1 Sucursal Física",
      "Punto de Venta (POS)",
      "Control de Mesas",
      "Comandas Digitales",
      "Hasta 3 Usuarios (+ Admin)",
      "NCF y Facturación Fiscal",
      "Soporte Estándar",
    ],
  },
  profesional: {
    id: "profesional",
    name: PLAN_LABELS.profesional,
    priceMonthlyUsd: PLAN_PRICES.profesional,
    tagline: "Para restaurantes en crecimiento y control de recetas",
    bullets: [
      "Hasta 3 Sucursales",
      "Hasta 5 Usuarios (+ Admin)",
      "Facturación Electrónica e-CF (DGII)",
      "Inventario Avanzado (Recetas)",
      "Cuentas por Pagar y Cobrar",
      "Menú Digital con Pedidos QR",
      "Módulo de Compras Insumos",
      "Soporte Prioritario",
    ],
  },
  empresarial: {
    id: "empresarial",
    name: PLAN_LABELS.empresarial,
    priceMonthlyUsd: PLAN_PRICES.empresarial,
    tagline: "Para marcas multi-sede y pedidos B2B de empresas",
    recommended: true,
    bullets: [
      "Sucursales y Usuarios Ilimitados",
      "Todo lo del Plan Profesional (e-CF)",
      "Menú digital para empresas: hasta 2 links",
      "Menús Personalizados por Día (recurrente o semanal)",
      "Extras Configurables por Link",
      "Estado de Cuenta en PDF por Rango de Fechas",
      "Control Multi-Sede Centralizado",
      "Integraciones vía API",
      "Soporte 24/7 Dedicado",
    ],
  },
  corporativo: {
    id: "corporativo",
    name: PLAN_LABELS.corporativo,
    priceMonthlyUsd: PLAN_PRICES.corporativo,
    tagline: "Para servicios corporativos, catering y factura e-CF mensual",
    bullets: [
      "Todo lo del Plan Empresarial",
      "Menú digital para empresas: hasta 6 links",
      "Factura Consolidada e-CF Mensual por Empresa",
      "Lista de Empleados Autorizados (nombre o cédula)",
      "Límite de Crédito por Empresa con Bloqueo Automático",
      "Reportes Detallados por Empresa",
      "Soporte Prioritario y Configuración Asistida",
    ],
  },
};

export function getPlanPrice(plan: Plan | string | null | undefined): number {
  if (!plan) return PLAN_PRICES.basico;
  const key = plan.toLowerCase() as Plan;
  return PLAN_PRICES[key] ?? PLAN_PRICES.basico;
}

export function getPlanTier(plan: Plan | string | null | undefined): PlanPricingTier {
  if (!plan) return PLAN_TIERS.basico;
  const key = plan.toLowerCase() as Plan;
  return PLAN_TIERS[key] ?? PLAN_TIERS.basico;
}

export const ALL_PLAN_TIERS: PlanPricingTier[] = PLAN_ORDER.map((key) => PLAN_TIERS[key]);
