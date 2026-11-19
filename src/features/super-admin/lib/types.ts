import type { ManagedUserRole } from "../../../shared/lib/tenantUserLimits";
import type { Plan } from "../../../shared/lib/planFeatures";
import type { DebtCurrency } from "../../../shared/lib/tenantDebt";

export interface SuperAdminAuditLogRow {
  id: string;
  actor_auth_user_id: string | null;
  action: string;
  tenant_id: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface TenantUserRow {
  id: string;
  tenant_id: string;
  email: string;
  rol: string;
  nombre: string | null;
  activo: boolean | null;
  auth_user_id: string | null;
}

export interface TenantRow {
  id: string;
  nombre_negocio?: string | null;
  rnc?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  activa?: boolean | null;
  plan?: string | null;
  created_at?: string | null;
  user_limit_enabled?: boolean | null;
  admin_user_limit?: number | null;
  cajera_user_limit?: number | null;
  cocina_user_limit?: number | null;
  mesero_user_limit?: number | null;
  sucursal_limit_enabled?: boolean | null;
  sucursal_limit?: number | null;
  payment_day_of_month?: number | null;
  monthly_fee_amount?: number | null;
  monthly_fee_currency?: DebtCurrency | null;
  last_charged_period?: string | null;
  debt_amount?: number | null;
  debt_currency?: DebtCurrency | null;
  debt_due_date?: string | null;
  debt_updated_at?: string | null;
  [key: string]: unknown;
}

export interface LimitDraft {
  userLimitEnabled: boolean;
  adminUserLimit: string;
  cajeraUserLimit: string;
  cocinaUserLimit: string;
  meseroUserLimit: string;
  sucursalLimitEnabled: boolean;
  sucursalLimit: string;
  paymentDayOfMonth: string;
  monthlyFeeAmount: string;
  monthlyFeeCurrency: DebtCurrency;
  debtAmount: string;
  debtCurrency: DebtCurrency;
  debtDueDate: string;
}

export type LimitDraftNumberField = Exclude<
  keyof LimitDraft,
  | "userLimitEnabled"
  | "sucursalLimitEnabled"
  | "debtCurrency"
  | "debtDueDate"
  | "monthlyFeeCurrency"
>;

export interface TenantCard {
  tenant: TenantRow;
  users: TenantUserRow[];
  admins: TenantUserRow[];
  counts: Record<ManagedUserRole, number>;
}

export interface SuperAdminKpis {
  total: number;
  active: number;
  blocked: number;
  byPlan: Record<Plan, number>;
}

export interface TenantFilterState {
  search: string;
  status: "all" | "active" | "blocked";
  plan: "all" | Plan;
}

export interface TenantOverviewLimits {
  user_limit_enabled: boolean | null;
  admin_user_limit: number | null;
  cajera_user_limit: number | null;
  cocina_user_limit: number | null;
  mesero_user_limit: number | null;
  sucursal_limit_enabled: boolean | null;
  sucursal_limit: number | null;
}

export interface TenantOverviewTenantBasics {
  id: string;
  nombre_negocio: string | null;
  rnc: string | null;
  plan: string | null;
  activa: boolean | null;
  created_at: string | null;
  payment_day_of_month: number | null;
  monthly_fee_amount?: number | null;
  monthly_fee_currency?: DebtCurrency | null;
  last_charged_period?: string | null;
  debt_amount?: number | null;
  debt_currency?: DebtCurrency | null;
  debt_due_date?: string | null;
  debt_updated_at?: string | null;
  fiscal_mode: string | null;
  ecf_environment: string | null;
  limits: TenantOverviewLimits;
}

export interface TenantBillingPaymentRow {
  id: string;
  tenant_id: string;
  amount: number;
  currency: DebtCurrency;
  paid_at: string;
  recorded_by?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface TenantOverviewSucursal {
  id: string;
  nombre: string;
  activa: boolean;
}

export interface TenantOverviewUserItem {
  id: string;
  email: string;
  nombre: string | null;
  rol: string;
  activo: boolean | null;
  auth_user_id: string | null;
  last_sign_in_at: string | null;
}

export interface TenantOverviewUsers {
  stats: {
    total: number;
    active: number;
    inactive: number;
    by_role: Record<string, number>;
  };
  list: TenantOverviewUserItem[];
}

export interface TenantOverviewActivity {
  latest_factura_at: string | null;
  latest_comanda_at: string | null;
  latest_sync_at: string | null;
  latest_activity_at: string | null;
}

export interface TenantOverviewDevice {
  device_id: string;
  last_seen_at: string | null;
  disabled_at: string | null;
  last_ack_cursor: number;
  app_version: string | null;
}

export interface TenantOverviewSync {
  pending_count: number;
  conflicted_count: number;
  rejected_count: number;
}

export interface TenantOverviewFiscalOutbox {
  retryable_count: number;
  error_count: number;
  queued_count: number;
  processing_count: number;
}

export interface TenantOverviewFiscal {
  ecf_counts_30d: Record<string, number>;
  outbox: TenantOverviewFiscalOutbox;
  latest_error_message: string | null;
}

export interface TenantOverviewCxC {
  count_total: number;
  count_pending: number;
  count_overdue: number;
  total_receivable: number;
  total_paid: number;
  total_pending: number;
  total_overdue: number;
}

export interface TenantOverviewCompanyCredit {
  customer_id: string;
  name: string;
  credit_limit: number | null;
  credit_used: number | null;
}

export interface TenantOverviewCorporate {
  menu_links: {
    total: number;
    enabled: number;
    plan_limit: number;
  };
  companies: TenantOverviewCompanyCredit[];
  digital_orders_7d: {
    count: number;
    total: number;
  };
}

export interface TenantOverviewData {
  tenant: TenantOverviewTenantBasics;
  sucursales: TenantOverviewSucursal[];
  users: TenantOverviewUsers;
  activity: TenantOverviewActivity;
  devices: TenantOverviewDevice[];
  sync: TenantOverviewSync;
  fiscal: TenantOverviewFiscal;
  cxc: TenantOverviewCxC;
  corporate: TenantOverviewCorporate;
}

export type HealthStatus = "green" | "amber" | "red";

export interface HealthEvaluation {
  status: HealthStatus;
  badgeText: string;
  reasons: string[];
}
