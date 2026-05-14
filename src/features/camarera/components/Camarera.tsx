import { useCallback, useEffect, useMemo, useState } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useTenantCurrency } from "../../../shared/hooks/useTenantCurrency";
import { generateMesasConfig } from "../../tables/config/mesas";
import { loadCantidadMesas } from "../../../shared/lib/tenantMesasSettings";
import { buildComandaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { normalizeTenantRol } from "../../../shared/lib/roleNav";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";

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
  mine_pending: boolean;
  owner_names: string[];
}

interface CartItem {
  plato: Plato;
  cantidad: number;
}

interface MesaConsumoRow {
  id: string;
  comanda_id: string | null;
  plato_id: number | null;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  tipo: "cocina" | "directo" | string;
  estado: string;
  created_at: string;
  created_by_auth_user_id: string | null;
}

interface TenantUserLite {
  auth_user_id: string | null;
  nombre: string | null;
  email: string | null;
}

interface MesaConsumoGroup {
  key: string;
  rows: MesaConsumoRow[];
  ids: string[];
  comandaIds: string[];
  plato_id: number | null;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  tipo: string;
  estado: string;
  ownerId: string | null;
  ownerName: string;
}

interface TenantPrintRow {
  nombre_negocio: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  logo_url: string | null;
  moneda?: string | null;
}

function getTenantUserName(row: TenantUserLite | undefined, fallback = "Sin asignar") {
  if (!row) return fallback;
  return row.nombre?.trim() || row.email?.trim() || fallback;
}

function buildOwnerNameMap(users: TenantUserLite[]) {
  const map = new Map<string, string>();
  for (const userRow of users) {
    if (!userRow.auth_user_id) continue;
    map.set(userRow.auth_user_id, getTenantUserName(userRow));
  }
  return map;
}

function getMesaConsumoGroupKey(row: MesaConsumoRow) {
  return [
    row.plato_id ?? row.nombre,
    row.nombre,
    row.precio_unitario,
    row.tipo,
    row.estado,
    row.created_by_auth_user_id ?? "sin-camarera",
  ].join("|");
}

function groupMesaConsumos(rows: MesaConsumoRow[], ownerNameByAuthId: Map<string, string>) {
  const groups = new Map<string, MesaConsumoGroup>();

  for (const row of rows) {
    const key = getMesaConsumoGroupKey(row);
    const ownerName = row.created_by_auth_user_id
      ? ownerNameByAuthId.get(row.created_by_auth_user_id) ?? "Camarera"
      : "Sin asignar";
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        key,
        rows: [row],
        ids: [row.id],
        comandaIds: row.comanda_id ? [row.comanda_id] : [],
        plato_id: row.plato_id,
        nombre: row.nombre,
        cantidad: Number(row.cantidad),
        precio_unitario: Number(row.precio_unitario),
        subtotal: Number(row.subtotal),
        tipo: row.tipo,
        estado: row.estado,
        ownerId: row.created_by_auth_user_id,
        ownerName,
      });
      continue;
    }

    current.rows.push(row);
    current.ids.push(row.id);
    if (row.comanda_id && !current.comandaIds.includes(row.comanda_id)) current.comandaIds.push(row.comanda_id);
    current.cantidad += Number(row.cantidad);
    current.subtotal += Number(row.subtotal);
  }

  return Array.from(groups.values());
}

export function Camarera() {
  const { tenantId, user, rol, loading: authLoading } = useAuth();
  const { formatMoney } = useTenantCurrency();
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [mesas, setMesas] = useState<MesaOption[]>([]);
  const [selectedMesaNumero, setSelectedMesaNumero] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mesaConsumos, setMesaConsumos] = useState<MesaConsumoRow[]>([]);
  const [ownerNameByAuthId, setOwnerNameByAuthId] = useState<Map<string, string>>(new Map());
  const [deletingConsumoId, setDeletingConsumoId] = useState<string | null>(null);
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
    const loadOpenConsumos = async () => {
      try {
        if (await shouldReadLocalFirst(tenantId, ["consumos"])) {
          return {
            data: (await readLocalMirror<MesaConsumoRow & { mesa_numero: number | null }>(tenantId, "consumos"))
              .filter((row) => row.estado !== "pagado"),
            error: null,
          };
        }
      } catch {
        // Si IndexedDB falla, seguimos con servidor.
      }
      return insforgeClient.database
        .from("consumos")
        .select("mesa_numero, subtotal, created_by_auth_user_id")
        .eq("tenant_id", tenantId)
        .neq("estado", "pagado");
    };

    Promise.all([
      insforgeClient.database
        .from("platos")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("disponible", true)
        .order("categoria"),
      loadOpenConsumos(),
      loadCantidadMesas(tenantId),
      insforgeClient.database
        .from("tenant_users")
        .select("auth_user_id, nombre, email")
        .eq("tenant_id", tenantId),
    ]).then(([platosRes, consumosRes, cantidadMesas, usersRes]) => {
      if (cancelled) return;
      if (!platosRes.error && platosRes.data) setPlatos(platosRes.data as Plato[]);

      const ownerMap = !usersRes.error && usersRes.data
        ? buildOwnerNameMap(usersRes.data as TenantUserLite[])
        : new Map<string, string>();
      setOwnerNameByAuthId(ownerMap);

      const deudaPorMesa = new Map<number, { deuda: number; items: number; mine: boolean; owners: Set<string> }>();
      if (!consumosRes.error && consumosRes.data) {
        for (const row of consumosRes.data as Array<{ mesa_numero: number | null; subtotal: number; created_by_auth_user_id: string | null }>) {
          const mesaNumero = Number(row.mesa_numero);
          if (mesaNumero <= 0) continue;
          const current = deudaPorMesa.get(mesaNumero) ?? { deuda: 0, items: 0, mine: false, owners: new Set<string>() };
          current.deuda += Number(row.subtotal);
          current.items += 1;
          if (row.created_by_auth_user_id && row.created_by_auth_user_id === user?.id) current.mine = true;
          if (row.created_by_auth_user_id) {
            current.owners.add(ownerMap.get(row.created_by_auth_user_id) ?? "Camarera");
          }
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
            mine_pending: deuda?.mine ?? false,
            owner_names: deuda ? Array.from(deuda.owners) : [],
          };
        })
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId, user?.id]);

  const loadSelectedMesaConsumos = useCallback(async (mesaNumero: number | null) => {
    if (!tenantId || !mesaNumero) {
      setMesaConsumos([]);
      return;
    }
    try {
      if (await shouldReadLocalFirst(tenantId, ["consumos"])) {
        const rows = await readLocalMirror<MesaConsumoRow & { mesa_numero: number | null }>(tenantId, "consumos");
        setMesaConsumos(
          rows
            .filter((row) => Number(row.mesa_numero) === mesaNumero && row.estado !== "pagado")
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        );
        return;
      }
    } catch {
      // Si IndexedDB falla, seguimos con servidor.
    }
    const { data, error } = await insforgeClient.database
      .from("consumos")
      .select("id, comanda_id, plato_id, nombre, cantidad, precio_unitario, subtotal, tipo, estado, created_at, created_by_auth_user_id")
      .eq("tenant_id", tenantId)
      .eq("mesa_numero", mesaNumero)
      .neq("estado", "pagado")
      .order("created_at", { ascending: false });

    if (error || !data) {
      setMesaConsumos([]);
      return;
    }
    setMesaConsumos(data as MesaConsumoRow[]);
  }, [tenantId]);

  useEffect(() => {
    void loadSelectedMesaConsumos(selectedMesaNumero);
  }, [loadSelectedMesaConsumos, selectedMesaNumero]);

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
  const mesaConsumoGroups = useMemo(() => groupMesaConsumos(mesaConsumos, ownerNameByAuthId), [mesaConsumos, ownerNameByAuthId]);
  const normalizedRole = normalizeTenantRol(rol);
  const isCamareraRole = normalizedRole === "mesero";
  const selectedMesaHasOtherOwner = Boolean(
    selectedMesa && selectedMesa.items_pendientes > 0 && !selectedMesa.mine_pending
  );
  const canEditSelectedMesa = Boolean(selectedMesa) && (!isCamareraRole || !selectedMesaHasOtherOwner);
  const selectedMesaOwnerLabel = selectedMesa?.owner_names.length
    ? selectedMesa.owner_names.join(", ")
    : selectedMesa?.items_pendientes ? "Sin asignar" : "Sin camarera";
  const cartTotal = cart.reduce((sum, item) => sum + item.plato.precio * item.cantidad, 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.cantidad, 0);

  function addToCart(plato: Plato) {
    if (!canEditSelectedMesa) {
      setMessage("Esta mesa pertenece a otra camarera. Podés verla, pero no editarla.");
      return;
    }
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
    if (!tenantId || !selectedMesa || cart.length === 0 || !canEditSelectedMesa) return;
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
        .insert([{ mesa_numero: selectedMesa.numero, estado: "pendiente", items, notas: null, tenant_id: tenantId, creado_por: user?.id ?? null }])
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
        created_by_auth_user_id: user?.id ?? null,
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
        created_by_auth_user_id: user?.id ?? null,
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
              mine_pending: true,
              owner_names: Array.from(new Set([...mesa.owner_names, ownerNameByAuthId.get(user?.id ?? "") ?? "Tu mesa"])),
            }
          : mesa
      )
    );
    setCart([]);
    await loadSelectedMesaConsumos(selectedMesa.numero);
    setMessage(`Orden enviada a Mesa ${String(selectedMesa.numero).padStart(2, "0")}.`);
    setSending(false);
  }

  async function deleteMesaConsumoGroup(group: MesaConsumoGroup) {
    if (!tenantId || !selectedMesa) return;
    if (isCamareraRole && group.ownerId !== user?.id) {
      setMessage("Solo podés editar los consumos de tus propias mesas.");
      return;
    }
    const confirmed = confirm(`Eliminar ${group.cantidad}× ${group.nombre} de la Mesa ${selectedMesa.numero}?`);
    if (!confirmed) return;

    setDeletingConsumoId(group.key);
    setMessage("");

    const { error } = await insforgeClient.database
      .from("consumos")
      .delete()
      .in("id", group.ids)
      .eq("tenant_id", tenantId);

    if (error) {
      setMessage(error.message || "No se pudo eliminar el consumo.");
      setDeletingConsumoId(null);
      return;
    }

    for (const comandaId of group.comandaIds) {
      const { data: remaining } = await insforgeClient.database
        .from("consumos")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("comanda_id", comandaId)
        .neq("estado", "pagado");

      if (!remaining || remaining.length === 0) {
        await insforgeClient.database
          .from("comandas")
          .delete()
          .eq("id", comandaId)
          .eq("tenant_id", tenantId);
      } else {
        const qtyToRemove = group.rows
          .filter((row) => row.comanda_id === comandaId)
          .reduce((sum, row) => sum + Number(row.cantidad), 0);
        const { data: comanda } = await insforgeClient.database
          .from("comandas")
          .select("items")
          .eq("id", comandaId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        const items = Array.isArray((comanda as { items?: unknown } | null)?.items)
          ? ([...((comanda as { items: Array<{ nombre?: string; cantidad?: number; precio?: number }> }).items)] as Array<{ nombre?: string; cantidad?: number; precio?: number }>)
          : [];
        const idx = items.findIndex((item) => item.nombre === group.nombre && Number(item.precio) === Number(group.precio_unitario));
        if (idx >= 0) {
          const currentQty = Number(items[idx].cantidad || 0);
          if (currentQty <= qtyToRemove) items.splice(idx, 1);
          else items[idx] = { ...items[idx], cantidad: currentQty - qtyToRemove };
          await insforgeClient.database
            .from("comandas")
            .update({ items })
            .eq("id", comandaId)
            .eq("tenant_id", tenantId);
        }
      }
    }

    await loadSelectedMesaConsumos(selectedMesa.numero);
    setMesas((prev) => prev.map((mesa) => mesa.numero === selectedMesa.numero
      ? {
          ...mesa,
          deuda_pendiente: Math.max(0, mesa.deuda_pendiente - Number(group.subtotal)),
          items_pendientes: Math.max(0, mesa.items_pendientes - group.ids.length),
        }
      : mesa
    ));
    setMessage(`${group.nombre} eliminado de la mesa.`);
    setDeletingConsumoId(null);
  }

  if (authLoading || loading) {
    return <div className="flex-1 grid place-items-center text-muted-foreground">Cargando módulo de camarera...</div>;
  }

  return (
    <div className="flex-1 min-h-0 bg-background p-3 pb-28 sm:p-5 sm:pb-5 lg:p-6 overflow-y-auto">
      <div className="mx-auto max-w-[1280px] flex flex-col gap-4 sm:gap-5">
        {message ? <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">{message}</div> : null}

        <section className="grid grid-cols-1 xl:grid-cols-[360px_280px_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
          <aside className="order-2 rounded-[20px] sm:rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-3 sm:p-5 xl:sticky xl:top-4">
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
                        : mesa.items_pendientes > 0
                          ? mesa.mine_pending
                            ? "border-destructive/60 bg-destructive/10 text-destructive ring-2 ring-emerald-500/70 hover:border-destructive"
                            : "border-destructive/50 bg-destructive/10 text-destructive hover:border-destructive"
                          : "border-black/10 dark:border-white/10 bg-muted/30 text-foreground hover:border-primary/50"
                    }`}
                  >
                    <span className="flex items-center gap-1 font-['Space_Grotesk'] text-sm sm:text-lg font-bold leading-none">{mesa.mine_pending ? <span className="size-2 rounded-full bg-emerald-500" aria-label="Tu mesa" /> : null}{String(mesa.numero).padStart(2, "0")}</span>
                    <span className={`mt-1 block text-[8px] sm:text-[10px] font-bold uppercase leading-none ${selected ? "text-primary-foreground/75" : mesa.items_pendientes > 0 ? "text-destructive/80" : "text-muted-foreground"}`}>
                      {mesa.items_pendientes > 0 ? `${mesa.items_pendientes} pend.` : "Libre"}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="order-3 min-w-0 rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-3 sm:p-5">
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
                  disabled={!canEditSelectedMesa}
                  className="min-h-[118px] sm:min-h-[132px] rounded-[18px] sm:rounded-[20px] border border-black/10 dark:border-white/10 bg-background p-3 sm:p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/45 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="block font-['Space_Grotesk'] text-sm sm:text-base font-bold text-foreground leading-tight">{plato.nombre}</span>
                  <span className="mt-2 block text-[11px] text-muted-foreground uppercase tracking-widest">{plato.categoria || "General"}</span>
                  <span className="mt-3 sm:mt-4 block text-base sm:text-lg font-bold text-primary">{formatMoney(plato.precio)}</span>
                </button>
              ))}
            </div>
          </main>

          <aside className="order-1 rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-4 sm:p-5 xl:sticky xl:top-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-['Space_Grotesk'] text-lg font-bold text-foreground">Pedido</h2>
                <p className="text-xs text-muted-foreground">{selectedMesa ? `Mesa ${String(selectedMesa.numero).padStart(2, "0")} - ${selectedMesaOwnerLabel}` : "Selecciona una mesa"}</p>
              </div>
              {cart.length > 0 ? (
                <button type="button" onClick={() => setCart([])} className="text-[10px] font-bold uppercase tracking-widest text-destructive bg-transparent border-none">Vaciar</button>
              ) : null}
            </div>

            {selectedMesa ? (
              <div className="mt-4 rounded-2xl border border-black/10 dark:border-white/10 bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Mesa actual</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-destructive">
                    {mesaConsumoGroups.length > 0 ? `${mesaConsumoGroups.reduce((sum, group) => sum + group.cantidad, 0)} pendiente(s)` : "Libre"}
                  </span>
                </div>
                <div className="mt-3 max-h-44 overflow-y-auto space-y-2 pr-1">
                  {mesaConsumoGroups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No hay consumos cargados en esta mesa.</p>
                  ) : mesaConsumoGroups.map((group) => {
                    const canDeleteGroup = !isCamareraRole || group.ownerId === user?.id;
                    return (
                      <div key={group.key} className={`rounded-xl border p-2 ${canDeleteGroup ? "border-destructive/15 bg-destructive/5" : "border-black/10 bg-muted/25 dark:border-white/10"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[13px] font-bold text-foreground leading-tight">{group.cantidad}× {group.nombre}</p>
                            <p className="text-[10px] font-bold uppercase text-muted-foreground">{group.tipo} · {group.estado}</p>
                            <p className="text-[10px] font-semibold text-muted-foreground">Camarera: {group.ownerName}</p>
                          </div>
                          <p className="text-[12px] font-bold text-destructive">{formatMoney(Number(group.subtotal))}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteMesaConsumoGroup(group)}
                          disabled={!canDeleteGroup || deletingConsumoId === group.key}
                          className="mt-2 text-[10px] font-bold uppercase tracking-widest text-destructive bg-transparent border-none disabled:opacity-40"
                        >
                          {deletingConsumoId === group.key ? "Eliminando..." : canDeleteGroup ? "Eliminar de mesa" : "Solo lectura"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-4 max-h-none xl:max-h-[48vh] overflow-y-auto space-y-3 pr-1">
              {cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm text-muted-foreground">
                  {canEditSelectedMesa ? "Agrega platos desde la carta. Si algo se cargo mal, lo podes eliminar antes de mandar." : "Esta mesa es de otra camarera. Podes verla en rojo, pero no editarla."}
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
                disabled={!selectedMesa || cart.length === 0 || sending || !canEditSelectedMesa}
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
              disabled={!selectedMesa || cart.length === 0 || sending || !canEditSelectedMesa}
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
