import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router";
import svgPaths from "../../../imports/svg-qgatbhef3k";
import { useVentaCartSearch } from "../../../app/context/VentaCartSearchContext";

// Utility to get today's date in YYYY-MM-DD format
function todayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const da = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// Checks if there is an open operational cycle for the tenant today
async function hasOpenCycle(tenantId: string): Promise<boolean> {
  const { data, error } = await insforgeClient.database
    .from("cierres_operativos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("business_day", todayYmd())
    .is("closed_at", null);
  if (error) {
    console.warn("Error checking open cycle:", error);
    return false;
  }
  return (data && (data as any[]).length > 0);
}

import { insforgeClient } from "../../../shared/lib/insforge";
import { MESAS_CONFIG } from "../../tables/config/mesas";
import { useAuth, ensureAuthSessionFresh } from "../../../shared/hooks/useAuth";
import {
  buildFacturaReceiptHtml,
  buildComandaReceiptHtml,
} from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
import { useTenantCurrency } from "../../../shared/hooks/useTenantCurrency";
import {
  MENU_CATEGORY_COLORS,
  sortCategoriesForTabs,
} from "../../../shared/lib/menuCategories";
import { MesaCloseAccountModal } from "../../billing/components/MesaCloseAccountModal";
import { DashboardTickerStrip } from "./DashboardTickerStrip";
import {
  incrementTenantNcfSequence,
  resolveNcfForNewInvoice,
} from "../../../shared/lib/invoiceNcf";
import {
  DEFAULT_NCF_B_CODE,
  isNcfBCode,
  NCF_B_TIPO_OPCIONES,
  ncfTypeRequiresClientRnc,
  type NcfBCode,
} from "../../../shared/lib/ncf";
import { loadTenantBillingSettings } from "../../../shared/lib/tenantBillingSettings";

interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
}

interface MesaBasic {
  id: string;
  numero: number;
  estado: string;
  fusionada?: boolean;
  fusion_padre_id?: string | null;
  fusion_hijos?: string[];
  deuda_pendiente?: number;
  items_pendientes?: number;
}

interface CartItem {
  plato: Plato;
  cantidad: number;
}

interface Consumo {
  id: string;
  /** Coincide con columna `mesa_numero` en BD (no existe mesa_id en consumos). */
  mesa_numero: number | null;
  comanda_id: string | null;
  plato_id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  tipo: 'cocina' | 'directo';
  estado: 'pedido' | 'enviado_cocina' | 'listo' | 'entregado' | 'pagado';
  factura_id: string | null;
  created_at: string;
}

const ITBIS = 0.18;

function catColor(cat: string) {
  return MENU_CATEGORY_COLORS[cat] ?? "#adaaaa";
}

export function Dashboard() {
  const { query: cartSearchQuery } = useVentaCartSearch();
  const { tenantId, user, loading: authLoading } = useAuth();
  const location = useLocation();
  const { formatMoney, currencySymbol } = useTenantCurrency();
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [mesas, setMesas] = useState<MesaBasic[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [selectedMesa, setSelectedMesa] = useState<MesaBasic | null>(null);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [kitchenClosed, setKitchenClosed] = useState(false);
  const [charging, setCharging] = useState(false);
  const [chargeOk, setChargeOk] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "efectivo" | "tarjeta" | "digital" | "transferencia"
  >("efectivo");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConsumosModal, setShowConsumosModal] = useState(false);
  const [showMesaDropdown, setShowMesaDropdown] = useState(false);
  const [mesaConsumos, setMesaConsumos] = useState<Consumo[]>([]);
  const [mesaAccountLoading, setMesaAccountLoading] = useState(false);
  /** Partes para ticket “separar cuenta” (solo referencia en carrito; reparte ítems en ronda, no el monto). */
  const [isTakeout, setIsTakeout] = useState(false);
  const [deletingConsumoId, setDeletingConsumoId] = useState<string | null>(null);
  /** Por defecto sin ITBIS en totales y factura; se activa desde el carrito. */
  const [cartItbisEnabled, setCartItbisEnabled] = useState(false);
  const [tenantNcfFiscalActive, setTenantNcfFiscalActive] = useState(false);
  const [selectedNcfType, setSelectedNcfType] = useState<NcfBCode>(DEFAULT_NCF_B_CODE);
  const [takeoutClientRnc, setTakeoutClientRnc] = useState("");

  useEffect(() => {
    if (authLoading || !tenantId) return;

    let cancelled = false;

    void loadTenantBillingSettings(tenantId).then((settings) => {
      if (cancelled) return;

      setCartItbisEnabled(settings?.defaultItbisEnabled ?? false);
      setTenantNcfFiscalActive(settings?.ncfFiscalActive ?? false);
      setSelectedNcfType(settings?.defaultNcfType ?? DEFAULT_NCF_B_CODE);
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId]);

  useEffect(() => {
    // Inicializar mesas desde configuración estática
    const mesasIniciales = MESAS_CONFIG.map((config) => ({
      id: config.id.toString(),
      numero: config.numero,
      estado: 'libre' as const,
      fusionada: false,
      fusion_padre_id: null,
      fusion_hijos: [],
      deuda_pendiente: 0,
      items_pendientes: 0,
    }));
    setMesas(mesasIniciales);

    // Esperar a tener el tenant_id antes de cargar datos
    if (!tenantId) return;

    // Cargar platos y estados de mesas desde la base de datos (filtrados por tenant)
    Promise.all([
      insforgeClient.database
        .from("platos")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("disponible", true)
        .order("categoria"),
      insforgeClient.database
        .from("mesas_estado")
        .select("*")
        .eq("tenant_id", tenantId),
      insforgeClient.database
        .from("consumos")
        .select("mesa_numero, subtotal")
        .eq("tenant_id", tenantId)
        .neq("estado", "pagado"),
    ]).then(([platosRes, estadosRes, consumosPendRes]) => {
      if (!platosRes.error && platosRes.data) setPlatos(platosRes.data as Plato[]);

      if (!estadosRes.error && estadosRes.data && estadosRes.data.length > 0) {
        // Crear mapa de estados por ID
        const estadosMap = new Map<number, any>();
        for (const e of estadosRes.data) {
          estadosMap.set(e.id, e);
        }

        // Actualizar mesas con los estados de la base de datos
        setMesas((prev) =>
          prev.map((m) => {
            const estadoDB = estadosMap.get(parseInt(m.id));
            if (estadoDB) {
              return {
                ...m,
                estado: estadoDB.estado ?? 'libre',
              };
            }
            return m;
          })
        );
      }

      if (!consumosPendRes.error && consumosPendRes.data) {
        const deudaPorNumero = new Map<number, { deuda: number; items: number }>();
        for (const row of consumosPendRes.data as { mesa_numero: number | null; subtotal: number }[]) {
          const mn = row.mesa_numero ?? 0;
          if (mn <= 0) continue;
          const cur = deudaPorNumero.get(mn) ?? { deuda: 0, items: 0 };
          cur.deuda += Number(row.subtotal);
          cur.items += 1;
          deudaPorNumero.set(mn, cur);
        }
        setMesas((prev) =>
          prev.map((m) => {
            const agg = deudaPorNumero.get(m.numero);
            return {
              ...m,
              deuda_pendiente: agg?.deuda ?? 0,
              items_pendientes: agg?.items ?? 0,
            };
          })
        );
      }
    });
  }, [tenantId]);

  useEffect(() => {
    if (mesas.length > 0 && location.state && (location.state as any).selectMesaNumero) {
      const mesaToSelect = mesas.find((m) => m.numero === (location.state as any).selectMesaNumero);
      if (mesaToSelect) {
        setSelectedMesa(mesaToSelect);
        // Clear state so it doesn't re-trigger
        window.history.replaceState({}, document.title);
      }
    }
  }, [mesas, location.state]);

  const categories = [
    "Todos",
    ...sortCategoriesForTabs(platos.map((p) => p.categoria)),
  ];

  const cartSearchNorm = cartSearchQuery.trim().toLowerCase();

  /** Sin búsqueda: respeta la categoría. Con búsqueda: toda la carta (evita choque categoría vs texto). */
  const filteredPlatosForGrid = useMemo(() => {
    const byCategory =
      activeCategory === "Todos"
        ? platos
        : platos.filter((p) => p.categoria === activeCategory);
    if (!cartSearchNorm) return byCategory;
    return platos.filter((p) => {
      const n = p.nombre.toLowerCase();
      const c = p.categoria.toLowerCase();
      return n.includes(cartSearchNorm) || c.includes(cartSearchNorm);
    });
  }, [platos, activeCategory, cartSearchNorm]);

  const cartSubtotal = cart.reduce((s, i) => s + i.plato.precio * i.cantidad, 0);
  const billItbisRate = cartItbisEnabled ? ITBIS : 0;
  const cartItbis = cartSubtotal * billItbisRate;
  const cartTotal = cartSubtotal + cartItbis;

  const cuentaSubtotal = mesaConsumos.reduce((s, c) => s + Number(c.subtotal), 0);
  const hasCuentaEnMesa = Boolean(selectedMesa && mesaConsumos.length > 0);
  const panelBillSubtotal = hasCuentaEnMesa ? cuentaSubtotal : cartSubtotal;
  const panelBillItbis = panelBillSubtotal * billItbisRate;
  const panelBillTotal = panelBillSubtotal + panelBillItbis;

  const showEmptyHint =
    cart.length === 0 &&
    (!selectedMesa || mesaAccountLoading || mesaConsumos.length === 0);

  const showOrderFooter =
    cart.length > 0 || (selectedMesa && (mesaAccountLoading || mesaConsumos.length > 0));

  function addToCart(plato: Plato) {
    setCart((prev) => {
      const ex = prev.find((i) => i.plato.id === plato.id);
      if (ex)
        return prev.map((i) =>
          i.plato.id === plato.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      return [...prev, { plato, cantidad: 1 }];
    });
  }

  function changeQty(platoId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.plato.id === platoId ? { ...i, cantidad: i.cantidad + delta } : i
        )
        .filter((i) => i.cantidad > 0)
    );
  }

  function removeItem(platoId: number) {
    setCart((prev) => prev.filter((i) => i.plato.id !== platoId));
  }

  // Marcar mesa como ocupada cuando se selecciona
  async function markMesaAsOccupied(mesa: MesaBasic) {
    if (mesa.estado === "ocupada") return;
    if (!tenantId) return;

    const { error } = await insforgeClient.database
      .from("mesas_estado")
      .upsert(
        { id: parseInt(mesa.id, 10), estado: "ocupada", tenant_id: tenantId },
        { onConflict: "tenant_id,id" }
      );

    if (!error) {
      setMesas((prev) =>
        prev.map((m) =>
          m.id === mesa.id ? { ...m, estado: 'ocupada' } : m
        )
      );
    }
  }

  // Cargar consumos de una mesa (cuenta abierta en POS)
  const loadTableConsumption = useCallback(
    async (mesaNumero: number): Promise<Consumo[]> => {
      if (!tenantId) return [];
      const { data, error } = await insforgeClient.database
        .from("consumos")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("mesa_numero", mesaNumero)
        .neq("estado", "pagado")
        .order("created_at", { ascending: true });

      if (error || !data) return [];
      return data as Consumo[];
    },
    [tenantId]
  );

  useEffect(() => {
    if (!selectedMesa) {
      setMesaConsumos([]);
      setMesaAccountLoading(false);
      return;
    }
    let cancelled = false;
    setMesaAccountLoading(true);
    void loadTableConsumption(selectedMesa.numero).then((rows) => {
      if (!cancelled) {
        setMesaConsumos(rows);
        setMesaAccountLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMesa?.id, selectedMesa?.numero, loadTableConsumption]);

  async function refreshMesaDebt(mesaId: string, mesaNumero: number) {
    if (!tenantId) return;
    const { data, error } = await insforgeClient.database
      .from("consumos")
      .select("subtotal")
      .eq("tenant_id", tenantId)
      .eq("mesa_numero", mesaNumero)
      .neq("estado", "pagado");

    if (error) return;
    const rows = data ?? [];
    const deuda_pendiente = rows.reduce((s, r) => s + Number((r as { subtotal: number }).subtotal), 0);
    const items_pendientes = rows.length;
    setMesas((prev) =>
      prev.map((m) =>
        m.id === mesaId ? { ...m, deuda_pendiente, items_pendientes } : m
      )
    );
  }

  async function deleteConsumo(consumoId: string) {
    if (!tenantId || !selectedMesa) return;
    const consumo = mesaConsumos.find((c) => c.id === consumoId);
    if (!consumo) return;

    const confirmed = window.confirm(
      `¿Eliminar "${consumo.cantidad}× ${consumo.nombre}" de la cuenta?\n\nEsta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setDeletingConsumoId(consumoId);

    const { error } = await insforgeClient.database
      .from("consumos")
      .delete()
      .eq("id", consumoId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Error al eliminar consumo:", error);
      alert(`Error al eliminar: ${error.message}`);
      setDeletingConsumoId(null);
      return;
    }

    // Update local state
    setMesaConsumos((prev) => prev.filter((c) => c.id !== consumoId));
    await refreshMesaDebt(selectedMesa.id, selectedMesa.numero);
    setDeletingConsumoId(null);
  }

  /** Totales del modal "para llevar" (sin mesa). */
  function calculateTakeoutTotals() {
    const subtotal = cart.reduce((sum, i) => sum + i.plato.precio * i.cantidad, 0);
    const rate = cartItbisEnabled ? ITBIS : 0;
    const itbis = subtotal * rate;
    const total = subtotal + itbis;
    return { subtotal, itbis, total };
  }

  async function printFactura(facturaId: string, numeroFactura: number) {
    if (!tenantId) return;

    const { data: factura, error: facturaError } = await insforgeClient.database
      .from("facturas")
      .select("*")
      .eq("id", facturaId)
      .eq("tenant_id", tenantId)
      .single();

    if (facturaError || !factura) {
      console.error("Error al obtener factura:", facturaError);
      return;
    }

    const { data: tenant } = await insforgeClient.database
      .from("tenants")
      .select("nombre_negocio, rnc, direccion, telefono, logo_url")
      .eq("id", tenantId)
      .single();

    if (!tenant) {
      console.error("Error: No se encontró información del tenant");
      return;
    }

    const paperWidthMm = getThermalPrintSettings().paperWidthMm;
    const html = buildFacturaReceiptHtml(
      {
        nombre_negocio: tenant.nombre_negocio,
        rnc: tenant.rnc,
        direccion: tenant.direccion,
        telefono: tenant.telefono,
        logo_url: tenant.logo_url,
      },
      factura as unknown as Parameters<typeof buildFacturaReceiptHtml>[1],
      numeroFactura,
      paperWidthMm
    );

    const res = await printThermalHtml(html);
    if (!res.ok && res.error) {
      console.warn("Impresión factura:", res.error);
    }
  }




  async function sendToKitchen() {
    if (!selectedMesa || cart.length === 0) return;
    setSending(true);
    setKitchenClosed(false);

    // Separar items: cocina vs directo
    const kitchenItems = cart.filter((i) => i.plato.va_a_cocina !== false);
    const directItems = cart.filter((i) => i.plato.va_a_cocina === false);

    let comandaId: string | null = null;

    // Crear comanda para items de cocina
    if (kitchenItems.length > 0) {
      if (!tenantId) {
        alert("No se pudo verificar cocina: sesión sin negocio asignado.");
        setSending(false);
        return;
      }
      const { data: estadoData } = await insforgeClient.database
        .from("cocina_estado")
        .select("activa")
        .eq("tenant_id", tenantId)
        .limit(1);

      if (estadoData?.[0]?.activa === false) {
        setKitchenClosed(true);
        setSending(false);
        return;
      }

      const items = kitchenItems.map((i) => ({
        nombre: i.plato.nombre,
        categoria: i.plato.categoria || "General",
        cantidad: i.cantidad,
        precio: i.plato.precio,
      }));

      const { data, error } = await insforgeClient.database.from("comandas").insert([
        {
          mesa_numero: selectedMesa.numero,
          estado: "pendiente",
          items,
          notas: null,
          tenant_id: tenantId,
        },
      ]).select().single();

      if (error) {
        console.error("Error al crear comanda:", error);
        alert(`Error al crear comanda: ${error.message}`);
        setSending(false);
        return;
      }

      comandaId = data?.id || null;

      if (data && tenantId) {
        const { data: tenantRow } = await insforgeClient.database
          .from("tenants")
          .select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda")
          .eq("id", tenantId)
          .single();
        if (tenantRow) {
          const paperWidthMm = getThermalPrintSettings().paperWidthMm;
          const tr = tenantRow as {
            nombre_negocio: string | null;
            rnc: string | null;
            direccion: string | null;
            telefono: string | null;
            logo_url: string | null;
            moneda?: string | null;
          };
          const comandaHtml = buildComandaReceiptHtml(
            {
              nombre_negocio: tr.nombre_negocio,
              rnc: tr.rnc,
              direccion: tr.direccion,
              telefono: tr.telefono,
              logo_url: tr.logo_url,
              moneda: tr.moneda ?? null,
            },
            {
              id: data.id,
              numero_comanda: (data as { numero_comanda?: number }).numero_comanda,
              mesa_numero: data.mesa_numero,
              items:
                (data.items as Array<{
                  nombre: string;
                  cantidad: number;
                  precio?: number;
                  categoria?: string;
                }>) || [],
              notas: data.notas,
              created_at: data.created_at,
            },
            paperWidthMm
          );
          const printRes = await printThermalHtml(comandaHtml);
          if (!printRes.ok && printRes.error) {
            console.warn("Impresión comanda:", printRes.error);
          }
        }
      }
    }

    // Crear consumos para TODOS los items (cocina + directo)
    const consumosToInsert = [
      ...kitchenItems.map((i) => ({
        mesa_numero: selectedMesa.numero,
        tenant_id: tenantId,
        comanda_id: comandaId,
        plato_id: i.plato.id,
        nombre: i.plato.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.plato.precio,
        subtotal: i.plato.precio * i.cantidad,
        tipo: "cocina" as const,
        estado: "enviado_cocina" as const,
      })),
      ...directItems.map((i) => ({
        mesa_numero: selectedMesa.numero,
        tenant_id: tenantId,
        comanda_id: null,
        plato_id: i.plato.id,
        nombre: i.plato.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.plato.precio,
        subtotal: i.plato.precio * i.cantidad,
        tipo: "directo" as const,
        estado: "entregado" as const,
      })),
    ];

    const { error: consumosError } = await insforgeClient.database
      .from("consumos")
      .insert(consumosToInsert);

    if (consumosError) {
      console.error("Error al crear consumos:", consumosError);
      alert(`Error al registrar consumos: ${consumosError.message}`);
      setSending(false);
      return;
    }

    // Limpiar SOLO el carrito (todo fue enviado)
    setCart([]);
    setSentOk(true);
    setTimeout(() => setSentOk(false), 3000);
    setSending(false);

    // Actualizar deuda de la mesa y refrescar cuenta en panel
    await refreshMesaDebt(selectedMesa.id, selectedMesa.numero);
    const consumosActualizados = await loadTableConsumption(selectedMesa.numero);
    setMesaConsumos(consumosActualizados);
  }

  async function openPaymentModal() {
    // Verificar que exista un ciclo operativo abierto antes de permitir cualquier cobro
    if (!tenantId) {
      alert("No hay negocio activo.");
      return;
    }
    const cycleOpen = await hasOpenCycle(tenantId);
    if (!cycleOpen) {
      alert("No hay un ciclo operativo abierto. Inicie un ciclo antes de cobrar.");
      return;
    }

    if (selectedMesa) {
      setShowPaymentModal(true);
      return;
    }

    if (isTakeout) {
      if (cart.length === 0) {
        alert("No hay items en el carrito para cobrar.");
        return;
      }
      setTakeoutClientRnc("");
      setMesaConsumos([]);
      setShowPaymentModal(true);
      return;
    }

    alert("⚠️ No hay ninguna mesa seleccionada.\n\n• Seleccioná una mesa, o\n• Activá 'Para llevar' para cobrar sin mesa");
  }

  async function createInvoice() {
    if (cart.length === 0) {
      alert("No hay items para cobrar");
      return;
    }
    if (!tenantId) {
      alert("No hay negocio activo.");
      return;
    }
    const normalizedClientRnc = takeoutClientRnc.trim();
    if (
      tenantNcfFiscalActive &&
      ncfTypeRequiresClientRnc(selectedNcfType) &&
      normalizedClientRnc === ""
    ) {
      alert("Debes indicar el RNC del cliente para emitir una factura B01.");
      return;
    }
    const cycleOpen = await hasOpenCycle(tenantId);
    if (!cycleOpen) {
      alert("No hay un ciclo operativo abierto. Inicie un ciclo antes de cobrar.");
      return;
    }

    const consumosToBill = cart.map((item) => ({
      id: crypto.randomUUID(),
      mesa_numero: 0,
      comanda_id: null,
      plato_id: item.plato.id,
      nombre: item.plato.nombre,
      categoria: item.plato.categoria || "General",
      cantidad: item.cantidad,
      precio_unitario: item.plato.precio,
      subtotal: item.plato.precio * item.cantidad,
      tipo: item.plato.va_a_cocina !== false ? "cocina" : "directo",
      estado: "pagado" as const,
      factura_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    setCharging(true);
    await ensureAuthSessionFresh();

    const groupedItems = consumosToBill.reduce(
      (acc, consumo) => {
        const key = consumo.plato_id;
        if (!acc[key]) {
          acc[key] = {
            plato_id: consumo.plato_id,
            nombre: consumo.nombre,
            categoria: (consumo as { categoria?: string }).categoria || "General",
            cantidad: 0,
            precio_unitario: consumo.precio_unitario,
            subtotal: 0,
          };
        }
        acc[key].cantidad += consumo.cantidad;
        acc[key].subtotal += consumo.subtotal;
        return acc;
      },
      {} as Record<
        number,
        {
          plato_id: number;
          nombre: string;
          categoria: string;
          cantidad: number;
          precio_unitario: number;
          subtotal: number;
        }
      >
    );

    const facturaItems = Object.values(groupedItems);

    const subtotal = consumosToBill.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const rate = cartItbisEnabled ? ITBIS : 0;
    const itbis = subtotal * rate;
    const total = subtotal + itbis;

    const ncfPart = tenantId
      ? await resolveNcfForNewInvoice(
        tenantId,
        tenantNcfFiscalActive ? selectedNcfType : null
      )
      : null;

    const facturaData: Record<string, unknown> = {
      tenant_id: tenantId,
      metodo_pago: paymentMethod,
      estado: "pagada" as const,
      subtotal,
      itbis,
      propina: 0,
      total,
      items: facturaItems,
      pagada_at: new Date().toISOString(),
      mesa_numero: 0,
      notas: "Para llevar",
    };
    if (ncfPart) {
      facturaData.ncf = ncfPart.ncf;
      facturaData.ncf_tipo = ncfPart.ncf_tipo;
    }
    if (normalizedClientRnc !== "") {
      facturaData.cliente_rnc = normalizedClientRnc;
    }

    const { data: factura, error: facturaError } = await insforgeClient.database
      .from("facturas")
      .insert([facturaData])
      .select()
      .single();

    if (facturaError || !factura) {
      console.error("Error al crear factura:", facturaError);
      alert(`Error al procesar el pago: ${facturaError?.message || "Error desconocido"}`);
      setCharging(false);
      return;
    }

    if (tenantId && ncfPart && !ncfPart.sequenceReservedAtomically) {
      await incrementTenantNcfSequence(tenantId, ncfPart.tipoCodigo, ncfPart.usedSequence);
    }

    await printFactura(factura.id, factura.numero_factura);

    setCart([]);
    setTakeoutClientRnc("");
    setMesaConsumos([]);
    setChargeOk(true);
    setTimeout(() => setChargeOk(false), 3000);
    setShowPaymentModal(false);
    setCharging(false);
  }

  // Verificar autenticación y tenant (después de todos los hooks)
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0e0e0e]">
        <div className="text-[#adaaaa] font-['Space_Grotesk',sans-serif] text-[16px]">
          Cargando...
        </div>
      </div>
    );
  }

  /* Sesión InsForge válida = ya pasó el login; tenant/rol vienen de la misma sesión (estado + caché en useAuth). */
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0e0e0e]">
        <div className="text-center max-w-md px-6">
          <div className="text-[#adaaaa] font-['Space_Grotesk',sans-serif] text-[18px] mb-2">
            No autenticado
          </div>
          <p className="text-[#6b7280] font-['Inter',sans-serif] text-[14px] m-0">
            Iniciá sesión para usar el punto de venta.
          </p>
        </div>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0e0e0e]">
        <div className="text-center max-w-md px-6 text-[#adaaaa] font-['Inter',sans-serif] text-[14px]">
          Preparando tu sesión…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-[24px] lg:gap-[32px] p-4 sm:p-[32px] flex-1 overflow-y-auto lg:overflow-hidden min-h-0">
      {/* LEFT: Menu */}
      <div className="lg:flex-1 flex flex-col gap-[24px] min-w-0 lg:overflow-auto">
        <DashboardTickerStrip />

        {/* Categories */}
        <div className="flex gap-[12px] overflow-x-auto pb-[4px] shrink-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-[24px] py-[10px] rounded-[12px] shrink-0 font-['Space_Grotesk',sans-serif] font-bold text-[14px] tracking-[1.2px] uppercase border-none cursor-pointer transition-all"
              style={{
                backgroundColor:
                  activeCategory === cat
                    ? catColor(cat) === "#adaaaa"
                      ? "#ff906d"
                      : catColor(cat)
                    : "#201f1f",
                color:
                  activeCategory === cat
                    ? cat === "Todos"
                      ? "#5b1600"
                      : "#0e0e0e"
                    : "#adaaaa",
                boxShadow:
                  activeCategory === cat
                    ? `0 0 16px rgba(255,144,109,0.2)`
                    : undefined,
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Items grid */}
        {platos.length === 0 ? (
          <div className="flex items-center justify-center py-[40px]">
            <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">
              Cargando carta...
            </span>
          </div>
        ) : filteredPlatosForGrid.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-[40px] gap-[8px] px-4">
            <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px] text-center">
              {cartSearchNorm
                ? "Ningún plato coincide con la búsqueda en la carta."
                : "No hay platos en esta categoría."}
            </span>
            {cartSearchNorm ? (
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] text-center">
                La búsqueda del encabezado recorre toda la carta; borrá el texto para volver al filtro por
                categoría.
              </span>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-[16px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {filteredPlatosForGrid.map((plato) => {
              const inCart = cart.find((i) => i.plato.id === plato.id);
              const cc = catColor(plato.categoria);
              return (
                <div
                  key={plato.id}
                  className="bg-[#201f1f] rounded-[16px] flex flex-col overflow-hidden border border-[rgba(72,72,71,0.1)] transition-all cursor-pointer group"
                  style={{ borderTop: `3px solid ${cc}` }}
                  onClick={() => addToCart(plato)}
                >
                  {/* Color header */}
                  <div
                    className="h-[6px] w-full shrink-0"
                    style={{ backgroundColor: `${cc}20` }}
                  />
                  <div className="flex flex-col gap-[8px] p-[16px] flex-1">
                    {/* Category badge */}
                    <div
                      className="rounded-[4px] px-[6px] py-[2px] w-fit"
                      style={{
                        backgroundColor: `${cc}15`,
                        border: `1px solid ${cc}30`,
                      }}
                    >
                      <span
                        className="font-['Inter',sans-serif] font-bold text-[9px] tracking-[0.8px] uppercase"
                        style={{ color: cc }}
                      >
                        {plato.categoria}
                      </span>
                    </div>

                    {/* Name */}
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px] uppercase leading-tight">
                      {plato.nombre}
                    </span>

                    {/* Price */}
                    <span
                      className="font-['Space_Grotesk',sans-serif] font-bold text-[16px] mt-auto"
                      style={{ color: cc }}
                    >
                      {formatMoney(plato.precio)}
                    </span>
                  </div>

                  {/* Add button */}
                  <div
                    className="flex items-center justify-center py-[10px] transition-colors"
                    style={{
                      backgroundColor: inCart ? `${cc}20` : "rgba(38,38,38,0.6)",
                    }}
                  >
                    {inCart ? (
                      <span
                        className="font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.5px] uppercase"
                        style={{ color: cc }}
                      >
                        {inCart.cantidad} en carrito
                      </span>
                    ) : (
                      <span className="font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.5px] uppercase text-[#6b7280] group-hover:text-white transition-colors">
                        + Agregar
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT: Order Panel */}
      <div className="w-full lg:w-[340px] shrink-0 backdrop-blur-[12px] bg-[rgba(32,31,31,0.6)] rounded-[16px] border border-[rgba(72,72,71,0.1)] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] flex flex-col lg:self-start lg:sticky lg:top-0 lg:max-h-[calc(100vh-160px)]">
        {/* Header */}
        <div className="border-b border-[rgba(72,72,71,0.2)] px-[24px] pt-[20px] pb-[20px] shrink-0">
          {/* Título */}
          <div className="text-center">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase">
              Pedido Actual
            </span>
          </div>

          {/* Botones */}
          <div className="flex items-center justify-center gap-[12px] mt-[16px]">
            {/* Mesa selector */}
            <div className="relative">
              <button
                onClick={() => setShowMesaDropdown((v) => !v)}
                className="flex items-center gap-[6px] rounded-[6px] px-[10px] py-[4px] border-none cursor-pointer transition-all"
                style={{ backgroundColor: selectedMesa ? "#ff784d" : "rgba(72,72,71,0.3)" }}
              >
                <span
                  className="font-['Inter',sans-serif] font-bold text-[11px] uppercase"
                  style={{ color: selectedMesa ? "#460f00" : "#adaaaa" }}
                >
                  {selectedMesa ? `Mesa ${selectedMesa.numero}` : "Seleccionar mesa"}
                </span>
                <span style={{ color: selectedMesa ? "#460f00" : "#adaaaa", fontSize: 9 }}>▼</span>
              </button>

              {showMesaDropdown && (
                <div
                  className="absolute top-[calc(100%+6px)] left-0 z-50 bg-[#1a1a1a] border border-[rgba(72,72,71,0.4)] rounded-[12px] p-[8px] shadow-xl"
                  style={{ minWidth: 180, maxHeight: 260, overflowY: "auto" }}
                >
                  {/* Opción: sin mesa */}
                  <button
                    onClick={() => { setSelectedMesa(null); setShowMesaDropdown(false); setCart([]); }}
                    className="w-full text-left flex items-center gap-[8px] px-[10px] py-[7px] rounded-[8px] cursor-pointer border-none transition-colors hover:bg-[rgba(72,72,71,0.3)]"
                    style={{ backgroundColor: !selectedMesa ? "rgba(89,238,80,0.08)" : "transparent" }}
                  >
                    <span className="font-['Inter',sans-serif] text-[12px]" style={{ color: !selectedMesa ? "#59ee50" : "#adaaaa" }}>
                      Sin mesa
                    </span>
                  </button>

                  <div className="h-px bg-[rgba(72,72,71,0.3)] my-[6px]" />

                  {/* Lista de mesas */}
                  <div className="grid grid-cols-4 gap-[4px]">
                    {mesas
                      .filter((m) => !m.fusionada)
                      .sort((a, b) => a.numero - b.numero)
                      .map((mesa) => {
                        const isSelected = selectedMesa?.id === mesa.id;
                        const bgColor =
                          isSelected
                            ? "#ff784d"
                            : mesa.estado === "ocupada"
                              ? "rgba(255,113,108,0.15)"
                              : mesa.estado === "limpieza"
                                ? "rgba(255,144,109,0.15)"
                                : "rgba(38,38,38,0.8)";
                        const textColor =
                          isSelected
                            ? "#460f00"
                            : mesa.estado === "ocupada"
                              ? "#ff716c"
                              : mesa.estado === "limpieza"
                                ? "#ff906d"
                                : "#adaaaa";
                        return (
                          <button
                            key={mesa.id}
                            onClick={async () => {
                              setSelectedMesa(mesa);
                              setShowMesaDropdown(false);
                              setCart([]);
                              setIsTakeout(false);
                              // Occupation now handled after order is sent; removed premature marking
                            }}
                            className="flex flex-col items-center justify-center py-[8px] rounded-[8px] cursor-pointer border-none transition-all"
                            style={{ backgroundColor: bgColor }}
                          >
                            <span
                              className="font-['Space_Grotesk',sans-serif] font-bold text-[13px]"
                              style={{ color: textColor }}
                            >
                              {String(mesa.numero).padStart(2, "0")}
                            </span>
                          </button>
                        );
                      })}
                  </div>

                  {/* Leyenda */}
                  <div className="flex gap-[10px] mt-[8px] px-[4px]">
                    <div className="flex items-center gap-[4px]">
                      <div className="size-[6px] rounded-full bg-[#59ee50]" />
                      <span className="font-['Inter',sans-serif] text-[9px] text-[#adaaaa]">Libre</span>
                    </div>
                    <div className="flex items-center gap-[4px]">
                      <div className="size-[6px] rounded-full bg-[#ff716c]" />
                      <span className="font-['Inter',sans-serif] text-[9px] text-[#adaaaa]">Ocupada</span>
                    </div>
                    <div className="flex items-center gap-[4px]">
                      <div className="size-[6px] rounded-full bg-[#ff906d]" />
                      <span className="font-['Inter',sans-serif] text-[9px] text-[#adaaaa]">Limpieza</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Para llevar toggle */}
            <button
              onClick={() => {
                setIsTakeout(!isTakeout);
                if (selectedMesa && !isTakeout) {
                  // Si está activando takeoff y hay mesa seleccionada, deseleccionar
                  setSelectedMesa(null);
                }
              }}
              className={`flex items-center gap-[8px] rounded-[6px] px-[10px] py-[4px] cursor-pointer border-none transition-all ${isTakeout ? "bg-[#59ee50]" : "bg-[rgba(72,72,71,0.3)]"
                }`}
            >
              <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 15 13.5">
                <path
                  d={svgPaths.p18098d80}
                  fill={isTakeout ? "#0e0e0e" : "#adaaaa"}
                />
              </svg>
              <span
                className={`font-['Inter',sans-serif] font-bold text-[10px] uppercase ${isTakeout ? "text-[#0e0e0e]" : "text-[#adaaaa]"
                  }`}
              >
                Para llevar
              </span>
            </button>
          </div>

          {kitchenClosed && (
            <div className="mt-[8px] bg-[rgba(255,113,108,0.08)] border border-[rgba(255,113,108,0.2)] rounded-[8px] px-[10px] py-[6px]">
              <span className="font-['Inter',sans-serif] text-[#ff716c] text-[11px]">
                La cocina está cerrada.
              </span>
            </div>
          )}
          {sentOk && (
            <div className="mt-[8px] bg-[rgba(89,238,80,0.08)] border border-[rgba(89,238,80,0.2)] rounded-[8px] px-[10px] py-[6px]">
              <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px]">
                Comanda enviada a cocina.
              </span>
            </div>
          )}
          {chargeOk && (
            <div className="mt-[8px] bg-[rgba(89,238,80,0.08)] border border-[rgba(89,238,80,0.2)] rounded-[8px] px-[10px] py-[6px]">
              <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px]">
                Factura generada correctamente.
              </span>
            </div>
          )}
        </div>

        {/* Cuenta en mesa + carrito nuevo */}
        <div className="flex-1 overflow-y-auto p-[20px] flex flex-col gap-[16px] min-h-0">
          {selectedMesa && mesaConsumos.length > 0 && (
            <div className="flex flex-col gap-[12px]">
              <span className="font-['Inter',sans-serif] text-[#ff906d] text-[10px] tracking-[0.6px] uppercase font-bold">
                En mesa (cuenta abierta)
              </span>
              {mesaConsumos.map((c) => (
                <div
                  key={c.id}
                  className="flex gap-[12px]"
                  style={{
                    opacity: deletingConsumoId === c.id ? 0.4 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                >
                  <div
                    className="w-[4px] rounded-full shrink-0"
                    style={{ backgroundColor: "rgba(255,144,109,0.45)" }}
                  />
                  <div className="flex-1 flex flex-col gap-[4px] min-w-0">
                    <div className="flex items-start justify-between gap-[8px]">
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] uppercase leading-tight">
                        {c.cantidad}× {c.nombre}
                      </span>
                      <div className="flex items-center gap-[6px] shrink-0">
                        <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[13px] tabular-nums">
                          {formatMoney(Number(c.subtotal))}
                        </span>
                        <button
                          onClick={() => void deleteConsumo(c.id)}
                          disabled={deletingConsumoId === c.id}
                          title="Eliminar de la cuenta"
                          className="bg-transparent border-none cursor-pointer p-[2px] transition-opacity hover:opacity-100 disabled:cursor-wait"
                          style={{ opacity: 0.5 }}
                        >
                          <svg fill="none" viewBox="0 0 8.16667 8.16667" className="size-[10px]">
                            <path d={svgPaths.p2317cf00} fill="#FF716C" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <span className="font-['Inter',sans-serif] text-[#6b7280] text-[9px] uppercase tracking-wide">
                      {c.tipo === "cocina" ? "Cocina" : "Directo"} · {c.estado.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showEmptyHint && (
            <div className="flex flex-col items-center justify-center py-[24px] gap-[8px]">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] text-center px-2">
                {!selectedMesa
                  ? "Seleccioná una mesa y hacé clic en los platos para agregarlos."
                  : mesaAccountLoading
                    ? "Cargando cuenta de la mesa…"
                    : "No hay consumos en esta mesa todavía. Agregá platos y enviá a cocina."}
              </span>
            </div>
          )}

          {cart.length > 0 && selectedMesa && (
            <span className="font-['Inter',sans-serif] text-[#59ee50] text-[10px] tracking-[0.6px] uppercase font-bold -mb-2">
              Nuevo pedido (carrito)
            </span>
          )}

          {cart.map((item) => {
            const cc = catColor(item.plato.categoria);
            return (
              <div key={item.plato.id} className="flex gap-[12px]">
                {/* Category color indicator */}
                <div
                  className="w-[4px] rounded-full shrink-0"
                  style={{ backgroundColor: cc }}
                />
                <div className="flex-1 flex flex-col gap-[4px]">
                  <div className="flex items-start justify-between gap-[8px]">
                    <div className="flex flex-col gap-[2px]">
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] uppercase leading-tight">
                        {item.plato.nombre}
                      </span>
                      {item.plato.va_a_cocina === false && (
                        <span className="font-['Inter',sans-serif] text-[#59ee50] text-[9px] tracking-[0.5px] uppercase">
                          ⚡ Directo
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.plato.id)}
                      className="shrink-0 mt-[2px] bg-transparent border-none cursor-pointer"
                    >
                      <svg fill="none" viewBox="0 0 8.16667 8.16667" className="size-[8px]">
                        <path d={svgPaths.p2317cf00} fill="#FF716C" fillOpacity="0.6" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-[4px]">
                    {/* Quantity control */}
                    <div className="bg-[#131313] flex gap-[10px] items-center px-[10px] py-[5px] rounded-[6px] border border-[rgba(72,72,71,0.3)]">
                      <button
                        onClick={() => changeQty(item.plato.id, -1)}
                        className="bg-transparent border-none cursor-pointer p-0 w-[12px] h-[12px] flex items-center justify-center text-white/60 hover:text-white"
                      >
                        −
                      </button>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px] min-w-[16px] text-center">
                        {String(item.cantidad).padStart(2, "0")}
                      </span>
                      <button
                        onClick={() => addToCart(item.plato)}
                        className="bg-transparent border-none cursor-pointer p-0 w-[12px] h-[12px] flex items-center justify-center text-white/60 hover:text-white"
                      >
                        +
                      </button>
                    </div>
                    <span
                      className="font-['Space_Grotesk',sans-serif] font-bold text-[14px]"
                      style={{ color: cc }}
                    >
                      {formatMoney(item.plato.precio * item.cantidad)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals & Actions */}
        {showOrderFooter && (
          <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.8)] border-t border-[rgba(72,72,71,0.2)] rounded-b-[16px] px-[20px] py-[20px] flex flex-col gap-[16px] shrink-0">
            {mesaAccountLoading && (
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] text-center">
                Actualizando total…
              </span>
            )}
            {cartSubtotal > 0 && hasCuentaEnMesa && (
              <div className="bg-[rgba(89,238,80,0.06)] border border-[rgba(89,238,80,0.15)] rounded-[8px] px-[10px] py-[8px]">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] leading-snug">
                  Carrito sin enviar: <span className="text-[#59ee50] font-semibold">{formatMoney(cartTotal)}</span>
                  . Tocá <span className="text-white">Cocina</span> para sumarlo a la cuenta de la mesa antes de cobrar todo junto.
                </span>
              </div>
            )}
            {/* Totals (mesa abierta o solo carrito / para llevar) */}
            <div className="flex flex-col gap-[6px]">
              <div className="flex items-center justify-between gap-[10px] rounded-[10px] border border-[rgba(72,72,71,0.28)] bg-[#131313] px-[12px] py-[10px] mb-[2px]">
                <div className="flex flex-col min-w-0">
                  <span className="font-['Inter',sans-serif] text-white text-[12px] font-semibold leading-tight">
                    ITBIS 18%
                  </span>
                  <span className="font-['Inter',sans-serif] text-[#6b7280] text-[10px] leading-snug">
                    Usa la preferencia de Ajustes al abrir y puedes cambiarlo para este cobro
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cartItbisEnabled}
                  onClick={() => setCartItbisEnabled((v) => !v)}
                  aria-label={cartItbisEnabled ? "Desactivar ITBIS en el total" : "Activar ITBIS 18% en el total"}
                  className={`relative h-[30px] w-[54px] shrink-0 rounded-full border-none cursor-pointer transition-colors ${cartItbisEnabled ? "bg-[#59ee50]" : "bg-[#383838]"
                    }`}
                >
                  <span
                    className={`absolute top-[5px] left-[5px] block size-[20px] rounded-full bg-white shadow transition-transform duration-200 ease-out ${cartItbisEnabled ? "translate-x-[24px]" : "translate-x-0"
                      }`}
                  />
                </button>
              </div>
              {tenantNcfFiscalActive ? (
                <div className="flex flex-col gap-[10px] rounded-[10px] border border-[rgba(72,72,71,0.28)] bg-[#131313] px-[12px] py-[10px]">
                  <div className="flex items-center justify-between gap-[12px]">
                    <div className="flex flex-col min-w-0">
                      <span className="font-['Inter',sans-serif] text-white text-[12px] font-semibold leading-tight">
                        Tipo NCF
                      </span>
                      <span className="font-['Inter',sans-serif] text-[#6b7280] text-[10px] leading-snug">
                        Cambialo solo para este cobro si necesitas emitir otro comprobante.
                      </span>
                    </div>
                    <select
                      value={selectedNcfType}
                      onChange={(e) =>
                        setSelectedNcfType(
                          isNcfBCode(e.target.value) ? e.target.value : DEFAULT_NCF_B_CODE
                        )
                      }
                      className="min-w-[168px] rounded-[10px] border border-[rgba(72,72,71,0.3)] bg-[#1a1a1a] px-[12px] py-[9px] font-['Inter',sans-serif] text-[12px] text-white outline-none"
                    >
                      {NCF_B_TIPO_OPCIONES.map((opcion) => (
                        <option key={opcion.codigo} value={opcion.codigo}>
                          {opcion.codigo}
                        </option>
                      ))}
                    </select>
                  </div>
                  {ncfTypeRequiresClientRnc(selectedNcfType) ? (
                    <div className="flex flex-col gap-[6px]">
                      <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.8px] uppercase">
                        RNC del cliente
                      </span>
                      <input
                        type="text"
                        value={takeoutClientRnc}
                        onChange={(e) => setTakeoutClientRnc(e.target.value)}
                        placeholder="RNC del cliente"
                        className="w-full rounded-[10px] border border-[rgba(72,72,71,0.3)] bg-[#1a1a1a] px-[12px] py-[9px] font-['Inter',sans-serif] text-[12px] text-white outline-none"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[1px] uppercase">
                  Subtotal {hasCuentaEnMesa ? "(en mesa)" : ""}
                </span>
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[1px] uppercase">
                  {formatMoney(panelBillSubtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[1px] uppercase">
                  {cartItbisEnabled ? "ITBIS (18%)" : "ITBIS (no incluido)"}
                </span>
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[1px] uppercase">
                  {formatMoney(panelBillItbis)}
                </span>
              </div>
              <div className="border-t border-[rgba(72,72,71,0.15)] pt-[8px] flex items-center justify-between">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] uppercase">
                  Total
                </span>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[20px]">
                  {formatMoney(panelBillTotal)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-1 gap-[10px]">
              <button
                onClick={sendToKitchen}
                disabled={sending || !selectedMesa}
                className="flex gap-[6px] items-center justify-center py-[12px] rounded-[12px] border-2 bg-transparent cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  borderColor: selectedMesa ? "#59ee50" : "rgba(72,72,71,0.4)",
                  color: selectedMesa ? "#59ee50" : "#6b7280",
                }}
              >
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[11px] tracking-[1px] uppercase">
                  {sending ? "Agregando..." : "+ Agregar"}
                </span>
              </button>
            </div>

            <button
              onClick={openPaymentModal}
              disabled={
                selectedMesa
                  ? mesaAccountLoading || mesaConsumos.length === 0
                  : cart.length === 0
              }
              className="w-full flex gap-[10px] items-center justify-center py-[14px] rounded-[12px] bg-[#ff906d] border-none cursor-pointer transition-opacity hover:bg-[#ff784d] disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[14px] tracking-[2px] uppercase">
                Cobrar {formatMoney(panelBillTotal)}
              </span>
              <svg className="size-[14px]" fill="none" viewBox="0 0 16 16">
                <path d={svgPaths.p1a406200} fill="#5B1600" />
              </svg>
            </button>
          </div>
        )}

        {cart.length === 0 && (
          <div className="px-[20px] pb-[20px] shrink-0">
            <div className="bg-[#131313] rounded-[12px] p-[16px] text-center">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] tracking-[0.5px] uppercase">
                {hasCuentaEnMesa ? "Sin ítems nuevos en carrito" : "Carrito vacío"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Cobro mesa — mismo modal que en Venta (facturación) */}
      {showPaymentModal && selectedMesa && (
        <MesaCloseAccountModal
          open
          tenantId={tenantId}
          mesaNumero={selectedMesa.numero}
          itbisRate={billItbisRate}
          initialNcfType={tenantNcfFiscalActive ? selectedNcfType : null}
          onClose={() => setShowPaymentModal(false)}
          onSettled={async (remaining) => {
            setMesaConsumos(remaining as Consumo[]);
            await refreshMesaDebt(selectedMesa.id, selectedMesa.numero);
          }}
          onPaidFull={async () => {
            setChargeOk(true);
            setTimeout(() => setChargeOk(false), 3000);
            if (!tenantId || !selectedMesa) return;
            // Verify mesa is clean before freeing it
            const { data: pending, error: pendingErr } = await insforgeClient.database
              .from('consumos')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('mesa_numero', selectedMesa.numero)
              .neq('estado', 'pagado');
            if (pendingErr) {
              console.warn('Error checking pending consumos for mesa:', pendingErr);
            }
            if (pending && (pending as any[]).length > 0) {
              alert('No se puede liberar la mesa porque todavía tiene consumos pendientes. Cierra la cuenta primero.');
              return;
            }

            const { error } = await insforgeClient.database.from("mesas_estado").upsert(
              {
                id: parseInt(selectedMesa.id, 10),
                estado: "libre",
                tenant_id: tenantId,
              },
              { onConflict: "tenant_id,id" }
            );
            if (!error) {
              setMesas((prev) =>
                prev.map((m) =>
                  m.id === selectedMesa.id
                    ? { ...m, estado: "libre", deuda_pendiente: 0, items_pendientes: 0 }
                    : m
                )
              );
            }
            await refreshMesaDebt(selectedMesa.id, selectedMesa.numero);
            await markMesaAsOccupied(selectedMesa);
            setSelectedMesa(null);
            setMesaConsumos([]);
            setCart([]);
          }}
        />
      )}

      {/* Cobro para llevar (carrito) */}
      {showPaymentModal && !selectedMesa && isTakeout && cart.length > 0 && (() => {
        const { subtotal: calcSubtotal, itbis: calcItbis, total: calcTotal } =
          calculateTakeoutTotals();
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setTakeoutClientRnc("");
                setShowPaymentModal(false);
              }
            }}
          >
            <div className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[20px] p-[28px] w-[700px] max-h-[90vh] overflow-y-auto flex flex-col gap-[20px] shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px]">
                    Cobrar para llevar
                  </span>
                  <div className="text-[#adaaaa] text-[12px] mt-1">
                    {cart.length} ítem{cart.length !== 1 ? "s" : ""} en el carrito
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTakeoutClientRnc("");
                    setShowPaymentModal(false);
                  }}
                  className="text-[#6b7280] bg-transparent border-none cursor-pointer text-[20px] hover:text-white transition-colors leading-none"
                >
                  ×
                </button>
              </div>

              <div className="max-h-[220px] overflow-y-auto flex flex-col gap-[8px] rounded-[12px] bg-[#131313] p-[12px]">
                {cart.map((line) => (
                  <div
                    key={line.plato.id}
                    className="flex items-center justify-between rounded-[8px] bg-[#262626] px-[12px] py-[10px]"
                  >
                    <div>
                      <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px]">
                        {line.cantidad}× {line.plato.nombre}
                      </div>
                      <div className="text-[#adaaaa] text-[11px]">
                        {`${currencySymbol} ${Number(line.plato.precio).toFixed(2)} c/u`}
                      </div>
                    </div>
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px]">
                      {`${currencySymbol} ${(line.plato.precio * line.cantidad).toFixed(2)}`}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-[#131313] rounded-[12px] p-[14px] flex flex-col gap-[8px]">
                <div className="flex justify-between">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                    Subtotal
                  </span>
                  <span className="font-['Inter',sans-serif] text-white text-[11px]">
                    {formatMoney(calcSubtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                    {cartItbisEnabled ? "ITBIS (18%)" : "ITBIS (no incluido)"}
                  </span>
                  <span className="font-['Inter',sans-serif] text-white text-[11px]">
                    {formatMoney(calcItbis)}
                  </span>
                </div>
                <div className="border-t border-[rgba(72,72,71,0.15)] pt-[6px] flex justify-between">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px]">
                    TOTAL
                  </span>
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px]">
                    {formatMoney(calcTotal)}
                  </span>
                </div>
              </div>

              {tenantNcfFiscalActive ? (
                <div className="flex flex-col gap-[12px]">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                    Tipo NCF
                  </span>
                  <select
                    value={selectedNcfType}
                    onChange={(e) =>
                      setSelectedNcfType(
                        isNcfBCode(e.target.value) ? e.target.value : DEFAULT_NCF_B_CODE
                      )
                    }
                    className="w-full rounded-[12px] border border-[rgba(72,72,71,0.3)] bg-[#262626] px-[14px] py-[12px] font-['Inter',sans-serif] text-white text-[13px] outline-none"
                  >
                    {NCF_B_TIPO_OPCIONES.map((opcion) => (
                      <option key={opcion.codigo} value={opcion.codigo}>
                        {opcion.codigo} - {opcion.descripcion.replace(`${opcion.codigo} - `, "")}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {tenantNcfFiscalActive && ncfTypeRequiresClientRnc(selectedNcfType) ? (
                <div className="flex flex-col gap-[8px]">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                    RNC del cliente
                  </span>
                  <input
                    type="text"
                    value={takeoutClientRnc}
                    onChange={(e) => setTakeoutClientRnc(e.target.value)}
                    placeholder="RNC del cliente"
                    className="w-full rounded-[12px] border border-[rgba(72,72,71,0.3)] bg-[#262626] px-[14px] py-[12px] font-['Inter',sans-serif] text-white text-[13px] outline-none"
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-[12px]">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                  Método de pago
                </span>
                <div className="grid grid-cols-2 gap-[8px]">
                  {[
                    { value: "efectivo" as const, label: "Efectivo", icon: "💵" },
                    { value: "tarjeta" as const, label: "Tarjeta", icon: "💳" },
                    { value: "digital" as const, label: "Digital", icon: "📱" },
                    { value: "transferencia" as const, label: "Transferencia", icon: "🏦" },
                  ].map((method) => (
                    <button
                      type="button"
                      key={method.value}
                      onClick={() => setPaymentMethod(method.value)}
                      className={`flex flex-col items-center gap-[8px] py-[12px] rounded-[12px] cursor-pointer border-none transition-all ${paymentMethod === method.value
                        ? "bg-[#ff906d] text-[#5b1600]"
                        : "bg-[#262626] text-white hover:bg-[#333]"
                        }`}
                    >
                      <span className="text-[20px]">{method.icon}</span>
                      <span className="font-['Inter',sans-serif] font-bold text-[10px] uppercase">
                        {method.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setTakeoutClientRnc("");
                    setShowPaymentModal(false);
                  }}
                  className="flex-1 bg-[#262626] border border-[rgba(72,72,71,0.3)] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:border-[rgba(255,144,109,0.3)] hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void createInvoice()}
                  disabled={charging}
                  className="flex-1 bg-[#59ee50] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#0e0e0e] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 transition-opacity"
                >
                  {charging ? "Procesando..." : "Confirmar Pago"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CONSUMOS MODAL */}
      {showConsumosModal && selectedMesa && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConsumosModal(false);
          }}
        >
          <div className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[20px] p-[28px] w-[500px] max-h-[80vh] overflow-y-auto flex flex-col gap-[20px] shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px]">
                  Consumos Mesa {selectedMesa.numero}
                </span>
                {mesaConsumos.length > 0 && (
                  <div className="text-[#adaaaa] text-[12px] mt-1">
                    {`Total pendiente: ${currencySymbol} ${mesaConsumos
                      .reduce((sum, c) => sum + Number(c.subtotal), 0)
                      .toFixed(2)}`}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowConsumosModal(false)}
                className="text-[#6b7280] bg-transparent border-none cursor-pointer text-[20px] hover:text-white transition-colors leading-none"
              >
                ×
              </button>
            </div>

            {mesaConsumos.length === 0 ? (
              <div className="text-center py-[40px] text-[#adaaaa]">
                No hay consumos pendientes
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {mesaConsumos.map((consumo) => (
                  <div
                    key={consumo.id}
                    className="bg-[#262626] rounded-[12px] p-[12px] flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-[8px]">
                        <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px]">
                          {consumo.cantidad}× {consumo.nombre}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded ${consumo.tipo === "cocina"
                            ? "bg-[#ff906d]/20 text-[#ff906d]"
                            : "bg-[#59ee50]/20 text-[#59ee50]"
                            }`}
                        >
                          {consumo.tipo === "cocina" ? "🍳 Cocina" : "🥤 Directo"}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded ${consumo.estado === "pagado"
                            ? "bg-green-500/20 text-green-500"
                            : consumo.estado === "entregado"
                              ? "bg-blue-500/20 text-blue-500"
                              : "bg-yellow-500/20 text-yellow-500"
                            }`}
                        >
                          {consumo.estado}
                        </span>
                      </div>
                      <div className="text-[#adaaaa] text-[12px] mt-1">
                        {new Date(consumo.created_at).toLocaleTimeString("es-DO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[16px]">
                        {`${currencySymbol} ${Number(consumo.subtotal).toFixed(2)}`}
                      </div>
                      <div className="text-[#adaaaa] text-[11px]">
                        {`${currencySymbol} ${Number(consumo.precio_unitario).toFixed(2)} c/u`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-[10px] pt-[10px] border-t border-[rgba(72,72,71,0.3)]">
              <button
                onClick={() => setShowConsumosModal(false)}
                className="flex-1 bg-[#262626] border border-[rgba(72,72,71,0.3)] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:border-[rgba(255,144,109,0.3)] hover:text-white transition-colors"
              >
                Cerrar
              </button>
              {mesaConsumos.length > 0 && (
                <button
                  onClick={openPaymentModal}
                  className="flex-1 bg-[#ff906d] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none hover:bg-[#ff784d] transition-colors"
                >
                  Cobrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
