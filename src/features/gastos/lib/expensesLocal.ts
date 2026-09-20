import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";

/** Safe accessor for the desktop bridge (undefined in web / test node env). */
function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

/**
 * Canonical normalized expense row. During the IndexedDB→SQLite migration the
 * same expense may be described with Spanish (legacy IndexedDB mirror / cloud)
 * or English (SQLite) field names. This shape exposes BOTH so every consumer
 * (Gastos, Cierre, Billing) can read it without caring about the origin store.
 */
export interface NormalizedExpense {
  id: string;
  tenant_id?: string | null;
  sucursal_id?: string | null;
  category_id: string | null;
  cycle_id: string | null;
  compra_id?: string | null;
  payroll_payment_id?: string | null;
  expense_type?: string | null;
  // Description (both conventions)
  descripcion: string;
  description: string;
  // Supplier (both conventions)
  proveedor: string | null;
  supplier: string | null;
  // Amount (both conventions)
  monto: number;
  amount: number;
  amount_cents?: number | null;
  // Payment method (both conventions)
  metodo_pago: string | null;
  payment_method: string | null;
  // Date (both conventions)
  fecha_gasto: string;
  expense_date: string;
  created_at?: string | null;
  notas: string | null;
  notes: string | null;
}

export interface NormalizedExpenseCategory {
  id: string;
  nombre: string;
  name: string;
  descripcion: string | null;
  description: string | null;
  color: string;
  activa: boolean;
  active: boolean;
  sucursal_id?: string | null;
}

export interface ReadExpensesOptions {
  sucursalId?: string | null;
  cycleId?: string | null;
  limit?: number;
  /** Inclusive start day (YYYY-MM-DD, by the expense's recorded date). */
  dateFrom?: string | null;
  /** Inclusive end day (YYYY-MM-DD, by the expense's recorded date). */
  dateTo?: string | null;
}

/** Calendar-day prefix (YYYY-MM-DD) of an expense date, ISO or plain. */
function expenseDay(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  return s.slice(0, 10);
}

function toNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function toStringOrNull(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return null;
}

/** Normalizes a raw row from SQLite or the IndexedDB mirror into a canonical expense. */
export function normalizeExpense(raw: Record<string, unknown>): NormalizedExpense {
  const amountCents = typeof raw.amount_cents === "number" ? raw.amount_cents : null;
  const monto = toNumber(raw.monto, raw.amount, amountCents !== null ? amountCents / 100 : undefined);
  const descripcion = toStringOrNull(raw.descripcion, raw.description) ?? "";
  const proveedor = toStringOrNull(raw.proveedor, raw.supplier);
  const metodoRaw = toStringOrNull(raw.metodo_pago, raw.payment_method);
  const metodo = metodoRaw === "cash" ? "efectivo" : metodoRaw;
  const fecha = toStringOrNull(raw.fecha_gasto, raw.expense_date, raw.created_at) ?? new Date().toISOString();
  const notas = toStringOrNull(raw.notas, raw.notes);

  return {
    id: String(raw.id),
    tenant_id: toStringOrNull(raw.tenant_id),
    sucursal_id: toStringOrNull(raw.sucursal_id),
    category_id: toStringOrNull(raw.category_id),
    cycle_id: toStringOrNull(raw.cycle_id),
    compra_id: toStringOrNull(raw.compra_id),
    payroll_payment_id: toStringOrNull(raw.payroll_payment_id),
    expense_type: toStringOrNull(raw.expense_type),
    descripcion,
    description: descripcion,
    proveedor,
    supplier: proveedor,
    monto,
    amount: monto,
    amount_cents: amountCents,
    metodo_pago: metodo,
    payment_method: metodo,
    fecha_gasto: fecha,
    expense_date: fecha,
    created_at: toStringOrNull(raw.created_at),
    notas,
    notes: notas,
  };
}

export function normalizeExpenseCategory(raw: Record<string, unknown>): NormalizedExpenseCategory {
  const nombre = toStringOrNull(raw.nombre, raw.name) ?? "";
  const descripcion = toStringOrNull(raw.descripcion, raw.description);
  const active = Boolean(raw.activa ?? raw.active ?? true);
  return {
    id: String(raw.id),
    nombre,
    name: nombre,
    descripcion,
    description: descripcion,
    color: toStringOrNull(raw.color) ?? "#ff906d",
    activa: active,
    active,
    sucursal_id: toStringOrNull(raw.sucursal_id),
  };
}

function belongsToSucursal(sucursalId: string | null | undefined, filterSucursalId?: string | null): boolean {
  if (!filterSucursalId) return true;
  // Rows with no branch (legacy / main-process-default) are visible everywhere.
  if (!sucursalId || sucursalId === "main-process-default") return true;
  return sucursalId === filterSucursalId;
}

/**
 * Reads expenses from SQLite (authoritative) unioned with the legacy IndexedDB
 * mirror (bridge, so purchase expenses still living only in IndexedDB during
 * the migration are not lost). SQLite wins on id collisions. Falls back to the
 * mirror alone when the desktop SQLite bridge is unavailable (e.g. web).
 */
export async function readLocalExpenses(
  tenantId: string,
  options: ReadExpensesOptions = {}
): Promise<NormalizedExpense[]> {
  const { sucursalId, cycleId, limit, dateFrom, dateTo } = options;
  const byId = new Map<string, NormalizedExpense>();

  // 1. SQLite (authoritative).
  let sqliteAvailable = false;
  const api = getElectronAPI();
  if (api?.listExpenses) {
    try {
      const res = await api.listExpenses({
        tenantId,
        sucursalId: sucursalId || undefined,
        limit: limit ?? 500,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (res?.ok && Array.isArray(res.data)) {
        sqliteAvailable = true;
        for (const raw of res.data) {
          const row = normalizeExpense(raw as Record<string, unknown>);
          byId.set(row.id, row);
        }
      }
    } catch (error) {
      console.warn("[expensesLocal] SQLite listExpenses failed:", error);
    }
  }

  // 2. IndexedDB mirror (bridge / fallback). Only add rows SQLite does not own.
  const useMirror = sqliteAvailable
    ? true // union: pull migration-pending rows (e.g. purchase expenses)
    : await shouldReadLocalFirst(tenantId, ["gastos"]).catch(() => false);
  if (useMirror) {
    try {
      const mirrorRows = await readLocalMirror<Record<string, unknown>>(tenantId, "gastos");
      for (const raw of mirrorRows) {
        const row = normalizeExpense(raw);
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
    } catch (error) {
      console.warn("[expensesLocal] IndexedDB mirror read failed:", error);
    }
  }

  let rows = Array.from(byId.values()).filter((row) => belongsToSucursal(row.sucursal_id, sucursalId));
  if (cycleId) rows = rows.filter((row) => row.cycle_id === cycleId);
  // Day-range filter (YYYY-MM-DD): covers IndexedDB mirror rows and the web path,
  // and is a safety net over the SQLite query.
  if (dateFrom || dateTo) {
    rows = rows.filter((row) => {
      const day = expenseDay(row.fecha_gasto);
      if (!day) return false;
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }
  rows.sort((a, b) => new Date(b.fecha_gasto).getTime() - new Date(a.fecha_gasto).getTime());
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

/** Same union strategy as readLocalExpenses, for expense categories. */
export async function readLocalExpenseCategories(
  tenantId: string,
  options: { sucursalId?: string | null; includeInactive?: boolean } = {}
): Promise<NormalizedExpenseCategory[]> {
  const { sucursalId, includeInactive } = options;
  const byId = new Map<string, NormalizedExpenseCategory>();

  let sqliteAvailable = false;
  const api = getElectronAPI();
  if (api?.listExpenseCategories) {
    try {
      const res = await api.listExpenseCategories();
      if (res?.ok && Array.isArray(res.data)) {
        sqliteAvailable = true;
        for (const raw of res.data) {
          const cat = normalizeExpenseCategory(raw as Record<string, unknown>);
          byId.set(cat.id, cat);
        }
      }
    } catch (error) {
      console.warn("[expensesLocal] SQLite listExpenseCategories failed:", error);
    }
  }

  const useMirror = sqliteAvailable
    ? true
    : await shouldReadLocalFirst(tenantId, ["gasto_categorias"]).catch(() => false);
  if (useMirror) {
    try {
      const mirrorRows = await readLocalMirror<Record<string, unknown>>(tenantId, "gasto_categorias");
      for (const raw of mirrorRows) {
        const cat = normalizeExpenseCategory(raw);
        if (!byId.has(cat.id)) byId.set(cat.id, cat);
      }
    } catch (error) {
      console.warn("[expensesLocal] IndexedDB categories read failed:", error);
    }
  }

  let cats = Array.from(byId.values()).filter((cat) => belongsToSucursal(cat.sucursal_id, sucursalId));
  if (!includeInactive) cats = cats.filter((cat) => cat.activa);
  cats.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return cats;
}
