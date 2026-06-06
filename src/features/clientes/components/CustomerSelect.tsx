import { useEffect, useMemo, useState } from "react";
import { customerLabel, customerMatchesSearch, listCustomers, type Customer } from "../lib/customers";

interface CustomerSelectProps {
  tenantId: string | null;
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  compact?: boolean;
}

export function CustomerSelect({ tenantId, value, onChange, compact = false }: CustomerSelectProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

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

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={loading ? "Cargando clientes..." : "Buscar por nombre, teléfono o RNC"}
        className="w-full rounded-[12px] border border-[rgba(72,72,71,0.3)] bg-[#262626] px-[14px] py-[12px] font-['Inter',sans-serif] text-white text-[13px] outline-none"
      />

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
