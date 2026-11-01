import type { HealthEvaluation, HealthStatus, TenantOverviewData } from "./types";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface EvaluateHealthOptions {
  now?: Date | number;
}

/**
 * Pure evaluation of tenant operational health based on sync, fiscal pipeline,
 * and recent operational activity.
 */
export function evaluateTenantHealth(
  data: TenantOverviewData,
  options: EvaluateHealthOptions = {}
): HealthEvaluation {
  const nowMs = typeof options.now === "number"
    ? options.now
    : (options.now instanceof Date ? options.now.getTime() : Date.now());

  const redReasons: string[] = [];
  const amberReasons: string[] = [];

  const isActive = data.tenant.activa !== false;

  // 1. Fiscal errors: terminal errors or errors > 0
  const fiscalErrors = data.fiscal.outbox.error_count;
  if (fiscalErrors > 0) {
    redReasons.push(`Errores fiscales pendientes: ${fiscalErrors}`);
  }

  // 2. Sync conflicts or rejections
  if (data.sync.conflicted_count > 0) {
    redReasons.push(`Conflictos de sincronización: ${data.sync.conflicted_count}`);
  }
  if (data.sync.rejected_count > 0) {
    redReasons.push(`Operaciones rechazadas en sync: ${data.sync.rejected_count}`);
  }

  // 3. Activity check for active tenants (no activity in 3 days)
  if (isActive) {
    const latestActivity = data.activity.latest_activity_at;
    if (!latestActivity) {
      // Check created_at age
      const createdAtMs = data.tenant.created_at ? new Date(data.tenant.created_at).getTime() : 0;
      if (nowMs - createdAtMs > THREE_DAYS_MS) {
        redReasons.push("Sin actividad registrada en los últimos 3 días");
      } else {
        amberReasons.push("Restaurante nuevo sin actividad registrada todavía");
      }
    } else {
      const activityMs = new Date(latestActivity).getTime();
      const diffMs = nowMs - activityMs;
      if (diffMs > THREE_DAYS_MS) {
        const days = Math.floor(diffMs / ONE_DAY_MS);
        redReasons.push(`Inactivo hace ${days} días`);
      } else if (diffMs > ONE_DAY_MS) {
        amberReasons.push("Sin actividad en las últimas 24 horas");
      }
    }
  }

  // 4. Amber triggers: retryable outbox items or pending sync
  const retryableCount = data.fiscal.outbox.retryable_count;
  if (retryableCount > 0) {
    amberReasons.push(`Reintentos fiscales en cola: ${retryableCount}`);
  }

  if (data.sync.pending_count > 0) {
    amberReasons.push(`Operaciones pendientes de sync: ${data.sync.pending_count}`);
  }

  let status: HealthStatus;
  let badgeText: string;
  let reasons: string[];

  if (redReasons.length > 0) {
    status = "red";
    badgeText = "Crítico";
    reasons = redReasons;
  } else if (amberReasons.length > 0) {
    status = "amber";
    badgeText = "Atención";
    reasons = amberReasons;
  } else {
    status = "green";
    badgeText = "Operativo";
    reasons = ["Sistema operando normalmente"];
  }

  return { status, badgeText, reasons };
}
