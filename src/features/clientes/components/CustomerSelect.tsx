import { useEffect, useMemo, useState } from "react";
import { lookupBusinessByRnc } from "../../../shared/lib/dgiiRncLookup";
import { createCustomer, customerLabel, customerMatchesSearch, listCustomers, type Customer } from "../lib/customers";

interface CustomerSelectProps {
  tenantId: string | null;
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  onQueryChange?: (query: string) => void;
  compact?: boolean;
}

export function CustomerSelect({ tenantId, value, onChange, onQueryChange, compact = false }: CustomerSelectProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");

  useEffect(() => {
    if (!tenantId) {
      setCustomers([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void listCustomers(tenantId)
      .then((rows) => {
        if (!cancelled) setCustomers(rows);
      })
      .catch((err) => {
        console.warn("No se pudieron cargar clientes:", err);
        if (!cancelled) setCustomers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const visibleCustomers = useMemo(
    () => customers.filter((customer) => customerMatchesSearch(customer, query)).slice(0, 8),
    [customers, query]
  );

  const queryRnc = query.replace(/\D/g, "");

  async function handleRncLookup() {
    if (!tenantId || queryRnc.length !== 9) return;

    setLookupMessage("");
    const savedCustomer = customers.find(
      (customer) => customer.document_id?.replace(/\D/g, "") === queryRnc
    );
    if (savedCustomer) {
      onChange(savedCustomer);
      setQuery("");
      return;
    }

    setLookupLoading(true);
    try {
      const result = await lookupBusinessByRnc(queryRnc);
      if (result.error || !result.data) {
        setLookupMessage(result.error || "No encontramos un negocio con ese RNC.");
        return;
      }

      const business = result.data;
      const customer = await createCustomer(tenantId, {
        name: business.tradeName || business.legalName,
        document_id: business.rnc,
      });
      setCustomers((current) => [...current, customer].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(customer);
      setQuery("");
      setLookupMessage("Cliente agregado y seleccionado.");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center justify-between gap-[8px]">
        <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
          Cliente (opcional)
        </span>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="bg-transparent border-none text-[#ff906d] text-[11px] cursor-pointer"
          >
            Quitar
          </button>
        ) : null}
      </div>

      {value ? (
        <div className="rounded-[12px] border border-[#59ee50]/30 bg-[#59ee50]/10 px-[14px] py-[10px] text-[#d7ffd4] text-[12px]">
          {customerLabel(value)}
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onQueryChange?.(event.target.value);
            setLookupMessage("");
          }}
          placeholder={loading ? "Cargando clientes..." : "Buscar por nombre, teléfono o RNC"}
          className="min-w-0 flex-1 rounded-[12px] border border-[rgba(72,72,71,0.3)] bg-[#262626] px-[14px] py-[12px] font-['Inter',sans-serif] text-white text-[13px] outline-none"
        />
        <button
          type="button"
          onClick={() => void handleRncLookup()}
          disabled={lookupLoading || queryRnc.length !== 9}
          className="shrink-0 rounded-[12px] border border-[#ff906d]/40 px-3 font-['Space_Grotesk',sans-serif] text-[10px] font-bold uppercase tracking-[0.7px] text-[#ff906d] transition-colors hover:bg-[#ff906d]/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {lookupLoading ? "Buscando..." : "Buscar RNC"}
        </button>
      </div>

      {lookupMessage && (
        <span className="font-['Inter',sans-serif] text-[11px] text-[#adaaaa]">{lookupMessage}</span>
      )}

      {query.trim() || (!compact && !value) ? (
        <div className="max-h-[180px] overflow-y-auto rounded-[12px] border border-[rgba(72,72,71,0.25)] bg-[#1f1f1f]">
          {visibleCustomers.length > 0 ? (
            visibleCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => {
                  onChange(customer);
                  setQuery("");
                }}
                className="block w-full border-0 border-b border-[rgba(72,72,71,0.2)] bg-transparent px-[14px] py-[10px] text-left text-white cursor-pointer hover:bg-[#2d2d2d]"
              >
                <span className="block font-['Space_Grotesk',sans-serif] text-[13px] font-bold">{customer.name}</span>
                <span className="block font-['Inter',sans-serif] text-[11px] text-[#adaaaa]">
                  {[customer.document_id, customer.phone, customer.email].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                </span>
              </button>
            ))
          ) : (
            <div className="px-[14px] py-[12px] text-[#adaaaa] text-[12px]">
              {loading ? "Cargando..." : "No hay clientes que coincidan."}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
