import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "./schema";
import { TenantSQLiteImporter, type LegacyImportChunk, type LegacyImportManifest } from "./importer";
import type { DesktopCommand, DesktopRepositoryStore } from "../../src/shared/lib/desktopRepository";
import type { CatalogCommand } from "../../src/shared/lib/catalogContracts";
import type { OrdersCommand } from "../../src/shared/lib/ordersContracts";
import type { SalesFiscalCommand, SalesFiscalRepositoryStore } from "./salesFiscalRepository";
import type { CashPurchaseCommand, CashPurchaseRepositoryStore } from "./cashPurchaseRepository";

export class TenantStore implements DesktopRepositoryStore, SalesFiscalRepositoryStore, CashPurchaseRepositoryStore {
  private constructor(
    private readonly database: DatabaseSync,
    private readonly databasePath: string,
    private readonly tenantId: string,
  ) {}

  static open(input: { dataRoot: string; tenantId: string }): TenantStore {
    const directory = join(input.dataRoot, "tenant-stores");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    new TenantSQLiteImporter({ dataRoot: input.dataRoot }).recoverInterruptedActivation(input.tenantId);
    const databasePath = join(directory, `${input.tenantId}.sqlite`);
    const database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true, defensive: true });
    chmodSync(databasePath, 0o600);
    initializeTenantSchema(database, input.tenantId);
    return new TenantStore(database, databasePath, input.tenantId);
  }

  getTenantId(): string { return this.tenantId; }
  getDatabasePath(): string { return this.databasePath; }
  getJournalMode(): string { return String(this.database.prepare("PRAGMA journal_mode;").get()?.journal_mode).toLowerCase(); }
  hasForeignKeysEnabled(): boolean { return this.database.prepare("PRAGMA foreign_keys;").get()?.foreign_keys === 1; }

  writeFoundationRecord(id: string, value: string): void {
    this.database.prepare("INSERT INTO foundation_records (id, tenant_id, value) VALUES (?, ?, ?)").run(id, this.tenantId, value);
  }

  readFoundationRecord(id: string): { id: string; value: string } | null {
    return (this.database.prepare("SELECT id, value FROM foundation_records WHERE id = ?").get(id) as { id: string; value: string } | undefined) ?? null;
  }

  readImportedRows(tableName: string): Array<{ id: string; tenantId: string; payload: Record<string, unknown> }> {
    const rows = this.database.prepare("SELECT row_id, tenant_id, payload_json FROM imported_rows WHERE table_name = ? ORDER BY row_id").all(tableName) as Array<{ row_id: string; tenant_id: string; payload_json: string }>;
    return rows.map((row) => ({ id: row.row_id, tenantId: row.tenant_id, payload: JSON.parse(row.payload_json) as Record<string, unknown> }));
  }

  readImportedOutbox(): Array<{ id: string; status: string }> {
    return this.database.prepare("SELECT id, status FROM imported_outbox ORDER BY id").all() as Array<{ id: string; status: string }>;
  }

  readLocalOutbox(): Array<{ id: string; tenantId: string; branchId: string; tableName: string; rowId: string; status: string }> {
    return this.database.prepare("SELECT id, tenant_id, branch_id, table_name, row_id, status FROM sync_outbox ORDER BY id").all().map((row) => {
      const value = row as { id: string; tenant_id: string; branch_id: string; table_name: string; row_id: string; status: string };
      return { id: value.id, tenantId: value.tenant_id, branchId: value.branch_id, tableName: value.table_name, rowId: value.row_id, status: value.status };
    });
  }

  readCatalogRows(tableName: "sucursales" | "customers" | "proveedores" | "menu_categories" | "platos" | "productos_inventario" | "recetas"): Array<Record<string, unknown>> {
    const queryByTable = {
      sucursales: "SELECT id, name FROM sucursales ORDER BY id",
      customers: "SELECT id, name FROM customers ORDER BY id",
      proveedores: "SELECT id, name FROM proveedores ORDER BY id",
      menu_categories: "SELECT id, name FROM menu_categories ORDER BY id",
      platos: "SELECT id, name, category_id AS categoryId FROM platos ORDER BY id",
      productos_inventario: "SELECT id, name, unit FROM productos_inventario ORDER BY id",
      recetas: "SELECT id, plato_id AS platoId, inventory_product_id AS inventoryProductId, quantity FROM recetas ORDER BY id",
    } as const;
    return this.database.prepare(queryByTable[tableName]).all() as Array<Record<string, unknown>>;
  }

  readOrderRows(tableName: "mesas_estado" | "comandas" | "consumos" | "cierres_operativos"): Array<Record<string, unknown>> {
    const queryByTable = {
      mesas_estado: "SELECT id, table_number AS tableNumber, state FROM mesas_estado ORDER BY id",
      comandas: "SELECT id, mesa_id AS tableId, mesa_numero AS tableNumber, state FROM comandas ORDER BY id",
      consumos: "SELECT id, comanda_id AS orderId, quantity, state, subtotal FROM consumos ORDER BY id",
      cierres_operativos: "SELECT id, business_day AS businessDay, opening_cash AS openingCash, state FROM cierres_operativos ORDER BY id",
    } as const;
    return this.database.prepare(queryByTable[tableName]).all() as Array<Record<string, unknown>>;
  }

  readSalesFiscalRows(): { invoices: Array<Record<string, unknown>>; intents: Array<Record<string, unknown>>; outbox: Array<Record<string, unknown>> } {
    return {
      invoices: this.database.prepare("SELECT id, fiscal_mode AS fiscalMode, total, local_status AS localStatus FROM facturas ORDER BY id").all() as Array<Record<string, unknown>>,
      intents: this.database.prepare("SELECT id, factura_id AS invoiceId, status FROM ecf_documents ORDER BY id").all() as Array<Record<string, unknown>>,
      outbox: this.database.prepare("SELECT id, factura_id AS invoiceId, status FROM fiscal_outbox ORDER BY id").all() as Array<Record<string, unknown>>,
    };
  }

  readCashPurchaseRows(): { purchases: Array<Record<string, unknown>>; details: Array<Record<string, unknown>>; movements: Array<Record<string, unknown>>; expenses: Array<Record<string, unknown>> } {
    return { purchases: this.database.prepare("SELECT id, total FROM compras ORDER BY id").all() as Array<Record<string, unknown>>, details: this.database.prepare("SELECT id, compra_id AS purchaseId, quantity, subtotal FROM detalles_compra ORDER BY id").all() as Array<Record<string, unknown>>, movements: this.database.prepare("SELECT id, compra_id AS purchaseId, quantity FROM movimientos_inventario ORDER BY id").all() as Array<Record<string, unknown>>, expenses: this.database.prepare("SELECT id, compra_id AS purchaseId, amount FROM gastos ORDER BY id").all() as Array<Record<string, unknown>> };
  }

  markOutboxSyncingForRecovery(rowId: string): void {
    this.database.prepare("UPDATE sync_outbox SET status = 'syncing' WHERE row_id = ?").run(rowId);
  }

  recoverStaleSyncingOperations(): void {
    this.database.prepare("UPDATE sync_outbox SET status = 'pending' WHERE status = 'syncing'").run();
  }

  getNetworkProbeCount(): number { return 0; }

  executeCatalogCommand(input: { command: CatalogCommand; commitId: string; branchId: string }): void {
    const definition = catalogDefinition(input.command, this.tenantId);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare(definition.sql).run(...definition.values);
      this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(input.commitId, this.tenantId, input.branchId, definition.tableName, input.command.id, "upsert", JSON.stringify(input.command), "pending");
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  executeDesktopCommand(input: { command: DesktopCommand; commitId: string; branchId: string }): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const { command } = input;
      this.database.prepare("INSERT INTO foundation_records (id, tenant_id, value) VALUES (?, ?, ?)").run(command.id, this.tenantId, command.value);
      this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(input.commitId, this.tenantId, input.branchId, "foundation_records", command.id, "upsert", JSON.stringify({ id: command.id, value: command.value }), "pending");
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  executeOrdersCommand(input: { command: OrdersCommand; commitId: string; branchId: string }): void {
    const { command, commitId, branchId } = input;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const outbox = (tableName: string, rowId: string, payload: unknown, suffix: string) => this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')").run(`${commitId}:${suffix}`, this.tenantId, branchId, tableName, rowId, JSON.stringify(payload));
      switch (command.type) {
        case "orders.table.set-state":
          this.database.prepare("INSERT INTO mesas_estado (id, tenant_id, sucursal_id, table_number, state) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET table_number = excluded.table_number, state = excluded.state").run(command.tableId, this.tenantId, branchId, command.tableNumber, command.state);
          outbox("mesas_estado", command.tableId, command, "table");
          break;
        case "orders.kitchen.set-open":
          this.database.prepare("INSERT INTO cocina_estado (id, tenant_id, sucursal_id, is_open) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET is_open = excluded.is_open").run(command.id, this.tenantId, branchId, Number(command.isOpen));
          outbox("cocina_estado", command.id, command, "kitchen");
          break;
        case "orders.order-to-kitchen": {
          const kitchen = this.database.prepare("SELECT is_open FROM cocina_estado WHERE tenant_id = ? AND sucursal_id = ? LIMIT 1").get(this.tenantId, branchId) as { is_open: number } | undefined;
          if (!kitchen?.is_open) throw new Error("Kitchen is closed");
          this.database.prepare("INSERT INTO comandas (id, tenant_id, sucursal_id, mesa_id, mesa_numero, state) VALUES (?, ?, ?, ?, ?, 'pending')").run(command.orderId, this.tenantId, branchId, command.tableId, command.tableNumber);
          this.database.prepare("INSERT INTO produccion_cocina (id, tenant_id, sucursal_id, comanda_id, state) VALUES (?, ?, ?, ?, 'pending')").run(command.orderId, this.tenantId, branchId, command.orderId);
          this.database.prepare("UPDATE mesas_estado SET state = 'occupied' WHERE id = ? AND tenant_id = ?").run(command.tableId, this.tenantId);
          for (const item of command.items) this.database.prepare("INSERT INTO consumos (id, tenant_id, sucursal_id, comanda_id, plato_id, name, quantity, unit_price, subtotal, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent_to_kitchen')").run(item.id, this.tenantId, branchId, command.orderId, item.productId, item.name, item.quantity, item.unitPrice, item.quantity * item.unitPrice);
          outbox("comandas", command.orderId, command, "order");
          break;
        }
        case "orders.kitchen.advance": {
          const current = this.database.prepare("SELECT state FROM comandas WHERE id = ? AND tenant_id = ?").get(command.orderId, this.tenantId) as { state: string } | undefined;
          const allowed = current?.state === "pending" ? "preparing" : current?.state === "preparing" ? "ready" : current?.state === "ready" ? "delivered" : null;
          if (allowed !== command.nextState) throw new Error("Invalid kitchen transition");
          this.database.prepare("UPDATE comandas SET state = ? WHERE id = ?").run(command.nextState, command.orderId);
          this.database.prepare("UPDATE produccion_cocina SET state = ? WHERE comanda_id = ?").run(command.nextState, command.orderId);
          if (command.nextState === "ready" || command.nextState === "delivered") this.database.prepare("UPDATE consumos SET state = ? WHERE comanda_id = ?").run(command.nextState, command.orderId);
          outbox("comandas", command.orderId, command, "advance");
          break;
        }
        case "orders.cycle.open": {
          const existing = this.database.prepare("SELECT id FROM cierres_operativos WHERE tenant_id = ? AND sucursal_id = ? AND state = 'open' LIMIT 1").get(this.tenantId, branchId);
          if (existing) throw new Error("Open cycle already exists");
          this.database.prepare("INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, closed_at) VALUES (?, ?, ?, ?, ?, 'open', NULL)").run(command.id, this.tenantId, branchId, command.businessDay, command.openingCash);
          outbox("cierres_operativos", command.id, command, "cycle-open");
          break;
        }
        case "orders.cycle.close":
          this.database.prepare("UPDATE cierres_operativos SET state = 'closed', closed_at = datetime('now') WHERE id = ? AND tenant_id = ? AND state = 'open'").run(command.id, this.tenantId);
          outbox("cierres_operativos", command.id, command, "cycle-close");
          break;
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  executeSalesFiscalCommand(input: { command: SalesFiscalCommand; commitId: string; branchId: string }): void {
    const { command, commitId, branchId } = input;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES (?, ?, ?, ?, ?, 'pending_sync')").run(command.invoiceId, this.tenantId, branchId, command.fiscalMode, command.total);
      if (command.fiscalMode === "dgii_ecf") this.database.prepare("INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status) VALUES (?, ?, ?, ?, ?, 'pending_sync')").run(command.fiscalIntentId, this.tenantId, branchId, command.invoiceId, command.documentType);
      this.database.prepare("INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, status) VALUES (?, ?, ?, ?, 'pending')").run(commitId, this.tenantId, branchId, command.invoiceId);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  executeCashPurchaseCommand(input: { command: CashPurchaseCommand; commitId: string; branchId: string }): void {
    const { command, commitId, branchId } = input;
    const total = command.quantity * command.unitCost;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES (?, ?, ?, ?, 'cash', ?, 'pending_sync')").run(command.purchaseId, this.tenantId, branchId, command.supplierId, total);
      this.database.prepare("INSERT INTO detalles_compra (id, tenant_id, compra_id, inventory_product_id, quantity, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)").run(command.detailId, this.tenantId, command.purchaseId, command.inventoryProductId, command.quantity, command.unitCost, total);
      this.database.prepare("INSERT INTO movimientos_inventario (id, tenant_id, sucursal_id, compra_id, inventory_product_id, movement_type, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, 'purchase_receipt', ?, ?)").run(command.inventoryMovementId, this.tenantId, branchId, command.purchaseId, command.inventoryProductId, command.quantity, command.unitCost);
      this.database.prepare("INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, payment_method, amount, local_status) VALUES (?, ?, ?, ?, 'cash', ?, 'pending_sync')").run(command.expenseId, this.tenantId, branchId, command.purchaseId, total);
      for (const [tableName, rowId, suffix] of [["compras", command.purchaseId, "purchase"], ["detalles_compra", command.detailId, "detail"], ["movimientos_inventario", command.inventoryMovementId, "movement"], ["gastos", command.expenseId, "expense"]]) this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')").run(`${commitId}:${suffix}`, this.tenantId, branchId, tableName, rowId, JSON.stringify(command));
      this.database.exec("COMMIT;");
    } catch (error) { this.database.exec("ROLLBACK;"); throw error; }
  }

  close(): void {
    this.database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    this.database.close();
  }
}

function catalogDefinition(command: CatalogCommand, tenantId: string): { tableName: string; sql: string; values: unknown[] } {
  switch (command.type) {
    case "catalog.branch.upsert":
      return { tableName: "sucursales", sql: "INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", values: [command.id, tenantId, command.name] };
    case "catalog.customer.upsert":
      return { tableName: "customers", sql: "INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", values: [command.id, tenantId, command.name] };
    case "catalog.supplier.upsert":
      return { tableName: "proveedores", sql: "INSERT INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", values: [command.id, tenantId, command.name] };
    case "catalog.category.upsert":
      return { tableName: "menu_categories", sql: "INSERT INTO menu_categories (id, tenant_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", values: [command.id, tenantId, command.name] };
    case "catalog.product.upsert":
      return { tableName: "platos", sql: "INSERT INTO platos (id, tenant_id, category_id, name) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, name = excluded.name", values: [command.id, tenantId, command.categoryId, command.name] };
    case "catalog.inventory-product.upsert":
      return { tableName: "productos_inventario", sql: "INSERT INTO productos_inventario (id, tenant_id, name, unit) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, unit = excluded.unit", values: [command.id, tenantId, command.name, command.unit] };
    case "catalog.recipe.upsert":
      return { tableName: "recetas", sql: "INSERT INTO recetas (id, tenant_id, plato_id, inventory_product_id, quantity) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET plato_id = excluded.plato_id, inventory_product_id = excluded.inventory_product_id, quantity = excluded.quantity", values: [command.id, tenantId, command.platoId, command.inventoryProductId, command.quantity] };
  }
}

export class TenantStoreController {
  private activeStore: TenantStore | null = null;

  constructor(private readonly dataRoot: string) {}

  activate(tenantId: string): TenantStore {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(tenantId)) {
      throw new Error("Invalid tenant identity");
    }

    this.close();
    this.activeStore = TenantStore.open({ dataRoot: this.dataRoot, tenantId });
    return this.activeStore;
  }

  getActiveStore(): TenantStore | null {
    return this.activeStore;
  }

  getStatus(): { tenantId: string | null; isOpen: boolean } {
    return {
      tenantId: this.activeStore?.getTenantId() ?? null,
      isOpen: this.activeStore !== null,
    };
  }

  importLegacySnapshot(input: { manifest: LegacyImportManifest; chunks: readonly LegacyImportChunk[] }): { tenantId: string; importedRows: number; recoveredOutbox: number } {
    const tenantId = this.activeStore?.getTenantId();
    if (!tenantId || input.manifest.tenantId !== tenantId) throw new Error("Legacy import tenant mismatch");
    this.close();
    try {
      const result = new TenantSQLiteImporter({ dataRoot: this.dataRoot }).import(input);
      this.activeStore = TenantStore.open({ dataRoot: this.dataRoot, tenantId });
      return result;
    } catch (error) {
      this.activeStore = TenantStore.open({ dataRoot: this.dataRoot, tenantId });
      throw error;
    }
  }

  close(): void {
    this.activeStore?.close();
    this.activeStore = null;
  }
}
