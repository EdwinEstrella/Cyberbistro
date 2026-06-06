import { insforgeClient } from "../../../shared/lib/insforge";
import {
  enqueueLocalWrite,
  getDeviceId,
  readLocalMirror,
  shouldReadLocalFirst,
} from "../../../shared/lib/localFirst";

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  document_id?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface CustomerSummary {
  totalSpent: number;
  invoiceCount: number;
  lastInvoiceAt: string | null;
}

export type CustomerFormInput = {
  name: string;
  phone?: string;
  email?: string;
  document_id?: string;
  address?: string;
  notes?: string;
};

export function normalizeCustomerInput(input: CustomerFormInput) {
  const name = input.name.trim();
  if (!name) throw new Error("El nombre del cliente es obligatorio.");

  return {
    name,
    phone: input.phone?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    document_id: input.document_id?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export function customerLabel(customer: Pick<Customer, "name" | "phone" | "document_id">) {
  const extra = customer.document_id || customer.phone;
  return extra ? `${customer.name} · ${extra}` : customer.name;
}

export function customerMatchesSearch(customer: Customer, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return [customer.name, customer.phone, customer.email, customer.document_id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export async function listCustomers(tenantId: string): Promise<Customer[]> {
  if (await shouldReadLocalFirst(tenantId, ["customers"])) {
    const rows = await readLocalMirror<Customer>(tenantId, "customers");
    return rows
      .filter((customer) => customer.tenant_id === tenantId && !customer.deleted_at)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data, error } = await insforgeClient.database
    .from("customers")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function createCustomer(tenantId: string, input: CustomerFormInput): Promise<Customer> {
  const payload = normalizeCustomerInput(input);
  const now = new Date().toISOString();
  const row: Customer = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    ...payload,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await enqueueLocalWrite({
    tenantId,
    tableName: "customers",
    rowId: row.id,
    op: "insert",
    payload: row as unknown as Record<string, unknown>,
    deviceId: await getDeviceId(),
  });

  return row;
}

export async function updateCustomer(tenantId: string, customerId: string, input: CustomerFormInput): Promise<Customer> {
  const payload = normalizeCustomerInput(input);
  const row = { ...payload, updated_at: new Date().toISOString() };

  await enqueueLocalWrite({
    tenantId,
    tableName: "customers",
    rowId: customerId,
    op: "update",
    payload: row,
    deviceId: await getDeviceId(),
  });

  return { id: customerId, tenant_id: tenantId, ...row } as Customer;
}

export async function softDeleteCustomer(tenantId: string, customerId: string): Promise<void> {
  const now = new Date().toISOString();

  await enqueueLocalWrite({
    tenantId,
    tableName: "customers",
    rowId: customerId,
    op: "update",
    payload: { deleted_at: now, updated_at: now },
    deviceId: await getDeviceId(),
  });
}

export async function listCustomerInvoices(tenantId: string, customerId: string) {
  if (await shouldReadLocalFirst(tenantId, ["facturas"])) {
    const rows = await readLocalMirror<{
      id: string;
      tenant_id: string;
      customer_id?: string | null;
      numero_factura: number;
      total: number;
      estado: string;
      metodo_pago: string;
      created_at: string;
      pagada_at?: string | null;
      cliente_nombre?: string | null;
      cliente_rnc?: string | null;
    }>(tenantId, "facturas");

    return rows
      .filter((invoice) => invoice.tenant_id === tenantId && invoice.customer_id === customerId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const { data, error } = await insforgeClient.database
    .from("facturas")
    .select("id, numero_factura, total, estado, metodo_pago, created_at, pagada_at, cliente_nombre, cliente_rnc")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    numero_factura: number;
    total: number;
    estado: string;
    metodo_pago: string;
    created_at: string;
    pagada_at?: string | null;
    cliente_nombre?: string | null;
    cliente_rnc?: string | null;
  }>;
}

export function summarizeCustomerInvoices(
  invoices: Array<{ total: number; estado: string; created_at?: string | null; pagada_at?: string | null }>
): CustomerSummary {
  const paid = invoices.filter((invoice) => invoice.estado === "pagada");
  return {
    totalSpent: paid.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0),
    invoiceCount: paid.length,
    lastInvoiceAt: paid[0]?.pagada_at ?? paid[0]?.created_at ?? null,
  };
}
