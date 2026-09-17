import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DurableOperation, PullBatch, ServerChange, ServerSyncClient } from "./syncWorker";
import { SYNC_PULL_TABLES } from "./syncPullRegistry";

/** Cloud→local pull tables, from the shared registry (single source of truth).
 * Children have neither tenant_id nor updated_at: scope via the employee join.
 * Complete snapshots also reconcile hard deletes and recover rows missed by old cursors. */
const PULL_TABLES = SYNC_PULL_TABLES.map((entry) => ({
  table: entry.remoteTable,
  localTable: entry.localTable,
  child: entry.child,
}));
const PULL_PAGE_SIZE = 500;

type MutationError = {
  code?: string;
  message: string;
};

type RemoteMutationBuilder = {
  upsert(payload: Record<string, unknown>, options: { onConflict: string }): Promise<{ error: MutationError | null }>;
  update(payload: Record<string, unknown>): {
    eq(column: string, value: string): {
      select(): Promise<{ data: unknown[] | null; error: MutationError | null }>;
    };
  };
  delete(): {
    eq(column: string, value: string): Promise<{ error: MutationError | null }>;
  };
};

type RemoteRpcClient = {
  rpc(functionName: string, args: Record<string, unknown>): Promise<{ data?: unknown; error: MutationError | null }>;
};

type ClientOverride =
  | Pick<SupabaseClient, "from" | "rpc">
  | { from(table: string): RemoteMutationBuilder; rpc?(functionName: string, args: Record<string, unknown>): Promise<{ data?: unknown; error: MutationError | null }> };

type PushResponse = Awaited<ReturnType<ServerSyncClient["push"]>>;

export interface PayrollAuthorizationContext {
  tenantId: string;
  allowedBranchIds: string[];
}

export class PayrollSyncClient implements ServerSyncClient {
  private clientPromise: Promise<SupabaseClient | ClientOverride>;
  private readonly config: { url: string; key: string } | null;

  constructor(clientOverride?: ClientOverride, accessToken?: string | null) {
    if (clientOverride) {
      this.config = null;
      this.clientPromise = Promise.resolve(clientOverride);
    } else {
      const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
      const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
      if (!url || !key) {
        throw new Error("Missing Supabase configuration in main process");
      }
      if (!/^https:\/\/[^\s/]+/i.test(url)) {
        throw new Error("Invalid SUPABASE_URL in main process configuration");
      }
      this.config = { url, key };
      this.clientPromise = this.createClient(accessToken);
    }
  }

  setAccessToken(accessToken: string | null): void {
    if (this.config) {
      this.clientPromise = this.createClient(accessToken);
    }
  }

  async resolveAuthorizationContext(): Promise<PayrollAuthorizationContext> {
    const client: any = await this.clientPromise;
    const { data, error } = await client.rpc("cloudix_resolve_tenant_memberships", {});
    if (error) throw new Error(`Payroll authorization lookup failed: ${error.message}`);
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (rows.length !== 1) throw new Error("Payroll authorization requires exactly one active tenant membership");

    const row = rows[0] as { tenant_id?: unknown; allowed_branch_ids?: unknown };
    if (typeof row.tenant_id !== "string" || !Array.isArray(row.allowed_branch_ids)) {
      throw new Error("Payroll authorization response is invalid");
    }
    const allowedBranchIds = [...new Set(row.allowed_branch_ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
    if (allowedBranchIds.length === 0) throw new Error("Payroll authorization has no assigned branches");
    return { tenantId: row.tenant_id, allowedBranchIds };
  }

  async push(operation: DurableOperation): Promise<PushResponse> {
    if (operation.tableName === "cierres_operativos") {
      return this.pushOperationalCycle(operation);
    }
    if (operation.op === "delete") {
      return this.deleteRemote(operation);
    }

    const mapped = mapOperation(operation);
    if (!mapped.ok) {
      return { permanent: mapped.error };
    }

    const tableClient = await this.getTableClient(mapped.remoteTable);
    const { error } = await tableClient.upsert(mapped.payload, { onConflict: "id" });

    if (error) {
      return classifyRemoteError(error, operation.tableName, "upsert");
    }

    return { result: { synced: true, id: operation.rowId, remoteTable: mapped.remoteTable } };
  }

  private async pushOperationalCycle(operation: DurableOperation): Promise<PushResponse> {
    // SQLite is the single writer of operational cycles: it creates, closes,
    // prints, and discards the Supabase row directly. IndexedDB no longer pushes
    // cierres (see pushOutboxToServer), so there is exactly one cloud creator and
    // the historical duplicate-cycle path cannot reopen.
    const tableClient = await this.getTableClient("cierres_operativos");
    const payload = (operation.payload ?? {}) as Record<string, unknown>;

    if (operation.op === "delete" || payload.type === "orders.cycle.discard") {
      const { error } = await tableClient.delete().eq("id", operation.rowId);
      if (error) {
        if (error.code === "PGRST116" || error.message.toLowerCase().includes("not found")) {
          return { result: { deleted: true, note: "already absent", remoteTable: "cierres_operativos" } };
        }
        return classifyRemoteError(error, operation.tableName, "delete");
      }
      return { result: { deleted: true, remoteTable: "cierres_operativos" } };
    }

    // Open creates the full cloud row (all NOT NULL columns present), so an
    // upsert is safe. Close/print only touch one column: they MUST be an UPDATE,
    // never a partial upsert — a partial upsert forms an INSERT tuple missing the
    // NOT NULL business_day/cycle_number and Postgres rejects it with 23502
    // BEFORE the ON CONFLICT resolves, which classifyRemoteError treats as a
    // permanent (non-retrying) failure and silently drops the close.
    if (payload.type === "orders.cycle.open") {
      let row: Record<string, unknown>;
      try {
        row = mapOperationalCycleOpenRow(operation, payload);
      } catch (error) {
        return { permanent: permanentReason(error instanceof Error ? error.message : "Malformed operational cycle payload", "malformed_payload", operation.tableName) };
      }
      const { error } = await tableClient.upsert(row, { onConflict: "id" });
      if (error) return classifyRemoteError(error, operation.tableName, "upsert");
      return { result: { synced: true, id: operation.rowId, remoteTable: "cierres_operativos" } };
    }

    if (payload.type === "orders.cycle.close" || payload.type === "orders.cycle.mark-printed") {
      let patch: Record<string, unknown>;
      try {
        patch = mapOperationalCyclePatch(payload);
      } catch (error) {
        return { permanent: permanentReason(error instanceof Error ? error.message : "Malformed operational cycle payload", "malformed_payload", operation.tableName) };
      }
      const { data, error } = await tableClient.update(patch).eq("id", operation.rowId).select();
      if (error) return classifyRemoteError(error, operation.tableName, "update");
      if (!Array.isArray(data) || data.length === 0) {
        // The cloud row does not exist yet: the open push is scheduled but has not
        // landed (close is pushed by the scheduler, not immediately). Retry so the
        // close/print applies once the open row is present, instead of vanishing.
        throw new Error(`Operational cycle ${operation.rowId} is not present remotely yet; retrying after its open push lands`);
      }
      return { result: { synced: true, id: operation.rowId, remoteTable: "cierres_operativos" } };
    }

    return { permanent: permanentReason(`Unsupported operational cycle command: ${String(payload.type)}`, "unsupported_cycle_command", operation.tableName) };
  }

  async pull(input: { tenantId: string; cursor: string | null }): Promise<PullBatch> {
    const client: any = await this.clientPromise;
    const changes: ServerChange[] = [];
    const snapshotTables: string[] = [];
    // Per-table isolation: one table failing (RLS, a missing embed, a transient
    // network error) must NOT abort the whole download and leave SQLite empty.
    // Each table is buffered and only committed when its full pagination
    // succeeds, so a failing table applies nothing (no partial snapshot, no false
    // deletes) while every healthy table still downloads and retries next pull.
    for (const { table, localTable, child } of PULL_TABLES) {
      const tableChanges: ServerChange[] = [];
      try {
        let afterId: string | null = null;
        while (true) {
          let query = client.from(table)
            .select(child ? "*, nomina_empleados!inner(tenant_id,sucursal_id)" : "*")
            .eq(child ? "nomina_empleados.tenant_id" : "tenant_id", input.tenantId)
            .order("id", { ascending: true })
            .limit(PULL_PAGE_SIZE);
          if (afterId) query = query.gt("id", afterId);
          const { data, error } = await query;
          if (error) throw new Error(`Pull failed for ${table}: ${error.message}`);
          if (!Array.isArray(data)) throw new Error(`Invalid pull response for ${table}`);
          if (data.length === 0) break;
          for (const row of data) {
            if (!row || typeof row.id !== "string" || (afterId && row.id <= afterId)) {
              throw new Error(`Invalid pull page for ${table}`);
            }
            const parent = Array.isArray(row.nomina_empleados) ? row.nomina_empleados[0] : row.nomina_empleados;
            if ((child ? parent?.tenant_id : row.tenant_id) !== input.tenantId) {
              throw new Error(`Tenant mismatch in pull for ${table}`);
            }
            tableChanges.push({ tableName: localTable, rowId: row.id, payload: row, deleted: false });
            afterId = row.id;
          }
        }
        changes.push(...tableChanges);
        snapshotTables.push(localTable);
      } catch (error) {
        // Skip only this table; it stays behind and retries on the next pull.
        console.warn(`[sync↓] tabla ${table} no se pudo bajar (se omite, se reintenta): ${error instanceof Error ? error.message : "error"}`);
      }
    }
    return { cursor: new Date().toISOString(), changes, snapshotTables };
  }

  private async deleteRemote(operation: DurableOperation): Promise<PushResponse> {
    const mapped = mapDeleteOperation(operation);
    if (!mapped.ok) {
      return { permanent: mapped.error };
    }

    const tableClient = await this.getTableClient(mapped.remoteTable);
    const { error } = await tableClient
      .delete()
      .eq("id", operation.rowId);

    if (error) {
      if (error.code === "PGRST116" || error.message.toLowerCase().includes("not found")) {
        return { result: { deleted: true, note: "already absent", remoteTable: mapped.remoteTable } };
      }
      return classifyRemoteError(error, operation.tableName, "delete");
    }

    return { result: { deleted: true, remoteTable: mapped.remoteTable } };
  }

  private async getTableClient(table: string): Promise<RemoteMutationBuilder> {
    const client: any = await this.clientPromise;

    if (client?.from && typeof client.from === "function") {
      return client.from(table);
    }
    throw new Error("Invalid Supabase client: missing from method");
  }

  private createClient(accessToken?: string | null): Promise<SupabaseClient> {
    if (!this.config) {
      throw new Error("Payroll sync client configuration is unavailable");
    }
    return Promise.resolve(createClient(this.config.url, this.config.key, {
      global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined },
      auth: { autoRefreshToken: false, persistSession: false },
    }));
  }
}

function mapDeleteOperation(operation: DurableOperation):
  | { ok: true; remoteTable: string }
  | { ok: false; error: Record<string, unknown> & { reason: string; retryable: false } } {
  if (operation.tableName === "gastos") {
    return { ok: true, remoteTable: "gastos" };
  }
  if (operation.tableName === "gasto_categorias") {
    return { ok: true, remoteTable: "gasto_categorias" };
  }
  if (operation.tableName === "customers") {
    return { ok: true, remoteTable: "customers" };
  }
  // Deleting a cxc_pago fires the cloud trigger, which recomputes the parent
  // cuentas_cobrar balance from the remaining payments — no parent update needed.
  if (operation.tableName === "cxc_pagos") {
    return { ok: true, remoteTable: "cxc_pagos" };
  }
  if (operation.tableName === "cuentas_cobrar") {
    return { ok: true, remoteTable: "cuentas_cobrar" };
  }
  // Deleting a cxp_pago fires the cloud trigger to recompute the payable balance.
  if (operation.tableName === "cxp_pagos") {
    return { ok: true, remoteTable: "cxp_pagos" };
  }
  if (operation.tableName === "cuentas_pagar") {
    return { ok: true, remoteTable: "cuentas_pagar" };
  }

  const remoteTable = PAYROLL_TABLES[operation.tableName];
  if (!remoteTable) {
    return { ok: false, error: permanentReason(`Unsupported payroll sync table: ${operation.tableName}`, "unsupported_table", operation.tableName) };
  }

  return { ok: true, remoteTable };
}

function mapOperation(operation: DurableOperation):
  | { ok: true; remoteTable: string; payload: Record<string, unknown> }
  | { ok: false; error: Record<string, unknown> & { reason: string; retryable: false } } {
  if (!operation.payload || typeof operation.payload !== "object") {
    return { ok: false, error: permanentReason("Missing payload for payroll sync upsert", "missing_payload", operation.tableName) };
  }

  try {
    switch (operation.tableName) {
      case "payroll_employees":
        return { ok: true, remoteTable: "nomina_empleados", payload: mapEmployeePayload(operation, operation.payload) };
      case "payroll_payments":
        return { ok: true, remoteTable: "nomina_pagos", payload: mapPaymentPayload(operation, operation.payload) };
      case "payroll_payment_adjustments":
        return { ok: true, remoteTable: "nomina_ajustes", payload: mapAdjustmentPayload(operation, operation.payload) };
      case "gasto_categorias":
        return { ok: true, remoteTable: "gasto_categorias", payload: mapCategoryPayload(operation, operation.payload) };
      case "customers":
        return { ok: true, remoteTable: "customers", payload: mapCustomerPayload(operation, operation.payload) };
      case "cuentas_cobrar":
        return { ok: true, remoteTable: "cuentas_cobrar", payload: mapReceivablePayload(operation, operation.payload) };
      case "cxc_pagos":
        return { ok: true, remoteTable: "cxc_pagos", payload: mapReceivablePaymentPayload(operation, operation.payload) };
      case "cuentas_pagar":
        return { ok: true, remoteTable: "cuentas_pagar", payload: mapPayablePayload(operation, operation.payload) };
      case "cxp_pagos":
        return { ok: true, remoteTable: "cxp_pagos", payload: mapPayablePaymentPayload(operation, operation.payload) };
      case "gastos": {
        if (operation.payload.expenseType === "payroll") {
          const tableResult = mapPayrollExpenseTable(operation);
          if (!tableResult.ok) {
            return tableResult;
          }
          return { ok: true, remoteTable: tableResult.remoteTable, payload: mapPayrollExpensePayload(operation, operation.payload) };
        }
        return { ok: true, remoteTable: "gastos", payload: mapGeneralExpensePayload(operation, operation.payload) };
      }
      default:
        return { ok: false, error: permanentReason(`Unsupported payroll sync table: ${operation.tableName}`, "unsupported_table", operation.tableName) };
    }
  } catch (error) {
    return {
      ok: false,
      error: permanentReason(
        error instanceof Error ? error.message : "Malformed payroll sync payload",
        "malformed_payload",
        operation.tableName,
      ),
    };
  }
}

const PAYROLL_TABLES: Record<string, string> = {
  payroll_employees: "nomina_empleados",
  payroll_payment_adjustments: "nomina_ajustes",
  payroll_payments: "nomina_pagos",
};

function mapEmployeePayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const firstName = requireString(payload.firstName, "payroll_employees.firstName");
  const lastName = requireString(payload.lastName, "payroll_employees.lastName");
  const frequency = mapFrequency(requireString(payload.frequency, "payroll_employees.frequency"), operation.tableName);

  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    sucursal_id: requireString(payload.sucursalId, "payroll_employees.sucursalId"),
    nombre_completo: `${firstName} ${lastName}`.trim(),
    identificacion: operation.rowId,
    telefono: null,
    cargo: requireString(payload.role, "payroll_employees.role"),
    salario_base_mensual: requireNumber(payload.baseSalaryCents, "payroll_employees.baseSalaryCents"),
    frecuencia_pago: frequency,
    activo: requireBoolean(payload.isActive, "payroll_employees.isActive"),
  };
}

function mapPaymentPayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const delta = requireNumber(payload.adjustmentsDeltaCents, "payroll_payments.adjustmentsDeltaCents");
  return {
    id: operation.rowId,
    empleado_id: requireString(payload.employeeId, "payroll_payments.employeeId"),
    periodo: requireString(payload.period, "payroll_payments.period"),
    monto_base: requireNumber(payload.periodSalaryCents ?? payload.baseSalaryCents, "payroll_payments.periodSalaryCents"),
    total_bonos: payload.totalBonusesCents ?? (delta > 0 ? delta : 0),
    total_descuentos: payload.totalDiscountsCents ?? (delta < 0 ? Math.abs(delta) : 0),
    monto_neto: requireNumber(payload.totalDueCents, "payroll_payments.totalDueCents"),
    monto_pagado: requireNumber(payload.paymentAmountCents, "payroll_payments.paymentAmountCents"),
    monto_pendiente: requireNumber(payload.pendingCents, "payroll_payments.pendingCents"),
    gasto_id: payload.gastoId ?? null,
    ...(payload.createdAt ? { created_at: requireString(payload.createdAt, "payroll_payments.createdAt") } : {}),
  };
}

function mapAdjustmentPayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const kind = requireString(payload.kind, "payroll_payment_adjustments.kind");
  return {
    id: operation.rowId,
    empleado_id: requireString(payload.employeeId, "payroll_payment_adjustments.employeeId"),
    tipo: kind === "bonus" ? "bono" : kind === "discount" ? "descuento" : unsupportedValue("payroll_payment_adjustments.kind", kind),
    frecuencia: requireString(payload.scope, "payroll_payment_adjustments.scope") === "currentPayment" ? "unico" : "por_periodo",
    monto: requireNumber(payload.amountCents, "payroll_payment_adjustments.amountCents"),
    motivo: buildAdjustmentReason(payload),
  };
}

function mapPayrollExpensePayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const payrollPaymentId = requireString(payload.payrollPaymentId, "gastos.payrollPaymentId");
  const amountCents = requireNumber(payload.amountCents, "gastos.amountCents");
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    descripcion: requireString(payload.description, "gastos.description", { fallback: `Payroll payment ${payrollPaymentId}` }),
    sucursal_id: operation.branchId ?? null,
    monto: centsToAmount(amountCents),
    metodo_pago: mapExpensePaymentMethod(requireString(payload.paymentMethod, "gastos.paymentMethod")),
    fecha_gasto: requireString(payload.recordedAt, "gastos.recordedAt"),
    payroll_payment_id: payrollPaymentId,
    payroll_sync_status: requireString(payload.localStatus, "gastos.localStatus"),
  };
}

function mapGeneralExpensePayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const amount = typeof payload.amount === "number" ? payload.amount : Number(payload.amount ?? 0);
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    sucursal_id: payload.sucursalId ? String(payload.sucursalId) : null,
    category_id: payload.categoryId ? String(payload.categoryId) : null,
    cycle_id: payload.cycleId ? String(payload.cycleId) : null,
    descripcion: typeof payload.description === "string" ? payload.description : "Gasto operacional",
    proveedor: payload.supplier ? String(payload.supplier) : null,
    monto: amount,
    metodo_pago: payload.paymentMethod ? String(payload.paymentMethod) : "cash",
    fecha_gasto: payload.expenseDate ? String(payload.expenseDate) : new Date().toISOString(),
    notas: payload.notes ? String(payload.notes) : null,
  };
}

function mapCategoryPayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    nombre: typeof payload.name === "string" ? payload.name : "Categoría",
    descripcion: payload.description ? String(payload.description) : null,
    color: payload.color ? String(payload.color) : "#ff906d",
    activa: payload.active !== false,
  };
}

function mapOperationalCycleOpenRow(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const openedAt = requireString(payload.openedAt, "cierres_operativos.openedAt");
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    sucursal_id: operation.branchId ?? null,
    business_day: requireString(payload.businessDay, "cierres_operativos.businessDay"),
    cycle_number: requireNumber(payload.cycleNumber, "cierres_operativos.cycleNumber"),
    efectivo_inicial: requireNumber(payload.openingCash, "cierres_operativos.openingCash"),
    opened_at: openedAt,
    created_at: openedAt,
    closed_at: null,
  };
}

/** UPDATE patch (id is the filter, never in the SET) for close/print. */
function mapOperationalCyclePatch(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.type === "orders.cycle.close") {
    return { closed_at: requireString(payload.closedAt, "cierres_operativos.closedAt") };
  }
  return { printed_at: requireString(payload.printedAt, "cierres_operativos.printedAt") };
}

function mapCustomerPayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    name: requireString(payload.name, "customers.name"),
    phone: payload.phone ? String(payload.phone) : null,
    email: payload.email ? String(payload.email) : null,
    document_id: payload.documentId ? String(payload.documentId) : null,
    address: payload.address ? String(payload.address) : null,
    notes: payload.notes ? String(payload.notes) : null,
    updated_at: payload.updatedAt ? String(payload.updatedAt) : new Date().toISOString(),
  };
}

// The receivables outbox rows carry the ReceivablesCommand (camelCase), not a
// table row. monto_pagado/estado on cuentas_cobrar are cloud-derived by the
// cxc_pagos trigger, so a create only sends the debt's fixed fields and every
// payment is an independent cxc_pagos upsert — order- and device-independent.
function mapReceivablePayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const dueDate = typeof payload.dueDate === "string" && payload.dueDate.trim()
    ? payload.dueDate
    : defaultDueDate(payload.fechaEmision);
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    sucursal_id: operation.branchId ?? (payload.sucursalId ? String(payload.sucursalId) : null),
    factura_id: payload.facturaId ? String(payload.facturaId) : null,
    customer_id: requireString(payload.customerId, "cuentas_cobrar.customerId"),
    monto_total: requireNumber(payload.totalAmount, "cuentas_cobrar.totalAmount"),
    fecha_vencimiento: dueDate,
    ...(payload.fechaEmision ? { fecha_emision: String(payload.fechaEmision) } : {}),
    ...(payload.observacion ? { observacion: String(payload.observacion) } : {}),
  };
}

function mapReceivablePaymentPayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    sucursal_id: operation.branchId ?? (payload.sucursalId ? String(payload.sucursalId) : null),
    cuenta_cobrar_id: requireString(payload.receivableId, "cxc_pagos.receivableId"),
    monto: requireNumber(payload.amount, "cxc_pagos.amount"),
    metodo_pago: requireString(payload.paymentMethod, "cxc_pagos.paymentMethod"),
    ...(payload.fechaPago ? { fecha_pago: String(payload.fechaPago) } : {}),
    ...(payload.notas ? { notas: String(payload.notas) } : {}),
    ...(payload.cycleId ? { cycle_id: String(payload.cycleId) } : {}),
    ...(payload.usuarioId ? { created_by_auth_user_id: String(payload.usuarioId) } : {}),
  };
}

// Payables mirror of the receivables mappers. cuentas_pagar.monto_pagado/estado
// are cloud-derived by the cxp_pagos trigger, so create sends only fixed fields.
function mapPayablePayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const dueDate = typeof payload.dueDate === "string" && payload.dueDate.trim()
    ? payload.dueDate
    : defaultDueDate(payload.fechaEmision);
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    sucursal_id: operation.branchId ?? (payload.sucursalId ? String(payload.sucursalId) : null),
    compra_id: payload.compraId ? String(payload.compraId) : null,
    proveedor_id: requireString(payload.supplierId, "cuentas_pagar.supplierId"),
    monto_total: requireNumber(payload.totalAmount, "cuentas_pagar.totalAmount"),
    fecha_vencimiento: dueDate,
    ...(payload.fechaEmision ? { fecha_emision: String(payload.fechaEmision) } : {}),
    ...(payload.observacion ? { observacion: String(payload.observacion) } : {}),
  };
}

function mapPayablePaymentPayload(operation: DurableOperation, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: operation.rowId,
    tenant_id: operation.tenantId,
    sucursal_id: operation.branchId ?? (payload.sucursalId ? String(payload.sucursalId) : null),
    cuenta_pagar_id: requireString(payload.payableId, "cxp_pagos.payableId"),
    monto: requireNumber(payload.amount, "cxp_pagos.amount"),
    metodo_pago: requireString(payload.paymentMethod, "cxp_pagos.paymentMethod"),
    ...(payload.fechaPago ? { fecha_pago: String(payload.fechaPago) } : {}),
    ...(payload.notas ? { notas: String(payload.notas) } : {}),
    ...(payload.cycleId ? { cycle_id: String(payload.cycleId) } : {}),
    ...(payload.usuarioId ? { created_by_auth_user_id: String(payload.usuarioId) } : {}),
  };
}

function defaultDueDate(fechaEmision: unknown): string {
  const base = typeof fechaEmision === "string" && fechaEmision.trim() ? new Date(fechaEmision) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

function mapPayrollExpenseTable(operation: DurableOperation):
  | { ok: true; remoteTable: string }
  | { ok: false; error: Record<string, unknown> & { reason: string; retryable: false } } {
  const payload = operation.payload;
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: permanentReason("Missing payload for payroll gasto sync", "missing_payload", operation.tableName) };
  }
  if (payload.expenseType !== "payroll") {
    return { ok: false, error: permanentReason("Only payroll-tagged gastos rows are eligible for payroll sync", "unsupported_payload", operation.tableName) };
  }
  return { ok: true, remoteTable: "gastos" };
}

function buildAdjustmentReason(payload: Record<string, unknown>): string {
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  return [type, note].filter(Boolean).join(": ") || type || note || "Ajuste de nómina";
}

function mapFrequency(value: string, tableName: string): string {
  if (value === "monthly") return "mensual";
  if (value === "biweekly") return "quincenal";
  unsupportedValue(`${tableName}.frequency`, value);
}

function classifyRemoteError(error: MutationError, tableName: string, operation: "upsert" | "update" | "delete"): PushResponse {
  const code = error.code ?? "unknown";
  const message = error.message;

  if (code === "23505" || message.toLowerCase().includes("duplicate key") || message.toLowerCase().includes("already exists")) {
    // upsert(id) already handles a retry of the same ID. Any remaining unique
    // violation may refer to another row and is not an acknowledgement.
    return { conflict: { reason: `Remote ${operation} conflict for ${tableName}: ${message}` } };
  }

  if (isPermanentRemoteError(code)) {
    return {
      permanent: permanentReason(`Remote ${operation} rejected for ${tableName}: ${message}`, "remote_structural_error", tableName, { code }),
    };
  }

  throw new Error(`${capitalize(operation)} failed: ${message}`);
}

function isPermanentRemoteError(code: string): boolean {
  return code === "23502" || code.startsWith("22") || (code.startsWith("42") && code !== "42501") || code === "PGRST204";
}

function permanentReason(reason: string, category: string, tableName: string, extra: Record<string, unknown> = {}): Record<string, unknown> & { reason: string; retryable: false } {
  return {
    reason,
    category,
    tableName,
    retryable: false,
    ...extra,
  };
}

function requireString(value: unknown, field: string, options?: { fallback?: string }): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (options && Object.prototype.hasOwnProperty.call(options, "fallback") && typeof options.fallback === "string" && options.fallback.trim()) {
    return options.fallback.trim();
  }
  unsupportedValue(field, value);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  unsupportedValue(field, value);
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  unsupportedValue(field, value);
}

function centsToAmount(amountCents: number): number {
  return Number((amountCents / 100).toFixed(2));
}

function mapExpensePaymentMethod(value: string): string {
  return value === "cash" ? "efectivo" : value;
}

function unsupportedValue(field: string, value: unknown): never {
  throw new Error(`Unsupported payroll sync payload field ${field}: ${JSON.stringify(value)}`);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

