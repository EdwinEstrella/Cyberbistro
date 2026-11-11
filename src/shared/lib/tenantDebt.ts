export type DebtCurrency = "DOP" | "USD";

export interface TenantDebt {
  amount: number | null;
  currency: DebtCurrency;
  dueDate: string | null;
}

export type DebtStatus =
  | { kind: "none" }
  | { kind: "upcoming"; daysLeft: number }
  | { kind: "due_today" }
  | { kind: "overdue"; daysOverdue: number; lockDate: string }
  | { kind: "locked"; daysOverdue: number };

export const DEBT_GRACE_DAYS = 3;

export function getDebtAlertStorageKey(tenantId: string, kind: string, dateKey: string): string {
  return `debt-alert:${tenantId}:${kind}:${dateKey}`;
}

export type TenantDebtRow = {
  debt_amount?: number | string | null;
  debt_currency?: string | null;
  debt_due_date?: string | null;
  [key: string]: unknown;
};

/**
 * Pure mapping helper that converts an untrusted cloud or local tenant row to a validated TenantDebt object.
 * Returns amount: null on null, non-numeric, zero, negative, or invalid amounts.
 */
export function toTenantDebt(row: unknown): TenantDebt {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { amount: null, currency: "DOP", dueDate: null };
  }

  const record = row as Record<string, unknown>;
  const rawCurrency = typeof record.debt_currency === "string" ? record.debt_currency.trim().toUpperCase() : "";
  const currency: DebtCurrency = rawCurrency === "USD" ? "USD" : "DOP";

  let amount: number | null = null;
  const rawAmount = record.debt_amount;
  if (typeof rawAmount === "number") {
    if (Number.isFinite(rawAmount) && rawAmount > 0) {
      amount = rawAmount;
    }
  } else if (typeof rawAmount === "string") {
    const trimmed = rawAmount.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        amount = parsed;
      }
    }
  }

  let dueDate: string | null = null;
  const rawDueDate = record.debt_due_date;
  if (typeof rawDueDate === "string") {
    const trimmed = rawDueDate.trim();
    if (parseIsoDate(trimmed)) {
      dueDate = trimmed;
    }
  }

  return {
    amount,
    currency,
    dueDate,
  };
}

export const mapRowToTenantDebt = toTenantDebt;

const CURRENCY_PREFIX: Record<DebtCurrency, string> = {
  DOP: "RD$ ",
  USD: "US$ ",
};

function parseIsoDate(isoDate: string | null): { year: number; month: number; day: number } | null {
  if (!isoDate || typeof isoDate !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatUtcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDebtStatus(today: Date, debt: TenantDebt): DebtStatus {
  if (
    debt.amount === null ||
    debt.amount === undefined ||
    !Number.isFinite(debt.amount) ||
    debt.amount <= 0
  ) {
    return { kind: "none" };
  }

  const parsedDue = parseIsoDate(debt.dueDate);
  if (!parsedDue) {
    return { kind: "none" };
  }

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dueUtc = Date.UTC(parsedDue.year, parsedDue.month - 1, parsedDue.day);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((dueUtc - todayUtc) / msPerDay);

  if (diffDays > 1) {
    return { kind: "none" };
  }

  if (diffDays === 1) {
    return { kind: "upcoming", daysLeft: 1 };
  }

  if (diffDays === 0) {
    return { kind: "due_today" };
  }

  const daysOverdue = -diffDays;
  if (daysOverdue < DEBT_GRACE_DAYS) {
    const lockUtc = new Date(Date.UTC(parsedDue.year, parsedDue.month - 1, parsedDue.day + DEBT_GRACE_DAYS));
    const lockDate = formatUtcDateKey(lockUtc);
    return { kind: "overdue", daysOverdue, lockDate };
  }

  return { kind: "locked", daysOverdue };
}

export function formatDebtAmount(amount: number, currency: DebtCurrency): string {
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefix = CURRENCY_PREFIX[currency] ?? `${currency} `;
  return `${prefix}${formatter.format(amount)}`;
}

export function buildDebtMessage(input: {
  businessName: string;
  debt: TenantDebt;
  status: DebtStatus;
}): { title: string; message: string } | null {
  if (input.status.kind === "none") {
    return null;
  }

  const name = input.businessName.trim() || "tu negocio";
  const amount = formatDebtAmount(input.debt.amount ?? 0, input.debt.currency);

  switch (input.status.kind) {
    case "upcoming":
      return {
        title: "Recordatorio de pago",
        message: `Por favor pagar ${name} — ${amount} — para continuar con el servicio sin interrupciones. Vence mañana.`,
      };
    case "due_today":
      return {
        title: "Recordatorio de pago",
        message: `Por favor pagar ${name} — ${amount} — para continuar con el servicio sin interrupciones. Vence hoy.`,
      };
    case "overdue": {
      const [year, month, day] = input.status.lockDate.split("-");
      const formattedLockDate = `${day}/${month}/${year}`;
      return {
        title: "Pago vencido",
        message: `Por favor pagar ${name} — ${amount} — para continuar con el servicio sin interrupciones. Si no se recibe el pago el ${formattedLockDate}, el sistema se deshabilitará.`,
      };
    }
    case "locked":
      return {
        title: "Servicio deshabilitado",
        message: `El servicio de ${name} está deshabilitado por pago pendiente (${amount}). Contactá a soporte para reactivarlo.`,
      };
  }
}
