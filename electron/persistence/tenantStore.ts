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
import type { PurchaseCommand, CashPurchaseCommand, CashPurchaseRepositoryStore } from "./cashPurchaseRepository";
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
          const rawBranch = typeof (command as any).sucursalId === "string" && (command as any).sucursalId.trim()
            ? (command as any).sucursalId.trim()
            : branchId;
          if (rawBranch && rawBranch !== "main-process-default") {
            this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(rawBranch, this.tenantId, "Principal");
          }
          const existing = this.database.prepare("SELECT id FROM cierres_operativos WHERE tenant_id = ? AND (sucursal_id = ? OR sucursal_id = 'main-process-default' OR sucursal_id IS NULL) AND state = 'open' LIMIT 1").get(this.tenantId, rawBranch);
          if (existing) throw new Error("Open cycle already exists");
          // Rich cycle shape: cycle_number/opened_at mirror the cloud row so the
          // SQLite writer (now the single engine) can create the Supabase cycle on
          // push. created_at is aligned to opened_at for deterministic ordering.
          this.database.prepare("INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, closed_at, cycle_number, opened_at, created_at) VALUES (?, ?, ?, ?, ?, 'open', NULL, ?, ?, ?)").run(command.id, this.tenantId, rawBranch, command.businessDay, command.openingCash, command.cycleNumber, command.openedAt, command.openedAt);
          outbox("cierres_operativos", command.id, { ...command, branchId: rawBranch }, "cycle-open");
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

  executeCashPurchaseCommand(input: { command: PurchaseCommand; commitId: string; branchId: string }): void {
    const { command, commitId, branchId } = input;
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO tenants (id) VALUES (?)").run(this.tenantId);
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");

      if (command.type === "purchase.cash.create") {
        const total = command.quantity * command.unitCost;
        this.database.prepare("INSERT OR IGNORE INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run(command.supplierId, this.tenantId, "Proveedor");
        this.database.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES (?, ?, ?, ?, 'cash', ?, 'pending_sync')").run(command.purchaseId, this.tenantId, branchId, command.supplierId, total);
        this.database.prepare("INSERT INTO detalles_compra (id, tenant_id, compra_id, inventory_product_id, quantity, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)").run(command.detailId, this.tenantId, command.purchaseId, command.inventoryProductId, command.quantity, command.unitCost, total);
        this.database.prepare("INSERT INTO movimientos_inventario (id, tenant_id, sucursal_id, compra_id, inventory_product_id, movement_type, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, 'purchase_receipt', ?, ?)").run(command.inventoryMovementId, this.tenantId, branchId, command.purchaseId, command.inventoryProductId, command.quantity, command.unitCost);
        this.database.prepare("INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, payroll_payment_id, expense_type, payment_method, amount, amount_cents, local_status, description) VALUES (?, ?, ?, ?, NULL, 'purchase', 'cash', ?, NULL, 'pending_sync', NULL)").run(command.expenseId, this.tenantId, branchId, command.purchaseId, total);
        for (const [tableName, rowId, suffix] of [["compras", command.purchaseId, "purchase"], ["detalles_compra", command.detailId, "detail"], ["movimientos_inventario", command.inventoryMovementId, "movement"], ["gastos", command.expenseId, "expense"]]) {
          this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')").run(`${commitId}:${suffix}`, this.tenantId, branchId, tableName, rowId, JSON.stringify(command));
        }
      } else if (command.type === "purchase.create") {
        const targetBranch = command.sucursalId || branchId;
        this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(targetBranch, this.tenantId, "Principal");
        const provName = command.providerName || "Proveedor";
        this.database.prepare("INSERT OR IGNORE INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run(command.supplierId, this.tenantId, provName);

        const fechaCompra = command.fechaCompra || new Date().toISOString();
        const total = command.total || 0;
        const montoPagado = command.montoPagado !== undefined ? command.montoPagado : (command.tipoPago === "contado" ? total : 0);

        this.database.prepare(`
          INSERT INTO compras (
            id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status,
            numero_factura, tipo_pago, metodo_pago, monto_pagado, fecha_compra, cycle_id, estado, observacion, usuario_id
          ) VALUES (?, ?, ?, ?, 'cash', ?, 'committed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            total = excluded.total,
            numero_factura = excluded.numero_factura,
            tipo_pago = excluded.tipo_pago,
            metodo_pago = excluded.metodo_pago,
            monto_pagado = excluded.monto_pagado,
            fecha_compra = excluded.fecha_compra,
            estado = excluded.estado,
            observacion = excluded.observacion
        `).run(
          command.id,
          this.tenantId,
          targetBranch,
          command.supplierId,
          total,
          command.numeroFactura || null,
          command.tipoPago,
          command.metodoPago || null,
          montoPagado,
          fechaCompra,
          command.cycleId || null,
          command.estado || "completada",
          command.observacion || null,
          command.usuarioId || null
        );

        this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'compras', ?, 'upsert', ?, 'pending')").run(
          `${commitId}:purchase`,
          this.tenantId,
          targetBranch,
          command.id,
          JSON.stringify({
            id: command.id,
            tenant_id: this.tenantId,
            sucursal_id: targetBranch,
            proveedor_id: command.supplierId,
            numero_factura: command.numeroFactura || null,
            tipo_pago: command.tipoPago,
            metodo_pago: command.metodoPago || null,
            monto_pagado: montoPagado,
            fecha_compra: fechaCompra,
            total,
            cycle_id: command.cycleId || null,
            estado: command.estado || "completada",
            observacion: command.observacion || null,
            usuario_id: command.usuarioId || null,
          })
        );

        for (const item of command.items) {
          const detalleId = item.id;
          const itemTotal = item.total || (item.cantidad * item.costoUnitario);
          this.database.prepare("INSERT OR IGNORE INTO productos_inventario (id, tenant_id, name, unit) VALUES (?, ?, 'Producto', 'ud')").run(item.productoId, this.tenantId);
          this.database.prepare("INSERT OR REPLACE INTO detalles_compra (id, tenant_id, compra_id, inventory_product_id, quantity, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
            detalleId,
            this.tenantId,
            command.id,
            item.productoId,
            item.cantidad,
            item.costoUnitario,
            itemTotal
          );

          this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'compra_detalles', ?, 'upsert', ?, 'pending')").run(
            `${commitId}:detail:${detalleId}`,
            this.tenantId,
            targetBranch,
            detalleId,
            JSON.stringify({
              id: detalleId,
              tenant_id: this.tenantId,
              compra_id: command.id,
              producto_id: item.productoId,
              cantidad: item.cantidad,
              costo_unitario: item.costoUnitario,
              total: itemTotal,
            })
          );

          if (item.movimientoId) {
            this.database.prepare("INSERT OR REPLACE INTO movimientos_inventario (id, tenant_id, sucursal_id, compra_id, inventory_product_id, movement_type, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, 'purchase_receipt', ?, ?)").run(
              item.movimientoId,
              this.tenantId,
              targetBranch,
              command.id,
              item.productoId,
              item.cantidad,
              item.costoUnitario
            );

            this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'inventario_movimientos', ?, 'upsert', ?, 'pending')").run(
              `${commitId}:mov:${item.movimientoId}`,
              this.tenantId,
              targetBranch,
              item.movimientoId,
              JSON.stringify({
                id: item.movimientoId,
                tenant_id: this.tenantId,
                sucursal_id: targetBranch,
                producto_id: item.productoId,
                tipo: "entrada",
                cantidad: item.cantidad,
                stock_antes: item.stockAntes || 0,
                stock_despues: item.stockDespues !== undefined ? item.stockDespues : item.cantidad,
                costo_unitario: item.costoUnitario,
                motivo: "Ingreso por compra",
                referencia: `Compra: ${command.numeroFactura || command.id}`,
                fecha: fechaCompra,
                usuario_id: command.usuarioId || null,
              })
            );
          }
        }

        if (command.fiscal) {
          const fisc = command.fiscal;
          const fiscalRow = {
            id: fisc.id,
            tenant_id: this.tenantId,
            compra_id: command.id,
            rnc_cedula: fisc.rncCedula,
            tipo_identificacion: fisc.tipoIdentificacion || (fisc.rncCedula.length === 9 ? "1" : "2"),
            tipo_bien_servicio: fisc.tipoBienServicio || "09",
            ncf: fisc.ncf,
            ncf_modificado: fisc.ncfModificado || null,
            fecha_comprobante: fisc.fechaComprobante || fechaCompra.slice(0, 10),
            fecha_pago: fisc.fechaPago || (command.tipoPago === "credito" ? null : fechaCompra.slice(0, 10)),
            monto_servicios: fisc.montoServicios || 0,
            monto_bienes: fisc.montoBienes || total,
            total_facturado: fisc.totalFacturado || total,
            itbis_facturado: fisc.itbisFacturado || 0,
            itbis_retenido: fisc.itbisRetenido || 0,
            itbis_proporcionalidad: 0,
            itbis_costo: fisc.itbisFacturado || 0,
            itbis_adelantar: 0,
            itbis_percibido: 0,
            tipo_retencion_isr: null as string | null,
            retencion_isr: fisc.retencionIsr || 0,
            isr_percibido: 0,
            impuesto_selectivo: fisc.impuestoSelectivo || 0,
            otros_impuestos: fisc.otrosImpuestos || 0,
            propina_legal: fisc.propinaLegal || 0,
            forma_pago: fisc.formaPago || "01",
          };
          // Local mirror so a later SQLite-only fiscal edit has a row to update.
          this.database.prepare(`
            INSERT INTO compra_fiscal (
              id, tenant_id, compra_id, rnc_cedula, tipo_identificacion, tipo_bien_servicio, ncf, ncf_modificado,
              fecha_comprobante, fecha_pago, monto_servicios, monto_bienes, total_facturado, itbis_facturado,
              itbis_retenido, itbis_proporcionalidad, itbis_costo, itbis_adelantar, itbis_percibido,
              tipo_retencion_isr, retencion_isr, isr_percibido, impuesto_selectivo, otros_impuestos, propina_legal, forma_pago
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              rnc_cedula = excluded.rnc_cedula,
              tipo_identificacion = excluded.tipo_identificacion,
              ncf = excluded.ncf,
              fecha_comprobante = excluded.fecha_comprobante
          `).run(
            fiscalRow.id, fiscalRow.tenant_id, fiscalRow.compra_id, fiscalRow.rnc_cedula, fiscalRow.tipo_identificacion,
            fiscalRow.tipo_bien_servicio, fiscalRow.ncf, fiscalRow.ncf_modificado, fiscalRow.fecha_comprobante,
            fiscalRow.fecha_pago, fiscalRow.monto_servicios, fiscalRow.monto_bienes, fiscalRow.total_facturado,
            fiscalRow.itbis_facturado, fiscalRow.itbis_retenido, fiscalRow.itbis_proporcionalidad, fiscalRow.itbis_costo,
            fiscalRow.itbis_adelantar, fiscalRow.itbis_percibido, fiscalRow.tipo_retencion_isr, fiscalRow.retencion_isr,
            fiscalRow.isr_percibido, fiscalRow.impuesto_selectivo, fiscalRow.otros_impuestos, fiscalRow.propina_legal,
            fiscalRow.forma_pago
          );
          this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'compra_fiscal', ?, 'upsert', ?, 'pending')").run(
            `${commitId}:fiscal`,
            this.tenantId,
            targetBranch,
            fisc.id,
            JSON.stringify(fiscalRow)
          );
        }

        if (command.expense && command.expense.amount > 0) {
          const exp = command.expense;
          this.database.prepare("INSERT OR IGNORE INTO gasto_categorias (id, tenant_id, name, color, active) VALUES (?, ?, 'Compras', '#ff906d', 1)").run(exp.categoryId || "cat-compras", this.tenantId);
          this.database.prepare(`
            INSERT INTO gastos (id, tenant_id, sucursal_id, category_id, cycle_id, compra_id, expense_type, payment_method, amount, local_status, description, expense_date)
            VALUES (?, ?, ?, ?, ?, ?, 'purchase', ?, ?, 'committed', ?, ?)
          `).run(
            exp.id,
            this.tenantId,
            targetBranch,
            exp.categoryId || null,
            exp.cycleId || command.cycleId || null,
            command.id,
            exp.paymentMethod || "cash",
            exp.amount,
            exp.description,
            exp.expenseDate || fechaCompra
          );
        }

        if (command.payable && command.payable.totalAmount > 0) {
          const pay = command.payable;
          this.database.prepare(`
            INSERT INTO cuentas_pagar (id, tenant_id, sucursal_id, compra_id, proveedor_id, monto_total, monto_pendiente, estado, fecha_vencimiento, fecha_emision, observacion)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)
          `).run(
            pay.id,
            this.tenantId,
            targetBranch,
            command.id,
            command.supplierId,
            pay.totalAmount,
            pay.totalAmount,
            pay.dueDate || null,
            pay.fechaEmision || fechaCompra.slice(0, 10),
            pay.observacion || null
          );

          this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'cuentas_pagar', ?, 'upsert', ?, 'pending')").run(
            `${commitId}:payable`,
            this.tenantId,
            targetBranch,
            pay.id,
            JSON.stringify({
              id: pay.id,
              tenantId: this.tenantId,
              sucursalId: targetBranch,
              supplierId: command.supplierId,
              compraId: command.id,
              totalAmount: pay.totalAmount,
              dueDate: pay.dueDate || null,
              fechaEmision: pay.fechaEmision || fechaCompra.slice(0, 10),
              observacion: pay.observacion || null,
            })
          );
        }
      } else if (command.type === "purchase.delete") {
        this.database.prepare("UPDATE compras SET estado = 'anulada' WHERE id = ? AND tenant_id = ?").run(command.purchaseId, this.tenantId);
        this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'compras', ?, 'delete', ?, 'pending')").run(
          `${commitId}:purchase-delete`,
          this.tenantId,
          branchId,
          command.purchaseId,
          JSON.stringify({ id: command.purchaseId })
        );

        const payables = this.database.prepare("SELECT id FROM cuentas_pagar WHERE compra_id = ? AND tenant_id = ?").all(command.purchaseId, this.tenantId) as Array<{ id: string }>;
        for (const p of payables) {
          this.database.prepare("DELETE FROM cuentas_pagar WHERE id = ?").run(p.id);
          this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'cuentas_pagar', ?, 'delete', ?, 'pending')").run(
            `${commitId}:payable-del:${p.id}`,
            this.tenantId,
            branchId,
            p.id,
            JSON.stringify({ id: p.id })
          );
        }

        const expenses = this.database.prepare("SELECT id FROM gastos WHERE compra_id = ? AND tenant_id = ?").all(command.purchaseId, this.tenantId) as Array<{ id: string }>;
        for (const e of expenses) {
          this.database.prepare("DELETE FROM gastos WHERE id = ?").run(e.id);
          this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'gastos', ?, 'delete', ?, 'pending')").run(
            `${commitId}:expense-del:${e.id}`,
            this.tenantId,
            branchId,
            e.id,
            JSON.stringify({ id: e.id })
          );
        }
      } else if (command.type === "purchase.updateFiscal") {
        // SQLite-only fiscal/supplier edit of an existing purchase, replacing the
        // legacy IndexedDB-mirror writes. Updates the purchase, its 606 fiscal row
        // and its payable (all pushed via outbox) plus the linked local expense.
        const provName = command.providerName || "Proveedor";
        this.database.prepare("INSERT OR IGNORE INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run(command.proveedorId, this.tenantId, provName);

        const compra = this.database.prepare(
          "SELECT sucursal_id, total, tipo_pago, metodo_pago, monto_pagado, fecha_compra, cycle_id, estado, usuario_id FROM compras WHERE id = ? AND tenant_id = ?"
        ).get(command.purchaseId, this.tenantId) as {
          sucursal_id: string; total: number; tipo_pago: string | null; metodo_pago: string | null;
          monto_pagado: number | null; fecha_compra: string | null; cycle_id: string | null;
          estado: string | null; usuario_id: string | null;
        } | undefined;
        if (!compra) throw new Error(`La compra ${command.purchaseId} no existe.`);
        const targetBranch = compra.sucursal_id || branchId;

        // 1. Purchase header.
        this.database.prepare(
          "UPDATE compras SET proveedor_id = ?, numero_factura = ?, fecha_compra = ?, observacion = ? WHERE id = ? AND tenant_id = ?"
        ).run(command.proveedorId, command.numeroFactura, command.fechaCompra, command.observacion ?? null, command.purchaseId, this.tenantId);
        this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'compras', ?, 'upsert', ?, 'pending')").run(
          `${commitId}:purchase`,
          this.tenantId,
          targetBranch,
          command.purchaseId,
          JSON.stringify({
            id: command.purchaseId,
            tenant_id: this.tenantId,
            sucursal_id: targetBranch,
            proveedor_id: command.proveedorId,
            numero_factura: command.numeroFactura,
            tipo_pago: compra.tipo_pago || "contado",
            metodo_pago: compra.metodo_pago || null,
            monto_pagado: compra.monto_pagado ?? 0,
            fecha_compra: command.fechaCompra,
            total: compra.total ?? 0,
            cycle_id: compra.cycle_id || null,
            estado: compra.estado || "completada",
            observacion: command.observacion ?? null,
            usuario_id: compra.usuario_id || null,
          })
        );

        // 2. Fiscal (606) row, if present locally.
        const fiscal = this.database.prepare("SELECT id FROM compra_fiscal WHERE compra_id = ? AND tenant_id = ?").get(command.purchaseId, this.tenantId) as { id: string } | undefined;
        if (fiscal) {
          const rnc = command.providerRnc || "";
          const tipoIdentificacion = rnc.length === 9 ? "1" : "2";
          this.database.prepare(
            "UPDATE compra_fiscal SET rnc_cedula = ?, tipo_identificacion = ?, ncf = ?, fecha_comprobante = ? WHERE compra_id = ? AND tenant_id = ?"
          ).run(rnc, tipoIdentificacion, command.numeroFactura.trim().toUpperCase(), command.fechaCompra.slice(0, 10), command.purchaseId, this.tenantId);
          const updatedFiscal = this.database.prepare("SELECT * FROM compra_fiscal WHERE id = ? AND tenant_id = ?").get(fiscal.id, this.tenantId) as Record<string, unknown> | undefined;
          if (updatedFiscal) {
            this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'compra_fiscal', ?, 'upsert', ?, 'pending')").run(
              `${commitId}:fiscal`,
              this.tenantId,
              targetBranch,
              fiscal.id,
              JSON.stringify(updatedFiscal)
            );
          }
        }

        // 3. Payable, if present locally.
        const payable = this.database.prepare("SELECT id, proveedor_id, monto_total, fecha_vencimiento, fecha_emision FROM cuentas_pagar WHERE compra_id = ? AND tenant_id = ?").get(command.purchaseId, this.tenantId) as {
          id: string; proveedor_id: string; monto_total: number; fecha_vencimiento: string | null; fecha_emision: string | null;
        } | undefined;
        if (payable) {
          this.database.prepare(
            "UPDATE cuentas_pagar SET proveedor_id = ?, fecha_emision = ?, observacion = ? WHERE id = ? AND tenant_id = ?"
          ).run(command.proveedorId, command.fechaCompra, command.observacion ?? null, payable.id, this.tenantId);
          this.database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, 'cuentas_pagar', ?, 'upsert', ?, 'pending')").run(
            `${commitId}:payable`,
            this.tenantId,
            targetBranch,
            payable.id,
            JSON.stringify({
              id: payable.id,
              tenantId: this.tenantId,
              sucursalId: targetBranch,
              supplierId: command.proveedorId,
              compraId: command.purchaseId,
              totalAmount: payable.monto_total,
              dueDate: payable.fecha_vencimiento || undefined,
              fechaEmision: command.fechaCompra,
              observacion: command.observacion ?? undefined,
            })
          );
        }

        // 4. Linked expense: local only. The compras-paid gasto is never pushed to
        //    the cloud from SQLite (purchase.create enqueues no gastos outbox, and
        //    there is no cloud trigger), so the edit stays local for read parity.
        this.database.prepare(
          "UPDATE gastos SET description = ?, supplier = ?, expense_date = ? WHERE compra_id = ? AND tenant_id = ?"
        ).run(`Compra - Factura ${command.numeroFactura.trim() || "S/N"}`, provName, command.fechaCompra, command.purchaseId, this.tenantId);
      }

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

  listCompras(filter?: {
    sucursalId?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Array<Record<string, unknown>> {
    const conditions = ["tenant_id = ?"];
    const params: Array<string | number> = [this.tenantId];
    if (filter?.sucursalId) {
      conditions.push("(sucursal_id = ? OR sucursal_id = 'main-process-default')");
      params.push(filter.sucursalId);
    }
    if (filter?.dateFrom) {
      conditions.push("substr(fecha_compra, 1, 10) >= ?");
      params.push(filter.dateFrom);
    }
    if (filter?.dateTo) {
      conditions.push("substr(fecha_compra, 1, 10) <= ?");
      params.push(filter.dateTo);
    }
    const limit = filter?.limit ?? 500;
    const sql = `SELECT * FROM compras WHERE ${conditions.join(" AND ")} ORDER BY fecha_compra DESC LIMIT ?`;
    params.push(limit);
    return this.database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  }

  ensureComprasOutboxIntegrity(): void {
    try {
      this.database.prepare(`
        DELETE FROM sync_outbox
        WHERE tenant_id = ?
          AND table_name IN ('compra_detalles', 'detalles_compra')
          AND payload_json LIKE '%item-general%'
      `).run(this.tenantId);

      const unqueuedCompras = this.database.prepare(`
        SELECT c.* FROM compras c
        WHERE c.tenant_id = ?
          AND c.local_status = 'pending_sync'
          AND c.id NOT IN (SELECT row_id FROM sync_outbox WHERE table_name = 'compras')
      `).all(this.tenantId) as Array<Record<string, unknown>>;

      if (unqueuedCompras.length > 0) {
        console.log(`[compras-sync] Enqueuing ${unqueuedCompras.length} unqueued compras for cloud sync`);
        const stmt = this.database.prepare(`
          INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
          VALUES (?, ?, ?, 'compras', ?, 'upsert', ?, 'pending')
        `);

        for (const c of unqueuedCompras) {
          const branchId = typeof c.sucursal_id === "string" && c.sucursal_id.trim() ? c.sucursal_id : "main-process-default";
          stmt.run(`reconcile:compra:${c.id}`, this.tenantId, branchId, String(c.id), JSON.stringify(c));
        }
      }
    } catch (err) {
      console.warn("[compras-sync] ensureComprasOutboxIntegrity failed:", err);
    }
  }

  listExpenses(filter?: {
    sucursalId?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Array<Record<string, unknown>> {
    const conditions = ["tenant_id = ?"];
    const params: Array<string | number> = [this.tenantId];
    if (filter?.sucursalId) {
      conditions.push("(sucursal_id = ? OR sucursal_id = 'main-process-default')");
      params.push(filter.sucursalId);
    }
    // expense_date can be a full ISO timestamp or a plain YYYY-MM-DD; compare on
    // the calendar-day prefix so both shapes filter correctly with date-only bounds.
    if (filter?.dateFrom) {
      conditions.push("substr(expense_date, 1, 10) >= ?");
      params.push(filter.dateFrom);
    }
    if (filter?.dateTo) {
      conditions.push("substr(expense_date, 1, 10) <= ?");
      params.push(filter.dateTo);
    }
    const limit = filter?.limit ?? 100;
    const sql = `SELECT * FROM gastos WHERE ${conditions.join(" AND ")} ORDER BY expense_date DESC LIMIT ?`;
    params.push(limit);
    return this.database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  }

  listExpenseCategories(): Array<Record<string, unknown>> {
    return this.database.prepare(
      "SELECT id, name AS nombre, description AS descripcion, color, active AS activa FROM gasto_categorias WHERE tenant_id = ? AND active = 1 ORDER BY name ASC"
    ).all(this.tenantId) as Array<Record<string, unknown>>;
  }

  listInvoices(filter?: {
    sucursalId?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Array<Record<string, unknown>> {
    const conditions = ["tenant_id = ?"];
    const params: Array<string | number> = [this.tenantId];
    if (filter?.sucursalId) {
      conditions.push("(sucursal_id = ? OR sucursal_id = 'main-process-default')");
      params.push(filter.sucursalId);
    }
    // dateFrom/dateTo are ISO-UTC bounds (the client already converted the
    // calendar day into start/end-of-day timestamps), so a lexicographic
    // comparison against the ISO-UTC created_at column is chronological.
    if (filter?.dateFrom) {
      conditions.push("created_at >= ?");
      params.push(filter.dateFrom);
    }
    if (filter?.dateTo) {
      conditions.push("created_at <= ?");
      params.push(filter.dateTo);
    }
    let sql = `SELECT * FROM facturas WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;
    if (typeof filter?.limit === "number" && filter.limit > 0) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }
    return this.database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
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

  listCierres(filter?: {
    sucursalId?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Array<Record<string, unknown>> {
    const columns = "id, tenant_id, sucursal_id, business_day, opening_cash AS efectivo_inicial, state, closed_at, cycle_number, opened_at, printed_at, created_at";
    const conditions = ["tenant_id = ?"];
    const params: Array<string | number> = [this.tenantId];
    if (filter?.sucursalId) {
      conditions.push("(sucursal_id = ? OR sucursal_id = 'main-process-default' OR sucursal_id IS NULL)");
      params.push(filter.sucursalId);
    }
    // Cycles are scoped by their calendar business_day (YYYY-MM-DD), so the
    // client passes plain date bounds here (not ISO-UTC timestamps).
    if (filter?.dateFrom) {
      conditions.push("business_day >= ?");
      params.push(filter.dateFrom);
    }
    if (filter?.dateTo) {
      conditions.push("business_day <= ?");
      params.push(filter.dateTo);
    }
    const limit = filter?.limit ?? 500;
    const sql = `SELECT ${columns} FROM cierres_operativos WHERE ${conditions.join(" AND ")} ORDER BY cycle_number DESC LIMIT ?`;
    params.push(limit);
    return this.database.prepare(sql).all(...params) as Array<Record<string, unknown>>;
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
    const estado = comanda.estado ? String(comanda.estado) : "pendiente";
    const state = estado === "entregado" ? "delivered" : estado === "listo" ? "ready" : estado === "en_preparacion" ? "preparing" : "pending";
    const mesaNum = comanda.mesa_numero != null && Number(comanda.mesa_numero) > 0 ? Number(comanda.mesa_numero) : 1;
    const mesaId = comanda.mesa_id ? String(comanda.mesa_id) : String(mesaNum);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");
      this.database.prepare("INSERT OR IGNORE INTO mesas_estado (id, tenant_id, sucursal_id, table_number, state) VALUES (?, ?, ?, ?, 'free')").run(mesaId, this.tenantId, branchId, mesaNum);
      this.database.prepare(`
        INSERT INTO comandas (id, tenant_id, sucursal_id, numero_comanda, mesa_id, mesa_numero, state, estado, items, notas, creado_por, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sucursal_id = excluded.sucursal_id,
          numero_comanda = excluded.numero_comanda,
          mesa_id = excluded.mesa_id,
          mesa_numero = excluded.mesa_numero,
          state = excluded.state,
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
        mesaId,
        mesaNum,
        state,
        estado,
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
      // Clear the two local references to the comanda first, or the DELETE trips
      // a foreign-key constraint: consumos.comanda_id is nullable (unlink — paid
      // consumos are kept and belong to their factura now), while
      // produccion_cocina.comanda_id is NOT NULL, so those kitchen-tracking rows
      // are removed (they are local-only and obsolete once the order is closed).
      this.database.prepare("UPDATE consumos SET comanda_id = NULL WHERE comanda_id = ? AND tenant_id = ?").run(comandaId, this.tenantId);
      this.database.prepare("DELETE FROM produccion_cocina WHERE comanda_id = ? AND tenant_id = ?").run(comandaId, this.tenantId);
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
    const existing = this.database.prepare("SELECT * FROM consumos WHERE id = ? AND tenant_id = ?").get(id, this.tenantId) as Record<string, unknown> | undefined;

    const branchId = typeof consumo.sucursal_id === "string" && consumo.sucursal_id.trim()
      ? consumo.sucursal_id.trim()
      : (typeof existing?.sucursal_id === "string" && existing.sucursal_id.trim() ? existing.sucursal_id.trim() : "main-process-default");

    const rawCant = consumo.cantidad ?? consumo.quantity ?? existing?.cantidad ?? existing?.quantity;
    const cant = Number(rawCant);
    const cantidad = Number.isFinite(cant) && cant > 0 ? Math.round(cant) : 1;

    const rawPrecio = consumo.precio_unitario ?? consumo.unit_price ?? existing?.precio_unitario ?? existing?.unit_price;
    const precio = Number(rawPrecio);
    const precioUnitario = Number.isFinite(precio) && precio >= 0 ? precio : 0;

    const rawSub = consumo.subtotal ?? existing?.subtotal;
    const sub = Number(rawSub);
    const subtotal = Number.isFinite(sub) && sub >= 0 ? sub : cantidad * precioUnitario;

    const itemName = consumo.nombre
      ? String(consumo.nombre)
      : (consumo.name
        ? String(consumo.name)
        : (existing?.nombre
          ? String(existing.nombre)
          : (existing?.name ? String(existing.name) : "Item")));

    const estado = consumo.estado ? String(consumo.estado) : (existing?.estado ? String(existing.estado) : "pendiente");
    const state = estado === "pagado" || estado === "entregado" ? "delivered" : estado === "listo" ? "ready" : "sent_to_kitchen";
    // Distinguish "field absent" (keep the existing link) from "explicit null"
    // (clear it): a paid consumo is intentionally unlinked from its comanda at
    // checkout, and treating null as "keep" would leave a dead FK to push.
    const comandaId = "comanda_id" in consumo
      ? (consumo.comanda_id ? String(consumo.comanda_id) : null)
      : (existing?.comanda_id ? String(existing.comanda_id) : null);
    const platoId = consumo.plato_id != null ? String(consumo.plato_id) : (existing?.plato_id != null ? String(existing.plato_id) : null);
    const facturaId = consumo.factura_id ? String(consumo.factura_id) : (existing?.factura_id ? String(existing.factura_id) : null);
    const mesaNumero = consumo.mesa_numero != null ? Number(consumo.mesa_numero) : (existing?.mesa_numero != null ? Number(existing.mesa_numero) : null);
    const createdBy = consumo.created_by_auth_user_id ? String(consumo.created_by_auth_user_id) : (existing?.created_by_auth_user_id ? String(existing.created_by_auth_user_id) : null);
    const createdAt = existing?.created_at ? String(existing.created_at) : (consumo.created_at ? String(consumo.created_at) : new Date().toISOString());
    const updatedAt = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(branchId, this.tenantId, "Principal");
      if (comandaId) {
        this.database.prepare("INSERT OR IGNORE INTO comandas (id, tenant_id, sucursal_id, mesa_id, mesa_numero, state) VALUES (?, ?, ?, '1', 1, 'pending')").run(comandaId, this.tenantId, branchId);
      }
      this.database.prepare(`
        INSERT INTO consumos (id, tenant_id, sucursal_id, comanda_id, plato_id, name, nombre, quantity, cantidad, unit_price, precio_unitario, subtotal, tipo, state, estado, factura_id, mesa_numero, created_by_auth_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sucursal_id = excluded.sucursal_id,
          comanda_id = excluded.comanda_id,
          plato_id = excluded.plato_id,
          name = excluded.name,
          nombre = excluded.nombre,
          quantity = excluded.quantity,
          cantidad = excluded.cantidad,
          unit_price = excluded.unit_price,
          precio_unitario = excluded.precio_unitario,
          subtotal = excluded.subtotal,
          tipo = excluded.tipo,
          state = excluded.state,
          estado = excluded.estado,
          factura_id = excluded.factura_id,
          mesa_numero = excluded.mesa_numero,
          created_by_auth_user_id = excluded.created_by_auth_user_id,
          updated_at = excluded.updated_at
      `).run(
        id,
        this.tenantId,
        branchId,
        comandaId,
        platoId,
        itemName,
        itemName,
        cantidad,
        cantidad,
        precioUnitario,
        precioUnitario,
        subtotal,
        consumo.tipo ? String(consumo.tipo) : (existing?.tipo ? String(existing.tipo) : "plato"),
        state,
        estado,
        facturaId,
        mesaNumero,
        createdBy,
        createdAt,
        updatedAt,
      );
      const fullConsumo = {
        id,
        tenant_id: this.tenantId,
        sucursal_id: branchId,
        comanda_id: comandaId,
        plato_id: platoId,
        nombre: itemName,
        name: itemName,
        cantidad,
        quantity: cantidad,
        precio_unitario: precioUnitario,
        unit_price: precioUnitario,
        subtotal,
        tipo: consumo.tipo ? String(consumo.tipo) : (existing?.tipo ? String(existing.tipo) : "plato"),
        state,
        estado,
        factura_id: facturaId,
        mesa_numero: mesaNumero,
        created_by_auth_user_id: createdBy,
        created_at: createdAt,
        updated_at: updatedAt,
      };
      this.database.prepare(`
        INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
        VALUES (?, ?, ?, 'consumos', ?, 'upsert', ?, 'pending')
      `).run(crypto.randomUUID(), this.tenantId, branchId, id, JSON.stringify(fullConsumo));
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
    this.database.prepare(`
      DELETE FROM sync_outbox
      WHERE tenant_id = ?
        AND table_name IN ('compra_detalles', 'detalles_compra')
        AND payload_json LIKE '%item-general%'
    `).run(this.tenantId);

    const result = this.database.prepare(`
      UPDATE sync_outbox
      SET status = 'pending', error_json = NULL
      WHERE tenant_id = ?
        AND (status IN ('not_retryable', 'conflicted') OR error_json IS NOT NULL)
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
    this.activeStore.ensureComprasOutboxIntegrity();
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

  listCompras(filter?: { sucursalId?: string; limit?: number; dateFrom?: string; dateTo?: string }): Array<Record<string, unknown>> {
    return this.activeStore?.listCompras(filter) ?? [];
  }

  close(): void {
    this.payrollSync.stop();
    this.activeStore?.close();
    this.activeStore = null;
  }
}
