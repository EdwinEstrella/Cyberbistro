import { supabase } from "../../../shared/lib/supabase";
import { isDesktopCloudUnavailable } from "../../../shared/lib/cloudAvailability";
import {
  enqueueLocalWrite,
  getDeviceId,
  readLocalMirror,
  shouldReadLocalFirst,
  deleteLocalMirrorRow,
} from "../../../shared/lib/localFirst";
import { readLocalInvoices } from "../../billing/lib/invoicesLocal";

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
  const matchesText = [customer.name, customer.phone, customer.email, customer.document_id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
  if (matchesText) return true;

  const documentDigits = customer.document_id?.replace(/\D/g, "") ?? "";
  const queryDigits = rawQuery.replace(/\D/g, "");
  return Boolean(queryDigits) && documentDigits.includes(queryDigits);
}

function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

/** Normalizes a customer row from SQLite, the IndexedDB mirror, or the cloud. */
function mapCustomerRecord(c: Record<string, unknown>, tenantId: string): Customer {
  return {
    id: String(c.id),
    tenant_id: (c.tenant_id as string) ?? tenantId,
    name: c.name as string,
    phone: (c.phone as string) ?? null,
    email: (c.email as string) ?? null,
    document_id: (c.document_id as string) ?? null,
    address: (c.address as string) ?? null,
    notes: (c.notes as string) ?? null,
    created_at: (c.created_at as string) ?? null,
    updated_at: (c.updated_at as string) ?? null,
    deleted_at: (c.deleted_at as string) ?? null,
  };
}

async function fetchCloudCustomers(tenantId: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data.map((c: any) => mapCustomerRecord(c, tenantId));
}

/** Background cloud → SQLite reconciliation; never throws into the caller. */
async function reconcileCustomersFromCloud(tenantId: string): Promise<void> {
  try {
    const mappedCloud = await fetchCloudCustomers(tenantId);
    const api = getElectronAPI();
    if (mappedCloud.length > 0 && api?.syncCloudCustomers) {
      void api.syncCloudCustomers(mappedCloud).catch(() => {});
    }
  } catch (e) {
    console.warn("[Customers] Background cloud sync skipped:", e);
  }
}

export async function listCustomers(tenantId: string): Promise<Customer[]> {
  const api = getElectronAPI();
  const byId = new Map<string, Customer>();

  // 1. SQLite (authoritative).
  let sqliteAvailable = false;
  if (api?.listCustomers) {
    try {
      const response = await api.listCustomers();
      if (response?.ok && Array.isArray(response.data)) {
        sqliteAvailable = true;
        for (const c of response.data as Array<Record<string, unknown>>) {
          const row = mapCustomerRecord(c, tenantId);
          byId.set(row.id, row);
        }
      }
    } catch (e) {
      console.warn("[Customers] Error querying SQLite customers, falling back:", e);
    }
  }

  // 2. IndexedDB mirror (bridge/fallback). Union: only add ids SQLite lacks so
  //    legacy customers still living only in IndexedDB are not lost.
  const useMirror = sqliteAvailable ? true : await shouldReadLocalFirst(tenantId, ["customers"]).catch(() => false);
  if (useMirror) {
    try {
      const rows = await readLocalMirror<Record<string, unknown>>(tenantId, "customers");
      for (const c of rows) {
        if (c.tenant_id !== tenantId) continue;
        const id = String(c.id);
        if (!byId.has(id)) byId.set(id, mapCustomerRecord(c, tenantId));
      }
    } catch (e) {
      console.warn("[Customers] Error reading IndexedDB fallback:", e);
    }
  }

  const localList = Array.from(byId.values())
    .filter((c) => !c.deleted_at)
    .sort((a, b) => a.name.localeCompare(b.name));

  // 3. Cloud reconciliation (WhatsApp-style): background when we already have
  //    local rows; synchronous only when local is empty (first load).
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const cloudDown = await isDesktopCloudUnavailable();
  if (!online || cloudDown) {
    return localList;
  }

  if (localList.length > 0) {
    void reconcileCustomersFromCloud(tenantId);
    return localList;
  }

  try {
    const mappedCloud = await fetchCloudCustomers(tenantId);
    if (mappedCloud.length > 0) {
      if (api?.syncCloudCustomers) void api.syncCloudCustomers(mappedCloud).catch(() => {});
      return mappedCloud;
    }
  } catch (e) {
    console.warn("[Customers] Cloud sync skipped (offline):", e);
  }

  return localList;
}

export async function createCustomer(tenantId: string, input: CustomerFormInput): Promise<Customer> {
  const payload = normalizeCustomerInput(input);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const row: Customer = {
    id,
    tenant_id: tenantId,
    ...payload,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (window.electronAPI?.executeCustomerCommand) {
    await window.electronAPI.executeCustomerCommand({
      type: "customer.upsert",
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      documentId: row.document_id,
      address: row.address,
      notes: row.notes,
    });
  } else {
    await enqueueLocalWrite({
      tenantId,
      tableName: "customers",
      rowId: row.id,
      op: "insert",
      payload: row as unknown as Record<string, unknown>,
      deviceId: await getDeviceId(),
    });
  }

  return row;
}

export async function updateCustomer(tenantId: string, customerId: string, input: CustomerFormInput): Promise<Customer> {
  const payload = normalizeCustomerInput(input);
  const now = new Date().toISOString();
  const row = { ...payload, updated_at: now };

  if (window.electronAPI?.executeCustomerCommand) {
    await window.electronAPI.executeCustomerCommand({
      type: "customer.upsert",
      id: customerId,
      name: row.name,
      phone: row.phone,
      email: row.email,
      documentId: row.document_id,
      address: row.address,
      notes: row.notes,
    });
  } else {
    await enqueueLocalWrite({
      tenantId,
      tableName: "customers",
      rowId: customerId,
      op: "update",
      payload: row,
      deviceId: await getDeviceId(),
    });
  }

  return { id: customerId, tenant_id: tenantId, ...row } as Customer;
}

export async function softDeleteCustomer(tenantId: string, customerId: string): Promise<void> {
  const now = new Date().toISOString();

  if (window.electronAPI?.executeCustomerCommand) {
    await window.electronAPI.executeCustomerCommand({
      type: "customer.delete",
      id: customerId,
    });
    // Keep the legacy IndexedDB mirror consistent so the union read does not
    // resurrect a customer deleted in SQLite.
    await deleteLocalMirrorRow(tenantId, "customers", customerId).catch(() => undefined);
  } else {
    await enqueueLocalWrite({
      tenantId,
      tableName: "customers",
      rowId: customerId,
      op: "update",
      payload: { deleted_at: now, updated_at: now },
      deviceId: await getDeviceId(),
    });
  }
}

export async function listCustomerInvoices(tenantId: string, customerId: string) {
  const allInvoices = await readLocalInvoices(tenantId);
  return allInvoices
    .filter((invoice) => invoice.tenant_id === tenantId && invoice.customer_id === customerId)
    .sort((a, b) => new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime()) as Array<{
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
