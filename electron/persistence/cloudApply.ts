import type { DatabaseSync } from "node:sqlite";

/**
 * Transaction-free cloud→SQLite appliers shared by the pull path
 * (SQLitePayrollSyncStore.applyPull) and the legacy per-screen reconciliation
 * (TenantStore.syncCloud*). Callers own the surrounding transaction so a pull
 * batch can commit rows AND its cursor atomically.
 */

export function applyCloudExpenseCategoryRows(
  db: DatabaseSync,
  tenantId: string,
  categories: Array<Record<string, unknown>>,
): void {
  const stmt = db.prepare(`
    INSERT INTO gasto_categorias (id, tenant_id, name, description, color, active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      color = excluded.color,
      active = excluded.active
  `);
  for (const cat of categories) {
    if (!cat || typeof cat !== "object" || !cat.id) continue;
    if (hasPendingCloudWrite(db, tenantId, "gasto_categorias", String(cat.id))) continue;
    const name = String(cat.nombre ?? cat.name ?? "").trim();
    if (!name) continue;
    const active = (cat.activa ?? cat.active ?? true) ? 1 : 0;
    stmt.run(
      String(cat.id),
      tenantId,
      name,
      cat.descripcion ? String(cat.descripcion) : (cat.description ? String(cat.description) : null),
      cat.color ? String(cat.color) : "#ff906d",
      active,
    );
  }
}

export function applyCloudExpenseRows(
  db: DatabaseSync,
  tenantId: string,
  expenses: Array<Record<string, unknown>>,
  defaultBranchId = "main-process-default",
): void {
  db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(defaultBranchId, tenantId, "Principal");
  const checkCompraStmt = db.prepare("SELECT 1 FROM compras WHERE id = ? AND tenant_id = ? AND sucursal_id = ?");
  const checkPayrollStmt = db.prepare("SELECT 1 FROM payroll_payments WHERE id = ? AND tenant_id = ?");
  const stmt = db.prepare(`
    INSERT INTO gastos (
      id, tenant_id, sucursal_id, category_id, cycle_id,
      compra_id, payroll_payment_id, expense_type, payment_method,
      amount, amount_cents, local_status, description, supplier, notes,
      expense_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sucursal_id = excluded.sucursal_id,
      compra_id = excluded.compra_id,
      payroll_payment_id = excluded.payroll_payment_id,
      category_id = excluded.category_id,
      cycle_id = excluded.cycle_id,
      expense_type = excluded.expense_type,
      payment_method = excluded.payment_method,
      amount = excluded.amount,
      amount_cents = excluded.amount_cents,
      description = excluded.description,
      supplier = excluded.supplier,
      notes = excluded.notes,
      expense_date = excluded.expense_date,
      created_at = excluded.created_at
  `);
  for (const g of expenses) {
    if (!g || typeof g !== "object" || !g.id) continue;
    if (hasPendingCloudWrite(db, tenantId, "gastos", String(g.id))) continue;
    const branchId = typeof g.sucursal_id === "string" && g.sucursal_id.trim() ? g.sucursal_id.trim() : defaultBranchId;
    db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, tenantId, "Principal");

    const categoryId = g.category_id ? String(g.category_id) : null;
    if (categoryId) {
      db.prepare("INSERT OR IGNORE INTO gasto_categorias (id, tenant_id, name, color, active) VALUES (?, ?, 'General', '#ff906d', 1)").run(categoryId, tenantId);
    }

    const rawAmount = Number(g.monto ?? g.amount ?? 0);
    const amount = Number.isFinite(rawAmount) && rawAmount >= 0 ? rawAmount : 0;
    const rawAmountCents = typeof g.amount_cents === "number" ? g.amount_cents : Math.round(amount * 100);
    const amountCents = Number.isFinite(rawAmountCents) && rawAmountCents >= 0 ? rawAmountCents : 0;
    const expenseType = typeof g.expense_type === "string" && ["operational", "purchase", "payroll"].includes(g.expense_type)
      ? g.expense_type
      : (g.compra_id ? "purchase" : (g.payroll_payment_id ? "payroll" : "operational"));
    const paymentMethod = typeof g.metodo_pago === "string" ? g.metodo_pago : (typeof g.payment_method === "string" ? g.payment_method : "cash");
    const description = g.descripcion ? String(g.descripcion) : (g.description ? String(g.description) : null);
    const supplier = g.proveedor ? String(g.proveedor) : (g.supplier ? String(g.supplier) : null);
    const notes = g.notas ? String(g.notas) : (g.notes ? String(g.notes) : null);
    const expenseDate = g.fecha_gasto ? String(g.fecha_gasto) : (g.expense_date ? String(g.expense_date) : new Date().toISOString());
    const createdAt = g.created_at ? String(g.created_at) : expenseDate;
    const cycleId = g.cycle_id ? String(g.cycle_id) : null;

    const hasValidCompra = g.compra_id
      ? Boolean(checkCompraStmt.get(String(g.compra_id), tenantId, branchId))
      : false;
    const compraId = hasValidCompra ? String(g.compra_id) : null;

    const hasValidPayrollPayment = g.payroll_payment_id
      ? Boolean(checkPayrollStmt.get(String(g.payroll_payment_id), tenantId))
      : false;
    const payrollPaymentId = hasValidPayrollPayment ? String(g.payroll_payment_id) : null;

    stmt.run(
      String(g.id),
      tenantId,
      branchId,
      categoryId,
      cycleId,
      compraId,
      payrollPaymentId,
      expenseType,
      paymentMethod,
      amount,
      amountCents,
      description,
      supplier,
      notes,
      expenseDate,
      createdAt,
    );
  }
}

export function applyCloudCustomerRows(
  db: DatabaseSync,
  tenantId: string,
  customers: Array<Record<string, unknown>>,
): void {
  const stmt = db.prepare(`
    INSERT INTO customers (id, tenant_id, name, phone, email, document_id, address, notes, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      email = excluded.email,
      document_id = excluded.document_id,
      address = excluded.address,
      notes = excluded.notes,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
  `);
  for (const c of customers) {
    if (!c || typeof c !== "object" || !c.id || !c.name) continue;
    if (hasPendingCloudWrite(db, tenantId, "customers", String(c.id))) continue;
    stmt.run(
      String(c.id),
      tenantId,
      String(c.name),
      c.phone ? String(c.phone) : null,
      c.email ? String(c.email) : null,
      c.document_id ? String(c.document_id) : null,
      c.address ? String(c.address) : null,
      c.notes ? String(c.notes) : null,
      c.created_at ? String(c.created_at) : new Date().toISOString(),
      c.updated_at ? String(c.updated_at) : new Date().toISOString(),
      c.deleted_at ? String(c.deleted_at) : null,
    );
  }
}

/**
 * Applies cloud operational cycles into the local mirror, mapping the cloud shape
 * (efectivo_inicial, closed_at-derived open/closed state) onto the local columns
 * and preserving cycle_number/opened_at so analytics can group "por ciclo".
 */
export function applyCloudOperationalCycleRows(
  db: DatabaseSync,
  tenantId: string,
  cycles: Array<Record<string, unknown>>,
): void {
  const ensureBranch = db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)");
  const stmt = db.prepare(`
    INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, closed_at, cycle_number, opened_at, printed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sucursal_id = excluded.sucursal_id,
      business_day = excluded.business_day,
      opening_cash = excluded.opening_cash,
      state = excluded.state,
      closed_at = excluded.closed_at,
      cycle_number = excluded.cycle_number,
      opened_at = excluded.opened_at,
      printed_at = excluded.printed_at,
      created_at = excluded.created_at
  `);
  for (const c of cycles) {
    if (!c || typeof c !== "object" || !c.id || !c.business_day) continue;
    if (hasPendingCloudWrite(db, tenantId, "cierres_operativos", String(c.id))) continue;
    const sucursalId = c.sucursal_id ? String(c.sucursal_id) : null;
    if (sucursalId) ensureBranch.run(sucursalId, tenantId, "Principal");
    const closedAt = c.closed_at ? String(c.closed_at) : null;
    stmt.run(
      String(c.id),
      tenantId,
      sucursalId,
      String(c.business_day),
      Number(c.efectivo_inicial ?? 0),
      closedAt ? "closed" : "open",
      closedAt,
      c.cycle_number != null ? Number(c.cycle_number) : null,
      c.opened_at ? String(c.opened_at) : null,
      c.printed_at ? String(c.printed_at) : null,
      c.created_at ? String(c.created_at) : null,
    );
  }
}

/**
 * Applies cloud invoices into the local SQLite mirror. The cloud shape carries
 * the full invoice (line items as a JSONB array, fiscal fields, totals); we map
 * it onto the evolved local `facturas` columns so analytics and the invoice
 * list can read from SQLite. Pulled rows are always `committed`. A row with a
 * pending local write is skipped so an unsynced local edit is never clobbered.
 */
export function applyCloudFacturaRows(
  db: DatabaseSync,
  tenantId: string,
  facturas: Array<Record<string, unknown>>,
  defaultBranchId = "main-process-default",
): void {
  const ensureBranch = db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)");
  ensureBranch.run(defaultBranchId, tenantId, "Principal");
  const stmt = db.prepare(`
    INSERT INTO facturas (
      id, tenant_id, sucursal_id, fiscal_mode, total, local_status,
      numero_factura, mesa_numero, cliente_nombre, metodo_pago, estado,
      subtotal, itbis, propina, moneda, items, notas, ncf, ncf_tipo,
      cliente_rnc, customer_id, created_at, updated_at, pagada_at
    ) VALUES (?, ?, ?, ?, ?, 'committed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sucursal_id = excluded.sucursal_id,
      fiscal_mode = excluded.fiscal_mode,
      total = excluded.total,
      numero_factura = excluded.numero_factura,
      mesa_numero = excluded.mesa_numero,
      cliente_nombre = excluded.cliente_nombre,
      metodo_pago = excluded.metodo_pago,
      estado = excluded.estado,
      subtotal = excluded.subtotal,
      itbis = excluded.itbis,
      propina = excluded.propina,
      moneda = excluded.moneda,
      items = excluded.items,
      notas = excluded.notas,
      ncf = excluded.ncf,
      ncf_tipo = excluded.ncf_tipo,
      cliente_rnc = excluded.cliente_rnc,
      customer_id = excluded.customer_id,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      pagada_at = excluded.pagada_at
  `);
  const allowedFiscalModes = new Set(["internal_receipt", "ncf_legacy", "dgii_ecf"]);
  const str = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const s = String(value);
    return s.length > 0 ? s : null;
  };
  const int = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const real = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  for (const f of facturas) {
    if (!f || typeof f !== "object" || !f.id) continue;
    if (hasPendingCloudWrite(db, tenantId, "facturas", String(f.id))) continue;
    const branchId = typeof f.sucursal_id === "string" && f.sucursal_id.trim() ? f.sucursal_id.trim() : defaultBranchId;
    ensureBranch.run(branchId, tenantId, "Principal");

    const rawTotal = Number(f.total ?? 0);
    const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : 0;
    const fiscalMode = typeof f.fiscal_mode === "string" && allowedFiscalModes.has(f.fiscal_mode) ? f.fiscal_mode : "internal_receipt";
    const items = f.items == null ? null : (typeof f.items === "string" ? f.items : JSON.stringify(f.items));

    stmt.run(
      String(f.id),
      tenantId,
      branchId,
      fiscalMode,
      total,
      int(f.numero_factura),
      int(f.mesa_numero),
      str(f.cliente_nombre),
      str(f.metodo_pago),
      str(f.estado),
      real(f.subtotal),
      real(f.itbis),
      real(f.propina),
      str(f.moneda),
      items,
      str(f.notas),
      str(f.ncf),
      str(f.ncf_tipo),
      str(f.cliente_rnc),
      str(f.customer_id),
      str(f.created_at),
      str(f.updated_at),
      str(f.pagada_at),
    );
  }
}

/**
 * Applies cloud purchases into the local SQLite mirror. The local `compras` table
 * is a cash-only stub (payment_method CHECK = 'cash'); the real method/invoice/
 * date fields live in the columns added by `ensureComprasSchemaEvolution`, so the
 * legacy `payment_method` is pinned to 'cash' and the real method goes to
 * `metodo_pago`. Proveedor and sucursal FKs are ensured before insert. A row with
 * a pending local write is skipped so an unsynced local edit is never clobbered.
 */
export function applyCloudCompraRows(
  db: DatabaseSync,
  tenantId: string,
  compras: Array<Record<string, unknown>>,
  defaultBranchId = "main-process-default",
): void {
  const ensureBranch = db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)");
  const ensureProveedor = db.prepare("INSERT OR IGNORE INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)");
  ensureBranch.run(defaultBranchId, tenantId, "Principal");
  const stmt = db.prepare(`
    INSERT INTO compras (
      id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status,
      numero_factura, tipo_pago, metodo_pago, monto_pagado, fecha_compra, cycle_id, estado, observacion, usuario_id
    ) VALUES (?, ?, ?, ?, 'cash', ?, 'committed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sucursal_id = excluded.sucursal_id,
      proveedor_id = excluded.proveedor_id,
      total = excluded.total,
      numero_factura = excluded.numero_factura,
      tipo_pago = excluded.tipo_pago,
      metodo_pago = excluded.metodo_pago,
      monto_pagado = excluded.monto_pagado,
      fecha_compra = excluded.fecha_compra,
      cycle_id = excluded.cycle_id,
      estado = excluded.estado,
      observacion = excluded.observacion,
      usuario_id = excluded.usuario_id
  `);
  const str = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const s = String(value);
    return s.length > 0 ? s : null;
  };
  const real = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  for (const c of compras) {
    if (!c || typeof c !== "object" || !c.id) continue;
    if (hasPendingCloudWrite(db, tenantId, "compras", String(c.id))) continue;
    const branchId = typeof c.sucursal_id === "string" && c.sucursal_id.trim() ? c.sucursal_id.trim() : defaultBranchId;
    ensureBranch.run(branchId, tenantId, "Principal");
    const proveedorId = typeof c.proveedor_id === "string" && c.proveedor_id.trim() ? c.proveedor_id.trim() : null;
    if (!proveedorId) continue; // proveedor_id is NOT NULL locally; skip malformed rows.
    ensureProveedor.run(proveedorId, tenantId, "Proveedor");

    const rawTotal = Number(c.total ?? 0);
    const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : 0;

    stmt.run(
      String(c.id),
      tenantId,
      branchId,
      proveedorId,
      total,
      str(c.numero_factura),
      str(c.tipo_pago),
      str(c.metodo_pago),
      real(c.monto_pagado),
      str(c.fecha_compra),
      str(c.cycle_id),
      str(c.estado),
      str(c.observacion),
      str(c.usuario_id),
    );
  }
}

/**
 * Cloud receivables/payables carry `monto_pagado` and a feminine `estado`
 * (pagada/vencida); the local STRICT tables store `monto_pendiente` and a
 * masculine `estado` (CHECK pendiente/parcial/pagado/vencido). This maps the
 * cloud estado onto the local domain, deriving from the amounts when the cloud
 * value is absent or unrecognized so the CHECK never rejects a pulled row.
 */
function mapCuentaEstadoToLocal(cloudEstado: unknown, montoTotal: number, montoPendiente: number): string {
  const e = String(cloudEstado ?? "").toLowerCase();
  if (e === "pagada" || e === "pagado") return "pagado";
  if (e === "vencida" || e === "vencido") return "vencido";
  if (e === "parcial") return "parcial";
  if (e === "pendiente") return "pendiente";
  if (montoPendiente <= 0 && montoTotal > 0) return "pagado";
  if (montoPendiente < montoTotal) return "parcial";
  return "pendiente";
}

function cloudAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Applies cloud accounts receivable into the local mirror (monto_pagado→monto_pendiente). */
export function applyCloudReceivableRows(
  db: DatabaseSync,
  tenantId: string,
  rows: Array<Record<string, unknown>>,
  defaultBranchId = "main-process-default",
): void {
  const ensureBranch = db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)");
  const ensureCustomer = db.prepare("INSERT OR IGNORE INTO customers (id, tenant_id, name) VALUES (?, ?, 'Cliente')");
  const facturaExists = db.prepare("SELECT 1 FROM facturas WHERE id = ? AND tenant_id = ?");
  ensureBranch.run(defaultBranchId, tenantId, "Principal");
  const stmt = db.prepare(`
    INSERT INTO cuentas_cobrar (id, tenant_id, sucursal_id, factura_id, customer_id, monto_total, monto_pendiente, estado, fecha_vencimiento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sucursal_id = excluded.sucursal_id,
      factura_id = excluded.factura_id,
      customer_id = excluded.customer_id,
      monto_total = excluded.monto_total,
      monto_pendiente = excluded.monto_pendiente,
      estado = excluded.estado,
      fecha_vencimiento = excluded.fecha_vencimiento
  `);
  for (const c of rows) {
    if (!c || typeof c !== "object" || !c.id || !c.customer_id) continue;
    if (hasPendingCloudWrite(db, tenantId, "cuentas_cobrar", String(c.id))) continue;
    const branchId = typeof c.sucursal_id === "string" && c.sucursal_id.trim() ? c.sucursal_id.trim() : defaultBranchId;
    ensureBranch.run(branchId, tenantId, "Principal");
    ensureCustomer.run(String(c.customer_id), tenantId);
    const montoTotal = cloudAmount(c.monto_total);
    const montoPendiente = Math.max(0, montoTotal - cloudAmount(c.monto_pagado));
    const facturaId = c.factura_id && facturaExists.get(String(c.factura_id), tenantId) ? String(c.factura_id) : null;
    stmt.run(
      String(c.id),
      tenantId,
      branchId,
      facturaId,
      String(c.customer_id),
      montoTotal,
      montoPendiente,
      mapCuentaEstadoToLocal(c.estado, montoTotal, montoPendiente),
      c.fecha_vencimiento ? String(c.fecha_vencimiento) : null,
    );
  }
}

/** Applies cloud accounts payable into the local mirror (monto_pagado→monto_pendiente). */
export function applyCloudPayableRows(
  db: DatabaseSync,
  tenantId: string,
  rows: Array<Record<string, unknown>>,
  defaultBranchId = "main-process-default",
): void {
  const ensureBranch = db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)");
  const ensureProveedor = db.prepare("INSERT OR IGNORE INTO proveedores (id, tenant_id, name) VALUES (?, ?, 'Proveedor')");
  const compraExists = db.prepare("SELECT 1 FROM compras WHERE id = ? AND tenant_id = ?");
  ensureBranch.run(defaultBranchId, tenantId, "Principal");
  const stmt = db.prepare(`
    INSERT INTO cuentas_pagar (id, tenant_id, sucursal_id, compra_id, proveedor_id, monto_total, monto_pendiente, estado, fecha_vencimiento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sucursal_id = excluded.sucursal_id,
      compra_id = excluded.compra_id,
      proveedor_id = excluded.proveedor_id,
      monto_total = excluded.monto_total,
      monto_pendiente = excluded.monto_pendiente,
      estado = excluded.estado,
      fecha_vencimiento = excluded.fecha_vencimiento
  `);
  for (const c of rows) {
    if (!c || typeof c !== "object" || !c.id || !c.proveedor_id) continue;
    if (hasPendingCloudWrite(db, tenantId, "cuentas_pagar", String(c.id))) continue;
    const branchId = typeof c.sucursal_id === "string" && c.sucursal_id.trim() ? c.sucursal_id.trim() : defaultBranchId;
    ensureBranch.run(branchId, tenantId, "Principal");
    ensureProveedor.run(String(c.proveedor_id), tenantId);
    const montoTotal = cloudAmount(c.monto_total);
    const montoPendiente = Math.max(0, montoTotal - cloudAmount(c.monto_pagado));
    const compraId = c.compra_id && compraExists.get(String(c.compra_id), tenantId) ? String(c.compra_id) : null;
    stmt.run(
      String(c.id),
      tenantId,
      branchId,
      compraId,
      String(c.proveedor_id),
      montoTotal,
      montoPendiente,
      mapCuentaEstadoToLocal(c.estado, montoTotal, montoPendiente),
      c.fecha_vencimiento ? String(c.fecha_vencimiento) : null,
    );
  }
}

/** Applies cloud receivable payments; skips a payment whose parent account is not local yet. */
export function applyCloudCxcPagoRows(
  db: DatabaseSync,
  tenantId: string,
  rows: Array<Record<string, unknown>>,
  defaultBranchId = "main-process-default",
): void {
  applyCloudPagoRows(db, tenantId, rows, "cxc_pagos", "cuenta_cobrar_id", "cuentas_cobrar", defaultBranchId);
}

/** Applies cloud payable payments; skips a payment whose parent account is not local yet. */
export function applyCloudCxpPagoRows(
  db: DatabaseSync,
  tenantId: string,
  rows: Array<Record<string, unknown>>,
  defaultBranchId = "main-process-default",
): void {
  applyCloudPagoRows(db, tenantId, rows, "cxp_pagos", "cuenta_pagar_id", "cuentas_pagar", defaultBranchId);
}

function applyCloudPagoRows(
  db: DatabaseSync,
  tenantId: string,
  rows: Array<Record<string, unknown>>,
  table: "cxc_pagos" | "cxp_pagos",
  parentColumn: "cuenta_cobrar_id" | "cuenta_pagar_id",
  parentTable: "cuentas_cobrar" | "cuentas_pagar",
  defaultBranchId: string,
): void {
  const ensureBranch = db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)");
  ensureBranch.run(defaultBranchId, tenantId, "Principal");
  const parentExists = db.prepare(`SELECT 1 FROM ${parentTable} WHERE id = ? AND tenant_id = ?`);
  const stmt = db.prepare(`
    INSERT INTO ${table} (id, tenant_id, sucursal_id, ${parentColumn}, monto, metodo_pago, fecha_pago)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sucursal_id = excluded.sucursal_id,
      ${parentColumn} = excluded.${parentColumn},
      monto = excluded.monto,
      metodo_pago = excluded.metodo_pago,
      fecha_pago = excluded.fecha_pago
  `);
  for (const p of rows) {
    if (!p || typeof p !== "object" || !p.id || !p[parentColumn]) continue;
    if (hasPendingCloudWrite(db, tenantId, table, String(p.id))) continue;
    const parentId = String(p[parentColumn]);
    // A payment whose account has not been pulled yet would violate the FK.
    if (!parentExists.get(parentId, tenantId)) continue;
    const monto = Number(p.monto);
    if (!Number.isFinite(monto) || monto <= 0) continue;
    const branchId = typeof p.sucursal_id === "string" && p.sucursal_id.trim() ? p.sucursal_id.trim() : defaultBranchId;
    ensureBranch.run(branchId, tenantId, "Principal");
    stmt.run(
      String(p.id),
      tenantId,
      branchId,
      parentId,
      monto,
      typeof p.metodo_pago === "string" && p.metodo_pago ? p.metodo_pago : "efectivo",
      p.fecha_pago ? String(p.fecha_pago) : new Date().toISOString(),
    );
  }
}

function hasPendingCloudWrite(db: DatabaseSync, tenantId: string, table: string, id: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sync_outbox WHERE tenant_id=? AND table_name=? AND row_id=? LIMIT 1")
    .get(tenantId, table, id));
}

/** Deletes rows by id from a known synced table (used for cloud tombstones). */
export function applyCloudDeletes(
  db: DatabaseSync,
  tableName: string,
  ids: string[],
  tenantId?: string,
): boolean {
  if (ids.length === 0) return true;
  const allowed = new Set(["gastos", "gasto_categorias", "customers", "payroll_employees", "payroll_payments", "payroll_cloud_adjustments"]);
  if (!allowed.has(tableName)) return false;
  const stmt = db.prepare(`DELETE FROM ${tableName} WHERE id = ?${tenantId ? " AND tenant_id = ?" : ""}`);
  let complete = true;
  for (const id of ids) {
    if (tableName === "payroll_payments") {
      // A retained expense may still be pending locally; keep its parent.
      if (db.prepare("SELECT 1 FROM gastos WHERE payroll_payment_id=?").get(id)) { complete = false; continue; }
      if (db.prepare(`SELECT 1 FROM payroll_payment_adjustments a JOIN sync_outbox o
        ON o.row_id=a.id AND o.tenant_id=a.tenant_id AND o.table_name='payroll_payment_adjustments'
        WHERE a.payment_id=? LIMIT 1`).get(id)) { complete = false; continue; }
      db.prepare("DELETE FROM payroll_payment_adjustments WHERE payment_id=?").run(id);
    }
    if (tableName === "payroll_employees" && db.prepare("SELECT 1 FROM payroll_payments WHERE employee_id=?").get(id)) { complete = false; continue; }
    if (tableName === "gasto_categorias" && db.prepare("SELECT 1 FROM gastos WHERE category_id=?").get(id)) { complete = false; continue; }
    if (tableName === "customers" && db.prepare("SELECT 1 FROM cuentas_cobrar WHERE customer_id=?").get(id)) { complete = false; continue; }
    if (tableName === "payroll_cloud_adjustments") {
      if (tenantId) db.prepare("DELETE FROM payroll_payment_adjustments WHERE id=? AND tenant_id=?").run(id, tenantId);
    }
    if (tenantId) stmt.run(id, tenantId); else stmt.run(id);
  }
  return complete;
}
