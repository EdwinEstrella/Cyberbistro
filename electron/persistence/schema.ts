import type { DatabaseSync } from "node:sqlite";

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
      name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS platos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      category_id TEXT NOT NULL REFERENCES menu_categories(id),
      name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS productos_inventario (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS recetas (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      plato_id TEXT NOT NULL REFERENCES platos(id),
      inventory_product_id TEXT NOT NULL REFERENCES productos_inventario(id),
      quantity REAL NOT NULL CHECK (quantity > 0)
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
      mesa_id TEXT NOT NULL REFERENCES mesas_estado(id),
      mesa_numero INTEGER NOT NULL CHECK (mesa_numero > 0),
      state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS consumos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      comanda_id TEXT NOT NULL REFERENCES comandas(id),
      plato_id TEXT NOT NULL REFERENCES platos(id),
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
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      business_day TEXT NOT NULL,
      opening_cash REAL NOT NULL CHECK (opening_cash >= 0),
      state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
      closed_at TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS facturas (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      fiscal_mode TEXT NOT NULL CHECK (fiscal_mode IN ('internal_receipt', 'ncf_legacy', 'dgii_ecf')),
      total REAL NOT NULL CHECK (total >= 0),
      local_status TEXT NOT NULL CHECK (local_status IN ('committed', 'pending_sync'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS ecf_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      factura_id TEXT NOT NULL UNIQUE REFERENCES facturas(id),
      document_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending_sync', 'pending_processing'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS fiscal_outbox (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      factura_id TEXT NOT NULL REFERENCES facturas(id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'syncing'))
    ) STRICT;
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
    CREATE TABLE IF NOT EXISTS digital_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      customer_name TEXT,
      total REAL NOT NULL CHECK (total >= 0),
      status TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS digital_order_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      order_id TEXT NOT NULL REFERENCES digital_orders(id),
      plato_id TEXT NOT NULL REFERENCES platos(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      subtotal REAL NOT NULL CHECK (subtotal >= 0)
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
  `);
  migrateLegacyPayrollSchema(database);
  ensureSyncOutboxSchemaEvolution(database);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_payroll_payments_employee_period ON payroll_payments (tenant_id, sucursal_id, employee_id, period);
    CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_payment ON payroll_payment_adjustments (payment_id);
    CREATE INDEX IF NOT EXISTS idx_gastos_payroll_payment ON gastos (payroll_payment_id);
  `);
  database.exec("UPDATE sync_outbox SET status = 'pending' WHERE status = 'syncing';");
}

function ensureSyncOutboxSchemaEvolution(database: DatabaseSync): void {
  const columns = getTableColumns(database, "sync_outbox");
  if (!columns.includes("error_json")) {
    database.exec("ALTER TABLE sync_outbox ADD COLUMN error_json TEXT;");
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
    database.exec("PRAGMA foreign_keys = ON;");
  }
}
