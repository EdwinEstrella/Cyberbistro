import { describe, expect, it } from "vitest";
import { evaluateTenantHealth } from "../healthIndicator";
import { formatSupportSummary } from "../supportSummary";
import type { TenantOverviewData } from "../types";

function createMockOverview(overrides: Partial<TenantOverviewData> = {}): TenantOverviewData {
  return {
    tenant: {
      id: "00000000-0000-0000-0000-000000000001",
      nombre_negocio: "Bistro Central",
      rnc: "131234567",
      plan: "corporativo",
      activa: true,
      created_at: "2026-01-01T00:00:00.000Z",
      payment_day_of_month: 15,
      fiscal_mode: "dgii_ecf",
      ecf_environment: "test",
      limits: {
        user_limit_enabled: true,
        admin_user_limit: 1,
        cajera_user_limit: 2,
        cocina_user_limit: 2,
        mesero_user_limit: 5,
        sucursal_limit_enabled: true,
        sucursal_limit: 3,
      },
    },
    sucursales: [
      { id: "s1", nombre: "Principal", activa: true },
      { id: "s2", nombre: "Naco", activa: false },
    ],
    users: {
      stats: {
        total: 4,
        active: 3,
        inactive: 1,
        by_role: { admin: 1, cajera: 2, mesero: 1 },
      },
      list: [
        {
          id: "u1",
          email: "owner@bistro.com",
          nombre: "Dueño",
          rol: "admin",
          activo: true,
          auth_user_id: "a1",
          last_sign_in_at: "2026-10-31T12:00:00.000Z",
        },
      ],
    },
    activity: {
      latest_factura_at: "2026-10-31T15:00:00.000Z",
      latest_comanda_at: "2026-10-31T15:30:00.000Z",
      latest_sync_at: "2026-10-31T15:35:00.000Z",
      latest_activity_at: "2026-10-31T15:35:00.000Z",
    },
    devices: [
      {
        device_id: "dev-1",
        last_seen_at: "2026-10-31T15:35:00.000Z",
        disabled_at: null,
        last_ack_cursor: 120,
        app_version: null,
      },
    ],
    sync: {
      pending_count: 0,
      conflicted_count: 0,
      rejected_count: 0,
    },
    fiscal: {
      ecf_counts_30d: { accepted: 45, rejected: 0 },
      outbox: {
        retryable_count: 0,
        error_count: 0,
        queued_count: 0,
        processing_count: 0,
      },
      latest_error_message: null,
    },
    cxc: {
      count_total: 5,
      count_pending: 2,
      count_overdue: 1,
      total_receivable: 10000,
      total_paid: 4000,
      total_pending: 6000,
      total_overdue: 2500,
    },
    corporate: {
      menu_links: {
        total: 2,
        enabled: 2,
        plan_limit: 6,
      },
      companies: [
        {
          customer_id: "c1",
          name: "Acme Corp",
          credit_limit: 50000,
          credit_used: 12500,
        },
      ],
      digital_orders_7d: {
        count: 14,
        total: 9200,
      },
    },
    ...overrides,
  };
}

describe("evaluateTenantHealth", () => {
  const fixedNow = new Date("2026-10-31T16:00:00.000Z").getTime();

  it("returns green status when system is fully active and error-free", () => {
    const data = createMockOverview();
    const result = evaluateTenantHealth(data, { now: fixedNow });
    expect(result.status).toBe("green");
    expect(result.badgeText).toBe("Operativo");
    expect(result.reasons[0]).toContain("normalmente");
  });

  it("returns red status when fiscal outbox has errors", () => {
    const data = createMockOverview({
      fiscal: {
        ecf_counts_30d: {},
        outbox: { retryable_count: 0, error_count: 2, queued_count: 0, processing_count: 0 },
        latest_error_message: "Rechazado por DGII: Certificado vencido",
      },
    });
    const result = evaluateTenantHealth(data, { now: fixedNow });
    expect(result.status).toBe("red");
    expect(result.badgeText).toBe("Crítico");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("Errores fiscales")]));
  });

  it("returns red status when sync conflicts exist", () => {
    const data = createMockOverview({
      sync: { pending_count: 0, conflicted_count: 1, rejected_count: 0 },
    });
    const result = evaluateTenantHealth(data, { now: fixedNow });
    expect(result.status).toBe("red");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("Conflictos de sincronización")]));
  });

  it("returns red status when an active tenant has no activity in > 3 days", () => {
    const data = createMockOverview({
      activity: {
        latest_factura_at: "2026-10-25T00:00:00.000Z",
        latest_comanda_at: "2026-10-25T00:00:00.000Z",
        latest_sync_at: "2026-10-25T00:00:00.000Z",
        latest_activity_at: "2026-10-25T00:00:00.000Z",
      },
    });
    const result = evaluateTenantHealth(data, { now: fixedNow });
    expect(result.status).toBe("red");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("Inactivo hace")]));
  });

  it("does not flag inactive (> 3 days) as red if the tenant is blocked/inactive", () => {
    const data = createMockOverview({
      tenant: {
        ...createMockOverview().tenant,
        activa: false,
      },
      activity: {
        latest_factura_at: "2026-10-20T00:00:00.000Z",
        latest_comanda_at: "2026-10-20T00:00:00.000Z",
        latest_sync_at: "2026-10-20T00:00:00.000Z",
        latest_activity_at: "2026-10-20T00:00:00.000Z",
      },
    });
    const result = evaluateTenantHealth(data, { now: fixedNow });
    expect(result.status).toBe("green");
  });

  it("returns amber status when retryable items are pending", () => {
    const data = createMockOverview({
      fiscal: {
        ecf_counts_30d: {},
        outbox: { retryable_count: 3, error_count: 0, queued_count: 1, processing_count: 0 },
        latest_error_message: null,
      },
    });
    const result = evaluateTenantHealth(data, { now: fixedNow });
    expect(result.status).toBe("amber");
    expect(result.badgeText).toBe("Atención");
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("Reintentos fiscales en cola")]));
  });

  it("returns amber status when pending sync operations exist", () => {
    const data = createMockOverview({
      sync: { pending_count: 4, conflicted_count: 0, rejected_count: 0 },
    });
    const result = evaluateTenantHealth(data, { now: fixedNow });
    expect(result.status).toBe("amber");
  });
});

describe("formatSupportSummary", () => {
  it("formats comprehensive text summary suitable for support clipboard copy", () => {
    const data = createMockOverview();
    const health = evaluateTenantHealth(data);
    const summary = formatSupportSummary(data, health);

    expect(summary).toContain("FICHA 360 - SOPORTE: Bistro Central");
    expect(summary).toContain("Tenant ID: 00000000-0000-0000-0000-000000000001");
    expect(summary).toContain("Plan: corporativo");
    expect(summary).toContain("Salud Operativa: [OPERATIVO]");
    expect(summary).toContain("Día 15");
    expect(summary).toContain("Principal (Activa)");
    expect(summary).toContain("Naco (Inactiva)");
    expect(summary).toContain("Total: 4 (Activos: 3, Inactivos: 1)");
    expect(summary).toContain("Acme Corp");
    expect(summary).toContain("Sin datos"); // For device app_version
  });
});
