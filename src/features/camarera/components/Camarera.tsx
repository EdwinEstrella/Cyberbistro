import { useEffect, useMemo, useState } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useTenantCurrency } from "../../../shared/hooks/useTenantCurrency";
import { generateMesasConfig } from "../../tables/config/mesas";
import { loadCantidadMesas } from "../../../shared/lib/tenantMesasSettings";
import { buildComandaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";

interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
}

interface MesaOption {
  id: string;
  numero: number;
  deuda_pendiente: number;
  items_pendientes: number;
}

interface CartItem {
  plato: Plato;
  cantidad: number;
}

interface TenantPrintRow {
  nombre_negocio: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  logo_url: string | null;
  moneda?: string | null;
}

export function Camarera() {
  const { tenantId, loading: authLoading } = useAuth();
  const { formatMoney } = useTenantCurrency();
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [mesas, setMesas] = useState<MesaOption[]>([]);
  const [selectedMesaNumero, setSelectedMesaNumero] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!tenantId) {
      setPlatos([]);
      setMesas([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([
      insforgeClient.database
        .from("platos")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("disponible", true)
        .order("categoria"),
      insforgeClient.database
        .from("consumos")
        .select("mesa_numero, subtotal")
        .eq("tenant_id", tenantId)
        .neq("estado", "pagado"),
      loadCantidadMesas(tenantId),
    ]).then(([platosRes, consumosRes, cantidadMesas]) => {
      if (cancelled) return;
      if (!platosRes.error && platosRes.data) setPlatos(platosRes.data as Plato[]);

      const deudaPorMesa = new Map<number, { deuda: number; items: number }>();
      if (!consumosRes.error && consumosRes.data) {
        for (const row of consumosRes.data as Array<{ mesa_numero: number | null; subtotal: number }>) {
          const mesaNumero = Number(row.mesa_numero);
          if (mesaNumero <= 0) continue;
          const current = deudaPorMesa.get(mesaNumero) ?? { deuda: 0, items: 0 };
          current.deuda += Number(row.subtotal);
          current.items += 1;
          deudaPorMesa.set(mesaNumero, current);
        }
      }

      setMesas(
        generateMesasConfig(cantidadMesas).map((mesa) => {
          const deuda = deudaPorMesa.get(mesa.numero);
          return {
            id: String(mesa.id),
            numero: mesa.numero,
            deuda_pendiente: deuda?.deuda ?? 0,
            items_pendientes: deuda?.items ?? 0,
          };
        })
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId]);

  const categories = useMemo(
    () => ["Todos", ...Array.from(new Set(platos.map((p) => p.categoria || "General")))],
    [platos]
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredPlatos = platos.filter((plato) => {
    const matchesCategory = activeCategory === "Todos" || (plato.categoria || "General") === activeCategory;
    if (!matchesCategory) return false;
    if (!normalizedSearch) return true;
    return `${plato.nombre} ${plato.categoria || "General"}`.toLowerCase().includes(normalizedSearch);
  });

  const selectedMesa = mesas.find((mesa) => mesa.numero === selectedMesaNumero) ?? null;
  const cartTotal = cart.reduce((sum, item) => sum + item.plato.precio * item.cantidad, 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.cantidad, 0);

  function addToCart(plato: Plato) {
    setCart((prev) => {
      const existing = prev.find((item) => item.plato.id === plato.id);
      if (existing) {
        return prev.map((item) =>
          item.plato.id === plato.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      }
      return [...prev, { plato, cantidad: 1 }];
    });
  }

  function changeQty(platoId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => item.plato.id === platoId ? { ...item, cantidad: item.cantidad + delta } : item)
        .filter((item) => item.cantidad > 0)
    );
  }

  async function submitOrder() {
    if (!tenantId || !selectedMesa || cart.length === 0) return;
    setSending(true);
    setMessage("");

    const kitchenItems = cart.filter((item) => item.plato.va_a_cocina !== false);
    const directItems = cart.filter((item) => item.plato.va_a_cocina === false);
    let comandaId: string | null = null;

    if (kitchenItems.length > 0) {
      const { data: cocinaEstado } = await insforgeClient.database
        .from("cocina_estado")
        .select("activa")
        .eq("tenant_id", tenantId)
        .limit(1);

      if (cocinaEstado?.[0]?.activa === false) {
        setMessage("Cocina está cerrada. No se pudo mandar la orden.");
        setSending(false);
        return;
      }

      const items = kitchenItems.map((item) => ({
        nombre: item.plato.nombre,
        categoria: item.plato.categoria || "General",
        cantidad: item.cantidad,
        precio: item.plato.precio,
      }));

      const { data: comanda, error } = await insforgeClient.database
        .from("comandas")
        .insert([{ mesa_numero: selectedMesa.numero, estado: "pendiente", items, notas: null, tenant_id: tenantId }])
        .select()
        .single();

      if (error || !comanda) {
        setMessage(error?.message || "No se pudo crear la comanda.");
        setSending(false);
        return;
      }

      comandaId = comanda.id as string;

      const { data: tenantRow } = await insforgeClient.database
        .from("tenants")
        .select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda")
        .eq("id", tenantId)
        .single();

      if (tenantRow) {
        const paperWidthMm = getThermalPrintSettings().paperWidthMm;
        const html = buildComandaReceiptHtml(
          tenantRow as TenantPrintRow,
          {
            id: comanda.id,
            numero_comanda: (comanda as { numero_comanda?: number }).numero_comanda,
            mesa_numero: comanda.mesa_numero,
            items,
            notas: comanda.notas,
            created_at: comanda.created_at,
          },
          paperWidthMm
        );
        void printThermalHtml(html);
      }
    }

    const consumosToInsert = [
      ...kitchenItems.map((item) => ({
        mesa_numero: selectedMesa.numero,
        tenant_id: tenantId,
        comanda_id: comandaId,
        plato_id: item.plato.id,
        nombre: item.plato.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.plato.precio,
        subtotal: item.plato.precio * item.cantidad,
        tipo: "cocina" as const,
        estado: "enviado_cocina" as const,
      })),
      ...directItems.map((item) => ({
        mesa_numero: selectedMesa.numero,
        tenant_id: tenantId,
        comanda_id: null,
        plato_id: item.plato.id,
        nombre: item.plato.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.plato.precio,
        subtotal: item.plato.precio * item.cantidad,
        tipo: "directo" as const,
        estado: "entregado" as const,
      })),
    ];

    const { error } = await insforgeClient.database.from("consumos").insert(consumosToInsert);
    if (error) {
      setMessage(error.message);
      setSending(false);
      return;
    }

    setMesas((prev) =>
      prev.map((mesa) =>
        mesa.numero === selectedMesa.numero
          ? {
              ...mesa,
              deuda_pendiente: mesa.deuda_pendiente + cartTotal,
              items_pendientes: mesa.items_pendientes + cart.length,
            }
          : mesa
      )
    );
    setCart([]);
    setMessage(`Orden enviada a Mesa ${String(selectedMesa.numero).padStart(2, "0")}.`);
    setSending(false);
  }

  if (authLoading || loading) {
    return <div className="flex-1 grid place-items-center text-muted-foreground">Cargando módulo de camarera...</div>;
  }

  return (
    <div className="flex-1 min-h-0 bg-background p-3 pb-28 sm:p-5 sm:pb-5 lg:p-6 overflow-y-auto">
      <div className="mx-auto max-w-[1280px] flex flex-col gap-4 sm:gap-5">
        {message ? <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{message}</div> : null}

        <section className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_360px] gap-4 lg:gap-5 items-start">
          <aside className="rounded-[20px] sm:rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-3 sm:p-5 xl:sticky xl:top-4">
            <h2 className="font-['Space_Grotesk'] text-sm sm:text-lg font-bold text-foreground">Mesas</h2>
            <div className="mt-3 sm:mt-4 grid grid-cols-5 min-[390px]:grid-cols-6 min-[480px]:grid-cols-7 sm:grid-cols-8 md:grid-cols-10 xl:grid-cols-3 gap-1.5 sm:gap-2">
              {mesas.map((mesa) => {
                const selected = selectedMesaNumero === mesa.numero;
                return (
                  <button
                    key={mesa.id}
                    type="button"
                    onClick={() => setSelectedMesaNumero(mesa.numero)}
                    className={`min-h-[46px] sm:min-h-[58px] rounded-xl sm:rounded-2xl border px-1.5 py-1.5 sm:p-2 text-center sm:text-left transition-all active:scale-[0.98] ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-lg"
                        : "border-black/10 dark:border-white/10 bg-muted/30 text-foreground hover:border-primary/50"
                    }`}
                  >
                    <span className="block font-['Space_Grotesk'] text-sm sm:text-lg font-bold leading-none">{String(mesa.numero).padStart(2, "0")}</span>
                    <span className={`mt-1 block text-[8px] sm:text-[10px] font-bold uppercase leading-none ${selected ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                      {mesa.items_pendientes > 0 ? `${mesa.items_pendientes} pend.` : "Libre"}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0 rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-3 sm:p-5">
            <div className="mb-3">
              <label htmlFor="camarera-search" className="sr-only">Buscar platos</label>
              <input
                id="camarera-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="BUSCAR PLATO..."
                autoComplete="off"
                className="w-full rounded-2xl border border-black/10 bg-background px-4 py-3 font-['Space_Grotesk'] text-sm font-bold uppercase tracking-widest text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 dark:border-white/10"
              />
            </div>

            <div className="-mx-3 sm:-mx-5 px-3 sm:px-5 flex gap-2 overflow-x-auto pb-3">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest border transition-colors ${
                    activeCategory === category
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-black/10 dark:border-white/10"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-4">
              {filteredPlatos.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-muted-foreground dark:border-white/10">
                  No hay platos que coincidan con la búsqueda.
                </div>
              ) : filteredPlatos.map((plato) => (
                <button
                  key={plato.id}
                  type="button"
                  onClick={() => addToCart(plato)}
                  className="min-h-[118px] sm:min-h-[132px] rounded-[18px] sm:rounded-[20px] border border-black/10 dark:border-white/10 bg-background p-3 sm:p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/45 active:scale-[0.98]"
                >
                  <span className="block font-['Space_Grotesk'] text-sm sm:text-base font-bold text-foreground leading-tight">{plato.nombre}</span>
                  <span className="mt-2 block text-[11px] text-muted-foreground uppercase tracking-widest">{plato.categoria || "General"}</span>
                  <span className="mt-3 sm:mt-4 block text-base sm:text-lg font-bold text-primary">{formatMoney(plato.precio)}</span>
                </button>
              ))}
            </div>
          </main>

          <aside className="rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-4 sm:p-5 xl:sticky xl:top-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-['Space_Grotesk'] text-lg font-bold text-foreground">Pedido</h2>
                <p className="text-xs text-muted-foreground">{selectedMesa ? `Mesa ${String(selectedMesa.numero).padStart(2, "0")}` : "Seleccioná una mesa"}</p>
              </div>
              {cart.length > 0 ? (
                <button type="button" onClick={() => setCart([])} className="text-[10px] font-bold uppercase tracking-widest text-destructive bg-transparent border-none">Vaciar</button>
              ) : null}
            </div>

            <div className="mt-4 max-h-none xl:max-h-[48vh] overflow-y-auto space-y-3 pr-1">
              {cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm text-muted-foreground">
                  Agregá platos desde la carta. Si algo se cargó mal, lo podés eliminar antes de mandar.
                </div>
              ) : cart.map((item) => (
                <div key={item.plato.id} className="rounded-2xl border border-black/10 dark:border-white/10 bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-foreground leading-tight">{item.plato.nombre}</p>
                      <p className="text-xs text-muted-foreground">{formatMoney(item.plato.precio)} c/u</p>
                    </div>
                    <p className="font-bold text-primary">{formatMoney(item.plato.precio * item.cantidad)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => changeQty(item.plato.id, -1)} className="size-10 rounded-xl bg-muted text-foreground font-bold border border-black/10 dark:border-white/10">−</button>
                      <span className="w-8 text-center font-bold tabular-nums">{item.cantidad}</span>
                      <button type="button" onClick={() => changeQty(item.plato.id, 1)} className="size-10 rounded-xl bg-muted text-foreground font-bold border border-black/10 dark:border-white/10">+</button>
                    </div>
                    <button type="button" onClick={() => changeQty(item.plato.id, -item.cantidad)} className="text-[10px] font-bold uppercase tracking-widest text-destructive bg-transparent border-none">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-black/10 dark:border-white/10 pt-4 space-y-3">
              <div className="flex items-center justify-between font-bold text-foreground">
                <span>Total</span>
                <span className="text-xl text-primary">{formatMoney(cartTotal)}</span>
              </div>
              <button
                type="button"
                onClick={submitOrder}
                disabled={!selectedMesa || cart.length === 0 || sending}
                className="w-full rounded-2xl bg-primary px-5 py-4 font-bold uppercase tracking-widest text-primary-foreground shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sending ? "Mandando..." : "Confirmar y mandar"}
              </button>
            </div>
          </aside>
        </section>

        <div className="fixed inset-x-3 bottom-3 z-40 rounded-[22px] border border-black/10 bg-card/95 p-3 shadow-2xl backdrop-blur dark:border-white/10 sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {selectedMesa ? `Mesa ${String(selectedMesa.numero).padStart(2, "0")}` : "Sin mesa"}
              </p>
              <p className="font-['Space_Grotesk'] text-lg font-bold text-primary">{formatMoney(cartTotal)}</p>
            </div>
            <button
              type="button"
              onClick={submitOrder}
              disabled={!selectedMesa || cart.length === 0 || sending}
              className="shrink-0 rounded-2xl bg-primary px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg disabled:opacity-45"
            >
              {sending ? "Mandando" : `Mandar ${cartItemsCount || ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
