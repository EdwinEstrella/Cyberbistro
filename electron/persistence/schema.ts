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
      name TEXT NOT NULL
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
    CREATE TABLE IF NOT EXISTS gastos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      compra_id TEXT NOT NULL UNIQUE REFERENCES compras(id),
      payment_method TEXT NOT NULL CHECK (payment_method = 'cash'),
      amount REAL NOT NULL CHECK (amount >= 0),
      local_status TEXT NOT NULL CHECK (local_status IN ('committed', 'pending_sync')),
      FOREIGN KEY (compra_id, tenant_id, sucursal_id) REFERENCES compras (id, tenant_id, sucursal_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_comandas_branch_state ON comandas (tenant_id, sucursal_id, state);
    CREATE INDEX IF NOT EXISTS idx_consumos_comanda ON consumos (comanda_id, state);
    CREATE INDEX IF NOT EXISTS idx_cierres_open ON cierres_operativos (tenant_id, sucursal_id, state);
    CREATE INDEX IF NOT EXISTS idx_facturas_tenant_branch ON facturas (tenant_id, sucursal_id);
    CREATE INDEX IF NOT EXISTS idx_ecf_documents_pending ON ecf_documents (tenant_id, sucursal_id, status);
    CREATE INDEX IF NOT EXISTS idx_fiscal_outbox_pending ON fiscal_outbox (tenant_id, sucursal_id, status);
    CREATE INDEX IF NOT EXISTS idx_compras_tenant_branch ON compras (tenant_id, sucursal_id);
    CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_purchase ON movimientos_inventario (compra_id, inventory_product_id);
  `);
  database.exec("UPDATE sync_outbox SET status = 'pending' WHERE status = 'syncing';");
}
