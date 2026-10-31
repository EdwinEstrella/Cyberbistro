import type { HealthEvaluation, TenantOverviewData } from "./types";

export function formatSupportSummary(
  data: TenantOverviewData,
  health: HealthEvaluation
): string {
  const { tenant, sucursales, users, activity, devices, sync, fiscal, cxc, corporate } = data;

  const lines: string[] = [];

  lines.push("========================================");
  lines.push(`FICHA 360 - SOPORTE: ${tenant.nombre_negocio || "Sin nombre"}`);
  lines.push("========================================");
  lines.push(`Tenant ID: ${tenant.id}`);
  lines.push(`RNC: ${tenant.rnc || "Sin datos"}`);
  lines.push(`Plan: ${tenant.plan || "basico"}`);
  lines.push(`Estado: ${tenant.activa !== false ? "Activo" : "Bloqueado"}`);
  lines.push(`Salud Operativa: [${health.badgeText.toUpperCase()}] ${health.reasons.join("; ")}`);
  lines.push(`Día de pago: ${tenant.payment_day_of_month ? `Día ${tenant.payment_day_of_month}` : "Sin configurar"}`);
  lines.push(`Fecha de creación: ${tenant.created_at ? new Date(tenant.created_at).toLocaleString() : "Sin datos"}`);

  lines.push("\n--- SUCURSALES ---");
  lines.push(`Total sucursales: ${sucursales.length}`);
  if (sucursales.length === 0) {
    lines.push("Sin sucursales registradas.");
  } else {
    sucursales.forEach((s, idx) => {
      lines.push(`  ${idx + 1}. ${s.nombre} (${s.activa ? "Activa" : "Inactiva"}) [${s.id}]`);
    });
  }

  lines.push("\n--- USUARIOS ---");
  lines.push(`Total: ${users.stats.total} (Activos: ${users.stats.active}, Inactivos: ${users.stats.inactive})`);
  const rolesSummary = Object.entries(users.stats.by_role)
    .map(([role, cnt]) => `${role}: ${cnt}`)
    .join(", ");
  lines.push(`Por rol: ${rolesSummary || "Ninguno"}`);

  lines.push("\n--- ACTIVIDAD Y SINCRONIZACIÓN ---");
  lines.push(`Última factura: ${activity.latest_factura_at ? new Date(activity.latest_factura_at).toLocaleString() : "Sin datos"}`);
  lines.push(`Última comanda: ${activity.latest_comanda_at ? new Date(activity.latest_comanda_at).toLocaleString() : "Sin datos"}`);
  lines.push(`Última sincronización: ${activity.latest_sync_at ? new Date(activity.latest_sync_at).toLocaleString() : "Sin datos"}`);
  lines.push(`Última actividad general: ${activity.latest_activity_at ? new Date(activity.latest_activity_at).toLocaleString() : "Sin datos"}`);
  lines.push(`Sync pendientes: ${sync.pending_count}, Conflictos: ${sync.conflicted_count}, Rechazos: ${sync.rejected_count}`);

  lines.push("\n--- DISPOSITIVOS ---");
  if (devices.length === 0) {
    lines.push("Sin dispositivos registrados.");
  } else {
    devices.forEach((d, idx) => {
      const versionStr = d.app_version || "Sin datos";
      const lastSeenStr = d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "Sin datos";
      lines.push(`  ${idx + 1}. ID: ${d.device_id} | Versión: ${versionStr} | Visto: ${lastSeenStr}${d.disabled_at ? " (Deshabilitado)" : ""}`);
    });
  }

  lines.push("\n--- FACTURACIÓN ELECTRÓNICA (e-CF) ---");
  lines.push(`Modo fiscal: ${tenant.fiscal_mode || "Sin datos"}`);
  lines.push(`Ambiente e-CF: ${tenant.ecf_environment || "Sin datos"}`);
  const ecfCountsStr = Object.entries(fiscal.ecf_counts_30d)
    .map(([st, cnt]) => `${st}: ${cnt}`)
    .join(", ");
  lines.push(`e-CF emitidos (30d): ${ecfCountsStr || "0"}`);
  lines.push(`Outbox fiscal - Reintentos: ${fiscal.outbox.retryable_count}, Errores: ${fiscal.outbox.error_count}`);
  if (fiscal.latest_error_message) {
    lines.push(`Último error fiscal: ${fiscal.latest_error_message}`);
  }

  lines.push("\n--- CUENTAS POR COBRAR (CxC) ---");
  lines.push(`Total pendiente: RD$ ${cxc.total_pending.toLocaleString("es-DO", { minimumFractionDigits: 2 })} (${cxc.count_pending} cuentas)`);
  lines.push(`Total vencido: RD$ ${cxc.total_overdue.toLocaleString("es-DO", { minimumFractionDigits: 2 })} (${cxc.count_overdue} cuentas vencidas)`);

  lines.push("\n--- USO CORPORATIVO ---");
  lines.push(`Enlaces menú corporativo: ${corporate.menu_links.enabled} activos de ${corporate.menu_links.total} (Límite del plan: ${corporate.menu_links.plan_limit})`);
  lines.push(`Pedidos digitales (7d): ${corporate.digital_orders_7d.count} pedidos, Total: RD$ ${corporate.digital_orders_7d.total.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`);
  if (corporate.companies.length > 0) {
    lines.push("Empresas con límite de crédito:");
    corporate.companies.forEach((comp) => {
      const limitStr = comp.credit_limit !== null ? `RD$ ${comp.credit_limit.toLocaleString("es-DO")}` : "Sin límite";
      const usedStr = comp.credit_used !== null ? `RD$ ${comp.credit_used.toLocaleString("es-DO")}` : "Sin datos";
      lines.push(`  - ${comp.name}: Usado ${usedStr} / Límite ${limitStr}`);
    });
  }

  lines.push("========================================");

  return lines.join("\n");
}
