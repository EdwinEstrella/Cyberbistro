import type { DatabaseSync } from "node:sqlite";

// Retired table kept inert so existing local databases don't throw migration errors
const NCF_LOCAL_SEQUENCES_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS ncf_local_sequences (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    tipo_codigo TEXT NOT NULL,
    next_sequence INTEGER NOT NULL CHECK (next_sequence > 0),
    cloud_next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (cloud_next_sequence > 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, tipo_codigo)
  ) STRICT;
`;

/**
 * Local e-CF status vocabularies. They are the union of what checkout writes today
 * (fiscalEngine), the legacy local values, the cloud vocabulary
 * (supabase/migrations/20260611220000_create-ecf-batches.sql) and the states local
 * signing will add. Shared by the schema CHECKs and the tests.
 */
// Client-side states only: what checkout writes today plus local signing. DGII outcomes (submitted, accepted,
// rejected, ...) are server-owned (docs/fiscal-status-truths.md) and must never be representable locally.
// Note: 'queued' locally means "replicated to the server outbox" (see docs/fiscal-status-truths.md); it is not a DGII outcome.
export const ECF_DOCUMENT_STATUSES = [
  "pending_offline", "pending_configuration", "pending_sync", "pending_processing", "signed", "queued",
] as const;
export const FISCAL_OUTBOX_STATUSES = [
  "pending", "syncing", "pending_sync", "blocked_configuration", "queued",
] as const;

const sqlList = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(", ");
const ECF_DOCUMENT_STATUS_CHECK = `CHECK (status IN (${sqlList(ECF_DOCUMENT_STATUSES)}))`;
const FISCAL_OUTBOX_STATUS_CHECK = `CHECK (status IN (${sqlList(FISCAL_OUTBOX_STATUSES)}))`;

const ECF_DOCUMENTS_CREATE_BODY = (tableName: string): string => `
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      factura_id TEXT NOT NULL UNIQUE REFERENCES facturas(id),
      document_type TEXT NOT NULL,
      status TEXT NOT NULL ${ECF_DOCUMENT_STATUS_CHECK},
      certificate_metadata_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      signed_xml TEXT,
      xml_hash TEXT,
      dgii_security_code TEXT,
      signed_at TEXT,
      signed_by_device TEXT
    ) STRICT;`;
const FISCAL_OUTBOX_CREATE_BODY = (tableName: string): string => `
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      factura_id TEXT NOT NULL REFERENCES facturas(id),
      ecf_document_id TEXT,
      operation TEXT,
      status TEXT NOT NULL ${FISCAL_OUTBOX_STATUS_CHECK},
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      idempotency_key TEXT,
      created_at TEXT,
      updated_at TEXT
    ) STRICT;`;

export function initializeTenantSchema(database: DatabaseSync, tenantId: string): void {
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS tenant_identity (
      id TEXT PRIMARY KEY CHECK (id = '${tenantId.replace(/'/g, "''")}')
    ) STRICT;
    INSERT OR IGNORE INTO tenant_identity (id) VALUES ('${tenantId.replace(/'/g, "''")}');
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY REFERENCES tenant_identity(id)
    ) STRICT;
    INSERT OR IGNORE INTO tenants (id) VALUES ('${tenantId.replace(/'/g, "''")}');
    CREATE TABLE IF NOT EXISTS sucursales (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      document_id TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS proveedores (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      nombre TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER,
      sucursal_id TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS platos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT,
      nombre TEXT NOT NULL,
      precio REAL,
      categoria TEXT,
      disponible INTEGER,
      va_a_cocina INTEGER,
      is_extra INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS productos_inventario (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      sucursal_id TEXT,
      nombre TEXT,
      categoria TEXT,
      unidad_base TEXT,
      unidad_compra TEXT,
      contenido_por_unidad_compra REAL,
      stock_actual REAL NOT NULL DEFAULT 0,
      stock_minimo REAL NOT NULL DEFAULT 0,
      costo_promedio REAL NOT NULL DEFAULT 0,
      costo_unidad_compra REAL,
      activo INTEGER,
      created_at TEXT,
      updated_at TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS recetas (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      plato_id TEXT NOT NULL REFERENCES platos(id),
      inventory_product_id TEXT NOT NULL REFERENCES productos_inventario(id),
      quantity REAL NOT NULL CHECK (quantity > 0),
      sucursal_id TEXT,
      insumo_id TEXT,
      cantidad REAL,
      created_at TEXT,
      updated_at TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS foundation_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant_identity(id),
      value TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant_identity(id),
      branch_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'syncing'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS mesas_estado (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      table_number INTEGER NOT NULL CHECK (table_number > 0),
      state TEXT NOT NULL CHECK (state IN ('free', 'occupied')),
      UNIQUE (tenant_id, sucursal_id, table_number)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cocina_estado (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      is_open INTEGER NOT NULL CHECK (is_open IN (0, 1))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS comandas (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      mesa_id TEXT REFERENCES mesas_estado(id),
      mesa_numero INTEGER CHECK (mesa_numero > 0),
      state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS consumos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      comanda_id TEXT REFERENCES comandas(id),
      plato_id TEXT,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      subtotal REAL NOT NULL CHECK (subtotal >= 0),
      state TEXT NOT NULL CHECK (state IN ('sent_to_kitchen', 'ready', 'delivered'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS produccion_cocina (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      comanda_id TEXT NOT NULL REFERENCES comandas(id),
      state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cierres_operativos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT REFERENCES sucursales(id),
      business_day TEXT NOT NULL,
      opening_cash REAL NOT NULL CHECK (opening_cash >= 0),
      state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
      closed_at TEXT,
      cycle_number INTEGER,
      opened_at TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS facturas (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      fiscal_mode TEXT NOT NULL CHECK (fiscal_mode IN ('internal_receipt', 'ncf_legacy', 'dgii_ecf')),
      total REAL NOT NULL CHECK (total >= 0),
      local_status TEXT NOT NULL CHECK (local_status IN ('committed', 'pending_sync'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS invoice_number_counters (
      tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
      next_number INTEGER NOT NULL CHECK (next_number > 0)
    ) STRICT;
    ${ECF_DOCUMENTS_CREATE_BODY("IF NOT EXISTS ecf_documents")}
    ${FISCAL_OUTBOX_CREATE_BODY("IF NOT EXISTS fiscal_outbox")}
    CREATE TABLE IF NOT EXISTS ecf_sequence_allocations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
       document_type TEXT NOT NULL,
       sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
       status TEXT NOT NULL CHECK (status IN ('allocating', 'reserved')),
       allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE (tenant_id, sucursal_id, document_type, sequence_number)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS compras (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      proveedor_id TEXT NOT NULL REFERENCES proveedores(id),
      payment_method TEXT NOT NULL CHECK (payment_method = 'cash'),
      total REAL NOT NULL CHECK (total >= 0),
      local_status TEXT NOT NULL CHECK (local_status IN ('committed', 'pending_sync')),
      UNIQUE (id, tenant_id, sucursal_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS detalles_compra (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      compra_id TEXT NOT NULL REFERENCES compras(id),
      inventory_product_id TEXT NOT NULL REFERENCES productos_inventario(id),
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
      subtotal REAL NOT NULL CHECK (subtotal >= 0)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      compra_id TEXT NOT NULL REFERENCES compras(id),
      inventory_product_id TEXT NOT NULL REFERENCES productos_inventario(id),
      movement_type TEXT NOT NULL CHECK (movement_type = 'purchase_receipt'),
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
      FOREIGN KEY (compra_id, tenant_id, sucursal_id) REFERENCES compras (id, tenant_id, sucursal_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS inventario_movimientos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      producto_id TEXT NOT NULL REFERENCES productos_inventario(id),
      tipo TEXT NOT NULL,
      cantidad REAL NOT NULL CHECK (cantidad > 0),
      stock_antes REAL NOT NULL,
      stock_despues REAL NOT NULL,
      costo_unitario REAL NOT NULL DEFAULT 0,
      motivo TEXT,
      referencia TEXT,
      fecha TEXT NOT NULL,
      usuario_id TEXT
    ) STRICT;
    -- Remote adjustments belong to employees, not payments. Keep their original
    -- contract instead of inventing a payment association during download.
    CREATE TABLE IF NOT EXISTS payroll_cloud_adjustments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      employee_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS payroll_employees (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL,
      base_salary_cents INTEGER NOT NULL CHECK (base_salary_cents >= 0),
      frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
      is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS payroll_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      employee_id TEXT NOT NULL REFERENCES payroll_employees(id),
      period TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
      base_salary_cents INTEGER NOT NULL CHECK (base_salary_cents >= 0),
      period_salary_cents INTEGER NOT NULL CHECK (period_salary_cents >= 0),
      adjustments_delta_cents INTEGER NOT NULL,
      total_due_cents INTEGER NOT NULL CHECK (total_due_cents >= 0),
      amount_paid_cents INTEGER NOT NULL CHECK (amount_paid_cents >= 0),
      pending_cents INTEGER NOT NULL CHECK (pending_cents >= 0),
      receipt_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS payroll_payment_adjustments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      payment_id TEXT NOT NULL REFERENCES payroll_payments(id),
      period TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('bonus', 'discount')),
      type TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('currentPayment', 'nextPayment')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      note TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS gasto_categorias (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#ff906d',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS gastos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      category_id TEXT REFERENCES gasto_categorias(id),
      cycle_id TEXT,
      compra_id TEXT UNIQUE REFERENCES compras(id),
      payroll_payment_id TEXT UNIQUE REFERENCES payroll_payments(id),
      expense_type TEXT NOT NULL DEFAULT 'operational',
      payment_method TEXT NOT NULL DEFAULT 'cash',
      amount REAL,
      amount_cents INTEGER,
      local_status TEXT NOT NULL DEFAULT 'committed' CHECK (local_status IN ('committed', 'pending_sync')),
      description TEXT,
      supplier TEXT,
      notes TEXT,
      expense_date TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      cxp_pago_id TEXT,
      CHECK (amount IS NULL OR amount >= 0),
      CHECK (amount_cents IS NULL OR amount_cents >= 0),
      FOREIGN KEY (compra_id, tenant_id, sucursal_id) REFERENCES compras (id, tenant_id, sucursal_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS tenant_users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      auth_user_id TEXT,
      role TEXT NOT NULL,
      nombre TEXT,
      pin TEXT,
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cuentas_pagar (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      compra_id TEXT REFERENCES compras(id),
      proveedor_id TEXT NOT NULL REFERENCES proveedores(id),
      monto_total REAL NOT NULL CHECK (monto_total >= 0),
      monto_pendiente REAL NOT NULL CHECK (monto_pendiente >= 0),
      estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'parcial', 'pagado', 'vencido')),
      fecha_vencimiento TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cxp_pagos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      cuenta_pagar_id TEXT NOT NULL REFERENCES cuentas_pagar(id),
      monto REAL NOT NULL CHECK (monto > 0),
      metodo_pago TEXT NOT NULL,
      fecha_pago TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cuentas_cobrar (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      factura_id TEXT REFERENCES facturas(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      monto_total REAL NOT NULL CHECK (monto_total >= 0),
      monto_pendiente REAL NOT NULL CHECK (monto_pendiente >= 0),
      estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'parcial', 'pagado', 'vencido')),
      fecha_vencimiento TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cxc_pagos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      cuenta_cobrar_id TEXT NOT NULL REFERENCES cuentas_cobrar(id),
      monto REAL NOT NULL CHECK (monto > 0),
      metodo_pago TEXT NOT NULL,
      fecha_pago TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS digital_menu_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
      settings_json TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS digital_menu_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      plato_id TEXT NOT NULL REFERENCES platos(id),
      is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
      price_override REAL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      table_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      cursor TEXT,
      completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
      row_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sync_errors (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      error_message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sync_pull_errors (
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      table_name TEXT NOT NULL,
      message TEXT NOT NULL,
      row_id TEXT,
      occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, table_name)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS local_device_session (
      tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
      session_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE TABLE IF NOT EXISTS local_license_cache (
      tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
      license_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_comandas_branch_state ON comandas (tenant_id, sucursal_id, state);
    CREATE INDEX IF NOT EXISTS idx_consumos_comanda ON consumos (comanda_id, state);
    CREATE INDEX IF NOT EXISTS idx_cierres_open ON cierres_operativos (tenant_id, sucursal_id, state);
    CREATE INDEX IF NOT EXISTS idx_facturas_tenant_branch ON facturas (tenant_id, sucursal_id);
    CREATE INDEX IF NOT EXISTS idx_ecf_documents_pending ON ecf_documents (tenant_id, sucursal_id, status);
    CREATE INDEX IF NOT EXISTS idx_fiscal_outbox_pending ON fiscal_outbox (tenant_id, sucursal_id, status);
    CREATE INDEX IF NOT EXISTS idx_compras_tenant_branch ON compras (tenant_id, sucursal_id);
    CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_purchase ON movimientos_inventario (compra_id, inventory_product_id);
    CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_proveedor ON cuentas_pagar (tenant_id, sucursal_id, proveedor_id, estado);
    CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_customer ON cuentas_cobrar (tenant_id, sucursal_id, customer_id, estado);
    CREATE INDEX IF NOT EXISTS idx_cxp_pagos_cuenta ON cxp_pagos (cuenta_pagar_id);
    CREATE INDEX IF NOT EXISTS idx_cxc_pagos_cuenta ON cxc_pagos (cuenta_cobrar_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_payments_employee_period ON payroll_payments (tenant_id, sucursal_id, employee_id, period);
    CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_payment ON payroll_payment_adjustments (payment_id);
    CREATE INDEX IF NOT EXISTS idx_gastos_payroll_payment ON gastos (payroll_payment_id);
    CREATE INDEX IF NOT EXISTS idx_ecf_documents_pending ON ecf_documents (tenant_id, sucursal_id, status);
    CREATE INDEX IF NOT EXISTS idx_fiscal_outbox_pending ON fiscal_outbox (tenant_id, sucursal_id, status);
  `);
  repairDanglingLegacyMigrationReferences(database);
  migrateLegacyPayrollSchema(database);
  ensureSyncOutboxSchemaEvolution(database);
  ensureFacturasSchemaEvolution(database);
  ensureCierresSchemaEvolution(database);
  ensureComprasSchemaEvolution(database);
  ensureCompraFiscalTable(database);
  ensureSucursalesSchemaEvolution(database);
  ensureTenantsSchemaEvolution(database);
  database.exec(NCF_LOCAL_SEQUENCES_CREATE_SQL);
  ensureReceivablesSchemaEvolution(database);
  ensurePayablesSchemaEvolution(database);
  ensureSalonCocinaSchemaEvolution(database);
  ensureInventorySchemaEvolution(database);
  ensurePlatosSchemaEvolution(database);
  ensureFiscalCheckoutSchemaEvolution(database);
  ensureEcfDocumentsSchemaEvolution(database);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_payroll_payments_employee_period ON payroll_payments (tenant_id, sucursal_id, employee_id, period);
    CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_payment ON payroll_payment_adjustments (payment_id);
    CREATE INDEX IF NOT EXISTS idx_gastos_payroll_payment ON gastos (payroll_payment_id);
  `);
  database.exec("UPDATE sync_outbox SET status = 'pending' WHERE status = 'syncing';");
}

function ensurePlatosSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "platos");
  if (columns.length > 0 && !columns.includes("is_extra")) {
    database.exec("ALTER TABLE platos ADD COLUMN is_extra INTEGER NOT NULL DEFAULT 0;");
  }
}

function ensureInventorySchemaEvolution(database: DatabaseSync): void {
  const productColumns = getTableColumns(database, "productos_inventario");
  const productAdditions = [
    ["sucursal_id", "TEXT"], ["nombre", "TEXT"], ["categoria", "TEXT"],
    ["unidad_base", "TEXT"], ["unidad_compra", "TEXT"], ["contenido_por_unidad_compra", "REAL"],
    ["stock_actual", "REAL NOT NULL DEFAULT 0"], ["stock_minimo", "REAL NOT NULL DEFAULT 0"],
    ["costo_promedio", "REAL NOT NULL DEFAULT 0"], ["costo_unidad_compra", "REAL"],
    ["activo", "INTEGER"], ["created_at", "TEXT"], ["updated_at", "TEXT"],
  ] as const;
  for (const [column, definition] of productAdditions) {
    if (!productColumns.includes(column)) database.exec(`ALTER TABLE productos_inventario ADD COLUMN ${column} ${definition};`);
  }

  const recipeColumns = getTableColumns(database, "recetas");
  const recipeAdditions = [
    ["sucursal_id", "TEXT"], ["insumo_id", "TEXT"], ["cantidad", "REAL"],
    ["created_at", "TEXT"], ["updated_at", "TEXT"],
  ] as const;
  for (const [column, definition] of recipeAdditions) {
    if (!recipeColumns.includes(column)) database.exec(`ALTER TABLE recetas ADD COLUMN ${column} ${definition};`);
  }
}

/**
 * Rebuilds ecf_documents / fiscal_outbox when an existing desktop DB still has the
 * old narrow status CHECK or lacks the signed columns. Every column present in both
 * the old and new table is copied, so rows survive intact. Idempotent: a table whose
 * stored DDL already carries the current CHECK and columns is left untouched.
 */
function ensureFiscalCheckoutSchemaEvolution(database: DatabaseSync): void {
  rebuildFiscalTableIfStale(database, "ecf_documents", ECF_DOCUMENT_STATUS_CHECK, ["signed_xml", "xml_hash", "dgii_security_code", "signed_at", "signed_by_device", "certificate_metadata_id"], ECF_DOCUMENTS_CREATE_BODY);
  rebuildFiscalTableIfStale(database, "fiscal_outbox", FISCAL_OUTBOX_STATUS_CHECK, ["ecf_document_id", "operation"], FISCAL_OUTBOX_CREATE_BODY);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_ecf_documents_pending ON ecf_documents (tenant_id, sucursal_id, status);
    CREATE INDEX IF NOT EXISTS idx_fiscal_outbox_pending ON fiscal_outbox (tenant_id, sucursal_id, status);
  `);
}

/**
 * DGII processing outcomes (submitted/accepted/rejected) belong to separate
 * mirror columns rather than the local status CHECK (docs/fiscal-status-truths.md).
 * Added additively without table rebuild, mirroring ensureFacturasSchemaEvolution.
 */
function ensureEcfDocumentsSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "ecf_documents");
  if (columns.length === 0) return;
  const additions: ReadonlyArray<readonly [string, string]> = [
    ["dgii_status", "TEXT"],
    ["dgii_track_id", "TEXT"],
    ["dgii_status_message", "TEXT"],
    ["submitted_at", "TEXT"],
    ["accepted_at", "TEXT"],
    ["dgii_security_code", "TEXT"],
  ] as const;
  for (const [column, definition] of additions) {
    if (!columns.includes(column)) database.exec(`ALTER TABLE ecf_documents ADD COLUMN ${column} ${definition};`);
  }
}

function rebuildFiscalTableIfStale(
  database: DatabaseSync,
  tableName: string,
  statusCheck: string,
  requiredColumns: readonly string[],
  createBody: (tableName: string) => string,
): void {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { sql: string } | undefined;
  if (!row) return;
  const oldColumns = getTableColumns(database, tableName);
  const stale = !row.sql.includes(statusCheck) || requiredColumns.some((column) => !oldColumns.includes(column));
  if (!stale) return;
  const newColumns = columnsOfCreateBody(createBody(tableName));
  const shared = newColumns.filter((column) => oldColumns.includes(column)).join(", ");
  recreateTable(database, tableName, createBody(tableName), `INSERT INTO ${tableName} (${shared}) SELECT ${shared} FROM __old_table__;`);
}

function columnsOfCreateBody(sql: string): string[] {
  return sql.split("\n").map((line) => /^\s{6}(\w+)\s/.exec(line)?.[1]).filter((name): name is string => Boolean(name));
}

function ensureSyncOutboxSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "sync_outbox");
  if (!columns.includes("error_json")) {
    database.exec("ALTER TABLE sync_outbox ADD COLUMN error_json TEXT;");
  }
}

/**
 * The original SQLite `facturas` table was a skeleton (id, total, fiscal_mode)
 * sized only for the analytics aggregate. Cloud→SQLite pull and the local-first
 * invoice list need the full invoice shape, so these columns are added
 * additively (nullable) to existing local databases. Kept out of the STRICT
 * CREATE so no data-carrying rebuild is required, exactly like the sync_outbox
 * evolution above.
 */
function ensureFacturasSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "facturas");
  if (columns.length === 0) return;
  const additions: ReadonlyArray<readonly [string, string]> = [
    ["numero_factura", "INTEGER"],
    ["mesa_numero", "INTEGER"],
    ["cliente_nombre", "TEXT"],
    ["metodo_pago", "TEXT"],
    ["estado", "TEXT"],
    ["subtotal", "REAL"],
    ["itbis", "REAL"],
    ["propina", "REAL"],
    ["moneda", "TEXT"],
    ["items", "TEXT"],
    ["notas", "TEXT"],
    ["ncf", "TEXT"],
    ["ncf_tipo", "TEXT"],
    ["cliente_rnc", "TEXT"],
    ["customer_id", "TEXT"],
    ["created_at", "TEXT"],
    ["updated_at", "TEXT"],
    ["pagada_at", "TEXT"],
    // e-CF credit note (E34) reference, filled by the cloud issue RPC and pulled down.
    ["credit_note_of", "TEXT"],
    ["ref_ncf", "TEXT"],
    ["ref_fecha_emision", "TEXT"],
    ["ref_codigo_modificacion", "INTEGER"],
    ["ref_razon_modificacion", "TEXT"],
  ];
  for (const [name, type] of additions) {
    if (!columns.includes(name)) {
      database.exec(`ALTER TABLE facturas ADD COLUMN ${name} ${type};`);
    }
  }
}

/**
 * The cloud cierres carry `printed_at` and `created_at` that the cierre and
 * billing screens read; the local table gains them additively so the cutover to
 * SQLite reads lose no fields. (`efectivo_inicial` is exposed as an alias of the
 * existing `opening_cash` column at query time, so no column is needed for it.)
 */
function ensureCierresSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "cierres_operativos");
  if (columns.length === 0) return;
  for (const [name, type] of [["printed_at", "TEXT"], ["created_at", "TEXT"]] as const) {
    if (!columns.includes(name)) {
      database.exec(`ALTER TABLE cierres_operativos ADD COLUMN ${name} ${type};`);
    }
  }
}

/**
 * The original SQLite `compras` table was a cash-only stub (payment_method CHECK
 * = 'cash', no invoice/date/method fields). Cloud→SQLite pull needs the full
 * purchase shape, so these columns are added additively (nullable) to existing
 * databases — the same low-risk pattern as facturas. The legacy `payment_method`
 * column keeps its 'cash' CHECK; pulled rows set it to 'cash' and carry the real
 * method in the new `metodo_pago` column, so no data-carrying rebuild is needed.
 */
/**
 * The original `sucursales` table only held id/name (seeded as 'Principal').
 * Cloud branches now download into it, so the renderer can resolve its branch
 * with the cloud down. Added additively (valid under STRICT); `cloud_synced`
 * marks rows that came from the cloud so seeded placeholders stay hidden.
 */
/**
 * The original `tenants` table only held the id (FK root). The current tenant's
 * cloud row (billing, NCF sequences, receipt headers) now downloads into it so
 * the POS can bill and print with the cloud down. Settings live in a JSON
 * payload of whitelisted, non-secret columns: the cloud row is wide and evolves
 * often, and no SQL ever filters on those fields.
 */
function ensureTenantsSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "tenants");
  if (columns.length === 0) return;
  for (const [name, definition] of [
    ["settings_json", "TEXT"],
    ["cloud_synced", "INTEGER NOT NULL DEFAULT 0"],
    ["cloud_updated_at", "TEXT"],
  ] as const) {
    if (!columns.includes(name)) database.exec(`ALTER TABLE tenants ADD COLUMN ${name} ${definition};`);
  }
}

function ensureSucursalesSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "sucursales");
  if (columns.length === 0) return;
  for (const [name, definition] of [
    ["direccion", "TEXT"],
    ["telefono", "TEXT"],
    ["activa", "INTEGER NOT NULL DEFAULT 1"],
    ["cloud_synced", "INTEGER NOT NULL DEFAULT 0"],
  ] as const) {
    if (!columns.includes(name)) database.exec(`ALTER TABLE sucursales ADD COLUMN ${name} ${definition};`);
  }
}

/**
 * The original SQLite receivables tables were skeletons sized only for the
 * command path. Full local-first parity with the cloud/IndexedDB shape (and the
 * CXC/cierre UIs) needs the emission date and note on the debt, and the note,
 * operational cycle, and author on each payment. Added additively (nullable,
 * TEXT — valid under STRICT) so existing databases evolve without a rebuild.
 * `cycle_id` on payments is load-bearing: the cierre attributes cash CXC
 * collections to the open cycle by matching it.
 */
function ensureReceivablesSchemaEvolution(database: DatabaseSync): void {
  const cuentasCobrar = getTableColumns(database, "cuentas_cobrar");
  if (cuentasCobrar.length > 0) {
    for (const [name, type] of [["fecha_emision", "TEXT"], ["observacion", "TEXT"]] as const) {
      if (!cuentasCobrar.includes(name)) {
        database.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN ${name} ${type};`);
      }
    }
  }
  const cxcPagos = getTableColumns(database, "cxc_pagos");
  if (cxcPagos.length > 0) {
    for (const [name, type] of [["notas", "TEXT"], ["cycle_id", "TEXT"], ["created_by_auth_user_id", "TEXT"]] as const) {
      if (!cxcPagos.includes(name)) {
        database.exec(`ALTER TABLE cxc_pagos ADD COLUMN ${name} ${type};`);
      }
    }
  }
}

/** Payables mirror of ensureReceivablesSchemaEvolution (cuentas_pagar / cxp_pagos). */
function ensurePayablesSchemaEvolution(database: DatabaseSync): void {
  const cuentasPagar = getTableColumns(database, "cuentas_pagar");
  if (cuentasPagar.length > 0) {
    for (const [name, type] of [["fecha_emision", "TEXT"], ["observacion", "TEXT"]] as const) {
      if (!cuentasPagar.includes(name)) {
        database.exec(`ALTER TABLE cuentas_pagar ADD COLUMN ${name} ${type};`);
      }
    }
  }
  // Local-only link from a payable settlement to the expense it created, so a
  // voided payment can remove exactly its own expense. Never pushed to the cloud.
  const gastos = getTableColumns(database, "gastos");
  if (gastos.length > 0 && !gastos.includes("cxp_pago_id")) {
    database.exec("ALTER TABLE gastos ADD COLUMN cxp_pago_id TEXT;");
  }
  if (gastos.length > 0) {
    database.exec("CREATE INDEX IF NOT EXISTS idx_gastos_cxp_pago ON gastos (cxp_pago_id);");
  }
  const cxpPagos = getTableColumns(database, "cxp_pagos");
  if (cxpPagos.length > 0) {
    for (const [name, type] of [["notas", "TEXT"], ["cycle_id", "TEXT"], ["created_by_auth_user_id", "TEXT"]] as const) {
      if (!cxpPagos.includes(name)) {
        database.exec(`ALTER TABLE cxp_pagos ADD COLUMN ${name} ${type};`);
      }
    }
  }
}

/**
 * Local mirror of the fiscal (606) header for a purchase. Historically this
 * lived only in the cloud (pushed via sync_outbox at purchase.create) and was
 * never stored locally, so a SQLite-only fiscal edit had no local row to update.
 * The table is additive and idempotent; columns mirror the cloud `compra_fiscal`
 * table exactly so the pull applier and the outbox payload stay in lockstep.
 */
function ensureCompraFiscalTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS compra_fiscal (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      compra_id TEXT NOT NULL UNIQUE REFERENCES compras(id),
      rnc_cedula TEXT,
      tipo_identificacion TEXT,
      tipo_bien_servicio TEXT,
      ncf TEXT,
      ncf_modificado TEXT,
      fecha_comprobante TEXT,
      fecha_pago TEXT,
      monto_servicios REAL,
      monto_bienes REAL,
      total_facturado REAL,
      itbis_facturado REAL,
      itbis_retenido REAL,
      itbis_proporcionalidad REAL,
      itbis_costo REAL,
      itbis_adelantar REAL,
      itbis_percibido REAL,
      tipo_retencion_isr TEXT,
      retencion_isr REAL,
      isr_percibido REAL,
      impuesto_selectivo REAL,
      otros_impuestos REAL,
      propina_legal REAL,
      forma_pago TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_compra_fiscal_compra ON compra_fiscal (compra_id);
  `);
}

function ensureComprasSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "compras");
  if (columns.length === 0) return;
  const additions = [
    ["numero_factura", "TEXT"], ["tipo_pago", "TEXT"], ["metodo_pago", "TEXT"],
    ["monto_pagado", "REAL"], ["fecha_compra", "TEXT"], ["cycle_id", "TEXT"],
    ["estado", "TEXT"], ["observacion", "TEXT"], ["usuario_id", "TEXT"],
  ] as const;
  for (const [name, type] of additions) {
    if (!columns.includes(name)) {
      database.exec(`ALTER TABLE compras ADD COLUMN ${name} ${type};`);
    }
  }
}

export function repairDanglingLegacyMigrationReferences(database: DatabaseSync): void {
  const tablesToRepair = (database
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '%\\_\\_legacy\\_migration' ESCAPE '\\' AND sql LIKE '%__legacy_migration%'",
    )
    .all() as Array<{ name: string; sql: string }>).filter((row) => row.sql && row.sql.includes("__legacy_migration"));

  if (tablesToRepair.length === 0) return;

  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("PRAGMA legacy_alter_table = ON;");
  try {
    for (const { name: tableName, sql: originalSql } of tablesToRepair) {
      const fixedSql = originalSql.replace(/"?(\w+?)__legacy_migration"?/g, "$1");
      const capturedObjects = (database
        .prepare("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL")
        .all(tableName) as Array<{ sql: string }>).map((row) => row.sql);

      const columns = getTableColumns(database, tableName);
      const cols = columns.map((col) => `"${col}"`).join(", ");
      const tempTableName = `${tableName}__fk_repair`;

      database.exec("BEGIN IMMEDIATE;");
      try {
        database.exec(`ALTER TABLE "${tableName}" RENAME TO "${tempTableName}";`);
        database.exec(fixedSql);
        database.exec(`INSERT INTO "${tableName}" (${cols}) SELECT ${cols} FROM "${tempTableName}";`);
        database.exec(`DROP TABLE "${tempTableName}";`);
        for (const objectSql of capturedObjects) {
          database.exec(objectSql);
        }
        database.exec("COMMIT;");
      } catch (error) {
        database.exec("ROLLBACK;");
        throw error;
      }
    }
  } finally {
    database.exec("PRAGMA legacy_alter_table = OFF;");
    database.exec("PRAGMA foreign_keys = ON;");
  }
}

function migrateLegacyPayrollSchema(database: DatabaseSync): void {
  ensureTableShape(database, "payroll_employees", (columns) => columns.includes("base_salary_cents"), () => {
    recreateTable(database, "payroll_employees", `
      CREATE TABLE payroll_employees (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT NOT NULL,
        base_salary_cents INTEGER NOT NULL CHECK (base_salary_cents >= 0),
        frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
        is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
    `, `
      INSERT INTO payroll_employees (id, tenant_id, sucursal_id, first_name, last_name, role, base_salary_cents, frequency, is_active, created_at, updated_at)
      SELECT id, tenant_id, sucursal_id, first_name, last_name, role, CAST(ROUND(COALESCE(base_salary, 0) * 100) AS INTEGER), frequency, COALESCE(is_active, 1), CURRENT_TIMESTAMP, COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM __old_table__;
    `);
  });

  ensureTableShape(database, "payroll_payments", (columns) => columns.includes("amount_paid_cents"), () => {
    recreateTable(database, "payroll_payments", `
      CREATE TABLE payroll_payments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        employee_id TEXT NOT NULL REFERENCES payroll_employees(id),
        period TEXT NOT NULL,
        frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
        base_salary_cents INTEGER NOT NULL CHECK (base_salary_cents >= 0),
        period_salary_cents INTEGER NOT NULL CHECK (period_salary_cents >= 0),
        adjustments_delta_cents INTEGER NOT NULL,
        total_due_cents INTEGER NOT NULL CHECK (total_due_cents >= 0),
        amount_paid_cents INTEGER NOT NULL CHECK (amount_paid_cents >= 0),
        pending_cents INTEGER NOT NULL CHECK (pending_cents >= 0),
        receipt_snapshot TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
    `, `
      INSERT INTO payroll_payments (id, tenant_id, sucursal_id, employee_id, period, frequency, base_salary_cents, period_salary_cents, adjustments_delta_cents, total_due_cents, amount_paid_cents, pending_cents, receipt_snapshot, created_at)
      SELECT
        id,
        tenant_id,
        sucursal_id,
        employee_id,
        period,
        frequency,
        CAST(ROUND(COALESCE(base_amount, 0) * 100) AS INTEGER),
        CAST(ROUND(COALESCE(base_amount, 0) * 100) AS INTEGER),
        0,
        CAST(ROUND(COALESCE(base_amount, 0) * 100) AS INTEGER),
        CAST(ROUND(COALESCE(amount_paid, 0) * 100) AS INTEGER),
        CAST(ROUND(COALESCE(pending_amount, 0) * 100) AS INTEGER),
        receipt_snapshot,
        COALESCE(created_at, CURRENT_TIMESTAMP)
      FROM __old_table__;
    `);
  });

  ensureTableShape(database, "payroll_payment_adjustments", (columns) => columns.includes("amount_cents") && columns.includes("scope") && columns.includes("sucursal_id"), () => {
    recreateTable(database, "payroll_payment_adjustments", `
      CREATE TABLE payroll_payment_adjustments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        payment_id TEXT NOT NULL REFERENCES payroll_payments(id),
        period TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('bonus', 'discount')),
        type TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('currentPayment', 'nextPayment')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        note TEXT NOT NULL
      ) STRICT;
    `, `
      INSERT INTO payroll_payment_adjustments (id, tenant_id, sucursal_id, payment_id, period, kind, type, scope, amount_cents, note)
      SELECT
        a.id,
        a.tenant_id,
        p.sucursal_id,
        a.payment_id,
        p.period,
        CASE WHEN a.kind = 'deduction' THEN 'discount' ELSE a.kind END,
        a.type,
        CASE WHEN a.apply_mode = 'next_payment' THEN 'nextPayment' ELSE 'currentPayment' END,
        CAST(ROUND(COALESCE(a.amount, 0) * 100) AS INTEGER),
        COALESCE(a.note, '')
      FROM __old_table__ a
      JOIN payroll_payments p ON p.id = a.payment_id;
    `);
  });

  ensureTableShape(database, "customers", (columns) => columns.includes("phone") && columns.includes("document_id") && columns.includes("deleted_at"), () => {
    recreateTable(database, "customers", `
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        document_id TEXT,
        address TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      ) STRICT;
    `, `
      INSERT INTO customers (id, tenant_id, name, phone, email, document_id, address, notes, created_at, updated_at, deleted_at)
      SELECT id, tenant_id, name, NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'), NULL
      FROM __old_table__;
    `);
  });

  ensureTableShape(database, "gasto_categorias", (columns) => columns.includes("color") && columns.includes("active"), () => {
    recreateTable(database, "gasto_categorias", `
      CREATE TABLE gasto_categorias (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        name TEXT NOT NULL,
        description TEXT,
        color TEXT NOT NULL DEFAULT '#ff906d',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
      ) STRICT;
    `, `
      INSERT INTO gasto_categorias (id, tenant_id, name, description, color, active)
      SELECT id, tenant_id, name, NULL, '#ff906d', 1
      FROM __old_table__;
    `);
  });

  ensureTableShape(database, "gastos", (columns) => columns.includes("category_id") && columns.includes("cycle_id") && columns.includes("expense_date"), () => {
    recreateTable(database, "gastos", `
      CREATE TABLE gastos (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        category_id TEXT REFERENCES gasto_categorias(id),
        cycle_id TEXT,
        compra_id TEXT UNIQUE REFERENCES compras(id),
        payroll_payment_id TEXT UNIQUE REFERENCES payroll_payments(id),
        expense_type TEXT NOT NULL DEFAULT 'operational',
        payment_method TEXT NOT NULL DEFAULT 'cash',
        amount REAL,
        amount_cents INTEGER,
        local_status TEXT NOT NULL DEFAULT 'committed' CHECK (local_status IN ('committed', 'pending_sync')),
        description TEXT,
        supplier TEXT,
        notes TEXT,
        expense_date TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (amount IS NULL OR amount >= 0),
        CHECK (amount_cents IS NULL OR amount_cents >= 0),
        FOREIGN KEY (compra_id, tenant_id, sucursal_id) REFERENCES compras (id, tenant_id, sucursal_id)
      ) STRICT;
    `, `
      INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, payroll_payment_id, expense_type, payment_method, amount, amount_cents, local_status, description, expense_date, created_at)
      SELECT id, tenant_id, sucursal_id, compra_id, payroll_payment_id, expense_type, payment_method, amount, amount_cents, local_status, description, datetime('now'), datetime('now')
      FROM __old_table__;
    `);
  });

  // Cloud cierres_operativos rows carry cycle_number/opened_at and may have a null
  // sucursal_id; the local table gains those columns and a nullable branch so the
  // cloud→local pull can mirror cycles 1:1 for analytics grouping ("por ciclo").
  ensureTableShape(database, "cierres_operativos", (columns) => columns.includes("cycle_number") && columns.includes("opened_at"), () => {
    recreateTable(database, "cierres_operativos", `
      CREATE TABLE cierres_operativos (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT REFERENCES sucursales(id),
        business_day TEXT NOT NULL,
        opening_cash REAL NOT NULL CHECK (opening_cash >= 0),
        state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
        closed_at TEXT,
        cycle_number INTEGER,
        opened_at TEXT
      ) STRICT;
    `, `
      INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, closed_at)
      SELECT id, tenant_id, sucursal_id, business_day, opening_cash, state, closed_at
      FROM __old_table__;
    `);
  });

  // The original menu_categories/platos skeleton (id TEXT PK, name TEXT, platos
  // FK'd to a category id) predates the cloud→SQLite pull cutover. The cloud
  // shape carries menu_categories.nombre/color/sort_order/sucursal_id and
  // platos.nombre/precio/categoria (a category NAME string, not a FK) plus
  // disponible/va_a_cocina flags, so both tables are recreated into that shape.
  ensureTableShape(database, "menu_categories", (columns) => columns.includes("nombre") && columns.includes("color"), () => {
    recreateTable(database, "menu_categories", `
      CREATE TABLE menu_categories (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        nombre TEXT NOT NULL,
        color TEXT,
        sort_order INTEGER,
        sucursal_id TEXT
      ) STRICT;
    `, `
      INSERT INTO menu_categories (id, tenant_id, nombre)
      SELECT id, tenant_id, name FROM __old_table__;
    `);
  });

  ensureTableShape(database, "platos", (columns) => columns.includes("nombre") && columns.includes("precio"), () => {
    recreateTable(database, "platos", `
      CREATE TABLE platos (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT,
        nombre TEXT NOT NULL,
        precio REAL,
        categoria TEXT,
        disponible INTEGER,
        va_a_cocina INTEGER,
        created_at TEXT,
        updated_at TEXT,
        deleted_at TEXT
      ) STRICT;
    `, `
      INSERT INTO platos (id, tenant_id, nombre)
      SELECT id, tenant_id, name FROM __old_table__;
    `);
  });
}

function isColumnNullable(database: DatabaseSync, tableName: string, columnName: string): boolean {
  const info = database.prepare(`PRAGMA table_info(${tableName});`).all() as Array<{ name: string; notnull: number }>;
  const col = info.find((c) => c.name === columnName);
  return col ? col.notnull === 0 : true;
}

function ensureSalonCocinaSchemaEvolution(database: DatabaseSync): void {
  const comandaCols = getTableColumns(database, "comandas");
  if (comandaCols.length > 0 && !isColumnNullable(database, "comandas", "mesa_id")) {
    recreateTable(database, "comandas", `
      CREATE TABLE comandas (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        mesa_id TEXT REFERENCES mesas_estado(id),
        mesa_numero INTEGER CHECK (mesa_numero > 0),
        state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered'))
      ) STRICT;
    `, `
      INSERT INTO comandas (id, tenant_id, sucursal_id, mesa_id, mesa_numero, state)
      SELECT id, tenant_id, sucursal_id, mesa_id, mesa_numero, state
      FROM __old_table__;
    `);
  }

  const consumoCols = getTableColumns(database, "consumos");
  if (consumoCols.length > 0 && !isColumnNullable(database, "consumos", "comanda_id")) {
    recreateTable(database, "consumos", `
      CREATE TABLE consumos (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        comanda_id TEXT REFERENCES comandas(id),
        plato_id TEXT,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        subtotal REAL NOT NULL CHECK (subtotal >= 0),
        state TEXT NOT NULL
      ) STRICT;
    `, `
      INSERT INTO consumos (id, tenant_id, sucursal_id, comanda_id, plato_id, name, quantity, unit_price, subtotal, state)
      SELECT id, tenant_id, sucursal_id, comanda_id, plato_id, name, quantity, unit_price, subtotal, state
      FROM __old_table__;
    `);
  }

  const updatedComandaCols = getTableColumns(database, "comandas");
  if (updatedComandaCols.length > 0) {
    const comandaAdditions = [
      ["numero_comanda", "INTEGER"],
      ["estado", "TEXT"],
      ["items", "TEXT"],
      ["notas", "TEXT"],
      ["creado_por", "TEXT"],
      ["created_at", "TEXT"],
      ["updated_at", "TEXT"],
    ] as const;
    for (const [col, type] of comandaAdditions) {
      if (!updatedComandaCols.includes(col)) {
        database.exec(`ALTER TABLE comandas ADD COLUMN ${col} ${type};`);
      }
    }
  }

  const updatedConsumoCols = getTableColumns(database, "consumos");
  if (updatedConsumoCols.length > 0) {
    const consumoAdditions = [
      ["nombre", "TEXT"],
      ["cantidad", "INTEGER"],
      ["precio_unitario", "REAL"],
      ["tipo", "TEXT"],
      ["estado", "TEXT"],
      ["factura_id", "TEXT"],
      ["mesa_numero", "INTEGER"],
      ["created_by_auth_user_id", "TEXT"],
      ["created_at", "TEXT"],
      ["updated_at", "TEXT"],
    ] as const;
    for (const [col, type] of consumoAdditions) {
      if (!updatedConsumoCols.includes(col)) {
        database.exec(`ALTER TABLE consumos ADD COLUMN ${col} ${type};`);
      }
    }
  }

  const mesaCols = getTableColumns(database, "mesas_estado");
  if (mesaCols.length > 0) {
    const mesaAdditions = [
      ["created_at", "TEXT"],
      ["updated_at", "TEXT"],
    ] as const;
    for (const [col, type] of mesaAdditions) {
      if (!mesaCols.includes(col)) {
        database.exec(`ALTER TABLE mesas_estado ADD COLUMN ${col} ${type};`);
      }
    }
  }
}

function ensureTableShape(
  database: DatabaseSync,
  tableName: string,
  isValid: (columns: string[]) => boolean,
  migrate: () => void,
): void {
  const columns = getTableColumns(database, tableName);
  if (columns.length === 0 || isValid(columns)) return;
  migrate();
}

function getTableColumns(database: DatabaseSync, tableName: string): string[] {
  return (database.prepare(`PRAGMA table_info(${tableName});`).all() as Array<{ name: string }>).map((column) => column.name);
}

function recreateTable(database: DatabaseSync, tableName: string, createSql: string, copySql: string): void {
  const tempTableName = `${tableName}__legacy_migration`;
  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("PRAGMA legacy_alter_table = ON;");
  database.exec("BEGIN IMMEDIATE;");

  try {
    database.exec(`ALTER TABLE ${tableName} RENAME TO ${tempTableName};`);
    database.exec(createSql);
    database.exec(copySql.replace(/__old_table__/g, tempTableName));
    database.exec(`DROP TABLE ${tempTableName};`);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.exec("PRAGMA legacy_alter_table = OFF;");
    database.exec("PRAGMA foreign_keys = ON;");
  }
}
