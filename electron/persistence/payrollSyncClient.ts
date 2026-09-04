import type { InsForgeClient } from "@insforge/sdk";
import { DurableOperation, PullBatch, ServerSyncClient } from "./syncWorker";

type MutationError = {
  code?: string;
  message: string;
};

type RemoteMutationBuilder = {
  upsert(payload: Record<string, unknown>, options: { onConflict: string }): Promise<{ error: MutationError | null }>;
  delete(): {
    eq(column: string, value: string): Promise<{ error: MutationError | null }>;
  };
};

type RemoteRpcClient = {
  rpc(functionName: string, args: Record<string, unknown>): Promise<{ data?: unknown; error: MutationError | null }>;
};

type ClientOverride =
  | Pick<InsForgeClient, "database">
  | { from(table: string): RemoteMutationBuilder; rpc?(functionName: string, args: Record<string, unknown>): Promise<{ data?: unknown; error: MutationError | null }> };

type PushResponse = Awaited<ReturnType<ServerSyncClient["push"]>>;

const FALLBACK_BASE_URL = "https://restaurante.azokia.com";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDAxMzF9.OQwbEoWPtw-inbXdU3D7c39RZn3c87FJ-HvMBF_jrn4";

export class PayrollSyncClient implements ServerSyncClient {
  private clientPromise: Promise<InsForgeClient | ClientOverride>;
  private readonly config: { url: string; key: string } | null;

  constructor(clientOverride?: ClientOverride, accessToken?: string | null) {
    if (clientOverride) {
      this.config = null;
      this.clientPromise = Promise.resolve(clientOverride);
    } else {
      const fallbackAllowed = process.env.DISABLE_INSFORGE_FALLBACK !== "true";
      const url = (process.env.VITE_INSFORGE_BASE_URL || process.env.INSFORGE_URL || (fallbackAllowed ? FALLBACK_BASE_URL : "")).trim();
      const key = (process.env.VITE_INSFORGE_ANON_KEY || process.env.INSFORGE_ANON_KEY || (fallbackAllowed ? FALLBACK_ANON_KEY : "")).trim();
      if (!url || !key) {
        throw new Error("Missing InsForge configuration in main process");
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

  async push(operation: DurableOperation): Promise<PushResponse> {
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

  async pull(input: { tenantId: string; cursor: string | null }): Promise<PullBatch> {
    return {
      cursor: input.cursor || new Date().toISOString(),
      changes: [],
    };
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

    if (client?.database?.from && typeof client.database.from === "function") {
      return client.database.from(table);
    }
    if (client?.from && typeof client.from === "function") {
      return client.from(table);
    }
    throw new Error("Invalid InsForge client: missing from method");
  }

  private createClient(accessToken?: string | null): Promise<InsForgeClient> {
    if (!this.config) {
      throw new Error("Payroll sync client configuration is unavailable");
    }
    return import("@insforge/sdk").then(({ createClient }) => {
      const client = createClient({
        baseUrl: this.config!.url,
        anonKey: this.config!.key,
        edgeFunctionToken: accessToken || undefined,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        isServerMode: true,
      });
      if (accessToken) {
        try {
          (client as any).getHttpClient?.()?.setAuthToken?.(accessToken);
          (client as any).tokenManager?.setAccessToken?.(accessToken);
        } catch {
          /* ignore */
        }
      }
      return client;
    });
  }
}

function mapDeleteOperation(operation: DurableOperation):
  | { ok: true; remoteTable: string }
  | { ok: false; error: Record<string, unknown> & { reason: string; retryable: false } } {
  if (operation.tableName === "gastos") {
    return mapPayrollExpenseTable(operation);
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
      case "gastos": {
        const tableResult = mapPayrollExpenseTable(operation);
        if (!tableResult.ok) {
          return tableResult;
        }
        return { ok: true, remoteTable: tableResult.remoteTable, payload: mapPayrollExpensePayload(operation, operation.payload) };
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
    total_bonos: delta > 0 ? delta : 0,
    total_descuentos: delta < 0 ? Math.abs(delta) : 0,
    monto_neto: requireNumber(payload.totalDueCents, "payroll_payments.totalDueCents"),
    monto_pagado: requireNumber(payload.paymentAmountCents, "payroll_payments.paymentAmountCents"),
    monto_pendiente: requireNumber(payload.pendingCents, "payroll_payments.pendingCents"),
    gasto_id: payload.gastoId ?? null,
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
    monto: centsToAmount(amountCents),
    metodo_pago: mapExpensePaymentMethod(requireString(payload.paymentMethod, "gastos.paymentMethod")),
    fecha_gasto: requireString(payload.recordedAt, "gastos.recordedAt"),
    payroll_payment_id: payrollPaymentId,
    payroll_sync_status: requireString(payload.localStatus, "gastos.localStatus"),
  };
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

function classifyRemoteError(error: MutationError, tableName: string, operation: "upsert" | "delete"): PushResponse {
  const code = error.code ?? "unknown";
  const message = error.message;

  if (code === "23505" || message.toLowerCase().includes("duplicate key") || message.toLowerCase().includes("already exists")) {
    return { result: { synced: true, id: tableName, note: "already synced", code } };
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
