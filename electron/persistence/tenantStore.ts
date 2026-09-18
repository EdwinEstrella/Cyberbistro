import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "./schema";
import { applyCloudExpenseCategoryRows, applyCloudExpenseRows, applyCloudCustomerRows } from "./cloudApply";
import { TenantSQLiteImporter, type LegacyImportChunk, type LegacyImportManifest } from "./importer";
import { PayrollSyncOrchestrator } from "./payrollSyncOrchestrator";
import type { DesktopCommand, DesktopRepositoryStore } from "../../src/shared/lib/desktopRepository";
import type { CatalogCommand } from "../../src/shared/lib/catalogContracts";
import type { OrdersCommand } from "../../src/shared/lib/ordersContracts";
import type { SalesFiscalCommand, SalesFiscalRepositoryStore } from "./salesFiscalRepository";
import type { CashPurchaseCommand, CashPurchaseRepositoryStore } from "./cashPurchaseRepository";
import type { ReceivablesCommand, ReceivablesRepositoryStore } from "./receivablesRepository";
import type { PayablesCommand, PayablesRepositoryStore } from "./payablesRepository";
import type { ExpenseCommand, ExpenseRepositoryStore } from "./expenseRepository";
import type { CustomerCommand, CustomerRepositoryStore } from "./customerRepository";

export class TenantStore implements DesktopRepositoryStore, SalesFiscalRepositoryStore, CashPurchaseRepositoryStore, ReceivablesRepositoryStore, PayablesRepositoryStore, ExpenseRepositoryStore, CustomerRepositoryStore {
  private constructor(
    private readonly database: DatabaseSync,
    private readonly databasePath: string,
    private readonly tenantId: string,
  ) {}

  public getDatabase(): DatabaseSync {
    return this.database;
  }

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

  readLocalOutbox(): Array<{ id: string; tenantId: string; branchId: string; tableName: string; rowId: string; operation: string; status: string }> {
    return this.database.prepare("SELECT id, tenant_id, branch_id, table_name, row_id, operation, status FROM sync_outbox ORDER BY id").all().map((row) => {
      const value = row as { id: string; tenant_id: string; branch_id: string; table_name: string; row_id: string; operation: string; status: string };
      return { id: value.id, tenantId: value.tenant_id, branchId: value.branch_id, tableName: value.table_name, rowId: value.row_id, operation: value.operation, status: value.status };
    });
  }

  readCatalogRows(tableName: "sucursales" | "customers" | "proveedores" | "menu_categories" | "platos" | "productos_inventario" | "recetas"): Array<Record<string, unknown>> {
    const queryByTable = {
      sucursales: "SELECT id, name FROM sucursales ORDER BY id",
      customers: "SELECT id, name FROM customers ORDER BY id",
      proveedores: "SELECT id, name FROM proveedores ORDER BY id",
      menu_categories: "SELECT id, nombre AS name FROM menu_categories ORDER BY id",
      platos: "SELECT id, nombre AS name, categoria AS categoryId FROM platos ORDER BY id",
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
      cierres_operativos: "SELECT id, business_day AS businessDay, opening_cash AS openingCash, state, cycle_number AS cycleNumber, opened_at AS openedAt, closed_at AS closedAt, printed_at AS printedAt FROM cierres_operativos ORDER BY id",
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
    return { purchases: this.database.prepare("SELECT id, total FROM compras ORDER BY id").all() as Array<Record<string, unknown>>, details: this.database.prepare("SELECT id, compra_id AS purchaseId, quantity, subtotal FROM detalles_compra ORDER BY id").all() as Array<Record<string, unknown>>, movements: this.database.prepare("SELECT id, compra_id AS purchaseId, quantity FROM movimientos_inventario ORDER BY id").all() as Array<Record<string, unknown>>, expenses: this.database.prepare("SELECT id, compra_id AS purchaseId, amount FROM gastos WHERE expense_type = 'purchase' ORDER BY id").all() as Array<Record<string, unknown>> };
  }

  readAnalyticsSummary(sucursalId?: string): {
    totalSales: number;
    totalExpenses: number;
    openOrdersCount: number;
    totalReceivables: number;
    totalPayables: number;
    activePayrollEmployees: number;
  } {
    const salesRow = this.database.prepare(
      "SELECT COALESCE(SUM(total), 0) AS total FROM facturas WHERE tenant_id = ?" + (sucursalId ? " AND sucursal_id = ?" : "")
    ).get(...(sucursalId ? [this.tenantId, sucursalId] : [this.tenantId])) as { total: number };

    const expensesRow = this.database.prepare(
      "SELECT COALESCE(SUM(amount), 0) + COALESCE(SUM(amount_cents)/100.0, 0) AS total FROM gastos WHERE tenant_id = ?" + (sucursalId ? " AND sucursal_id = ?" : "")
    ).get(...(sucursalId ? [this.tenantId, sucursalId] : [this.tenantId])) as { total: number };

    const ordersRow = this.database.prepare(
      "SELECT COUNT(*) AS count FROM comandas WHERE tenant_id = ? AND state IN ('pending', 'preparing', 'ready')" + (sucursalId ? " AND sucursal_id = ?" : "")
    ).get(...(sucursalId ? [this.tenantId, sucursalId] : [this.tenantId])) as { count: number };

    const cxcRow = this.database.prepare(
      "SELECT COALESCE(SUM(monto_pendiente), 0) AS total FROM cuentas_cobrar WHERE tenant_id = ? AND estado != 'pagado'" + (sucursalId ? " AND sucursal_id = ?" : "")
    ).get(...(sucursalId ? [this.tenantId, sucursalId] : [this.tenantId])) as { total: number };

    const cxpRow = this.database.prepare(
      "SELECT COALESCE(SUM(monto_pendiente), 0) AS total FROM cuentas_pagar WHERE tenant_id = ? AND estado != 'pagado'" + (sucursalId ? " AND sucursal_id = ?" : "")
    ).get(...(sucursalId ? [this.tenantId, sucursalId] : [this.tenantId])) as { total: number };

    const employeesRow = this.database.prepare(
      "SELECT COUNT(*) AS count FROM payroll_employees WHERE tenant_id = ? AND is_active = 1" + (sucursalId ? " AND sucursal_id = ?" : "")
    ).get(...(sucursalId ? [this.tenantId, sucursalId] : [this.tenantId])) as { count: number };

    return {
      totalSales: salesRow.total,
      totalExpenses: expensesRow.total,
      openOrdersCount: ordersRow.count,
      totalReceivables: cxcRow.total,
      totalPayables: cxpRow.total,
      activePayrollEmployees: employeesRow.count,
    };
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
        .run(input.commitId, this.tenantId, input.branchId, definition.tableName, input.command.id, definition.operation, JSON.stringify(input.command), "pending");
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
      const outbox = (tableName: string, rowId: string, payload: unknown, suffix: string, operation: "upsert" | "delete" = "upsert") => this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')").run(`${commitId}:${suffix}`, this.tenantId, branchId, tableName, rowId, operation, JSON.stringify(payload));
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
          // Rich cycle shape: cycle_number/opened_at mirror the cloud row so the
          // SQLite writer (now the single engine) can create the Supabase cycle on
          // push. created_at is aligned to opened_at for deterministic ordering.
          this.database.prepare("INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, closed_at, cycle_number, opened_at, created_at) VALUES (?, ?, ?, ?, ?, 'open', NULL, ?, ?, ?)").run(command.id, this.tenantId, branchId, command.businessDay, command.openingCash, command.cycleNumber, command.openedAt, command.openedAt);
          outbox("cierres_operativos", command.id, command, "cycle-open");
          break;
        }
        case "orders.cycle.close":
          {
            const result = this.database.prepare("UPDATE cierres_operativos SET state = 'closed', closed_at = ? WHERE id = ? AND tenant_id = ? AND state = 'open'").run(command.closedAt, command.id, this.tenantId);
            // Never create a close event without one local state transition.
            if (Number(result.changes) === 1) outbox("cierres_operativos", command.id, command, "cycle-close");
          }
          break;
        case "orders.cycle.mark-printed":
          {
            const result = this.database.prepare("UPDATE cierres_operativos SET printed_at = ? WHERE id = ? AND tenant_id = ?").run(command.printedAt, command.id, this.tenantId);
            if (Number(result.changes) === 1) outbox("cierres_operativos", command.id, command, "cycle-printed");
          }
          break;
        case "orders.cycle.discard":
          {
            // Discard an empty cycle: remove it locally and enqueue a delete so the
            // Supabase row created on open is removed, freeing the cycle number.
            const result = this.database.prepare("DELETE FROM cierres_operativos WHERE id = ? AND tenant_id = ? AND state = 'open'").run(command.id, this.tenantId);
            if (Number(result.changes) === 1) outbox("cierres_operativos", command.id, command, "cycle-discard", "delete");
          }
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
      this.database.prepare("INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, payroll_payment_id, expense_type, payment_method, amount, amount_cents, local_status, description) VALUES (?, ?, ?, ?, NULL, 'purchase', 'cash', ?, NULL, 'pending_sync', NULL)").run(command.expenseId, this.tenantId, branchId, command.purchaseId, total);
      for (const [tableName, rowId, suffix] of [["compras", command.purchaseId, "purchase"], ["detalles_compra", command.detailId, "detail"], ["movimientos_inventario", command.inventoryMovementId, "movement"], ["gastos", command.expenseId, "expense"]]) this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')").run(`${commitId}:${suffix}`, this.tenantId, branchId, tableName, rowId, JSON.stringify(command));
      this.database.exec("COMMIT;");
    } catch (error) { this.database.exec("ROLLBACK;"); throw error; }
  }

  executeReceivablesCommand(input: { command: ReceivablesCommand; commitId: string; branchId: string }): void {
    const { command, commitId, branchId } = input;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");
      if (command.type === "receivables.create") {
        this.database.prepare("INSERT OR IGNORE INTO customers (id, tenant_id, name) VALUES (?, ?, ?)").run(command.customerId, this.tenantId, "Cliente");
        this.database.prepare(`
          INSERT INTO cuentas_cobrar (id, tenant_id, sucursal_id, factura_id, customer_id, monto_total, monto_pendiente, estado, fecha_vencimiento, fecha_emision, observacion)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)
        `).run(command.id, this.tenantId, branchId, command.facturaId ?? null, command.customerId, command.totalAmount, command.totalAmount, command.dueDate ?? null, command.fechaEmision ?? null, command.observacion ?? null);
        this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')")
          .run(`${commitId}:cxc-create`, this.tenantId, branchId, "cuentas_cobrar", command.id, JSON.stringify(command));
      } else if (command.type === "receivables.payment.record") {
        const row = this.database.prepare("SELECT monto_pendiente FROM cuentas_cobrar WHERE id = ? AND tenant_id = ?").get(command.receivableId, this.tenantId) as { monto_pendiente: number } | undefined;
        if (!row) throw new Error(`Cuenta por cobrar ${command.receivableId} no encontrada.`);
        if (command.amount <= 0 || command.amount > row.monto_pendiente) {
          throw new Error(`Monto de pago inválido. Pendiente: ${row.monto_pendiente}`);
        }
        const newPending = row.monto_pendiente - command.amount;
        const newStatus = newPending === 0 ? "pagado" : "parcial";
        this.database.prepare(`
          INSERT INTO cxc_pagos (id, tenant_id, sucursal_id, cuenta_cobrar_id, monto, metodo_pago, fecha_pago, notas, cycle_id, created_by_auth_user_id)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?)
        `).run(command.paymentId, this.tenantId, branchId, command.receivableId, command.amount, command.paymentMethod, command.fechaPago ?? null, command.notas ?? null, command.cycleId ?? null, command.usuarioId ?? null);
        this.database.prepare(`
          UPDATE cuentas_cobrar SET monto_pendiente = ?, estado = ? WHERE id = ? AND tenant_id = ?
        `).run(newPending, newStatus, command.receivableId, this.tenantId);
        this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')")
          .run(`${commitId}:cxc-payment`, this.tenantId, branchId, "cxc_pagos", command.paymentId, JSON.stringify(command));
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  executePayablesCommand(input: { command: PayablesCommand; commitId: string; branchId: string }): void {
    const { command, commitId, branchId } = input;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");
      if (command.type === "payables.create") {
        this.database.prepare("INSERT OR IGNORE INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run(command.supplierId, this.tenantId, "Proveedor");
        this.database.prepare(`
          INSERT INTO cuentas_pagar (id, tenant_id, sucursal_id, compra_id, proveedor_id, monto_total, monto_pendiente, estado, fecha_vencimiento, fecha_emision, observacion)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)
        `).run(command.id, this.tenantId, branchId, command.compraId ?? null, command.supplierId, command.totalAmount, command.totalAmount, command.dueDate ?? null, command.fechaEmision ?? null, command.observacion ?? null);
        this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')")
          .run(`${commitId}:cxp-create`, this.tenantId, branchId, "cuentas_pagar", command.id, JSON.stringify(command));
      } else if (command.type === "payables.payment.record") {
        const row = this.database.prepare("SELECT monto_pendiente FROM cuentas_pagar WHERE id = ? AND tenant_id = ?").get(command.payableId, this.tenantId) as { monto_pendiente: number } | undefined;
        if (!row) throw new Error(`Cuenta por pagar ${command.payableId} no encontrada.`);
        if (command.amount <= 0 || command.amount > row.monto_pendiente) {
          throw new Error(`Monto de pago inválido. Pendiente: ${row.monto_pendiente}`);
        }
        const newPending = row.monto_pendiente - command.amount;
        const newStatus = newPending === 0 ? "pagado" : "parcial";
        this.database.prepare(`
          INSERT INTO cxp_pagos (id, tenant_id, sucursal_id, cuenta_pagar_id, monto, metodo_pago, fecha_pago, notas, cycle_id, created_by_auth_user_id)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?)
        `).run(command.paymentId, this.tenantId, branchId, command.payableId, command.amount, command.paymentMethod, command.fechaPago ?? null, command.notas ?? null, command.cycleId ?? null, command.usuarioId ?? null);
        this.database.prepare(`
          UPDATE cuentas_pagar SET monto_pendiente = ?, estado = ? WHERE id = ? AND tenant_id = ?
        `).run(newPending, newStatus, command.payableId, this.tenantId);
        this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')")
          .run(`${commitId}:cxp-payment`, this.tenantId, branchId, "cxp_pagos", command.paymentId, JSON.stringify(command));
        // A payables settlement is money leaving the drawer: record it as an
        // operational expense in the SAME transaction (atomic with the payment),
        // mirroring the shape executeExpenseCommand writes so the cierre and the
        // gasto push mapper treat it identically.
        if (command.expense) {
          const exp = command.expense;
          if (exp.categoryId) {
            this.database.prepare("INSERT OR IGNORE INTO gasto_categorias (id, tenant_id, name, color, active) VALUES (?, ?, 'General', '#ff906d', 1)").run(exp.categoryId, this.tenantId);
          }
          const expenseDate = command.fechaPago ?? new Date().toISOString();
          this.database.prepare(`
            INSERT INTO gastos (
              id, tenant_id, sucursal_id, category_id, cycle_id,
              expense_type, payment_method, amount, local_status,
              description, supplier, notes, expense_date
            ) VALUES (?, ?, ?, ?, ?, 'operational', ?, ?, 'pending_sync', ?, ?, ?, ?)
          `).run(exp.id, this.tenantId, branchId, exp.categoryId ?? null, command.cycleId ?? null, command.paymentMethod, command.amount, exp.description, exp.supplier ?? null, exp.notes ?? null, expenseDate);
          this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')").run(
            `${commitId}:cxp-expense`, this.tenantId, branchId, "gastos", exp.id,
            JSON.stringify({
              id: exp.id,
              tenantId: this.tenantId,
              sucursalId: branchId,
              categoryId: exp.categoryId ?? null,
              cycleId: command.cycleId ?? null,
              description: exp.description,
              supplier: exp.supplier ?? null,
              amount: command.amount,
              paymentMethod: command.paymentMethod,
              expenseDate,
              notes: exp.notes ?? null,
              expenseType: "operational",
            }),
          );
        }
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listExpenses(filter?: { sucursalId?: string; limit?: number }): Array<Record<string, unknown>> {
    const limit = filter?.limit ?? 100;
    if (filter?.sucursalId) {
      return this.database.prepare(
        "SELECT * FROM gastos WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default') ORDER BY expense_date DESC LIMIT ?"
      ).all(this.tenantId, filter.sucursalId, limit) as Array<Record<string, unknown>>;
    }
    return this.database.prepare(
      "SELECT * FROM gastos WHERE tenant_id = ? ORDER BY expense_date DESC LIMIT ?"
    ).all(this.tenantId, limit) as Array<Record<string, unknown>>;
  }

  listExpenseCategories(): Array<Record<string, unknown>> {
    return this.database.prepare(
      "SELECT id, name AS nombre, description AS descripcion, color, active AS activa FROM gasto_categorias WHERE tenant_id = ? AND active = 1 ORDER BY name ASC"
    ).all(this.tenantId) as Array<Record<string, unknown>>;
  }

  listInvoices(filter?: { sucursalId?: string; limit?: number }): Array<Record<string, unknown>> {
    const hasLimit = typeof filter?.limit === "number" && filter.limit > 0;
    if (filter?.sucursalId) {
      const sql = hasLimit
        ? "SELECT * FROM facturas WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default') ORDER BY created_at DESC LIMIT ?"
        : "SELECT * FROM facturas WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default') ORDER BY created_at DESC";
      return (hasLimit
        ? this.database.prepare(sql).all(this.tenantId, filter.sucursalId, filter.limit)
        : this.database.prepare(sql).all(this.tenantId, filter.sucursalId)
      ) as Array<Record<string, unknown>>;
    }
    const sql = hasLimit
      ? "SELECT * FROM facturas WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?"
      : "SELECT * FROM facturas WHERE tenant_id = ? ORDER BY created_at DESC";
    return (hasLimit
      ? this.database.prepare(sql).all(this.tenantId, filter.limit)
      : this.database.prepare(sql).all(this.tenantId)
    ) as Array<Record<string, unknown>>;
  }

  reserveInvoiceNumbers(count: number): number[] {
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
      throw new Error("Invalid invoice number reservation count");
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const invoiceMax = this.database.prepare(
        "SELECT COALESCE(MAX(numero_factura), 0) AS max_number FROM facturas WHERE tenant_id = ?"
      ).get(this.tenantId) as { max_number: number } | undefined;
      const counter = this.database.prepare(
        "SELECT next_number FROM invoice_number_counters WHERE tenant_id = ?"
      ).get(this.tenantId) as { next_number: number } | undefined;
      const first = Math.max(Number(invoiceMax?.max_number ?? 0) + 1, Number(counter?.next_number ?? 1));
      if (!Number.isSafeInteger(first) || first < 1 || first + count - 1 > Number.MAX_SAFE_INTEGER) {
        throw new Error("Invoice number range is exhausted");
      }
      this.database.prepare(`
        INSERT INTO invoice_number_counters (tenant_id, next_number)
        VALUES (?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET next_number = excluded.next_number
      `).run(this.tenantId, first + count);
      this.database.exec("COMMIT;");
      return Array.from({ length: count }, (_, index) => first + index);
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getInvoiceNumberFloor(): number {
    const invoiceMax = this.database.prepare(
      "SELECT COALESCE(MAX(numero_factura), 0) AS max_number FROM facturas WHERE tenant_id = ?"
    ).get(this.tenantId) as { max_number: number } | undefined;
    const counter = this.database.prepare(
      "SELECT next_number FROM invoice_number_counters WHERE tenant_id = ?"
    ).get(this.tenantId) as { next_number: number } | undefined;
    const floor = Math.max(Number(invoiceMax?.max_number ?? 0) + 1, Number(counter?.next_number ?? 1));
    if (!Number.isSafeInteger(floor) || floor < 1) throw new Error("Invalid local invoice number floor");
    return floor;
  }

  saveInvoice(invoice: Record<string, unknown>): void {
    const id = String(invoice.id);
    if (!id) throw new Error("Invalid invoice id");
    const branchId = typeof invoice.sucursal_id === "string" && invoice.sucursal_id.trim()
      ? invoice.sucursal_id.trim()
      : "main-process-default";

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");

      const stmt = this.database.prepare(`
        INSERT INTO facturas (
          id, tenant_id, sucursal_id, fiscal_mode, total, local_status,
          numero_factura, mesa_numero, cliente_nombre, metodo_pago, estado,
          subtotal, itbis, propina, moneda, items, notas, ncf, ncf_tipo,
          cliente_rnc, customer_id, created_at, updated_at, pagada_at
        ) VALUES (?, ?, ?, ?, ?, 'pending_sync', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

      const rawTotal = Number(invoice.total ?? 0);
      const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : 0;
      const fiscalMode = typeof invoice.fiscal_mode === "string" ? invoice.fiscal_mode : "internal_receipt";
      const items = invoice.items == null ? null : (typeof invoice.items === "string" ? invoice.items : JSON.stringify(invoice.items));
      const str = (v: unknown): string | null => (v != null && String(v).length > 0 ? String(v) : null);
      const num = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      stmt.run(
        id,
        this.tenantId,
        branchId,
        fiscalMode,
        total,
        num(invoice.numero_factura),
        num(invoice.mesa_numero),
        str(invoice.cliente_nombre),
        str(invoice.metodo_pago),
        str(invoice.estado) ?? "pagada",
        num(invoice.subtotal) ?? 0,
        num(invoice.itbis) ?? 0,
        num(invoice.propina) ?? 0,
        str(invoice.moneda) ?? "DOP",
        items,
        str(invoice.notas),
        str(invoice.ncf),
        str(invoice.ncf_tipo),
        str(invoice.cliente_rnc),
        str(invoice.customer_id),
        str(invoice.created_at) ?? new Date().toISOString(),
        str(invoice.updated_at) ?? new Date().toISOString(),
        str(invoice.pagada_at)
      );

      const commitId = crypto.randomUUID();
      this.database.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'facturas', ?, 'upsert', ?, 'pending')
      `).run(
        commitId,
        this.tenantId,
        branchId,
        id,
        JSON.stringify(invoice)
      );

      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  deleteInvoiceAndTraces(invoiceId: string): void {
    if (!invoiceId) throw new Error("Invalid invoice id");
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const invoice = this.database.prepare(
        "SELECT sucursal_id FROM facturas WHERE id = ? AND tenant_id = ?"
      ).get(invoiceId, this.tenantId) as { sucursal_id: string | null } | undefined;
      if (!invoice) {
        this.database.exec("COMMIT;");
        return;
      }
      this.database.prepare("DELETE FROM fiscal_outbox WHERE factura_id = ? AND tenant_id = ?").run(invoiceId, this.tenantId);
      this.database.prepare("DELETE FROM ecf_documents WHERE factura_id = ? AND tenant_id = ?").run(invoiceId, this.tenantId);
      this.database.prepare("DELETE FROM facturas WHERE id = ? AND tenant_id = ?").run(invoiceId, this.tenantId);
      this.database.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'facturas', ?, 'delete', ?, 'pending')
      `).run(
        crypto.randomUUID(),
        this.tenantId,
        invoice.sucursal_id ?? "",
        invoiceId,
        JSON.stringify({ id: invoiceId, tenant_id: this.tenantId })
      );
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listCierres(filter?: { sucursalId?: string; limit?: number }): Array<Record<string, unknown>> {
    const limit = filter?.limit ?? 500;
    const columns = "id, tenant_id, sucursal_id, business_day, opening_cash AS efectivo_inicial, state, closed_at, cycle_number, opened_at, printed_at, created_at";
    if (filter?.sucursalId) {
      return this.database.prepare(
        `SELECT ${columns} FROM cierres_operativos WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id IS NULL) ORDER BY cycle_number DESC LIMIT ?`
      ).all(this.tenantId, filter.sucursalId, limit) as Array<Record<string, unknown>>;
    }
    return this.database.prepare(
      `SELECT ${columns} FROM cierres_operativos WHERE tenant_id = ? ORDER BY cycle_number DESC LIMIT ?`
    ).all(this.tenantId, limit) as Array<Record<string, unknown>>;
  }

  listMesasEstado(sucursalId?: string): Array<Record<string, unknown>> {
    if (sucursalId) {
      return this.database.prepare(
        "SELECT * FROM mesas_estado WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default' OR sucursal_id IS NULL) ORDER BY table_number ASC"
      ).all(this.tenantId, sucursalId) as Array<Record<string, unknown>>;
    }
    return this.database.prepare(
      "SELECT * FROM mesas_estado WHERE tenant_id = ? ORDER BY table_number ASC"
    ).all(this.tenantId) as Array<Record<string, unknown>>;
  }

  saveMesaEstado(mesaEstado: Record<string, unknown>): void {
    const id = String(mesaEstado.id);
    const branchId = typeof mesaEstado.sucursal_id === "string" && mesaEstado.sucursal_id.trim() ? mesaEstado.sucursal_id.trim() : "main-process-default";
    const stateStr = mesaEstado.state == null ? null : (typeof mesaEstado.state === "string" ? mesaEstado.state : JSON.stringify(mesaEstado.state));
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");
      this.database.prepare(`
        INSERT INTO mesas_estado (id, tenant_id, sucursal_id, table_number, state, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          sucursal_id = excluded.sucursal_id,
          table_number = excluded.table_number,
          state = excluded.state,
          updated_at = CURRENT_TIMESTAMP
      `).run(id, this.tenantId, branchId, mesaEstado.table_number != null ? Number(mesaEstado.table_number) : null, stateStr);
      this.database.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'mesas_estado', ?, 'upsert', ?, 'pending')
      `).run(crypto.randomUUID(), this.tenantId, branchId, id, JSON.stringify(mesaEstado));
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listCocinaEstado(sucursalId?: string): Array<Record<string, unknown>> {
    if (sucursalId) {
      return this.database.prepare(
        "SELECT * FROM cocina_estado WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default' OR sucursal_id IS NULL) LIMIT 1"
      ).all(this.tenantId, sucursalId) as Array<Record<string, unknown>>;
    }
    return this.database.prepare(
      "SELECT * FROM cocina_estado WHERE tenant_id = ? LIMIT 1"
    ).all(this.tenantId) as Array<Record<string, unknown>>;
  }

  listComandas(filter?: { sucursalId?: string; activeOnly?: boolean }): Array<Record<string, unknown>> {
    const activeFilter = filter?.activeOnly ? " AND estado IN ('pendiente', 'en_preparacion', 'listo')" : "";
    if (filter?.sucursalId) {
      return this.database.prepare(
        `SELECT * FROM comandas WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default' OR sucursal_id IS NULL)${activeFilter} ORDER BY created_at ASC`
      ).all(this.tenantId, filter.sucursalId) as Array<Record<string, unknown>>;
    }
    return this.database.prepare(
      `SELECT * FROM comandas WHERE tenant_id = ?${activeFilter} ORDER BY created_at ASC`
    ).all(this.tenantId) as Array<Record<string, unknown>>;
  }

  saveComanda(comanda: Record<string, unknown>): void {
    const id = String(comanda.id);
    const branchId = typeof comanda.sucursal_id === "string" && comanda.sucursal_id.trim() ? comanda.sucursal_id.trim() : "main-process-default";
    const itemsStr = comanda.items == null ? null : (typeof comanda.items === "string" ? comanda.items : JSON.stringify(comanda.items));
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");
      this.database.prepare(`
        INSERT INTO comandas (id, tenant_id, sucursal_id, numero_comanda, mesa_id, mesa_numero, estado, items, notas, creado_por, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sucursal_id = excluded.sucursal_id,
          numero_comanda = excluded.numero_comanda,
          mesa_id = excluded.mesa_id,
          mesa_numero = excluded.mesa_numero,
          estado = excluded.estado,
          items = excluded.items,
          notas = excluded.notas,
          creado_por = excluded.creado_por,
          updated_at = excluded.updated_at
      `).run(
        id,
        this.tenantId,
        branchId,
        comanda.numero_comanda != null ? Number(comanda.numero_comanda) : null,
        comanda.mesa_id ? String(comanda.mesa_id) : null,
        comanda.mesa_numero != null ? Number(comanda.mesa_numero) : null,
        comanda.estado ? String(comanda.estado) : "pendiente",
        itemsStr,
        comanda.notas ? String(comanda.notas) : null,
        comanda.creado_por ? String(comanda.creado_por) : null,
        comanda.created_at ? String(comanda.created_at) : new Date().toISOString(),
        comanda.updated_at ? String(comanda.updated_at) : new Date().toISOString(),
      );
      this.database.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'comandas', ?, 'upsert', ?, 'pending')
      `).run(crypto.randomUUID(), this.tenantId, branchId, id, JSON.stringify(comanda));
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  deleteComanda(comandaId: string): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const comanda = this.database.prepare("SELECT sucursal_id FROM comandas WHERE id = ? AND tenant_id = ?").get(comandaId, this.tenantId) as { sucursal_id: string | null } | undefined;
      this.database.prepare("DELETE FROM comandas WHERE id = ? AND tenant_id = ?").run(comandaId, this.tenantId);
      this.database.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'comandas', ?, 'delete', ?, 'pending')
      `).run(crypto.randomUUID(), this.tenantId, comanda?.sucursal_id ?? "", comandaId, JSON.stringify({ id: comandaId }));
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listConsumos(filter?: { sucursalId?: string; comandaId?: string; mesaNumero?: number; unpaidOnly?: boolean }): Array<Record<string, unknown>> {
    let sql = "SELECT * FROM consumos WHERE tenant_id = ?";
    const params: unknown[] = [this.tenantId];
    if (filter?.sucursalId) {
      sql += " AND (sucursal_id = ? OR sucursal_id = 'main-process-default' OR sucursal_id IS NULL)";
      params.push(filter.sucursalId);
    }
    if (filter?.comandaId) {
      sql += " AND comanda_id = ?";
      params.push(filter.comandaId);
    }
    if (filter?.mesaNumero != null) {
      sql += " AND mesa_numero = ?";
      params.push(filter.mesaNumero);
    }
    if (filter?.unpaidOnly) {
      sql += " AND estado != 'pagado'";
    }
    sql += " ORDER BY created_at ASC";
    return this.database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  }

  saveConsumo(consumo: Record<string, unknown>): void {
    const id = String(consumo.id);
    const branchId = typeof consumo.sucursal_id === "string" && consumo.sucursal_id.trim() ? consumo.sucursal_id.trim() : "main-process-default";
    const cant = Number(consumo.cantidad);
    const cantidad = Number.isFinite(cant) && cant > 0 ? Math.round(cant) : 1;
    const precio = Number(consumo.precio_unitario);
    const precioUnitario = Number.isFinite(precio) && precio >= 0 ? precio : 0;
    const sub = Number(consumo.subtotal);
    const subtotal = Number.isFinite(sub) && sub >= 0 ? sub : cantidad * precioUnitario;

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");
      this.database.prepare(`
        INSERT INTO consumos (id, tenant_id, sucursal_id, comanda_id, plato_id, nombre, cantidad, precio_unitario, subtotal, tipo, estado, factura_id, mesa_numero, created_by_auth_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sucursal_id = excluded.sucursal_id,
          comanda_id = excluded.comanda_id,
          plato_id = excluded.plato_id,
          nombre = excluded.nombre,
          cantidad = excluded.cantidad,
          precio_unitario = excluded.precio_unitario,
          subtotal = excluded.subtotal,
          tipo = excluded.tipo,
          estado = excluded.estado,
          factura_id = excluded.factura_id,
          mesa_numero = excluded.mesa_numero,
          created_by_auth_user_id = excluded.created_by_auth_user_id,
          updated_at = excluded.updated_at
      `).run(
        id,
        this.tenantId,
        branchId,
        consumo.comanda_id ? String(consumo.comanda_id) : null,
        consumo.plato_id != null ? String(consumo.plato_id) : null,
        consumo.nombre ? String(consumo.nombre) : (consumo.name ? String(consumo.name) : "Item"),
        cantidad,
        precioUnitario,
        subtotal,
        consumo.tipo ? String(consumo.tipo) : "plato",
        consumo.estado ? String(consumo.estado) : "pendiente",
        consumo.factura_id ? String(consumo.factura_id) : null,
        consumo.mesa_numero != null ? Number(consumo.mesa_numero) : null,
        consumo.created_by_auth_user_id ? String(consumo.created_by_auth_user_id) : null,
        consumo.created_at ? String(consumo.created_at) : new Date().toISOString(),
        consumo.updated_at ? String(consumo.updated_at) : new Date().toISOString(),
      );
      this.database.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'consumos', ?, 'upsert', ?, 'pending')
      `).run(crypto.randomUUID(), this.tenantId, branchId, id, JSON.stringify(consumo));
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  deleteConsumo(consumoId: string): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const consumo = this.database.prepare("SELECT sucursal_id FROM consumos WHERE id = ? AND tenant_id = ?").get(consumoId, this.tenantId) as { sucursal_id: string | null } | undefined;
      this.database.prepare("DELETE FROM consumos WHERE id = ? AND tenant_id = ?").run(consumoId, this.tenantId);
      this.database.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'consumos', ?, 'delete', ?, 'pending')
      `).run(crypto.randomUUID(), this.tenantId, consumo?.sucursal_id ?? "", consumoId, JSON.stringify({ id: consumoId }));
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listCuentasCobrar(filter?: { sucursalId?: string; limit?: number }): Array<Record<string, unknown>> {
    const limit = filter?.limit ?? 2000;
    const columns = "id, tenant_id, sucursal_id, factura_id, customer_id, monto_total, monto_pendiente, (monto_total - monto_pendiente) AS monto_pagado, estado, fecha_vencimiento, fecha_emision, observacion";
    if (filter?.sucursalId) {
      return this.database.prepare(
        `SELECT ${columns} FROM cuentas_cobrar WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default') LIMIT ?`
      ).all(this.tenantId, filter.sucursalId, limit) as Array<Record<string, unknown>>;
    }
    return this.database.prepare(
      `SELECT ${columns} FROM cuentas_cobrar WHERE tenant_id = ? LIMIT ?`
    ).all(this.tenantId, limit) as Array<Record<string, unknown>>;
  }

  listCuentasPagar(filter?: { sucursalId?: string; limit?: number }): Array<Record<string, unknown>> {
    const limit = filter?.limit ?? 2000;
    const columns = "id, tenant_id, sucursal_id, compra_id, proveedor_id, monto_total, monto_pendiente, (monto_total - monto_pendiente) AS monto_pagado, estado, fecha_vencimiento, fecha_emision, observacion";
    if (filter?.sucursalId) {
      return this.database.prepare(
        `SELECT ${columns} FROM cuentas_pagar WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default') LIMIT ?`
      ).all(this.tenantId, filter.sucursalId, limit) as Array<Record<string, unknown>>;
    }
    return this.database.prepare(
      `SELECT ${columns} FROM cuentas_pagar WHERE tenant_id = ? LIMIT ?`
    ).all(this.tenantId, limit) as Array<Record<string, unknown>>;
  }

  listCxcPagos(filter?: { sucursalId?: string; limit?: number }): Array<Record<string, unknown>> {
    return this.listPagos("cxc_pagos", "cuenta_cobrar_id", filter);
  }

  listCxpPagos(filter?: { sucursalId?: string; limit?: number }): Array<Record<string, unknown>> {
    return this.listPagos("cxp_pagos", "cuenta_pagar_id", filter);
  }

  private listPagos(table: "cxc_pagos" | "cxp_pagos", parentColumn: string, filter?: { sucursalId?: string; limit?: number }): Array<Record<string, unknown>> {
    const limit = filter?.limit ?? 5000;
    const baseColumns = `id, tenant_id, sucursal_id, ${parentColumn}, monto, metodo_pago, fecha_pago`;
    // Both cxc_pagos and cxp_pagos carry notas/cycle_id/created_by after schema evolution.
    const columns = `${baseColumns}, notas, cycle_id, created_by_auth_user_id`;
    if (filter?.sucursalId) {
      return this.database.prepare(
        `SELECT ${columns} FROM ${table} WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default') ORDER BY fecha_pago DESC LIMIT ?`
      ).all(this.tenantId, filter.sucursalId, limit) as Array<Record<string, unknown>>;
    }
    return this.database.prepare(
      `SELECT ${columns} FROM ${table} WHERE tenant_id = ? ORDER BY fecha_pago DESC LIMIT ?`
    ).all(this.tenantId, limit) as Array<Record<string, unknown>>;
  }

  syncCloudExpenseCategories(categories: Array<Record<string, unknown>>): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      applyCloudExpenseCategoryRows(this.database, this.tenantId, categories);
      this.database.exec("COMMIT;");
    } catch (e) {
      this.database.exec("ROLLBACK;");
      throw e;
    }
  }

  syncCloudExpenses(expenses: Array<Record<string, unknown>>, defaultBranchId = "main-process-default"): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      applyCloudExpenseRows(this.database, this.tenantId, expenses, defaultBranchId);
      this.database.exec("COMMIT;");
    } catch (e) {
      this.database.exec("ROLLBACK;");
      throw e;
    }
  }

  executeExpenseCommand(input: { command: ExpenseCommand; commitId: string; branchId: string }): void {
    const { command, commitId, branchId } = input;
    const targetBranch = (command.type === "expense.create" && (command as any).branchId) ? (command as any).branchId : branchId;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO tenants (id) VALUES (?)").run(this.tenantId);
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(targetBranch, this.tenantId, "Principal");
      if (command.type === "expense.create" && command.categoryId) {
        this.database.prepare("INSERT OR IGNORE INTO gasto_categorias (id, tenant_id, name, color, active) VALUES (?, ?, 'General', '#ff906d', 1)").run(command.categoryId, this.tenantId);
      }

      switch (command.type) {
        case "expense.create": {
          const expenseDate = command.expenseDate ?? new Date().toISOString();
          this.database.prepare(`
            INSERT INTO gastos (
              id, tenant_id, sucursal_id, category_id, cycle_id,
              expense_type, payment_method, amount, local_status,
              description, supplier, notes, expense_date
            ) VALUES (?, ?, ?, ?, ?, 'operational', ?, ?, 'pending_sync', ?, ?, ?, ?)
          `).run(
            command.id,
            this.tenantId,
            targetBranch,
            command.categoryId ?? null,
            command.cycleId ?? null,
            command.paymentMethod ?? "cash",
            command.amount,
            command.description,
            command.supplier ?? null,
            command.notes ?? null,
            expenseDate
          );

          this.database.prepare(
            "INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')"
          ).run(
            `${commitId}:expense-create`,
            this.tenantId,
            targetBranch,
            "gastos",
            command.id,
            JSON.stringify({
              id: command.id,
              tenantId: this.tenantId,
              sucursalId: targetBranch,
              categoryId: command.categoryId ?? null,
              cycleId: command.cycleId ?? null,
              description: command.description,
              supplier: command.supplier ?? null,
              amount: command.amount,
              paymentMethod: command.paymentMethod ?? "cash",
              expenseDate,
              notes: command.notes ?? null,
              expenseType: "operational",
            })
          );
          break;
        }

        case "expense.delete": {
          const expenseRow = this.database
            .prepare("SELECT id, payroll_payment_id, expense_type FROM gastos WHERE id = ? AND tenant_id = ?")
            .get(command.id, this.tenantId) as { id: string; payroll_payment_id: string | null; expense_type: string | null } | undefined;

          if (expenseRow?.payroll_payment_id) {
            const payrollPaymentId = expenseRow.payroll_payment_id;
            this.database
              .prepare("DELETE FROM payroll_payment_adjustments WHERE payment_id = ? AND tenant_id = ?")
              .run(payrollPaymentId, this.tenantId);
            this.database
              .prepare("DELETE FROM payroll_payments WHERE id = ? AND tenant_id = ?")
              .run(payrollPaymentId, this.tenantId);
            this.database.prepare(
              "INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'delete', ?, 'pending')"
            ).run(
              `${commitId}:payroll-delete`,
              this.tenantId,
              branchId,
              "payroll_payments",
              payrollPaymentId,
              JSON.stringify({ id: payrollPaymentId, tenantId: this.tenantId, sucursalId: branchId })
            );
          }

          this.database.prepare("DELETE FROM gastos WHERE id = ? AND tenant_id = ?").run(command.id, this.tenantId);
          this.database.prepare(
            "INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'delete', ?, 'pending')"
          ).run(
            `${commitId}:expense-delete`,
            this.tenantId,
            branchId,
            "gastos",
            command.id,
            JSON.stringify({
              id: command.id,
              tenantId: this.tenantId,
              sucursalId: branchId,
              expenseType: expenseRow?.expense_type || "operational",
            })
          );
          break;
        }

        case "expense.category.create": {
          this.database.prepare(`
            INSERT INTO gasto_categorias (id, tenant_id, name, description, color, active)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              color = excluded.color,
              active = 1
          `).run(
            command.id,
            this.tenantId,
            command.name,
            command.description ?? null,
            command.color ?? "#ff906d"
          );

          this.database.prepare(
            "INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')"
          ).run(
            `${commitId}:category-create`,
            this.tenantId,
            branchId,
            "gasto_categorias",
            command.id,
            JSON.stringify({
              id: command.id,
              tenantId: this.tenantId,
              name: command.name,
              description: command.description ?? null,
              color: command.color ?? "#ff906d",
              active: true,
            })
          );
          break;
        }

        case "expense.category.delete": {
          this.database.prepare("UPDATE gasto_categorias SET active = 0 WHERE id = ? AND tenant_id = ?").run(command.id, this.tenantId);
          this.database.prepare(
            "INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'delete', ?, 'pending')"
          ).run(
            `${commitId}:category-delete`,
            this.tenantId,
            branchId,
            "gasto_categorias",
            command.id,
            JSON.stringify({ id: command.id, tenantId: this.tenantId, active: false })
          );
          break;
        }
      }

      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listCustomers(): Array<Record<string, unknown>> {
    return this.database.prepare(
      "SELECT id, tenant_id, name, phone, email, document_id, address, notes, created_at, updated_at, deleted_at FROM customers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name ASC"
    ).all(this.tenantId) as Array<Record<string, unknown>>;
  }

  listCatalog(): { platos: Array<Record<string, unknown>>; menuCategories: Array<Record<string, unknown>> } {
    const platos = this.database.prepare(
      "SELECT id, tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina, created_at, updated_at, deleted_at FROM platos WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY nombre ASC"
    ).all(this.tenantId) as Array<Record<string, unknown>>;
    const menuCategories = this.database.prepare(
      "SELECT id, tenant_id, nombre, color, sort_order, sucursal_id FROM menu_categories WHERE tenant_id = ? ORDER BY sort_order ASC, nombre ASC"
    ).all(this.tenantId) as Array<Record<string, unknown>>;
    return { platos, menuCategories };
  }

  syncCloudCustomers(customers: Array<Record<string, unknown>>): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      applyCloudCustomerRows(this.database, this.tenantId, customers);
      this.database.exec("COMMIT;");
    } catch (e) {
      this.database.exec("ROLLBACK;");
      throw e;
    }
  }

  executeCustomerCommand(input: { command: CustomerCommand; commitId: string; branchId: string }): void {
    const { command, commitId, branchId } = input;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");

      switch (command.type) {
        case "customer.upsert": {
          const now = new Date().toISOString();
          this.database.prepare(`
            INSERT INTO customers (id, tenant_id, name, phone, email, document_id, address, notes, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              phone = excluded.phone,
              email = excluded.email,
              document_id = excluded.document_id,
              address = excluded.address,
              notes = excluded.notes,
              updated_at = excluded.updated_at,
              deleted_at = NULL
          `).run(
            command.id,
            this.tenantId,
            command.name,
            command.phone ?? null,
            command.email ?? null,
            command.documentId ?? null,
            command.address ?? null,
            command.notes ?? null,
            now,
            now
          );

          this.database.prepare(
            "INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')"
          ).run(
            `${commitId}:customer-upsert`,
            this.tenantId,
            branchId,
            "customers",
            command.id,
            JSON.stringify({
              id: command.id,
              tenantId: this.tenantId,
              name: command.name,
              phone: command.phone ?? null,
              email: command.email ?? null,
              documentId: command.documentId ?? null,
              address: command.address ?? null,
              notes: command.notes ?? null,
              updatedAt: now,
            })
          );
          break;
        }

        case "customer.delete": {
          const now = new Date().toISOString();
          this.database.prepare("UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").run(now, now, command.id, this.tenantId);

          this.database.prepare(
            "INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'delete', ?, 'pending')"
          ).run(
            `${commitId}:customer-delete`,
            this.tenantId,
            branchId,
            "customers",
            command.id,
            JSON.stringify({ id: command.id, tenantId: this.tenantId, deletedAt: now })
          );
          break;
        }
      }

      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getSyncDiagnosticReport(): {
    tenantId: string;
    databasePath: string;
    walMode: boolean;
    tableCounts: Array<{ table: string; count: number }>;
    outboxSummary: Array<{ tableName: string; status: string; count: number; errorCount: number }>;
    recentErrors: Array<{ id: string; tableName: string; rowId: string; operation: string; status: string; errorJson: string | null; payloadJson: string }>;
    pendingQueue: Array<{ id: string; tableName: string; rowId: string; operation: string; status: string }>;
    pullState: {
      global: { lastPullAt: string | null; lastBatchCount: number; cursor: string | null } | null;
      perTable: Array<{ table: string; mirroredRows: number; lastPullAt: string | null }>;
    };
  } {
    const tableNames = [
      "customers", "gastos", "gasto_categorias", "payroll_employees", "payroll_payments",
      "payroll_payment_adjustments", "compras", "detalles_compra", "movimientos_inventario",
      "cuentas_cobrar", "cxc_pagos", "cuentas_pagar", "cxp_pagos", "platos", "menu_categories",
      "sucursales", "comandas", "consumos", "facturas", "cierres_operativos", "ecf_documents", "mesas_estado"
    ];

    const tableCounts: Array<{ table: string; count: number }> = [];
    for (const table of tableNames) {
      try {
        const row = this.database.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number } | undefined;
        tableCounts.push({ table, count: row?.c ?? 0 });
      } catch {
        // Table might not exist yet
      }
    }

    const outboxSummary = this.database.prepare(`
      SELECT table_name as tableName, status, COUNT(*) as count,
             SUM(CASE WHEN error_json IS NOT NULL THEN 1 ELSE 0 END) as errorCount
      FROM sync_outbox
      WHERE tenant_id = ?
      GROUP BY table_name, status
      ORDER BY table_name, status
    `).all(this.tenantId) as Array<{ tableName: string; status: string; count: number; errorCount: number }>;

    const recentErrors = this.database.prepare(`
      SELECT id, table_name as tableName, row_id as rowId, operation, status, error_json as errorJson, payload_json as payloadJson
      FROM sync_outbox
      WHERE tenant_id = ? AND (error_json IS NOT NULL OR status = 'not_retryable')
      ORDER BY rowid DESC
      LIMIT 50
    `).all(this.tenantId) as Array<{ id: string; tableName: string; rowId: string; operation: string; status: string; errorJson: string | null; payloadJson: string }>;

    const pendingQueue = this.database.prepare(`
      SELECT id, table_name as tableName, row_id as rowId, operation, status
      FROM sync_outbox
      WHERE tenant_id = ? AND status IN ('pending', 'syncing')
      ORDER BY rowid ASC
      LIMIT 50
    `).all(this.tenantId) as Array<{ id: string; tableName: string; rowId: string; operation: string; status: string }>;

    // Download (cloud → local) visibility from sync_state. The '__pull__' row is
    // the global pull cursor (last batch size + when); every other row is a
    // per-table snapshot with the mirrored row count and its last pull time.
    let pullState: {
      global: { lastPullAt: string | null; lastBatchCount: number; cursor: string | null } | null;
      perTable: Array<{ table: string; mirroredRows: number; lastPullAt: string | null }>;
    } = { global: null, perTable: [] };
    try {
      const globalRow = this.database.prepare(
        "SELECT cursor, row_count AS rowCount, updated_at AS updatedAt FROM sync_state WHERE tenant_id = ? AND table_name = '__pull__' LIMIT 1"
      ).get(this.tenantId) as { cursor: string | null; rowCount: number; updatedAt: string } | undefined;
      const perTable = this.database.prepare(
        "SELECT table_name AS table, row_count AS mirroredRows, updated_at AS lastPullAt FROM sync_state WHERE tenant_id = ? AND table_name != '__pull__' ORDER BY updated_at DESC"
      ).all(this.tenantId) as Array<{ table: string; mirroredRows: number; lastPullAt: string | null }>;
      pullState = {
        global: globalRow ? { lastPullAt: globalRow.updatedAt, lastBatchCount: globalRow.rowCount, cursor: globalRow.cursor } : null,
        perTable,
      };
    } catch {
      // sync_state may not exist yet on a fresh DB; leave the empty default.
    }

    return {
      tenantId: this.tenantId,
      databasePath: this.databasePath,
      walMode: true,
      tableCounts,
      outboxSummary,
      recentErrors,
      pendingQueue,
      pullState,
    };
  }

  retryFailedOutboxOperations(): number {
    const result = this.database.prepare(`
      UPDATE sync_outbox
      SET status = 'pending', error_json = NULL
      WHERE tenant_id = ?
        AND (error_json IS NULL OR json_valid(error_json) = 0 OR COALESCE(json_extract(error_json, '$.retryable'), 1) = 1)
        AND (error_json IS NOT NULL OR status = 'not_retryable')
    `).run(this.tenantId);
    return Number(result.changes);
  }

  close(): void {
    this.database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    this.database.close();
  }
}

function catalogDefinition(command: CatalogCommand, tenantId: string): { tableName: string; sql: string; values: unknown[]; operation: "upsert" | "delete" } {
  switch (command.type) {
    case "catalog.branch.upsert":
      return { tableName: "sucursales", operation: "upsert", sql: "INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", values: [command.id, tenantId, command.name] };
    case "catalog.customer.upsert":
      return { tableName: "customers", operation: "upsert", sql: "INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", values: [command.id, tenantId, command.name] };
    case "catalog.supplier.upsert":
      return { tableName: "proveedores", operation: "upsert", sql: "INSERT INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", values: [command.id, tenantId, command.name] };
    case "catalog.category.upsert":
      return {
        tableName: "menu_categories",
        operation: "upsert",
        sql: `
          INSERT INTO menu_categories (id, tenant_id, nombre, color, sort_order, sucursal_id)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            nombre = excluded.nombre,
            color = excluded.color,
            sort_order = excluded.sort_order,
            sucursal_id = excluded.sucursal_id
        `,
        values: [command.id, tenantId, command.nombre, command.color, command.sortOrder, command.sucursalId],
      };
    case "catalog.category.delete":
      return { tableName: "menu_categories", operation: "delete", sql: "DELETE FROM menu_categories WHERE id = ? AND tenant_id = ?", values: [command.id, tenantId] };
    case "catalog.product.upsert":
      return {
        tableName: "platos",
        operation: "upsert",
        sql: `
          INSERT INTO platos (id, tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            sucursal_id = excluded.sucursal_id,
            nombre = excluded.nombre,
            precio = excluded.precio,
            categoria = excluded.categoria,
            disponible = excluded.disponible,
            va_a_cocina = excluded.va_a_cocina,
            updated_at = datetime('now')
        `,
        values: [command.id, tenantId, command.sucursalId, command.nombre, command.precio, command.categoria, Number(command.disponible), Number(command.va_a_cocina)],
      };
    case "catalog.product.delete":
      return { tableName: "platos", operation: "delete", sql: "DELETE FROM platos WHERE id = ? AND tenant_id = ?", values: [command.id, tenantId] };
    case "catalog.inventory-product.upsert":
      return { tableName: "productos_inventario", operation: "upsert", sql: "INSERT INTO productos_inventario (id, tenant_id, name, unit) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, unit = excluded.unit", values: [command.id, tenantId, command.name, command.unit] };
    case "catalog.recipe.upsert":
      return { tableName: "recetas", operation: "upsert", sql: "INSERT INTO recetas (id, tenant_id, plato_id, inventory_product_id, quantity) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET plato_id = excluded.plato_id, inventory_product_id = excluded.inventory_product_id, quantity = excluded.quantity", values: [command.id, tenantId, command.platoId, command.inventoryProductId, command.quantity] };
  }
}

export class TenantStoreController {
  private activeStore: TenantStore | null = null;
  public readonly payrollSync = new PayrollSyncOrchestrator();

  constructor(private readonly dataRoot: string) {}

  activate(tenantId: string): TenantStore {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(tenantId)) {
      throw new Error("Invalid tenant identity");
    }

    this.close();
    this.activeStore = TenantStore.open({ dataRoot: this.dataRoot, tenantId });
    this.payrollSync.start(this.activeStore.getDatabase(), tenantId);
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

  getSyncDiagnosticReport(tenantId?: string) {
    let store = this.activeStore;
    if (tenantId && (!store || store.getTenantId() !== tenantId)) {
      store = this.activate(tenantId);
    }
    if (!store) return null;
    return store.getSyncDiagnosticReport();
  }

  retryFailedOutboxOperations(tenantId?: string): number {
    let store = this.activeStore;
    if (tenantId && (!store || store.getTenantId() !== tenantId)) {
      store = this.activate(tenantId);
    }
    if (!store) return 0;
    const count = store.retryFailedOutboxOperations();
    this.payrollSync.triggerSync().catch(console.error);
    return count;
  }

  close(): void {
    this.payrollSync.stop();
    this.activeStore?.close();
    this.activeStore = null;
  }
}
