import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router";
import svgPaths from "../../../imports/svg-qgatbhef3k";
import { useVentaCartSearch } from "../../../app/context/VentaCartSearchContext";
import { useSucursal } from "../../../app/context/SucursalContext";

// Checks if there is an open operational cycle for the tenant and sucursal
async function hasOpenCycle(tenantId: string, sucursalId: string | null): Promise<boolean> {
  if (!sucursalId) return false;
  try {
    const snapshot = await getLocalFirstStatusSnapshot(tenantId);
    const localMode = snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing";
    if (localMode) {
      const cycles = await readLocalMirror<{ id: string; closed_at: string | null; sucursal_id?: string | null }>(tenantId, "cierres_operativos");
      return cycles.some(c => !c.closed_at && (c.sucursal_id === sucursalId || !c.sucursal_id));
    }
  } catch { /* fall through to online */ }
  const { data, error } = await insforgeClient.database
    .from("cierres_operativos")
    .select("id, sucursal_id")
    .eq("tenant_id", tenantId)
    .is("closed_at", null);
  if (error) {
    console.warn("Error checking open cycle:", error);
    return false;
  }
  return (data && (data as any[]).some(c => c.sucursal_id === sucursalId || !c.sucursal_id));
}

import { insforgeClient } from "../../../shared/lib/insforge";
import { generateMesasConfig } from "../../tables/config/mesas";
import { loadCantidadMesas } from "../../../shared/lib/tenantMesasSettings";
import { useAuth, ensureAuthSessionFresh } from "../../../shared/hooks/useAuth";
import {
  buildFacturaReceiptHtml,
  buildComandaReceiptHtml,
} from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { openCashDrawerForSale, printThermalHtml } from "../../../shared/lib/thermalPrint";
import { useTenantCurrency } from "../../../shared/hooks/useTenantCurrency";
import { useTheme } from "../../../shared/context/ThemeContext";
import { suggestCategoryColor, sortCategoriesForTabs } from "../../../shared/lib/menuCategories";
import { MesaCloseAccountModal } from "../../billing/components/MesaCloseAccountModal";
import { canUseFeature } from "../../../shared/lib/planFeatures";
// DashboardTickerStrip removed
import {
  incrementTenantNcfSequence,
} from "../../../shared/lib/invoiceNcf";
import {
  DEFAULT_NCF_B_CODE,
  isNcfBCode,
  NCF_B_TIPO_OPCIONES,
  ncfTypeRequiresClientRnc,
  type NcfBCode,
} from "../../../shared/lib/ncf";
import { loadTenantBillingSettings } from "../../../shared/lib/tenantBillingSettings";
import { getLocalFirstStatusSnapshot, readLocalMirror, readLocalOutbox, enqueueLocalWrite, getDeviceId, writeLocalMirrorRow, shouldReadLocalFirst, resolveNcfForNewInvoiceLocalFirst, LOCAL_NCF_RESERVED_PAYLOAD_FLAG } from "../../../shared/lib/localFirst";
import { getNextFacturaNumber } from "../../../shared/lib/invoiceNumber";
import { writePosMutationLocalFirst } from "../../pos/lib/localFirstMutations";
import { cacheLogoFromUrl } from "../../../shared/lib/logoCache";
import { normalizeTenantRol } from "../../../shared/lib/roleNav";
import { isDesktopCloudUnavailable } from "../../../shared/lib/cloudAvailability";
import { CustomerSelect } from "../../clientes/components/CustomerSelect";
import type { Customer } from "../../clientes/lib/customers";
import { ConfirmModal } from "../../../shared/components/ConfirmModal";

interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
  sucursal_id?: string | null;
}

interface MenuCategoryRow {
  id: string;
  tenant_id: string;
  nombre: string;
  color: string;
  sort_order: number;
  sucursal_id?: string | null;
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
  created_by_auth_user_id?: string | null;
  sucursal_id?: string | null;
}

const ITBIS = 0.18;
const CONSUMO_DELETE_STAFF_ROLES = new Set(["cajera", "mesero"]);

function canDeleteOpenConsumo(rol: string | null | undefined, userId: string | null | undefined, consumo: Consumo) {
  const normalizedRole = normalizeTenantRol(rol ?? null);
  const isOpenUnbilled = consumo.factura_id == null && consumo.estado !== "pagado";
  if (!isOpenUnbilled) return false;
  if (normalizedRole === "admin") return true;
  return Boolean(
    userId &&
    normalizedRole &&
    CONSUMO_DELETE_STAFF_ROLES.has(normalizedRole) &&
    consumo.created_by_auth_user_id === userId
  );
}

export function Dashboard() {
  const { query: cartSearchQuery } = useVentaCartSearch();
  const { tenantId, user, rol, plan, loading: authLoading } = useAuth();
  const { activeSucursalId, loading: sucursalLoading } = useSucursal();
  const location = useLocation();
  const { theme } = useTheme();
  const { formatMoney, currencySymbol } = useTenantCurrency();
  const isDark = theme === "dark";
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategoryRow[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuLoadError, setMenuLoadError] = useState(false);
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
    "efectivo" | "tarjeta" | "digital" | "transferencia" | "fiado"
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
  const [takeoutCustomer, setTakeoutCustomer] = useState<Customer | null>(null);
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "primary";
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  useEffect(() => {
    if (authLoading || !tenantId) return;

    let cancelled = false;

    void loadTenantBillingSettings(tenantId).then((settings) => {
      if (cancelled) return;

      setCartItbisEnabled(settings?.defaultItbisEnabled ?? false);
      setTenantNcfFiscalActive(settings?.ncfFiscalActive ?? false);
      setSelectedNcfType(settings?.defaultNcfType ?? DEFAULT_NCF_B_CODE);
    });

    // Proactively cache the tenant logo for offline printing
    void (async () => {
      try {
        const localTenants = await readLocalMirror<any>(tenantId, "tenants").catch(() => []);
        const t = localTenants.find((row: any) => row.id === tenantId);
        if (t?.logo_url) void cacheLogoFromUrl(t.logo_url);
      } catch { /* best effort */ }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId]);

  useEffect(() => {
    // Set initial to empty since it depends on the database
    setMesas([]);
    setPlatos([]);
    setMenuCategories([]);
    setMenuLoading(true);
    setMenuLoadError(false);
 
    // Esperar a que auth y sucursales terminen antes de decidir si cargar o mostrar estado vacío.
    if (authLoading || !tenantId || sucursalLoading) return;

    if (!activeSucursalId) {
      setMenuLoading(false);
      return;
    }
 
    let cancelled = false;
 
    const load = async () => {
      // Garantizar que la sesión sea válida antes de consultar
      await ensureAuthSessionFresh();
 
      const snapshot = await getLocalFirstStatusSnapshot(tenantId);
      const localMode = snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing";
      const outbox = localMode ? await readLocalOutbox(tenantId).catch(() => []) : [];
      const hasPendingConsumos = outbox.some((entry) =>
        entry.table_name === "consumos" &&
        (entry.status === "pending" || entry.status === "syncing" || entry.status === "error")
      );
      const useLocalRead = await shouldReadLocalFirst(tenantId, ["platos", "menu_categories", "mesas_estado"]);
      const useLocalOpenConsumos = await shouldReadLocalFirst(tenantId, ["consumos"]) || hasPendingConsumos;
 
      let [platosData, categoriasData, estadosData, consumosData, cantidadMesas] = await Promise.all([
        useLocalRead
          ? readLocalMirror<Plato>(tenantId, "platos").then(rows => rows.filter(r => r.sucursal_id === activeSucursalId))
          : insforgeClient.database
              .from("platos")
              .select("*")
              .eq("tenant_id", tenantId)
              .eq("sucursal_id", activeSucursalId)
              .eq("disponible", true)
              .order("categoria")
              .then(r => r.data ?? []),
        useLocalRead
          ? readLocalMirror<MenuCategoryRow>(tenantId, "menu_categories").then(rows => rows.filter(r => r.sucursal_id === activeSucursalId))
          : insforgeClient.database
              .from("menu_categories")
              .select("id, tenant_id, nombre, color, sort_order")
              .eq("tenant_id", tenantId)
              .eq("sucursal_id", activeSucursalId)
              .order("sort_order")
              .order("nombre")
              .then(r => r.data ?? []),
        useLocalRead
          ? readLocalMirror<any>(tenantId, "mesas_estado").then(rows => rows.filter(r => r.sucursal_id === activeSucursalId))
          : insforgeClient.database
              .from("mesas_estado")
              .select("*")
              .eq("tenant_id", tenantId)
              .eq("sucursal_id", activeSucursalId)
              .then(r => r.data ?? []),
        useLocalOpenConsumos
          ? readLocalMirror<{ mesa_numero: number | null; subtotal: number; estado?: string; sucursal_id?: string | null }>(tenantId, "consumos")
              .then(rows => rows.filter(row => row.estado !== "pagado" && row.sucursal_id === activeSucursalId))
          : insforgeClient.database
              .from("consumos")
              .select("mesa_numero, subtotal")
              .eq("tenant_id", tenantId)
              .eq("sucursal_id", activeSucursalId)
              .neq("estado", "pagado")
              .then(r => r.data ?? []),
        loadCantidadMesas(tenantId),
      ]);

      if (useLocalRead && (platosData as Plato[]).filter(p => p.disponible).length === 0 && navigator.onLine) {
        const [serverPlatosRes, serverCategoriesRes] = await Promise.all([
          insforgeClient.database
            .from("platos")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("sucursal_id", activeSucursalId)
            .eq("disponible", true)
            .order("categoria"),
          insforgeClient.database
            .from("menu_categories")
            .select("id, tenant_id, nombre, color, sort_order, sucursal_id")
            .eq("tenant_id", tenantId)
            .eq("sucursal_id", activeSucursalId)
            .order("sort_order")
            .order("nombre"),
        ]);

        if (!serverPlatosRes.error && (serverPlatosRes.data?.length ?? 0) > 0) {
          platosData = serverPlatosRes.data ?? [];
          categoriasData = serverCategoriesRes.data ?? [];
        }
      }
 
      if (cancelled) return;
 
      const availablePlatos = (platosData as Plato[]).filter(p => p.disponible);
      setPlatos(availablePlatos);
      setMenuCategories(categoriasData as MenuCategoryRow[]);
 
      const configArray = generateMesasConfig(cantidadMesas);
      let currentMesas: MesaBasic[] = configArray.map((config) => ({
        id: config.id.toString(),
        numero: config.numero,
        estado: 'libre',
        fusionada: false,
        fusion_padre_id: null,
        fusion_hijos: [],
        deuda_pendiente: 0,
        items_pendientes: 0,
      }));

      const deudaPorNumero = new Map<number, { deuda: number; items: number }>();
      for (const row of consumosData) {
        const mn = row.mesa_numero ?? 0;
        if (mn <= 0) continue;
        const cur = deudaPorNumero.get(mn) ?? { deuda: 0, items: 0 };
        cur.deuda += Number(row.subtotal);
        cur.items += 1;
        deudaPorNumero.set(mn, cur);
      }

      if (estadosData && estadosData.length > 0) {
        // Crear mapa de estados por ID
        const estadosMap = new Map<number, any>();
        for (const e of estadosData) {
          estadosMap.set(e.id, e);
        }

        // La ocupacion se deriva de consumos pendientes; mesas_estado conserva fusion/layout.
        currentMesas = currentMesas.map((m) => {
          const estadoDB = estadosMap.get(parseInt(m.id));
          const agg = deudaPorNumero.get(m.numero);
          if (estadoDB) {
            return {
              ...m,
              estado: agg && agg.items > 0 ? 'ocupada' : 'libre',
              deuda_pendiente: agg?.deuda ?? 0,
              items_pendientes: agg?.items ?? 0,
            };
          }
          return {
            ...m,
            estado: agg && agg.items > 0 ? 'ocupada' : 'libre',
            deuda_pendiente: agg?.deuda ?? 0,
            items_pendientes: agg?.items ?? 0,
          };
        });
      } else if (deudaPorNumero.size > 0) {
        currentMesas = currentMesas.map((m) => {
          const agg = deudaPorNumero.get(m.numero);
          return {
            ...m,
            estado: agg && agg.items > 0 ? 'ocupada' : 'libre',
            deuda_pendiente: agg?.deuda ?? 0,
            items_pendientes: agg?.items ?? 0,
          };
        });
      }
      
      setMesas(currentMesas);
      setMenuLoading(false);
    };

    load().catch((error) => {
      console.error(error);
      if (!cancelled) {
        setMenuLoadError(true);
        setMenuLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [authLoading, tenantId, activeSucursalId, sucursalLoading]);

  useEffect(() => {
    if (mesas.length > 0 && location.state && (location.state as any).selectMesaNumero) {
      const mesaToSelect = mesas.find((m) => m.numero === (location.state as any).selectMesaNumero);
      if (mesaToSelect) {
        setMesaConsumos([]);
        setMesaAccountLoading(true);
        setSelectedMesa(mesaToSelect);
        // Clear state so it doesn't re-trigger
        window.history.replaceState({}, document.title);
      }
    }
  }, [mesas, location.state]);

  const categoryOrder = menuCategories.map((category) => category.nombre);
  const categoryColorMap = useMemo(
    () => new Map(menuCategories.map((category) => [category.nombre, category.color])),
    [menuCategories]
  );
  const categories = [
    "Todos",
    ...(categoryOrder.length > 0
      ? sortCategoriesForTabs(categoryOrder, categoryOrder)
      : sortCategoriesForTabs(platos.map((p) => p.categoria))),
  ];

  const getCatColor = useCallback(
    (cat: string) => categoryColorMap.get(cat) ?? suggestCategoryColor(cat),
    [categoryColorMap]
  );

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

  const hasCartItems = cart.length > 0;
  const canSendCartToMesa = Boolean(selectedMesa && hasCartItems);

  const showEmptyHint =
    !hasCartItems &&
    (!selectedMesa || mesaAccountLoading || mesaConsumos.length === 0);

  const showOrderFooter =
    hasCartItems || hasCuentaEnMesa;

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

  async function syncMesaStateFromOpenAccount(mesaId: string, mesaNumero: number) {
    if (!tenantId || !activeSucursalId) return;
    let useLocalConsumos = !navigator.onLine;
    if (!useLocalConsumos) {
      const outbox = await readLocalOutbox(tenantId).catch(() => []);
      useLocalConsumos = outbox.some((entry) =>
        entry.table_name === "consumos" &&
        (entry.status === "pending" || entry.status === "syncing" || entry.status === "error")
      );
    }

    if (useLocalConsumos) {
      const rows = (await readLocalMirror<Consumo>(tenantId, "consumos"))
        .filter((row) => Number(row.mesa_numero) === mesaNumero && row.estado !== "pagado" && row.sucursal_id === activeSucursalId);
      const deuda_pendiente = rows.reduce((s, r) => s + Number(r.subtotal), 0);
      const items_pendientes = rows.length;
      const estado = items_pendientes > 0 ? "ocupada" : "libre";
      setMesas((prev) =>
        prev.map((m) =>
          m.id === mesaId ? { ...m, estado, deuda_pendiente, items_pendientes } : m
        )
      );
      return;
    }
    const { data, error } = await insforgeClient.database
      .from("consumos")
      .select("subtotal")
      .eq("tenant_id", tenantId)
      .eq("sucursal_id", activeSucursalId)
      .eq("mesa_numero", mesaNumero)
      .neq("estado", "pagado");

    if (error) return;
    const rows = data ?? [];
    const deuda_pendiente = rows.reduce((s, r) => s + Number((r as { subtotal: number }).subtotal), 0);
    const items_pendientes = rows.length;
    const estado = items_pendientes > 0 ? "ocupada" : "libre";

    const mesaEstadoRow = {
      id: parseInt(mesaId, 10),
      estado,
      tenant_id: tenantId,
      sucursal_id: activeSucursalId,
      updated_at: new Date().toISOString(),
    };
    await writePosMutationLocalFirst({
      tenantId,
      tableName: "mesas_estado",
      rowId: String(mesaEstadoRow.id),
      op: "upsert",
      payload: mesaEstadoRow,
      authUserId: user?.id ?? null,
      deviceId: await getDeviceId(),
    });

    setMesas((prev) =>
      prev.map((m) =>
        m.id === mesaId ? { ...m, estado, deuda_pendiente, items_pendientes } : m
      )
    );
  }

  // Cargar consumos de una mesa (cuenta abierta en POS)
  const loadTableConsumption = useCallback(
    async (mesaNumero: number): Promise<Consumo[]> => {
      if (!tenantId || !activeSucursalId) return [];
      try {
        const outbox = await readLocalOutbox(tenantId);
        const hasPendingMesaConsumos = outbox.some((entry) => {
          if (entry.table_name !== "consumos") return false;
          if (entry.status !== "pending" && entry.status !== "syncing" && entry.status !== "error") return false;
          const payloadMesa = Number((entry.payload as { mesa_numero?: unknown } | null)?.mesa_numero);
          return payloadMesa === mesaNumero;
        });
        if (!navigator.onLine || hasPendingMesaConsumos) {
          const rows = await readLocalMirror<Consumo>(tenantId, "consumos");
          return rows
            .filter((row) => Number(row.mesa_numero) === mesaNumero && row.estado !== "pagado" && row.sucursal_id === activeSucursalId)
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        }
      } catch {
        // Si IndexedDB no está disponible, caemos al servidor.
      }
      const { data, error } = await insforgeClient.database
         .from("consumos")
         .select("*")
         .eq("tenant_id", tenantId)
         .eq("sucursal_id", activeSucursalId)
         .eq("mesa_numero", mesaNumero)
         .neq("estado", "pagado")
         .order("created_at", { ascending: true });

      if (error || !data) return [];
      return data as Consumo[];
    },
    [tenantId, activeSucursalId]
  );

  useEffect(() => {
    if (!selectedMesa) {
      setMesaConsumos([]);
      setMesaAccountLoading(false);
      return;
    }
    let cancelled = false;
    setMesaConsumos([]);
    setMesaAccountLoading(true);
    void loadTableConsumption(selectedMesa.numero).then((rows) => {
      if (!cancelled) {
        setMesaConsumos(rows);
        const deuda_pendiente = rows.reduce((sum, row) => sum + Number(row.subtotal), 0);
        const items_pendientes = rows.length;
        setMesas((prev) =>
          prev.map((mesa) =>
            mesa.id === selectedMesa.id
              ? {
                  ...mesa,
                  estado: items_pendientes > 0 ? "ocupada" : "libre",
                  deuda_pendiente,
                  items_pendientes,
                }
              : mesa
          )
        );
        setMesaAccountLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMesa?.id, selectedMesa?.numero, loadTableConsumption]);

  async function refreshMesaDebt(mesaId: string, mesaNumero: number) {
    await syncMesaStateFromOpenAccount(mesaId, mesaNumero);
  }

  async function deleteConsumo(consumoId: string) {
    if (!tenantId || !selectedMesa || !activeSucursalId) return;
    const consumo = mesaConsumos.find((c) => c.id === consumoId);
    if (!consumo) return;

    if (!canDeleteOpenConsumo(rol, user?.id, consumo)) {
      setDeleteConfirm({
        open: true,
        title: "Sin Permiso",
        message: "No tienes permiso para eliminar este consumo o ya fue facturado.",
        variant: "primary",
        onConfirm: () => setDeleteConfirm(s => ({ ...s, open: false })),
      });
      return;
    }

    setDeleteConfirm({
      open: true,
      title: "Eliminar Consumo",
      message: `¿Eliminar "${consumo.cantidad}× ${consumo.nombre}" de la cuenta?\n\nEsta acción no se puede deshacer.`,
      onConfirm: async () => {
        setDeleteConfirm(s => ({ ...s, open: false }));
        setDeletingConsumoId(consumoId);

        try {
          await writePosMutationLocalFirst({
            tenantId: tenantId!,
            tableName: "consumos",
            rowId: consumoId,
            op: "delete",
            payload: {
              id: consumoId,
              tenant_id: tenantId!,
              sucursal_id: activeSucursalId!,
              mesa_numero: consumo.mesa_numero,
              comanda_id: consumo.comanda_id,
              created_by_auth_user_id: consumo.created_by_auth_user_id ?? null,
            },
            authUserId: user?.id ?? null,
            deviceId: await getDeviceId(),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error desconocido";
          console.error("Error al eliminar consumo:", error);
          setDeleteConfirm({
            open: true,
            title: "Error",
            message: `Error al eliminar: ${message}`,
            variant: "primary",
            onConfirm: () => setDeleteConfirm(s => ({ ...s, open: false })),
          });
          setDeletingConsumoId(null);
          return;
        }

        // Update local state
        setMesaConsumos((prev) => prev.filter((c) => c.id !== consumoId));
        if (selectedMesa) {
          await refreshMesaDebt(selectedMesa.id, selectedMesa.numero);
        }
        setDeletingConsumoId(null);
      },
    });
  }

  /** Totales del modal "para llevar" (sin mesa). */
  function calculateTakeoutTotals() {
    const subtotal = cart.reduce((sum, i) => sum + i.plato.precio * i.cantidad, 0);
    const rate = cartItbisEnabled ? ITBIS : 0;
    const itbis = subtotal * rate;
    const total = subtotal + itbis;
    return { subtotal, itbis, total };
  }

  function parseOptionalCashReceived(total: number, isFiado: boolean = false): { amount: number | null; change: number | null } | null {
    const raw = cashReceivedInput.trim();
    if (raw === "") return { amount: null, change: null };

    const amount = Number(raw.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      alert("El dinero recibido debe ser un monto válido.");
      return null;
    }
    if (!isFiado && amount < total) {
      alert("El dinero recibido no puede ser menor al total.");
      return null;
    }
    if (isFiado && amount >= total) {
      alert("Si el monto cubre o supera el total, por favor seleccioná Efectivo u otro medio de pago.");
      return null;
    }

    return { amount, change: Math.max(0, amount - total) };
  }

  async function printFactura(facturaData: Record<string, unknown>, tenantData: { nombre_negocio: string | null; rnc: string | null; direccion: string | null; telefono: string | null; logo_url: string | null; logo_size_px?: number; logo_offset_x?: number; logo_offset_y?: number }, numeroFactura: number) {
    const paperWidthMm = getThermalPrintSettings().paperWidthMm;
    const html = buildFacturaReceiptHtml(
      {
        nombre_negocio: tenantData.nombre_negocio,
        rnc: tenantData.rnc,
        direccion: tenantData.direccion,
        telefono: tenantData.telefono,
        logo_url: tenantData.logo_url,
        logo_size_px: tenantData.logo_size_px,
        logo_offset_x: tenantData.logo_offset_x,
        logo_offset_y: tenantData.logo_offset_y,
      },
      facturaData as unknown as Parameters<typeof buildFacturaReceiptHtml>[1],
      numeroFactura,
      paperWidthMm
    );

    const res = await printThermalHtml(html);
    if (!res.ok && res.error) {
      console.warn("Impresión factura:", res.error);
    }
  }




  async function sendToKitchen() {
    if (!selectedMesa || cart.length === 0 || !activeSucursalId) return;
    if (!tenantId) {
      alert("No se pudo enviar: sesión sin negocio asignado.");
      return;
    }
    const tid = tenantId;
    setSending(true);
    setKitchenClosed(false);

    // Separar items: cocina vs directo
    const kitchenItems = cart.filter((i) => i.plato.va_a_cocina !== false);
    const directItems = cart.filter((i) => i.plato.va_a_cocina === false);

    let comandaId: string | null = null;

    // Crear comanda para items de cocina
    if (kitchenItems.length > 0) {
      let cocinaActiva = true;
      try {
        if (!navigator.onLine) {
          const localCocina = await readLocalMirror<{ activa?: boolean; sucursal_id?: string | null }>(tid, "cocina_estado");
          cocinaActiva = localCocina.find(r => r.sucursal_id === activeSucursalId)?.activa !== false;
        } else {
          const { data: estadoData } = await insforgeClient.database
            .from("cocina_estado")
            .select("activa")
            .eq("tenant_id", tid)
            .eq("sucursal_id", activeSucursalId)
            .limit(1);
          cocinaActiva = estadoData?.[0]?.activa !== false;
        }
      } catch {
        const localCocina = await readLocalMirror<{ activa?: boolean; sucursal_id?: string | null }>(tid, "cocina_estado").catch(() => []);
        cocinaActiva = localCocina.find(r => r.sucursal_id === activeSucursalId)?.activa !== false;
      }

      if (!cocinaActiva) {
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

      const localComandaId = crypto.randomUUID();
      const comandaPayload = {
        id: localComandaId,
        mesa_numero: selectedMesa.numero,
        estado: "pendiente",
        items,
        notas: null,
        tenant_id: tid,
        sucursal_id: activeSucursalId,
        creado_por: user?.id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await enqueueLocalWrite({
        tenantId: tid,
        tableName: "comandas",
        rowId: localComandaId,
        op: "insert",
        payload: comandaPayload,
        authUserId: user?.id ?? null,
        deviceId: await getDeviceId(),
      });
      const data: any = comandaPayload;

      comandaId = data?.id || localComandaId;

      if (data) {
        let tenantRow: any = null;
        try {
          if (!navigator.onLine) {
            const localTenants = await readLocalMirror<any>(tid, "tenants");
            tenantRow = localTenants.find((t) => t.id === tid);
          } else {
            const { data: t, error } = await insforgeClient.database
              .from("tenants")
              .select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda, logo_size_px, logo_offset_x, logo_offset_y")
              .eq("id", tid)
              .maybeSingle();
            if (error) throw error;
            tenantRow = t;
          }
        } catch {
          const localTenants = await readLocalMirror<any>(tid, "tenants").catch(() => []);
          tenantRow = localTenants.find((t) => t.id === tid);
        }

        if (tenantRow) {
          const paperWidthMm = getThermalPrintSettings().paperWidthMm;
          const tr = tenantRow as {
            nombre_negocio: string | null;
            rnc: string | null;
            direccion: string | null;
            telefono: string | null;
            logo_url: string | null;
            moneda?: string | null;
            logo_size_px?: number;
            logo_offset_x?: number;
            logo_offset_y?: number;
          };
          const comandaHtml = buildComandaReceiptHtml(
            {
              nombre_negocio: tr.nombre_negocio,
              rnc: tr.rnc,
              direccion: tr.direccion,
              telefono: tr.telefono,
              logo_url: tr.logo_url,
              moneda: tr.moneda ?? null,
              logo_size_px: tr.logo_size_px,
              logo_offset_x: tr.logo_offset_x,
              logo_offset_y: tr.logo_offset_y,
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
              notes: (data as any).notas || null,
              created_at: data.created_at,
            } as any,
            paperWidthMm
          );
          const printSettings = getThermalPrintSettings();
          if (printSettings.printComandas !== false) {
            const printRes = await printThermalHtml(comandaHtml);
            if (!printRes.ok && printRes.error) {
              console.warn("Impresión comanda:", printRes.error);
            }
          }
        }
      }
    }

    // Crear consumos para TODOS los items (cocina + directo)
    const consumosToInsert = [
      ...kitchenItems.map((i) => ({
        id: crypto.randomUUID(),
        mesa_numero: selectedMesa.numero,
        tenant_id: tid,
        sucursal_id: activeSucursalId,
        comanda_id: comandaId,
        plato_id: i.plato.id,
        nombre: i.plato.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.plato.precio,
        subtotal: i.plato.precio * i.cantidad,
        tipo: "cocina" as const,
        estado: "enviado_cocina" as const,
        created_by_auth_user_id: user?.id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      ...directItems.map((i) => ({
        id: crypto.randomUUID(),
        mesa_numero: selectedMesa.numero,
        tenant_id: tid,
        sucursal_id: activeSucursalId,
        comanda_id: null,
        plato_id: i.plato.id,
        nombre: i.plato.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.plato.precio,
        subtotal: i.plato.precio * i.cantidad,
        tipo: "directo" as const,
        estado: "entregado" as const,
        created_by_auth_user_id: user?.id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    ];

    for (const consumo of consumosToInsert) {
      await enqueueLocalWrite({
        tenantId: tid,
        tableName: "consumos",
        rowId: consumo.id,
        op: "insert",
        payload: consumo,
        authUserId: user?.id ?? null,
        deviceId: await getDeviceId(),
      });
    }

    // Limpiar SOLO el carrito (todo fue enviado)
    setCart([]);
    setSentOk(true);
    setTimeout(() => setSentOk(false), 3000);
    setSending(false);

    // Actualizar deuda de la mesa y refrescar cuenta en panel
    const consumosActualizados = await loadTableConsumption(selectedMesa.numero);
    setMesaConsumos(consumosActualizados);
    await refreshMesaDebt(selectedMesa.id, selectedMesa.numero);
  }

  async function openPaymentModal() {
    // Verificar que exista un ciclo operativo abierto antes de permitir cualquier cobro
    if (!tenantId) {
      alert("No hay negocio activo.");
      return;
    }
    const cycleOpen = await hasOpenCycle(tenantId, activeSucursalId);
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
      setTakeoutCustomer(null);
      setCashReceivedInput("");
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
    const normalizedClientRnc = takeoutClientRnc.trim() || takeoutCustomer?.document_id?.trim() || "";
    if (
      tenantNcfFiscalActive &&
      ncfTypeRequiresClientRnc(selectedNcfType) &&
      normalizedClientRnc === ""
    ) {
      alert("Debes indicar el RNC del cliente para emitir una factura B01.");
      return;
    }
    if (paymentMethod === "fiado" && !takeoutCustomer) {
      alert("Debes seleccionar un cliente para registrar una venta al fiado.");
      return;
    }
    const cycleOpen = await hasOpenCycle(tenantId, activeSucursalId);
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
      tenant_id: tenantId,
      sucursal_id: activeSucursalId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    setCharging(true);
    try { await ensureAuthSessionFresh(); } catch { /* offline: session remains valid */ }

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
    const isFiado = paymentMethod === "fiado";
    const cashReceived =
      paymentMethod === "efectivo" || isFiado
        ? parseOptionalCashReceived(total, isFiado)
        : { amount: null, change: null };
    if (!cashReceived) {
      setCharging(false);
      return;
    }

    let ncfPart: Awaited<ReturnType<typeof resolveNcfForNewInvoiceLocalFirst>> = null;
    if (tenantId && tenantNcfFiscalActive) {
      try {
        ncfPart = await resolveNcfForNewInvoiceLocalFirst(tenantId, selectedNcfType);
      } catch (err) {
        alert(err instanceof Error ? err.message : "No se pudo reservar NCF fiscal. No se emitió la factura.");
        setCharging(false);
        return;
      }
      if (!ncfPart) {
        alert("No se pudo reservar NCF fiscal. No se emitió la factura.");
        setCharging(false);
        return;
      }
    }

    const localFacturaId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const numeroFactura = await getNextFacturaNumber(tenantId);
    const facturaData: Record<string, unknown> = {
      id: localFacturaId,
      tenant_id: tenantId,
      sucursal_id: activeSucursalId,
      numero_factura: numeroFactura,
      metodo_pago: paymentMethod,
      estado: isFiado ? ("pendiente" as const) : ("pagada" as const),
      subtotal,
      itbis,
      propina: 0,
      total,
      items: facturaItems,
      monto_recibido: isFiado ? null : cashReceived.amount,
      cambio_devuelto: isFiado ? null : cashReceived.change,
      created_at: nowIso,
      pagada_at: isFiado ? null : nowIso,
      mesa_numero: 0,
      notas: "Para llevar",
    };
    if (ncfPart) {
      facturaData.ncf = ncfPart.ncf;
      facturaData.ncf_tipo = ncfPart.ncf_tipo;
      if (ncfPart.reservationSource === "local_mirror") {
        facturaData[LOCAL_NCF_RESERVED_PAYLOAD_FLAG] = true;
      }
    }
    if (normalizedClientRnc !== "") {
      facturaData.cliente_rnc = normalizedClientRnc;
    }
    if (takeoutCustomer) {
      facturaData.customer_id = takeoutCustomer.id;
      facturaData.cliente_nombre = takeoutCustomer.name;
      if (takeoutCustomer.document_id?.trim()) {
        facturaData.cliente_rnc = takeoutCustomer.document_id.trim();
      }
    }

    if (tenantId) {
      await enqueueLocalWrite({
        tenantId,
        tableName: "facturas",
        rowId: localFacturaId,
        op: "insert",
        payload: facturaData,
        deviceId: await getDeviceId(),
      });

      if (isFiado && takeoutCustomer) {
        const cxcId = crypto.randomUUID();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        await enqueueLocalWrite({
          tenantId,
          tableName: "cuentas_cobrar",
          rowId: cxcId,
          op: "insert",
          payload: {
            id: cxcId,
            tenant_id: tenantId,
            sucursal_id: activeSucursalId,
            factura_id: localFacturaId,
            customer_id: takeoutCustomer.id,
            monto_total: total,
            monto_pagado: cashReceived.amount ?? 0.00,
            fecha_emision: nowIso,
            fecha_vencimiento: dueDate.toISOString(),
            estado: "pendiente",
            observacion: `Registrada automáticamente desde POS (Para llevar, Factura #${numeroFactura})`,
            created_at: nowIso,
            updated_at: nowIso,
          },
          deviceId: await getDeviceId(),
        });
      }
    }

    if (!isFiado) {
      const cashDrawerRes = await openCashDrawerForSale();
      if (!cashDrawerRes.ok && cashDrawerRes.error) {
        console.warn("Apertura de caja:", cashDrawerRes.error);
      }
    }

    if (tenantId && ncfPart && !ncfPart.sequenceReservedAtomically) {
      await incrementTenantNcfSequence(tenantId, ncfPart.tipoCodigo, ncfPart.usedSequence);
    }

    let tenantPrintData: { nombre_negocio: string | null; rnc: string | null; direccion: string | null; telefono: string | null; logo_url: string | null } | null = null;
    try {
      if (!navigator.onLine || await isDesktopCloudUnavailable()) {
        const localTenants = await readLocalMirror<any>(tenantId, "tenants");
        tenantPrintData = localTenants.find((t) => t.id === tenantId) ?? null;
      } else {
        const { data: t, error } = await insforgeClient.database.from("tenants").select("nombre_negocio, rnc, direccion, telefono, logo_url, logo_size_px, logo_offset_x, logo_offset_y").eq("id", tenantId).maybeSingle();
        if (error) throw error;
        tenantPrintData = t;
      }
    } catch {
      const localTenants = await readLocalMirror<any>(tenantId, "tenants").catch(() => []);
      tenantPrintData = localTenants.find((t) => t.id === tenantId) ?? null;
    }
    if (tenantPrintData) {
      // Ensure logo is cached for this and future prints
      void cacheLogoFromUrl(tenantPrintData.logo_url);
      await printFactura(facturaData, tenantPrintData, Number(facturaData.numero_factura) || numeroFactura);
    }

    setCart([]);
    setTakeoutClientRnc("");
    setTakeoutCustomer(null);
    setCashReceivedInput("");
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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* LEFT: Menu */}
      <div className="flex min-w-0 flex-col gap-4 sm:gap-[24px] p-3 sm:p-5 lg:p-[32px] lg:flex-1 lg:overflow-auto">
        {/* Categories */}
        <div className="flex gap-2 sm:gap-[12px] pb-1 shrink-0 overflow-x-auto lg:flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-4 sm:px-[24px] py-2 sm:py-[10px] rounded-[12px] shrink-0 font-['Space_Grotesk',sans-serif] font-bold text-[12px] sm:text-[14px] tracking-[1px] sm:tracking-[1.2px] uppercase border-none cursor-pointer transition-all"
               style={{
                backgroundColor:
                  activeCategory === cat
                    ? getCatColor(cat) === "#a1a1aa"
                      ? "#ff906d"
                      : getCatColor(cat)
                    : isDark ? "#1a1a1a" : "#ffffff",
                color:
                  activeCategory === cat
                    ? "#000000"
                    : isDark ? "#a1a1aa" : "#4b5563",
                boxShadow:
                  activeCategory === cat
                    ? `0 0 20px ${getCatColor(cat)}40`
                    : undefined,
                border: activeCategory === cat ? "none" : `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.08)"}`
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Items grid */}
        {menuLoading || sucursalLoading ? (
          <div className="flex items-center justify-center py-[40px]">
            <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">
              Cargando carta...
            </span>
          </div>
        ) : menuLoadError ? (
          <div className="flex items-center justify-center py-[40px] px-4">
            <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px] text-center">
              No se pudo cargar la carta. Intentá nuevamente.
            </span>
          </div>
        ) : !activeSucursalId ? (
          <div className="flex items-center justify-center py-[40px] px-4">
            <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px] text-center">
              No tenés sucursal configurada todavía.
            </span>
          </div>
        ) : platos.length === 0 ? (
          <div className="flex items-center justify-center py-[40px] px-4">
            <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px] text-center">
              No tenés menú agregado todavía.
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
          <div className="grid gap-3 sm:gap-[16px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(145px, 100%), 1fr))" }}>
            {filteredPlatosForGrid.map((plato) => {
              const inCart = cart.find((i) => i.plato.id === plato.id);
              const cc = getCatColor(plato.categoria);
              return (
                <div
                  key={plato.id}
                  className="bg-card rounded-[16px] flex flex-col overflow-hidden border border-black/10 dark:border-[rgba(255,255,255,0.05)] transition-all cursor-pointer group hover:scale-[1.02] active:scale-[0.98]"
                  style={{ 
                    borderTop: `3px solid ${cc}`,
                    boxShadow: `0 4px 20px -10px ${cc}40, 0 0 15px -5px ${cc}20`
                  }}
                  onClick={() => addToCart(plato)}
                >
                  {/* Color header */}
                  <div
                    className="h-[6px] w-full shrink-0"
                    style={{ backgroundColor: `${cc}20` }}
                  />
                  <div className="flex flex-col gap-[8px] p-3 sm:p-[16px] flex-1">
                    {/* Category badge */}
                    <div
                      className="rounded-[4px] px-[6px] py-[2.5px] w-fit"
                      style={{
                        backgroundColor: `${cc}25`,
                        border: `1px solid ${cc}50`,
                      }}
                    >
                      <span
                        className="font-['Inter',sans-serif] font-extrabold text-[9px] tracking-[1px] uppercase"
                        style={{ color: cc, textShadow: `0 0 8px ${cc}40` }}
                      >
                        {plato.categoria}
                      </span>
                    </div>
 
                    {/* Name */}
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[12.5px] sm:text-[14.5px] uppercase leading-tight tracking-tight">
                      {plato.nombre}
                    </span>
 
                    {/* Price */}
                    <span
                      className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] sm:text-[17px] mt-auto"
                      style={{ color: cc, textShadow: `0 0 10px ${cc}30` }}
                    >
                      {formatMoney(plato.precio)}
                    </span>
                  </div>

                  {/* Add button */}
                  <div
                    className="flex items-center justify-center py-[10px] transition-colors"
                    style={{
                      backgroundColor: inCart ? `${cc}20` : isDark ? "rgba(38,38,38,0.6)" : "rgba(15,23,42,0.04)",
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
                      <span className="font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.5px] uppercase text-muted-foreground group-hover:text-foreground transition-colors">
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
      <div className="w-full shrink-0 bg-card border-t lg:border-t-0 lg:border-l border-black/10 dark:bg-[#0e0e0e] dark:border-[rgba(72,72,71,0.3)] flex flex-col lg:h-full lg:w-[380px] lg:rounded-none shadow-2xl relative">
        {/* Header */}
        <div className="relative z-20 border-b border-black/10 dark:border-[rgba(72,72,71,0.2)] px-4 sm:px-[24px] pt-4 sm:pt-[20px] pb-4 sm:pb-[20px] shrink-0">
          {/* Título */}
          <div className="text-center">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[18px] uppercase">
              Pedido Actual
            </span>
          </div>

          {/* Botones */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-[12px] mt-3 sm:mt-[16px]">
            {/* Mesa selector */}
            <div className="relative">
              <button
                onClick={() => setShowMesaDropdown((v) => !v)}
                className="flex items-center gap-[6px] rounded-[6px] px-[10px] py-[4px] border-none cursor-pointer transition-all"
                style={{ backgroundColor: selectedMesa ? "#ff784d" : isDark ? "rgba(72,72,71,0.3)" : "rgba(15,23,42,0.06)" }}
              >
                <span
                  className="font-['Inter',sans-serif] font-bold text-[11px] uppercase"
                  style={{ color: selectedMesa ? "#460f00" : isDark ? "#adaaaa" : "#4b5563" }}
                >
                  {selectedMesa ? `Mesa ${selectedMesa.numero}` : "Seleccionar mesa"}
                </span>
                <span style={{ color: selectedMesa ? "#460f00" : isDark ? "#adaaaa" : "#4b5563", fontSize: 9 }}>▼</span>
              </button>

              {showMesaDropdown && (
                <div
                  className="absolute top-[calc(100%+6px)] left-0 z-50 bg-popover border border-black/10 dark:bg-[#1a1a1a] dark:border-[rgba(72,72,71,0.4)] rounded-[12px] p-[8px] shadow-xl"
                  style={{ minWidth: 180, maxHeight: 260, overflowY: "auto" }}
                >
                  {/* Opción: sin mesa */}
                  <button
                    onClick={() => { setSelectedMesa(null); setShowMesaDropdown(false); setCart([]); }}
                    className="w-full text-left flex items-center gap-[8px] px-[10px] py-[7px] rounded-[8px] cursor-pointer border-none transition-colors hover:bg-black/5 dark:hover:bg-[rgba(72,72,71,0.3)]"
                    style={{ backgroundColor: !selectedMesa ? "rgba(89,238,80,0.08)" : "transparent" }}
                  >
                    <span className="font-['Inter',sans-serif] text-[12px]" style={{ color: !selectedMesa ? "#59ee50" : isDark ? "#adaaaa" : "#4b5563" }}>
                      Sin mesa
                    </span>
                  </button>

                  <div className="h-px bg-black/10 dark:bg-[rgba(72,72,71,0.3)] my-[6px]" />

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
                                : isDark ? "rgba(38,38,38,0.8)" : "rgba(15,23,42,0.06)";
                        const textColor =
                          isSelected
                            ? "#460f00"
                            : mesa.estado === "ocupada"
                              ? "#ff716c"
                              : mesa.estado === "limpieza"
                                ? "#ff906d"
                                : isDark ? "#adaaaa" : "#4b5563";
                        return (
                          <button
                            key={mesa.id}
                            onClick={async () => {
                              setShowMesaDropdown(false);
                              setIsTakeout(false);
                              if (selectedMesa?.id === mesa.id) return;
                              setMesaConsumos([]);
                              setMesaAccountLoading(true);
                              setSelectedMesa(mesa);
                              setCart([]);
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
                      <span className="font-['Inter',sans-serif] text-[9px] text-muted-foreground">Libre</span>
                    </div>
                    <div className="flex items-center gap-[4px]">
                      <div className="size-[6px] rounded-full bg-[#ff716c]" />
                      <span className="font-['Inter',sans-serif] text-[9px] text-muted-foreground">Ocupada</span>
                    </div>
                    <div className="flex items-center gap-[4px]">
                      <div className="size-[6px] rounded-full bg-[#ff906d]" />
                      <span className="font-['Inter',sans-serif] text-[9px] text-muted-foreground">Limpieza</span>
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
              className={`flex items-center gap-[8px] rounded-[6px] px-[10px] py-[4px] cursor-pointer border-none transition-all ${isTakeout ? "bg-[#59ee50]" : "bg-black/5 dark:bg-[rgba(72,72,71,0.3)]"
                }`}
            >
              <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 15 13.5">
                <path
                  d={svgPaths.p18098d80}
                  fill={isTakeout ? "#0e0e0e" : isDark ? "#adaaaa" : "#4b5563"}
                />
              </svg>
              <span
                className={`font-['Inter',sans-serif] font-bold text-[10px] uppercase ${isTakeout ? "text-[#0e0e0e]" : "text-muted-foreground"
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
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[13px] uppercase leading-tight">
                        {c.cantidad}× {c.nombre}
                      </span>
                      <div className="flex items-center gap-[6px] shrink-0">
                        <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[13px] tabular-nums">
                          {formatMoney(Number(c.subtotal))}
                        </span>
                        {canDeleteOpenConsumo(rol, user?.id, c) && (
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
                        )}
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
            const cc = getCatColor(item.plato.categoria);
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
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[13px] uppercase leading-tight">
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
                    <div className="bg-background dark:bg-[#131313] flex gap-[10px] items-center px-[10px] py-[5px] rounded-[6px] border border-black/10 dark:border-[rgba(72,72,71,0.3)]">
                      <button
                        onClick={() => changeQty(item.plato.id, -1)}
                        className="bg-transparent border-none cursor-pointer p-0 w-[12px] h-[12px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        −
                      </button>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[12px] min-w-[16px] text-center">
                        {String(item.cantidad).padStart(2, "0")}
                      </span>
                      <button
                        onClick={() => addToCart(item.plato)}
                        className="bg-transparent border-none cursor-pointer p-0 w-[12px] h-[12px] flex items-center justify-center text-muted-foreground hover:text-foreground"
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
          <div className="backdrop-blur-[6px] bg-muted/70 border-t border-black/10 dark:bg-[rgba(38,38,38,0.8)] dark:border-[rgba(72,72,71,0.2)] rounded-b-[16px] px-[20px] py-[20px] flex flex-col gap-[16px] shrink-0">
            {mesaAccountLoading && (
              <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] text-center">
                Actualizando total…
              </span>
            )}
            {cartSubtotal > 0 && hasCuentaEnMesa && (
              <div className="bg-[rgba(89,238,80,0.06)] border border-[rgba(89,238,80,0.15)] rounded-[8px] px-[10px] py-[8px]">
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[10px] leading-snug">
                  Carrito sin enviar: <span className="text-[#59ee50] font-semibold">{formatMoney(cartTotal)}</span>
                  . Tocá <span className="text-foreground font-semibold">Cocina</span> para sumarlo a la cuenta de la mesa antes de cobrar todo junto.
                </span>
              </div>
            )}
            {/* Totals (mesa abierta o solo carrito / para llevar) */}
            <div className="flex flex-col gap-[6px]">
              <div className="flex items-center justify-between gap-[10px] rounded-[10px] border border-black/10 bg-background px-[12px] py-[10px] mb-[2px] dark:border-[rgba(72,72,71,0.28)] dark:bg-[#131313]">
                <div className="flex flex-col min-w-0">
                  <span className="font-['Inter',sans-serif] text-foreground text-[12px] font-semibold leading-tight">
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
                  className={`relative h-[30px] w-[54px] shrink-0 rounded-full border-none cursor-pointer transition-colors ${cartItbisEnabled ? "bg-[#59ee50]" : "bg-black/20 dark:bg-[#383838]"
                    }`}
                >
                  <span
                    className={`absolute top-[5px] left-[5px] block size-[20px] rounded-full bg-white shadow transition-transform duration-200 ease-out ${cartItbisEnabled ? "translate-x-[24px]" : "translate-x-0"
                      }`}
                  />
                </button>
              </div>
              {tenantNcfFiscalActive ? (
                <div className="flex flex-col gap-[10px] rounded-[10px] border border-black/10 bg-background px-[12px] py-[10px] dark:border-[rgba(72,72,71,0.28)] dark:bg-[#131313]">
                  <div className="flex items-center justify-between gap-[12px]">
                    <div className="flex flex-col min-w-0">
                      <span className="font-['Inter',sans-serif] text-foreground text-[12px] font-semibold leading-tight">
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
                      className="min-w-[168px] rounded-[10px] border border-black/10 bg-card px-[12px] py-[9px] font-['Inter',sans-serif] text-[12px] text-foreground outline-none dark:border-[rgba(72,72,71,0.3)] dark:bg-[#1a1a1a]"
                    >
                      {NCF_B_TIPO_OPCIONES.map((opcion) => (
                        <option key={opcion.codigo} value={opcion.codigo}>
                          {opcion.codigo} - {opcion.descripcion.replace(`${opcion.codigo} - `, "")}
                        </option>
                      ))}
                    </select>
                  </div>
                  {ncfTypeRequiresClientRnc(selectedNcfType) ? (
                    <div className="flex flex-col gap-[6px]">
                      <span className="font-['Inter',sans-serif] text-muted-foreground text-[10px] tracking-[0.8px] uppercase">
                        RNC del cliente
                      </span>
                      <input
                        type="text"
                        value={takeoutClientRnc}
                        onChange={(e) => setTakeoutClientRnc(e.target.value)}
                        placeholder="RNC del cliente"
                        className="w-full rounded-[10px] border border-black/10 bg-card px-[12px] py-[9px] font-['Inter',sans-serif] text-[12px] text-foreground outline-none dark:border-[rgba(72,72,71,0.3)] dark:bg-[#1a1a1a]"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] tracking-[1px] uppercase">
                  Subtotal {hasCuentaEnMesa ? "(en mesa)" : ""}
                </span>
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] tracking-[1px] uppercase">
                  {formatMoney(panelBillSubtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] tracking-[1px] uppercase">
                  {cartItbisEnabled ? "ITBIS (18%)" : "ITBIS (no incluido)"}
                </span>
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] tracking-[1px] uppercase">
                  {formatMoney(panelBillItbis)}
                </span>
              </div>
              <div className="border-t border-black/10 dark:border-[rgba(72,72,71,0.15)] pt-[8px] flex items-center justify-between">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[16px] uppercase">
                  Total
                </span>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[20px]">
                  {formatMoney(panelBillTotal)}
                </span>
              </div>
            </div>

            {canSendCartToMesa && (
              <div className="grid grid-cols-1 gap-[10px]">
                <button
                  onClick={sendToKitchen}
                  disabled={sending}
                  className="flex gap-[6px] items-center justify-center py-[12px] rounded-[12px] border-2 bg-transparent cursor-pointer transition-colors disabled:opacity-50"
                  style={{
                    borderColor: "#59ee50",
                    color: "#59ee50",
                  }}
                >
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-[11px] tracking-[1px] uppercase">
                    {sending ? "Agregando..." : "+ Agregar"}
                  </span>
                </button>
              </div>
            )}

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

        {cart.length === 0 && !hasCuentaEnMesa && !mesaAccountLoading && (
          <div className="px-[20px] pb-[20px] shrink-0">
            <div className="bg-muted rounded-[12px] p-[16px] text-center dark:bg-[#131313]">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] tracking-[0.5px] uppercase">
                Carrito vacío
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
            const freeMesaRow = {
              id: parseInt(selectedMesa.id, 10),
              estado: "libre",
              tenant_id: tenantId,
              updated_at: new Date().toISOString(),
            };
            await writeLocalMirrorRow(tenantId, "mesas_estado", freeMesaRow);
            await writePosMutationLocalFirst({
              tenantId,
              tableName: "mesas_estado",
              rowId: String(freeMesaRow.id),
              op: "upsert",
              payload: freeMesaRow,
              authUserId: user?.id ?? null,
              deviceId: await getDeviceId(),
            });
            setMesas((prev) =>
              prev.map((m) =>
                m.id === selectedMesa.id
                  ? { ...m, estado: "libre", deuda_pendiente: 0, items_pendientes: 0 }
                  : m
              )
            );
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-all duration-300"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setTakeoutClientRnc("");
                setTakeoutCustomer(null);
                setCashReceivedInput("");
                setShowPaymentModal(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="takeout-close-title"
              aria-describedby="takeout-close-description"
              className="bg-[#121212] border border-zinc-800 rounded-[24px] shadow-[0px_0px_50px_rgba(255,144,109,0.15)] w-full max-w-5xl max-h-[95vh] md:max-h-[85vh] flex flex-col overflow-hidden relative"
            >
              {/* Ambient Top Glow */}
              <div className="absolute top-0 right-0 w-80 h-40 bg-[radial-gradient(ellipse_at_top_right,rgba(255,144,109,0.08),transparent)] pointer-events-none rounded-[24px]" />

              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900 shrink-0 relative z-10">
                <div>
                  <h2 id="takeout-close-title" className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[22px] tracking-[0.5px] flex items-center gap-2">
                    <span className="text-[#ff906d]">●</span> Cobrar para llevar
                  </h2>
                  <p id="takeout-close-description" className="text-zinc-400 text-[13px] mt-0.5 font-['Inter',sans-serif] flex items-center gap-1.5">
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-zinc-800 text-zinc-300 rounded-full">{cart.length}</span>
                    ítem{cart.length !== 1 ? "s" : ""} en el carrito
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTakeoutClientRnc("");
                    setTakeoutCustomer(null);
                    setCashReceivedInput("");
                    setShowPaymentModal(false);
                  }}
                  aria-label="Cerrar modal de cobro para llevar"
                  className="text-zinc-400 bg-transparent border-none cursor-pointer text-[26px] hover:text-white transition-colors leading-none w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-900"
                >
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto md:overflow-hidden p-6 relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
                
                {/* Left Column: Items and Totals */}
                <div className="md:col-span-7 flex flex-col gap-4 md:overflow-hidden h-full">
                  <div className="flex-1 flex flex-col min-h-0">
                    <span className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[1px] mb-2 px-1">
                      Detalle de la Orden
                    </span>
                    <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5 custom-scrollbar">
                      {cart.map((line) => (
                        <div
                          key={line.plato.id}
                          className="rounded-xl p-3 bg-zinc-900/40 border border-zinc-800/40 flex items-center justify-between transition-all hover:bg-zinc-900/60"
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-[28px] h-[28px] rounded-lg bg-zinc-800 border border-zinc-800 flex items-center justify-center font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] mt-0.5">
                              {line.cantidad}
                            </div>
                            <div>
                              <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px]">
                                {line.plato.nombre}
                              </div>
                              <div className="text-zinc-500 text-[12px] font-['Inter',sans-serif] mt-0.5">
                                {`${currencySymbol} ${Number(line.plato.precio).toFixed(2)} c/u`}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[#ff906d] font-['Space_Grotesk',sans-serif] font-bold text-[14px]">
                              {`${currencySymbol} ${(line.plato.precio * line.cantidad).toFixed(2)}`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Main Totals Card */}
                  <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-3 shrink-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,144,109,0.03),transparent)] pointer-events-none" />
                    <div className="flex justify-between items-center relative z-10">
                      <span className="font-['Inter',sans-serif] text-zinc-500 text-[13px]">Subtotal</span>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-zinc-300 text-[14px]">{formatMoney(calcSubtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center relative z-10">
                      <span className="font-['Inter',sans-serif] text-zinc-500 text-[13px]">
                        {cartItbisEnabled ? "ITBIS (18%)" : "ITBIS (no incluido)"}
                      </span>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-zinc-300 text-[14px]">{formatMoney(calcItbis)}</span>
                    </div>
                    <div className="h-[1px] bg-zinc-900 my-1 relative z-10" />
                    <div className="flex justify-between items-end relative z-10">
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-zinc-400 text-[14px]">
                        TOTAL COBRAR
                      </span>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[24px] leading-none tracking-tight">
                        {formatMoney(calcTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Column: customer, NCF, payment, confirm */}
                <div className="md:col-span-5 flex flex-col gap-5 md:overflow-y-auto pr-1 h-full custom-scrollbar md:border-l md:border-zinc-900 md:pl-6">
                  
                  {/* Customer Selector Card */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <span className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[1px] px-1">
                      Cliente
                    </span>
                    <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl p-3">
                      <CustomerSelect
                        tenantId={tenantId}
                        value={takeoutCustomer}
                        onChange={(customer) => {
                          setTakeoutCustomer(customer);
                          if (customer?.document_id) setTakeoutClientRnc(customer.document_id);
                        }}
                        compact
                      />
                    </div>
                  </div>

                  {/* NCF Selection Cards */}
                  {tenantNcfFiscalActive && (
                    <div className="flex flex-col gap-3 shrink-0 bg-zinc-900/20 border border-zinc-800/30 rounded-2xl p-4">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="ncf-select" className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[1px]">
                          Tipo NCF
                        </label>
                        <select
                          id="ncf-select"
                          value={selectedNcfType}
                          onChange={(e) =>
                            setSelectedNcfType(
                              isNcfBCode(e.target.value) ? e.target.value : DEFAULT_NCF_B_CODE
                            )
                          }
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors cursor-pointer"
                        >
                          {NCF_B_TIPO_OPCIONES.map((opcion) => (
                            <option key={opcion.codigo} value={opcion.codigo}>
                              {opcion.codigo} - {opcion.descripcion.replace(`${opcion.codigo} - `, "")}
                            </option>
                          ))}
                        </select>
                      </div>

                      {ncfTypeRequiresClientRnc(selectedNcfType) && (
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="client-rnc-input" className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[1px]">
                            RNC del cliente
                          </label>
                          <input
                            id="client-rnc-input"
                            type="text"
                            value={takeoutClientRnc}
                            onChange={(e) => setTakeoutClientRnc(e.target.value)}
                            placeholder="RNC del cliente (obligatorio)"
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment Method Section */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <span className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[1px] px-1">
                      Método de pago
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { value: "efectivo" as const, label: "Efectivo", icon: "💵" },
                          { value: "tarjeta" as const, label: "Tarjeta", icon: "💳" },
                          { value: "digital" as const, label: "Digital", icon: "📱" },
                          { value: "transferencia" as const, label: "Transf.", icon: "🏦" },
                          { value: "fiado" as const, label: "Crédito / Fiado", icon: "🤝" },
                        ] as const
                      ).map((method) => {
                        const active = paymentMethod === method.value;
                        const isFiadoLocked = method.value === "fiado" && !canUseFeature(plan, "accounts_receivable");
                        return (
                          <button
                            type="button"
                            key={method.value}
                            onClick={() => {
                              if (isFiadoLocked) {
                                setDeleteConfirm({
                                  open: true,
                                  title: "Función Premium",
                                  message: "🔒 El pago 'Al Fiado' (Cuentas por Cobrar) es una función del Plan Profesional.\n\n¿Deseas solicitar la actualización de tu plan por WhatsApp?",
                                  variant: "primary",
                                  onConfirm: () => {
                                    setDeleteConfirm(s => ({ ...s, open: false }));
                                    window.open("https://wa.me/18096041078?text=Hola%20Cyberbistro%2C%20quiero%20actualizar%20mi%20plan%20para%20usar%20Cuentas%20por%20Cobrar", "_blank", "noopener,noreferrer");
                                  }
                                });
                                return;
                              }
                              setPaymentMethod(method.value);
                            }}
                            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl cursor-pointer border transition-all active:scale-95 justify-start ${
                              active
                                  ? "bg-[#ff906d] border-[#ff906d] text-[#5b1600] shadow-[0_4px_12px_rgba(255,144,109,0.2)] font-bold"
                                  : "bg-zinc-900/50 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700"
                            } ${isFiadoLocked ? "opacity-60" : ""}`}
                          >
                            <span className="text-[18px]">{method.icon}</span>
                            <span className="font-['Space_Grotesk',sans-serif] text-[12px] uppercase tracking-[0.5px] flex items-center gap-1.5">
                              {method.label} {isFiadoLocked && <span>🔒</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cash Calculator Section */}
                  {(paymentMethod === "efectivo" || paymentMethod === "fiado") && (
                    <div className="flex flex-col gap-2 shrink-0 bg-zinc-900/20 border border-zinc-800/30 rounded-2xl p-4">
                      <label htmlFor="cash-received-input" className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[1px]">
                        {paymentMethod === "fiado" ? "Abono inicial (opcional)" : "Dinero recibido (opcional)"}
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[14px]">RD$</span>
                        <input
                          id="cash-received-input"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={cashReceivedInput}
                          onChange={(e) => setCashReceivedInput(e.target.value)}
                          placeholder="Ej: 1000"
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-12 pr-4 py-3 font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] outline-none focus:border-[#ff906d]/50 transition-colors"
                        />
                      </div>
                      {cashReceivedInput.trim() !== "" && (
                        <div className="flex justify-between items-center px-1 py-0.5">
                          <span className="text-zinc-500 text-[12px] font-['Inter',sans-serif]">
                            {paymentMethod === "fiado" ? "Balance pendiente:" : "Cambio devuelto:"}
                          </span>
                          <span className={`font-['Space_Grotesk',sans-serif] font-bold ${paymentMethod === "fiado" ? "text-[#ff906d]" : "text-[#59ee50]"} text-[14px]`}>
                            {formatMoney(
                              paymentMethod === "fiado"
                                ? Math.max(0, calcTotal - Number(cashReceivedInput.replace(",", ".")))
                                : Math.max(0, Number(cashReceivedInput.replace(",", ".")) - calcTotal || 0)
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons Section */}
                  <div className="flex gap-3 mt-2 pb-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setTakeoutClientRnc("");
                        setTakeoutCustomer(null);
                        setCashReceivedInput("");
                        setShowPaymentModal(false);
                      }}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl py-3.5 font-['Space_Grotesk',sans-serif] font-bold text-zinc-400 text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:border-zinc-700 hover:text-white transition-all active:scale-95"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void createInvoice()}
                      disabled={charging}
                      className="flex-1 bg-[#59ee50] rounded-xl py-3.5 font-['Space_Grotesk',sans-serif] font-bold text-[#0e0e0e] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#4cd444] transition-all shadow-[0_4px_12px_rgba(89,238,80,0.2)] active:scale-95"
                    >
                      {charging ? "Procesando..." : "Confirmar Pago"}
                    </button>
                  </div>
                </div>
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
                          hour12: true,
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

      <ConfirmModal
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        message={deleteConfirm.message}
        onConfirm={deleteConfirm.onConfirm}
        onCancel={() => setDeleteConfirm(s => ({ ...s, open: false }))}
        variant={deleteConfirm.variant}
      />
    </div>
  );
}
