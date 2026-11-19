import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TenantOverviewPanel } from "../TenantOverviewPanel";
import type { TenantCard } from "../../lib/types";

vi.mock("../../lib/tenantOverviewRepo", () => ({
  fetchTenantOverview: vi.fn().mockResolvedValue({
    data: {
      tenant: {
        id: "tenant-1",
        nombre_negocio: "Restaurante Central",
        rnc: "131000001",
        plan: "profesional",
        activa: true,
        created_at: "2026-01-01T00:00:00.000Z",
        payment_day_of_month: 15,
        monthly_fee_amount: 2500,
        monthly_fee_currency: "DOP",
        last_charged_period: "2026-11-13",
        debt_amount: 5000,
        debt_currency: "DOP",
        debt_due_date: "2026-11-20",
        fiscal_mode: "ecf",
        ecf_environment: "test",
        limits: {
          user_limit_enabled: true,
          admin_user_limit: 1,
          cajera_user_limit: 2,
          cocina_user_limit: 2,
          mesero_user_limit: 2,
          sucursal_limit_enabled: true,
          sucursal_limit: 2,
        },
      },
      sucursales: [],
      users: { stats: { total: 2, active: 2, inactive: 0, by_role: {} }, list: [] },
      activity: {
        latest_factura_at: null,
        latest_comanda_at: null,
        latest_sync_at: null,
        latest_activity_at: null,
      },
      devices: [],
      sync: { pending_count: 0, conflicted_count: 0, rejected_count: 0 },
      fiscal: {
        ecf_counts_30d: {},
        outbox: { retryable_count: 0, error_count: 0, queued_count: 0, processing_count: 0 },
        latest_error_message: null,
      },
      cxc: {
        count_total: 0,
        count_pending: 0,
        count_overdue: 0,
        total_receivable: 0,
        total_paid: 0,
        total_pending: 0,
        total_overdue: 0,
      },
      corporate: {
        menu_links: { total: 0, enabled: 0, plan_limit: 1 },
        companies: [],
        digital_orders_7d: { count: 0, total: 0 },
      },
    },
    error: null,
  }),
}));

describe("TenantOverviewPanel", () => {
  const baseCard: TenantCard = {
    tenant: {
      id: "tenant-1",
      nombre_negocio: "Restaurante Central",
      rnc: "131000001",
      plan: "profesional",
      activa: true,
      payment_day_of_month: 15,
      monthly_fee_amount: 2500,
      monthly_fee_currency: "DOP",
      debt_amount: 5000,
      debt_currency: "DOP",
      debt_due_date: "2026-11-20",
      sucursal_limit_enabled: true,
      sucursal_limit: 2,
      user_limit_enabled: true,
    },
    users: [],
    admins: [],
    counts: { admin: 1, cajera: 1, cocina: 1, mesero: 1 },
  };

  const mockOverviewData = {
    tenant: {
      id: "tenant-1",
      nombre_negocio: "Restaurante Central",
      rnc: "131000001",
      plan: "profesional",
      activa: true,
      created_at: "2026-01-01T00:00:00.000Z",
      payment_day_of_month: 15,
      monthly_fee_amount: 2500,
      monthly_fee_currency: "DOP" as const,
      last_charged_period: "2026-11-13",
      debt_amount: 5000,
      debt_currency: "DOP" as const,
      debt_due_date: "2026-11-20",
      fiscal_mode: "ecf",
      ecf_environment: "test",
      limits: {
        user_limit_enabled: true,
        admin_user_limit: 1,
        cajera_user_limit: 2,
        cocina_user_limit: 2,
        mesero_user_limit: 2,
        sucursal_limit_enabled: true,
        sucursal_limit: 2,
      },
    },
    sucursales: [],
    users: { stats: { total: 2, active: 2, inactive: 0, by_role: {} }, list: [] },
    activity: {
      latest_factura_at: null,
      latest_comanda_at: null,
      latest_sync_at: null,
      latest_activity_at: null,
    },
    devices: [],
    sync: { pending_count: 0, conflicted_count: 0, rejected_count: 0 },
    fiscal: {
      ecf_counts_30d: {},
      outbox: { retryable_count: 0, error_count: 0, queued_count: 0, processing_count: 0 },
      latest_error_message: null,
    },
    cxc: {
      count_total: 0,
      count_pending: 0,
      count_overdue: 0,
      total_receivable: 0,
      total_paid: 0,
      total_pending: 0,
      total_overdue: 0,
    },
    corporate: {
      menu_links: { total: 0, enabled: 0, plan_limit: 1 },
      companies: [],
      digital_orders_7d: { count: 0, total: 0 },
    },
  };

  it("renders Cuota mensual next to Día de pago and Deuda", () => {
    const html = renderToStaticMarkup(
      <TenantOverviewPanel card={baseCard} initialData={mockOverviewData} />
    );

    expect(html).toContain("Día de pago");
    expect(html).toContain("Cuota mensual");
    expect(html).toContain("Deuda");
    expect(html).toContain("RD$ 2,500.00");
  });

  it("renders Sin cuota when monthly fee is null or 0", () => {
    const cardWithoutFee: TenantCard = {
      ...baseCard,
      tenant: {
        ...baseCard.tenant,
        monthly_fee_amount: null,
      },
    };
    const html = renderToStaticMarkup(
      <TenantOverviewPanel card={cardWithoutFee} initialData={mockOverviewData} />
    );

    expect(html).toContain("Cuota mensual");
    expect(html).toContain("Sin cuota");
  });
});
