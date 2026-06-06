import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../shared/hooks/useAuth";
import {
  createCustomer,
  customerMatchesSearch,
  listCustomerInvoices,
  listCustomers,
  softDeleteCustomer,
  summarizeCustomerInvoices,
  updateCustomer,
  type Customer,
  type CustomerFormInput,
} from "../lib/customers";

const emptyForm: CustomerFormInput = {
  name: "",
  phone: "",
  email: "",
  document_id: "",
  address: "",
  notes: "",
};

export function Clientes() {
  const { tenantId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormInput>(emptyForm);
  const [invoices, setInvoices] = useState<Awaited<ReturnType<typeof listCustomerInvoices>>>([]);

  async function refreshCustomers() {
    if (!tenantId) return;
    setLoading(true);
    try {
      setCustomers(await listCustomers(tenantId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshCustomers();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !selected) {
      setInvoices([]);
      return;
    }
    let cancelled = false;
    void listCustomerInvoices(tenantId, selected.id).then((rows) => {
      if (!cancelled) setInvoices(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, selected]);

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => customerMatchesSearch(customer, query)),
    [customers, query]
  );

  const summary = useMemo(() => summarizeCustomerInvoices(invoices), [invoices]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
  }

  function startEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      document_id: customer.document_id ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
    });
  }

  async function saveCustomer() {
    if (!tenantId) return;
    setSaving(true);
    try {
      const saved = editing ? await updateCustomer(tenantId, editing.id, form) : await createCustomer(tenantId, form);
      await refreshCustomers();
      setSelected(saved);
      startCreate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (!confirm(`Eliminar cliente "${customer.name}"?`)) return;
    if (!tenantId) return;
    await softDeleteCustomer(tenantId, customer.id);
    if (selected?.id === customer.id) setSelected(null);
    await refreshCustomers();
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-['Space_Grotesk'] text-3xl font-bold m-0">Clientes</h1>
              <p className="text-muted-foreground mt-1 text-sm">Historial, facturas y datos del cliente.</p>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente..."
              className="rounded-xl border border-border bg-muted px-4 py-3 text-sm outline-none"
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Cliente</th>
                  <th className="text-left p-3">Contacto</th>
                  <th className="text-left p-3">Documento</th>
                  <th className="text-right p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-t border-border">
                    <td className="p-3 font-semibold">
                      <button className="bg-transparent border-none text-left text-foreground cursor-pointer" onClick={() => setSelected(customer)}>
                        {customer.name}
                      </button>
                    </td>
                    <td className="p-3 text-muted-foreground">{customer.phone || customer.email || "—"}</td>
                    <td className="p-3 text-muted-foreground">{customer.document_id || "—"}</td>
                    <td className="p-3 text-right">
                      <button className="px-3 py-1 rounded-lg bg-muted text-foreground border-none cursor-pointer mr-2" onClick={() => startEdit(customer)}>
                        Editar
                      </button>
                      <button className="px-3 py-1 rounded-lg bg-red-500/10 text-red-500 border-none cursor-pointer" onClick={() => void deleteCustomer(customer)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No hay clientes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-['Space_Grotesk'] text-xl font-bold m-0">{editing ? "Editar cliente" : "Agregar cliente"}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {(["name", "phone", "email", "document_id", "address", "notes"] as const).map((field) => (
                <input
                  key={field}
                  value={form[field] ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                  placeholder={{
                    name: "Nombre *",
                    phone: "Teléfono",
                    email: "Email",
                    document_id: "RNC / Cédula",
                    address: "Dirección",
                    notes: "Notas",
                  }[field]}
                  className="rounded-xl border border-border bg-muted px-4 py-3 text-sm outline-none"
                />
              ))}
              <button disabled={saving} onClick={() => void saveCustomer()} className="rounded-xl bg-primary text-primary-foreground py-3 font-bold border-none cursor-pointer disabled:opacity-50">
                {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear cliente"}
              </button>
              {editing ? (
                <button onClick={startCreate} className="rounded-xl bg-muted text-foreground py-3 font-bold border-none cursor-pointer">
                  Cancelar edición
                </button>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-['Space_Grotesk'] text-xl font-bold m-0">Detalle</h2>
            {selected ? (
              <div className="mt-4">
                <p className="font-bold text-lg m-0">{selected.name}</p>
                <p className="text-muted-foreground text-sm mt-1">{[selected.document_id, selected.phone, selected.email].filter(Boolean).join(" · ") || "Sin datos adicionales"}</p>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <Metric label="Gastado" value={`RD$ ${summary.totalSpent.toFixed(2)}`} />
                  <Metric label="Facturas" value={String(summary.invoiceCount)} />
                  <Metric label="Última" value={summary.lastInvoiceAt ? new Date(summary.lastInvoiceAt).toLocaleDateString("es-DO") : "—"} />
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-xl bg-muted p-3 flex justify-between gap-3 text-sm">
                      <span>#{String(invoice.numero_factura).padStart(4, "0")} · {invoice.estado}</span>
                      <strong>RD$ {Number(invoice.total).toFixed(2)}</strong>
                    </div>
                  ))}
                  {invoices.length === 0 ? <p className="text-muted-foreground text-sm">Sin facturas asociadas.</p> : null}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm mt-4">Seleccioná un cliente para ver su historial.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <div className="text-[11px] text-muted-foreground uppercase">{label}</div>
      <div className="font-bold text-sm mt-1">{value}</div>
    </div>
  );
}
