import { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { 
  Eye, 
  Plus, 
  Search, 
  User, 
  Phone, 
  Mail, 
  FileText, 
  MapPin, 
  Trash2, 
  Edit
} from "lucide-react";
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
  const [form, setForm] = useState<CustomerFormInput>(emptyForm);
  
  // Tab control: "list" or "form"
  const [activeSubTab, setActiveSubTab] = useState<"list" | "form">("list");

  // Modal details control
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [viewingInvoices, setViewingInvoices] = useState<any[]>([]);
  const [viewingLoading, setViewingLoading] = useState(false);

  const savingRef = useRef(false);

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

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => customerMatchesSearch(customer, query));
  }, [customers, query]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setActiveSubTab("form");
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
    setActiveSubTab("form");
  }

  async function saveCustomer() {
    if (!tenantId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = editing 
        ? await updateCustomer(tenantId, editing.id, form) 
        : await createCustomer(tenantId, form);
      await refreshCustomers();
      setActiveSubTab("list");
      startCreate();
      // Optional: auto-open the saved customer details
      void handleViewCustomer(saved);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo guardar el cliente.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (!confirm(`¿Eliminar cliente "${customer.name}"?`)) return;
    if (!tenantId) return;
    try {
      await softDeleteCustomer(tenantId, customer.id);
      if (viewingCustomer?.id === customer.id) setViewingCustomer(null);
      await refreshCustomers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo eliminar el cliente.");
    }
  }

  async function handleViewCustomer(customer: Customer) {
    setViewingCustomer(customer);
    setViewingLoading(true);
    setViewingInvoices([]);
    try {
      const invs = await listCustomerInvoices(tenantId!, customer.id);
      setViewingInvoices(invs);
    } catch (err) {
      console.error("Error al cargar historial de facturas:", err);
    } finally {
      setViewingLoading(false);
    }
  }

  // Calculate summary stats for viewing modal
  const customerStats = useMemo(() => {
    if (!viewingCustomer) return { totalSpent: 0, invoiceCount: 0, avgTicket: 0, lastInvoiceAt: null };
    const summary = summarizeCustomerInvoices(viewingInvoices);
    const avgTicket = summary.invoiceCount > 0 ? summary.totalSpent / summary.invoiceCount : 0;
    return {
      totalSpent: summary.totalSpent,
      invoiceCount: summary.invoiceCount,
      avgTicket,
      lastInvoiceAt: summary.lastInvoiceAt,
    };
  }, [viewingCustomer, viewingInvoices]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-6 font-['Inter',sans-serif]">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        
        {/* Module Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-900 pb-5">
          <div>
            <h1 className="font-['Space_Grotesk',sans-serif] text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span className="text-[#ff906d]">●</span> Clientes
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Historial de consumos, facturación y perfiles de clientes.
            </p>
          </div>
          
          {/* Submodule Tab Selector */}
          <div className="flex bg-zinc-900/60 p-1.5 rounded-xl border border-zinc-800 self-start sm:self-center shrink-0">
            <button
              onClick={() => setActiveSubTab("list")}
              className={`px-5 py-2.5 rounded-lg font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wide transition-all active:scale-95 border-none cursor-pointer ${
                activeSubTab === "list"
                  ? "bg-[#ff906d] text-[#5b1600] shadow-[0_4px_12px_rgba(255,144,109,0.15)]"
                  : "bg-transparent text-zinc-400 hover:text-white"
              }`}
            >
              Lista de Clientes
            </button>
            <button
              onClick={startCreate}
              className={`px-5 py-2.5 rounded-lg font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wide transition-all active:scale-95 border-none cursor-pointer ${
                activeSubTab === "form" && !editing
                  ? "bg-[#ff906d] text-[#5b1600] shadow-[0_4px_12px_rgba(255,144,109,0.15)]"
                  : activeSubTab === "form" && editing
                  ? "bg-amber-500/20 border border-amber-500/30 text-amber-300"
                  : "bg-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {editing ? `Editar: ${editing.name}` : "Nuevo Cliente"}
            </button>
          </div>
        </div>

        {/* Submodule: View List */}
        {activeSubTab === "list" && (
          <div className="flex flex-col gap-5">
            {/* Search and Action Bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre, teléfono, RNC..."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40 pl-11 pr-4 py-3 text-sm text-white outline-none focus:border-[#ff906d]/50 transition-colors"
                />
              </div>

              <button
                onClick={startCreate}
                className="w-full sm:w-auto bg-[#ff906d] text-[#5b1600] rounded-xl px-5 py-3 font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wide cursor-pointer transition-all hover:bg-[#ff8059] flex items-center justify-center gap-2 active:scale-95 border-none"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                Agregar Cliente
              </button>
            </div>

            {/* Customers Table List */}
            <div className="rounded-[24px] border border-zinc-800/60 bg-zinc-900/10 overflow-hidden shadow-xl backdrop-blur-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-900 text-zinc-400 font-['Space_Grotesk'] font-bold text-xs uppercase tracking-[0.5px]">
                      <th className="text-left px-6 py-4.5 bg-zinc-900/20">Cliente</th>
                      <th className="text-left px-6 py-4.5 bg-zinc-900/20">Teléfono</th>
                      <th className="text-left px-6 py-4.5 bg-zinc-900/20">Documento / RNC</th>
                      <th className="text-right px-6 py-4.5 bg-zinc-900/20">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((customer) => (
                      <tr 
                        key={customer.id} 
                        className="border-b border-zinc-900/50 hover:bg-zinc-900/20 transition-all group"
                      >
                        <td className="px-6 py-4 font-bold text-white font-['Space_Grotesk'] text-[15px]">
                          {customer.name}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 font-['Inter']">
                          {customer.phone || "—"}
                        </td>
                        <td className="px-6 py-4 text-zinc-400 font-mono text-[13px]">
                          {customer.document_id || "—"}
                        </td>
                        <td className="px-6 py-4 text-right shrink-0">
                          <div className="flex gap-2 justify-end">
                            <button
                              title="Ver Ficha y Facturas"
                              onClick={() => void handleViewCustomer(customer)}
                              className="w-10 h-10 rounded-xl bg-zinc-850 hover:bg-[#ff906d]/10 hover:text-[#ff906d] text-zinc-400 flex items-center justify-center border border-zinc-800 transition-all cursor-pointer active:scale-90"
                            >
                              <Eye className="w-[18px] h-[18px]" />
                            </button>
                            <button
                              title="Editar Perfil"
                              onClick={() => startEdit(customer)}
                              className="w-10 h-10 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-800 transition-all cursor-pointer active:scale-90"
                            >
                              <Edit className="w-[16px] h-[16px]" />
                            </button>
                            <button
                              title="Eliminar Cliente"
                              onClick={() => void deleteCustomer(customer)}
                              className="w-10 h-10 rounded-xl bg-zinc-850 hover:bg-red-500/10 hover:text-red-400 text-zinc-500 flex items-center justify-center border border-zinc-800 transition-all cursor-pointer active:scale-90"
                            >
                              <Trash2 className="w-[16px] h-[16px]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 font-['Inter']">
                          No se encontraron clientes registrados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Submodule: Create / Edit Form */}
        {activeSubTab === "form" && (
          <div className="max-w-2xl mx-auto w-full bg-zinc-950 border border-zinc-900 rounded-[28px] p-8 shadow-2xl relative overflow-hidden">
            {/* Design Ambient Glow */}
            <div className="absolute top-0 right-0 w-64 h-32 bg-[radial-gradient(ellipse_at_top_right,rgba(255,144,109,0.05),transparent)] pointer-events-none rounded-[28px]" />
            
            <h2 className="font-['Space_Grotesk',sans-serif] text-2xl font-bold text-white flex items-center gap-2 mb-6">
              <span className="text-[#ff906d]">●</span>
              {editing ? "Editar Cliente" : "Registrar Nuevo Cliente"}
            </h2>

            <div className="flex flex-col gap-4.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-500 font-['Space_Grotesk'] font-bold text-[11px] uppercase tracking-[1px] px-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Ej: Juan Pérez"
                  className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3.5 text-sm text-white outline-none focus:border-[#ff906d]/50 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-500 font-['Space_Grotesk'] font-bold text-[11px] uppercase tracking-[1px] px-1">
                    Teléfono / Celular
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                    placeholder="Ej: 809-555-0199"
                    className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3.5 text-sm text-white outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-500 font-['Space_Grotesk'] font-bold text-[11px] uppercase tracking-[1px] px-1">
                    RNC o Cédula
                  </label>
                  <input
                    type="text"
                    value={form.document_id}
                    onChange={(e) => setForm((c) => ({ ...c, document_id: e.target.value }))}
                    placeholder="Ej: 101001234"
                    className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3.5 text-sm text-white font-mono outline-none focus:border-[#ff906d]/50 transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-500 font-['Space_Grotesk'] font-bold text-[11px] uppercase tracking-[1px] px-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                  placeholder="ejemplo@correo.com"
                  className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3.5 text-sm text-white outline-none focus:border-[#ff906d]/50 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-500 font-['Space_Grotesk'] font-bold text-[11px] uppercase tracking-[1px] px-1">
                  Dirección Física
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))}
                  placeholder="Ej: Av. Winston Churchill #123, Santo Domingo"
                  className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3.5 text-sm text-white outline-none focus:border-[#ff906d]/50 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-500 font-['Space_Grotesk'] font-bold text-[11px] uppercase tracking-[1px] px-1">
                  Notas / Observaciones
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                  placeholder="Notas adicionales..."
                  rows={3}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3.5 text-sm text-white outline-none focus:border-[#ff906d]/50 transition-colors resize-none font-['Inter',sans-serif]"
                />
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab("list");
                    startCreate();
                  }}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl py-3.5 font-['Space_Grotesk'] font-bold text-zinc-400 text-xs tracking-[0.5px] uppercase cursor-pointer hover:border-zinc-700 hover:text-white transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveCustomer()}
                  className="flex-1 bg-[#ff906d] rounded-xl py-3.5 font-['Space_Grotesk'] font-bold text-[#5b1600] text-xs tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff8059] transition-all shadow-md active:scale-95"
                >
                  {saving ? "Guardando..." : editing ? "Guardar Cambios" : "Crear Cliente"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Customer Details Modal ("Ojito") */}
      {viewingCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-all duration-300"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingCustomer(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[#121212] border border-zinc-800 rounded-[24px] shadow-[0px_0px_50px_rgba(255,144,109,0.15)] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative"
          >
            {/* Ambient Top Glow */}
            <div className="absolute top-0 right-0 w-80 h-40 bg-[radial-gradient(ellipse_at_top_right,rgba(255,144,109,0.08),transparent)] pointer-events-none rounded-[24px]" />

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900 shrink-0 relative z-10">
              <div>
                <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] tracking-[0.5px] flex items-center gap-2">
                  <span className="text-[#ff906d]">●</span> Ficha de Cliente
                </h2>
                <p className="text-zinc-500 text-xs mt-0.5 font-['Inter',sans-serif]">
                  ID único: <span className="font-mono text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded text-zinc-400">{viewingCustomer.id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                aria-label="Cerrar modal"
                className="text-zinc-400 bg-transparent border-none cursor-pointer text-[26px] hover:text-white transition-colors leading-none w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-900"
              >
                ×
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 relative z-10 flex flex-col gap-6 custom-scrollbar">
              
              {/* Profile Card */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 relative overflow-hidden flex flex-col gap-4 shrink-0">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,144,109,0.02),transparent)] pointer-events-none" />
                
                <div className="flex items-center gap-3 border-b border-zinc-900 pb-3">
                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#ff906d] font-bold text-lg">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-['Space_Grotesk'] font-bold text-white text-lg m-0">{viewingCustomer.name}</h3>
                    <p className="text-zinc-500 text-xs m-0 font-['Inter']">RNC / Cédula: {viewingCustomer.document_id || "—"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-['Inter']">
                  <div className="flex items-center gap-2.5 text-zinc-300">
                    <Phone className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span>{viewingCustomer.phone || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-zinc-300">
                    <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span className="truncate">{viewingCustomer.email || "—"}</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-zinc-300 md:col-span-2">
                    <MapPin className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                    <span>{viewingCustomer.address || "—"}</span>
                  </div>
                  {viewingCustomer.notes && (
                    <div className="flex items-start gap-2.5 text-zinc-300 md:col-span-2 bg-zinc-900/30 p-3.5 rounded-xl border border-zinc-800/60 mt-1">
                      <FileText className="w-4 h-4 text-[#ff906d] shrink-0 mt-0.5" />
                      <div className="text-xs text-zinc-400">
                        <strong className="block text-zinc-300 font-bold mb-1">Notas:</strong>
                        {viewingCustomer.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Financial KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                <div className="bg-zinc-900/20 border border-zinc-800/40 rounded-2xl p-4 flex flex-col gap-1">
                  <span className="text-zinc-500 text-[10px] font-['Space_Grotesk'] font-bold uppercase tracking-[1.5px]">Total Compras</span>
                  <span className="font-['Space_Grotesk'] font-bold text-[18px] text-[#59ee50] mt-1">
                    RD$ {customerStats.totalSpent.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-zinc-900/20 border border-zinc-800/40 rounded-2xl p-4 flex flex-col gap-1">
                  <span className="text-zinc-500 text-[10px] font-['Space_Grotesk'] font-bold uppercase tracking-[1.5px]">Facturas Pagadas</span>
                  <span className="font-['Space_Grotesk'] font-bold text-[18px] text-white mt-1">
                    {customerStats.invoiceCount}
                  </span>
                </div>
                <div className="bg-zinc-900/20 border border-zinc-800/40 rounded-2xl p-4 flex flex-col gap-1">
                  <span className="text-zinc-500 text-[10px] font-['Space_Grotesk'] font-bold uppercase tracking-[1.5px]">Ticket Promedio</span>
                  <span className="font-['Space_Grotesk'] font-bold text-[18px] text-[#ff906d] mt-1">
                    RD$ {customerStats.avgTicket.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-zinc-900/20 border border-zinc-800/40 rounded-2xl p-4 flex flex-col gap-1">
                  <span className="text-zinc-500 text-[10px] font-['Space_Grotesk'] font-bold uppercase tracking-[1.5px]">Última Compra</span>
                  <span className="font-['Space_Grotesk'] font-bold text-[13px] text-zinc-300 mt-2 truncate">
                    {customerStats.lastInvoiceAt 
                      ? new Date(customerStats.lastInvoiceAt).toLocaleDateString("es-DO") 
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Invoice History list */}
              <div className="flex flex-col gap-3">
                <span className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[11px] uppercase tracking-[1.5px] px-1">
                  Historial de Facturación
                </span>
                
                {viewingLoading ? (
                  <div className="text-center py-6 text-zinc-500 text-xs">Cargando facturas...</div>
                ) : viewingInvoices.length > 0 ? (
                  <div className="rounded-2xl border border-zinc-800/60 overflow-hidden bg-zinc-950/40">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-900 text-zinc-500 font-bold">
                          <th className="text-left px-4 py-3 bg-zinc-950">Factura</th>
                          <th className="text-left px-4 py-3 bg-zinc-950">Fecha</th>
                          <th className="text-left px-4 py-3 bg-zinc-950">Método</th>
                          <th className="text-right px-4 py-3 bg-zinc-950">Monto</th>
                          <th className="text-right px-4 py-3 bg-zinc-950">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingInvoices.map((invoice) => (
                          <tr key={invoice.id} className="border-b border-zinc-900/50">
                            <td className="px-4 py-3 font-mono font-bold text-zinc-300">
                              #{String(invoice.numero_factura).padStart(6, "0")}
                            </td>
                            <td className="px-4 py-3 text-zinc-400">
                              {new Date(invoice.created_at).toLocaleDateString("es-DO")}
                            </td>
                            <td className="px-4 py-3 text-zinc-400 uppercase">
                              {invoice.metodo_pago}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-white">
                              RD$ {Number(invoice.total || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wide ${
                                invoice.estado === "pagada"
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : invoice.estado === "pendiente"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                              }`}>
                                {invoice.estado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-zinc-500 text-xs bg-zinc-900/10 rounded-2xl border border-zinc-900 border-dashed">
                    Este cliente aún no tiene facturas emitidas.
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4.5 border-t border-zinc-900 shrink-0 bg-zinc-950/60 flex justify-end gap-3 z-10">
              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 font-['Space_Grotesk'] font-bold text-zinc-400 text-xs tracking-[0.5px] uppercase cursor-pointer hover:border-zinc-700 hover:text-white transition-all active:scale-95"
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
