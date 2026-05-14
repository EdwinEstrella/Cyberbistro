import { useState, useEffect, useCallback, useRef } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { ensureAuthSessionFresh } from "../../../shared/hooks/useAuth";
import { buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";
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
import { enqueueLocalWrite, getDeviceId, getLocalFirstStatusSnapshot, readLocalMirror, readLocalOutbox } from "../../../shared/lib/localFirst";
import { getNextFacturaNumber } from "../../../shared/lib/invoiceNumber";

const ITBIS = 0.18;

// Checks if there is an open operational cycle for the tenant (any business day)
async function hasOpenCycle(tenantId: string): Promise<boolean> {
  try {
    const snapshot = await getLocalFirstStatusSnapshot(tenantId);
    const localMode = snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing";
    if (localMode) {
      const cycles = await readLocalMirror<{ id: string; closed_at: string | null }>(tenantId, "cierres_operativos");
      return cycles.some(c => !c.closed_at);
    }
  } catch { /* fall through to online */ }
  const { data, error } = await insforgeClient.database
    .from("cierres_operativos")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("closed_at", null);
  if (error) {
    console.warn("Error checking open cycle:", error);
    return false;
  }
  return (data && (data as any[]).length > 0);
}


const RD = (n: number) =>
  "RD$ " + n.toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export interface MesaConsumoRow {
  id: string;
  mesa_numero: number | null;
  comanda_id: string | null;
  plato_id: number;
  nombre: string;
  categoria?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  tipo: "cocina" | "directo";
  estado: "pedido" | "enviado_cocina" | "listo" | "entregado" | "pagado";
  factura_id: string | null;
  created_at: string;
  updated_at?: string;
}

export interface MesaCloseAccountModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string | null;
  mesaNumero: number;
  /** Por defecto 18% (`ITBIS`). Pasá `0` para facturar sin ITBIS (p. ej. desde Venta con ITBIS apagado). */
  itbisRate?: number;
  initialNcfType?: NcfBCode | null;
  onSettled?: (remaining: MesaConsumoRow[]) => void | Promise<void>;
  /** Solo cuando la mesa queda sin consumos pendientes tras un cobro completo. */
  onPaidFull?: () => void;
}

async function loadTableConsumption(
  tenantId: string,
  mesaNumero: number
): Promise<MesaConsumoRow[]> {
  try {
    const snapshot = await getLocalFirstStatusSnapshot(tenantId);
    const shouldTrustLocal =
      snapshot.status === "history_complete" ||
      snapshot.status === "ready_history_syncing" ||
      (typeof navigator !== "undefined" && !navigator.onLine);

    if (shouldTrustLocal) {
      const localRows = await readLocalMirror<MesaConsumoRow>(tenantId, "consumos");
      const mesaRows = localRows
        .filter((row) => row.mesa_numero === mesaNumero)
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      const localPendingRows = mesaRows.filter((row) => row.estado !== "pagado");

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return localPendingRows;
      }

      const mesaRowIds = new Set(mesaRows.map((row) => row.id));
      const outbox = await readLocalOutbox(tenantId);
      const hasPendingMesaWrites = outbox.some((entry) => {
        if (entry.status !== "pending" && entry.status !== "syncing" && entry.status !== "error") return false;
        if (entry.table_name !== "consumos") return false;
        if (mesaRowIds.has(entry.row_id)) return true;
        return Number(entry.payload?.mesa_numero) === mesaNumero;
      });

      if (localPendingRows.length > 0 || hasPendingMesaWrites) {
        return localPendingRows;
      }
    }
  } catch {
    if (typeof navigator !== "undefined" && !navigator.onLine) return [];
  }

  const { data, error } = await insforgeClient.database
    .from("consumos")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("mesa_numero", mesaNumero)
    .neq("estado", "pagado")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as MesaConsumoRow[];
}

async function groupConsumosForFactura(
  tenantId: string,
  consumos: MesaConsumoRow[],
  itbisRate: number
) {
  const plateIds = [...new Set(consumos.map((consumo) => consumo.plato_id))];
  const categoriaPorPlato = new Map<number, string>();

  if (plateIds.length > 0) {
    const { data } = await insforgeClient.database
      .from("platos")
      .select("id, categoria")
      .eq("tenant_id", tenantId)
      .in("id", plateIds);

    for (const plate of (data as Array<{ id: number; categoria?: string | null }>) ?? []) {
      categoriaPorPlato.set(plate.id, plate.categoria?.trim() || "General");
    }
  }

  const groupedItems = consumos.reduce(
    (acc, consumo) => {
      const key = consumo.plato_id;
      if (!acc[key]) {
        acc[key] = {
          plato_id: consumo.plato_id,
          nombre: consumo.nombre,
          categoria:
            consumo.categoria?.trim() ||
            categoriaPorPlato.get(consumo.plato_id) ||
            "General",
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
  const subtotal = consumos.reduce((sum, c) => sum + Number(c.subtotal), 0);
  const itbis = subtotal * itbisRate;
  const total = subtotal + itbis;
  return { facturaItems, subtotal, itbis, total };
}

/** Cierra comandas de cocina abiertas para esta mesa (evita que la vista Mesas siga sumando su total). */
async function cerrarComandasCocinaMesa(tenantId: string, mesaNumero: number): Promise<void> {
  const { error } = await insforgeClient.database
    .from("comandas")
    .update({ estado: "entregado", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("mesa_numero", mesaNumero)
    .in("estado", ["pendiente", "en_preparacion", "listo"]);

  if (error) {
    console.warn("MesaCloseAccountModal: no se pudieron cerrar comandas de cocina:", error);
  }
}

export function MesaCloseAccountModal({
  open,
  onClose,
  tenantId,
  mesaNumero,
  itbisRate = ITBIS,
  initialNcfType = null,
  onSettled,
  onPaidFull,
}: MesaCloseAccountModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [mesaConsumos, setMesaConsumos] = useState<MesaConsumoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [charging, setCharging] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "efectivo" | "tarjeta" | "digital" | "transferencia"
  >("efectivo");
  const [ncfFiscalActive, setNcfFiscalActive] = useState(false);
  const [selectedNcfType, setSelectedNcfType] = useState<NcfBCode>(DEFAULT_NCF_B_CODE);
  const [clientRnc, setClientRnc] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  /** En modo dividir: cada línea de consumo va a una persona 1..splitParts (ítem completo, no se parte el monto). */
  const [personByConsumoId, setPersonByConsumoId] = useState<Record<string, number>>({});
  const [splitParts, setSplitParts] = useState(2);

  const refreshConsumos = useCallback(async () => {
    if (!tenantId) return [];
    return loadTableConsumption(tenantId, mesaNumero);
  }, [tenantId, mesaNumero]);

  useEffect(() => {
    if (!open) {
      setSplitMode(false);
      setPersonByConsumoId({});
      setPaymentMethod("efectivo");
      setClientRnc("");
      return;
    }
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    void loadTableConsumption(tenantId, mesaNumero).then((rows) => {
      if (!cancelled) {
        setMesaConsumos(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, mesaNumero]);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !splitMode || mesaConsumos.length === 0) return;
    setPersonByConsumoId((prev) => {
      const next = { ...prev };
      const allowed = new Set(mesaConsumos.map((c) => c.id));
      for (const k of Object.keys(next)) {
        if (!allowed.has(k)) delete next[k];
      }
      for (const c of mesaConsumos) {
        let p = next[c.id];
        if (p == null || !Number.isFinite(p)) p = 1;
        next[c.id] = Math.min(Math.max(1, Math.floor(p)), splitParts);
      }
      return next;
    });
  }, [open, splitMode, mesaConsumos, splitParts]);

  useEffect(() => {
    if (!open || !tenantId) return;

    let cancelled = false;

    void loadTenantBillingSettings(tenantId).then((settings) => {
      if (cancelled) return;

      setNcfFiscalActive(settings?.ncfFiscalActive ?? false);
      setSelectedNcfType(
        initialNcfType && isNcfBCode(initialNcfType)
          ? initialNcfType
          : settings?.defaultNcfType ?? DEFAULT_NCF_B_CODE
      );
    });

    return () => {
      cancelled = true;
    };
  }, [open, tenantId, initialNcfType]);

  async function printFactura(facturaId: string, numeroFactura: number) {
    if (!tenantId) return;

    let factura: any = null;
    let tenant: any = null;

    try {
      const snapshot = await getLocalFirstStatusSnapshot(tenantId);
      const localMode = snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing";

      if (localMode) {
        const allFacturas = await readLocalMirror<any>(tenantId, "facturas");
        factura = allFacturas.find(f => f.id === facturaId);

        const allTenants = await readLocalMirror<any>(tenantId, "tenants");
        tenant = allTenants.find(t => t.id === tenantId);
      } else {
        const { data: factData, error: facturaError } = await insforgeClient.database
          .from("facturas")
          .select("*")
          .eq("id", facturaId)
          .eq("tenant_id", tenantId)
          .single();
        if (facturaError) {
          console.error("Error al obtener factura:", facturaError);
          return;
        }
        factura = factData;

        const { data: tenantData } = await insforgeClient.database
          .from("tenants")
          .select("nombre_negocio, rnc, direccion, telefono, logo_url, logo_size_px, logo_offset_x, logo_offset_y")
          .eq("id", tenantId)
          .single();
        tenant = tenantData;
      }
    } catch (err) {
      console.error("Error leyendo datos para factura:", err);
      return;
    }

    if (!factura) {
      console.error("Error: No se encontró la factura para imprimir");
      return;
    }

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
        logo_size_px: (tenant as any).logo_size_px,
        logo_offset_x: (tenant as any).logo_offset_x,
        logo_offset_y: (tenant as any).logo_offset_y,
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

  function collectPersonGroups(): Map<number, MesaConsumoRow[]> {
    const m = new Map<number, MesaConsumoRow[]>();
    for (let p = 1; p <= splitParts; p++) m.set(p, []);
    for (const c of mesaConsumos) {
      const raw = personByConsumoId[c.id];
      const p = Math.min(
        Math.max(1, raw == null || !Number.isFinite(raw) ? 1 : Math.floor(raw)),
        splitParts
      );
      m.get(p)!.push(c);
    }
    return m;
  }

  function assignRoundRobinByItems() {
    if (mesaConsumos.length === 0) return;
    const next: Record<string, number> = { ...personByConsumoId };
    mesaConsumos.forEach((c, i) => {
      next[c.id] = (i % splitParts) + 1;
    });
    setPersonByConsumoId(next);
  }

  function assignAllToPerson(person: number) {
    const p = Math.min(Math.max(1, person), splitParts);
    const next: Record<string, number> = {};
    for (const c of mesaConsumos) next[c.id] = p;
    setPersonByConsumoId(next);
  }

  function calculateTotals() {
    const subtotal = mesaConsumos.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const itbis = subtotal * itbisRate;
    const total = subtotal + itbis;
    return { subtotal, itbis, total };
  }

  /**
   * Emite una factura por grupo de persona. Cada factura obtiene su propio NCF (secuencia +1 por factura).
   * `mode === "all"`: todas las personas con ítems. `mode === n`: solo persona n.
   */
  async function createSplitInvoices(mode: "all" | number) {
  if (!tenantId) return;
  // Ensure there is an open operational cycle before creating invoices
  const cycleOpen = await hasOpenCycle(tenantId);
  if (!cycleOpen) {
    alert("No hay un ciclo operativo abierto. Inicie un ciclo antes de cobrar.");
    return;
  }
    if (!tenantId) return;

    const groups = collectPersonGroups();
    const personsWithItems = Array.from({ length: splitParts }, (_, i) => i + 1).filter(
      (p) => (groups.get(p)?.length ?? 0) > 0
    );

    const order =
      mode === "all"
        ? personsWithItems
        : typeof mode === "number" && mode >= 1 && mode <= splitParts
          ? (groups.get(mode)?.length ?? 0) > 0
            ? [mode]
            : []
          : [];

    if (order.length === 0) {
      alert(
        mode === "all"
          ? "No hay ítems asignados a ninguna persona."
          : `La persona ${mode} no tiene ítems asignados.`
      );
      return;
    }

    const normalizedClientRnc = clientRnc.trim();
    if (
      ncfFiscalActive &&
      ncfTypeRequiresClientRnc(selectedNcfType) &&
      normalizedClientRnc === ""
    ) {
      alert("Debes indicar el RNC del cliente para emitir una factura B01.");
      return;
    }

    setCharging(true);
    await ensureAuthSessionFresh();

    try {
      const deviceId = await getDeviceId();
      let nextFacturaNumber = await getNextFacturaNumber(tenantId);

      for (const personIndex of order) {
        const consumosToInvoice = groups.get(personIndex)!;
        if (consumosToInvoice.length === 0) continue;

        const { facturaItems, subtotal, itbis, total } = await groupConsumosForFactura(
          tenantId,
          consumosToInvoice,
          itbisRate
        );

        const ncfPart = await resolveNcfForNewInvoice(
          tenantId,
          ncfFiscalActive ? selectedNcfType : null
        );

        const localFacturaId = crypto.randomUUID();
        const now = new Date().toISOString();
        const insertRow: Record<string, unknown> = {
          id: localFacturaId,
          tenant_id: tenantId,
          numero_factura: nextFacturaNumber++,
          mesa_numero: mesaNumero,
          metodo_pago: paymentMethod,
          estado: "pagada",
          subtotal,
          itbis,
          propina: 0,
          total,
          items: facturaItems,
          notas: `Mesa ${mesaNumero} — Persona ${personIndex} de ${splitParts} (${consumosToInvoice.length} líneas)`,
          pagada_at: now,
          created_at: now,
          updated_at: now,
        };
        if (ncfPart) {
          insertRow.ncf = ncfPart.ncf;
          insertRow.ncf_tipo = ncfPart.ncf_tipo;
        }
        if (normalizedClientRnc !== "") {
          insertRow.cliente_rnc = normalizedClientRnc;
        }

        await enqueueLocalWrite({
          tenantId,
          tableName: "facturas",
          rowId: localFacturaId,
          op: "insert",
          payload: insertRow,
          deviceId,
        });

        if (ncfPart && !ncfPart.sequenceReservedAtomically) {
          await incrementTenantNcfSequence(tenantId, ncfPart.tipoCodigo, ncfPart.usedSequence);
        }

        await printFactura(localFacturaId, Number(insertRow.numero_factura));

        const consumoIds = consumosToInvoice.map((c) => c.id);
        for (const cid of consumoIds) {
          await enqueueLocalWrite({
            tenantId,
            tableName: "consumos",
            rowId: cid,
            op: "update",
            payload: {
              estado: "pagado",
              factura_id: localFacturaId,
              updated_at: new Date().toISOString(),
            },
            deviceId,
          });
        }
      }
    } finally {
      setCharging(false);
    }

    const updatedConsumos = await refreshConsumos();
    setMesaConsumos(updatedConsumos);
    await onSettled?.(updatedConsumos);

    if (updatedConsumos.length === 0) {
      await cerrarComandasCocinaMesa(tenantId, mesaNumero);
      if (mode === "all" && order.length > 1) {
        alert(`✅ Se emitieron ${order.length} facturas (cada una con su NCF si está activo).`);
      }
      setSplitMode(false);
      setPersonByConsumoId({});
      onPaidFull?.();
      onClose();
    } else {
      const partsDone = mode === "all" ? order.length : 1;
      alert(
        `✅ Factura(s) emitida(s): ${partsDone}.\n\nQuedan ${updatedConsumos.length} línea(s) pendiente(s) en la mesa.`
      );
    }
  }

  async function createInvoice() {
    if (!tenantId) return;
    const cycleOpen = await hasOpenCycle(tenantId);
    if (!cycleOpen) {
      alert("No hay un ciclo operativo abierto. Inicie un ciclo antes de cobrar.");
      return;
    }
    if (!tenantId) return;
    if (mesaConsumos.length === 0) {
      alert("No hay consumos pendientes para cobrar");
      return;
    }

    const normalizedClientRnc = clientRnc.trim();
    if (
      ncfFiscalActive &&
      ncfTypeRequiresClientRnc(selectedNcfType) &&
      normalizedClientRnc === ""
    ) {
      alert("Debes indicar el RNC del cliente para emitir una factura B01.");
      return;
    }

    setCharging(true);
    await ensureAuthSessionFresh();

    const deviceId = await getDeviceId();
    const nextFacturaNumber = await getNextFacturaNumber(tenantId);

    const consumosToBill = mesaConsumos;
    const { facturaItems, subtotal, itbis, total } = await groupConsumosForFactura(
      tenantId,
      consumosToBill,
      itbisRate
    );

    const ncfPart = await resolveNcfForNewInvoice(
      tenantId,
      ncfFiscalActive ? selectedNcfType : null
    );

    const localFacturaId = crypto.randomUUID();
    const now = new Date().toISOString();
    const facturaData: Record<string, unknown> = {
      id: localFacturaId,
      tenant_id: tenantId,
      numero_factura: nextFacturaNumber,
      metodo_pago: paymentMethod,
      estado: "pagada",
      subtotal,
      itbis,
      propina: 0,
      total,
      items: facturaItems,
      pagada_at: now,
      created_at: now,
      updated_at: now,
      mesa_numero: mesaNumero,
      notas: `Mesa ${mesaNumero}`,
    };
    if (ncfPart) {
      facturaData.ncf = ncfPart.ncf;
      facturaData.ncf_tipo = ncfPart.ncf_tipo;
    }
    if (normalizedClientRnc !== "") {
      facturaData.cliente_rnc = normalizedClientRnc;
    }

    await enqueueLocalWrite({
      tenantId,
      tableName: "facturas",
      rowId: localFacturaId,
      op: "insert",
      payload: facturaData,
      deviceId,
    });

    if (ncfPart && !ncfPart.sequenceReservedAtomically) {
      await incrementTenantNcfSequence(tenantId, ncfPart.tipoCodigo, ncfPart.usedSequence);
    }

    await printFactura(localFacturaId, nextFacturaNumber);

    const consumoIds = consumosToBill.map((c) => c.id);
    for (const cid of consumoIds) {
      await enqueueLocalWrite({
        tenantId,
        tableName: "consumos",
        rowId: cid,
        op: "update",
        payload: {
          estado: "pagado",
          factura_id: localFacturaId,
          updated_at: new Date().toISOString(),
        },
        deviceId,
      });
    }

    const restantes = await refreshConsumos();
    setMesaConsumos(restantes);
    await onSettled?.(restantes);

    if (restantes.length === 0) {
      await cerrarComandasCocinaMesa(tenantId, mesaNumero);
    }

    setCharging(false);
    setSplitMode(false);
    setPersonByConsumoId({});

    if (restantes.length === 0) {
      onPaidFull?.();
      onClose();
    } else {
      alert(
        `La factura se generó pero quedan ${restantes.length} consumo(s) sin marcar como pagado. Revisá la base de datos o intentá de nuevo.`
      );
    }
  }

  if (!open) return null;

  const { subtotal: calcSubtotal, itbis: calcItbis, total: calcTotal } = calculateTotals();
  const splitGroups = splitMode && mesaConsumos.length > 0 ? collectPersonGroups() : null;
  const personsWithItems =
    splitGroups != null
      ? Array.from({ length: splitParts }, (_, i) => i + 1).filter(
          (p) => (splitGroups.get(p)?.length ?? 0) > 0
        )
      : [];

  function personIndexForConsumo(c: MesaConsumoRow): number {
    const raw = personByConsumoId[c.id];
    return Math.min(
      Math.max(1, raw == null || !Number.isFinite(raw) ? 1 : Math.floor(raw)),
      splitParts
    );
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mesa-close-title"
        aria-describedby="mesa-close-description"
        className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[20px] p-[28px] w-[700px] max-h-[90vh] overflow-y-auto flex flex-col gap-[20px] shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <span id="mesa-close-title" className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px]">
              Cobrar Mesa {mesaNumero}
            </span>
            {loading ? (
              <div id="mesa-close-description" className="text-[#adaaaa] text-[12px] mt-1">Cargando cuenta…</div>
            ) : mesaConsumos.length > 0 ? (
              <div id="mesa-close-description" className="text-[#adaaaa] text-[12px] mt-1">
                {mesaConsumos.length} items pendientes
              </div>
            ) : (
              <div id="mesa-close-description" className="text-[#adaaaa] text-[12px] mt-1">Sin líneas pendientes</div>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => {
              onClose();
            }}
            aria-label="Cerrar modal de cobro de mesa"
            className="text-[#6b7280] bg-transparent border-none cursor-pointer text-[20px] hover:text-white transition-colors leading-none"
          >
            ×
          </button>
        </div>

        {mesaConsumos.length > 1 && (
          <div className="flex items-center justify-between bg-[#262626] rounded-[12px] p-[12px]">
            <div className="flex items-center gap-[8px]">
              <span className="text-white text-[14px]">🔄</span>
              <span className="font-['Inter',sans-serif] text-white text-[13px]">Dividir cuenta</span>
              <span className="text-[#adaaaa] text-[11px]">(solo si el cliente lo solicita)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSplitMode(!splitMode);
                if (!splitMode) setPersonByConsumoId({});
              }}
              className={`px-4 py-2 rounded-[8px] font-['Inter',sans-serif] font-bold text-[12px] transition-all ${
                splitMode ? "bg-[#ff906d] text-[#5b1600]" : "bg-[#383838] text-[#adaaaa]"
              }`}
            >
              {splitMode ? "Activado" : "Activar"}
            </button>
          </div>
        )}

        {splitMode && mesaConsumos.length > 0 && (
          <div className="bg-[#262626] rounded-[12px] p-[12px] flex flex-col gap-[12px]">
            <div className="flex flex-col gap-[6px]">
              <span className="font-['Inter',sans-serif] text-white text-[13px]">
                Asigná cada línea a una persona. Cada persona recibe su propia factura (y su NCF si está activo).
              </span>
              <span className="text-[#adaaaa] text-[11px]">
                Los ítems no se parten por monto: va el artículo completo a la persona que elijas.
              </span>
            </div>

            <div className="flex items-center gap-[12px] flex-wrap">
              <span className="text-[#adaaaa] text-[12px]">Personas:</span>
              <div className="flex items-center gap-[8px]">
                <button
                  type="button"
                  onClick={() => setSplitParts((p) => Math.max(2, p - 1))}
                  aria-label="Reducir número de personas"
                  className="w-[32px] h-[32px] bg-[#383838] hover:bg-[#444] text-white rounded-[8px] flex items-center justify-center font-bold text-[14px] transition-colors"
                >
                  −
                </button>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] min-w-[40px] text-center">
                  {splitParts}
                </span>
                <button
                  type="button"
                  onClick={() => setSplitParts((p) => Math.min(12, p + 1))}
                  aria-label="Aumentar número de personas"
                  className="w-[32px] h-[32px] bg-[#383838] hover:bg-[#444] text-white rounded-[8px] flex items-center justify-center font-bold text-[14px] transition-colors"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={assignRoundRobinByItems}
                className="px-4 py-2 bg-[#59ee50] hover:bg-[#4cd444] text-[#0e0e0e] text-[12px] font-bold rounded-[8px] transition-colors"
              >
                Repartir ítems en ronda
              </button>
              <button
                type="button"
                onClick={() => assignAllToPerson(1)}
                className="px-3 py-2 bg-[#383838] hover:bg-[#444] text-white text-[11px] font-bold rounded-[8px] transition-colors"
              >
                Todo a persona 1
              </button>
            </div>
          </div>
        )}

        {splitMode && mesaConsumos.length > 0 && (
          <div className="max-h-[220px] overflow-y-auto flex flex-col gap-[8px]">
            {mesaConsumos.map((consumo) => {
              const activePerson = personIndexForConsumo(consumo);
              return (
                <div
                  key={consumo.id}
                  className="rounded-[8px] p-[10px] bg-[#262626] border border-[rgba(72,72,71,0.35)] flex flex-col gap-[8px] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px]">
                      {consumo.cantidad}× {consumo.nombre}
                    </div>
                    <div className="text-[#adaaaa] text-[11px]">
                      RD$ {Number(consumo.precio_unitario).toFixed(2)} c/u · línea{" "}
                      <span className="text-[#ff906d]">RD$ {Number(consumo.subtotal).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-[6px] flex-wrap shrink-0">
                    <span className="text-[#6b7280] text-[10px] uppercase tracking-wide mr-[4px]">Persona</span>
                    {Array.from({ length: splitParts }, (_, i) => {
                      const pn = i + 1;
                      const on = pn === activePerson;
                      return (
                        <button
                          key={pn}
                          type="button"
                          onClick={() =>
                            setPersonByConsumoId((prev) => ({
                              ...prev,
                              [consumo.id]: pn,
                            }))
                          }
                          className={`min-w-[32px] h-[32px] px-[8px] rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] border-none cursor-pointer transition-colors ${
                            on
                              ? "bg-[#ff906d] text-[#5b1600]"
                              : "bg-[#383838] text-[#adaaaa] hover:bg-[#444] hover:text-white"
                          }`}
                        >
                          {pn}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-[#131313] rounded-[12px] p-[14px] flex flex-col gap-[8px]">
          {splitMode && splitGroups != null && (
            <>
              {Array.from({ length: splitParts }, (_, i) => i + 1).map((p) => {
                const rows = splitGroups.get(p) ?? [];
                if (rows.length === 0) return null;
                const st = rows.reduce((s, c) => s + Number(c.subtotal), 0);
                const itb = st * itbisRate;
                return (
                  <div key={p} className="flex justify-between gap-[8px]">
                    <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px]">
                      Persona {p} · {rows.length} línea{rows.length !== 1 ? "s" : ""}
                    </span>
                    <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px] text-right">
                      {RD(st)}
                      {itbisRate > 0 ? (
                        <>
                          {" "}
                          + ITBIS {RD(itb)} = {RD(st + itb)}
                        </>
                      ) : (
                        <> = {RD(st)}</>
                      )}
                    </span>
                  </div>
                );
              })}
              <div className="border-t border-[rgba(72,72,71,0.3)] my-[4px]" />
            </>
          )}

          <div className="flex justify-between">
            <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">Subtotal</span>
            <span className="font-['Inter',sans-serif] text-white text-[11px]">{RD(calcSubtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
              {itbisRate > 0 ? "ITBIS (18%)" : "ITBIS (no incluido)"}
            </span>
            <span className="font-['Inter',sans-serif] text-white text-[11px]">{RD(calcItbis)}</span>
          </div>
          <div className="border-t border-[rgba(72,72,71,0.15)] pt-[6px] flex justify-between">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px]">
              {splitMode ? "TOTAL MESA" : "TOTAL"}
            </span>
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px]">
              {RD(calcTotal)}
            </span>
          </div>
        </div>

        {ncfFiscalActive ? (
          <div className="flex flex-col gap-[10px]">
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
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] leading-relaxed">
              Este cobro emitira el tipo seleccionado. Si divides la cuenta, todas las facturas de esta ronda usan el mismo NCF.
            </span>
          </div>
        ) : null}

        {ncfFiscalActive && ncfTypeRequiresClientRnc(selectedNcfType) ? (
          <div className="flex flex-col gap-[8px]">
            <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
              RNC del cliente
            </span>
            <input
              type="text"
              value={clientRnc}
              onChange={(e) => setClientRnc(e.target.value)}
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
            {(
              [
                { value: "efectivo" as const, label: "Efectivo", icon: "💵" },
                { value: "tarjeta" as const, label: "Tarjeta", icon: "💳" },
                { value: "digital" as const, label: "Digital", icon: "📱" },
                { value: "transferencia" as const, label: "Transferencia", icon: "🏦" },
              ] as const
            ).map((method) => (
              <button
                type="button"
                key={method.value}
                onClick={() => setPaymentMethod(method.value)}
                className={`flex flex-col items-center gap-[8px] py-[12px] rounded-[12px] cursor-pointer border-none transition-all ${
                  paymentMethod === method.value
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

        <div className="flex flex-col gap-[10px]">
          <div className="flex gap-[10px]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[#262626] border border-[rgba(72,72,71,0.3)] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:border-[rgba(255,144,109,0.3)] hover:text-white transition-colors"
            >
              Cancelar
            </button>

            {splitMode ? (
              <button
                type="button"
                onClick={() => void createSplitInvoices("all")}
                disabled={charging || loading || personsWithItems.length === 0}
                className="flex-1 bg-[#ff906d] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff784d] transition-opacity"
              >
                {charging
                  ? "Procesando..."
                  : personsWithItems.length <= 1
                    ? "Emitir factura(s)"
                    : `Emitir ${personsWithItems.length} facturas`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void createInvoice()}
                disabled={charging || loading || mesaConsumos.length === 0}
                className="flex-1 bg-[#59ee50] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#0e0e0e] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 transition-opacity"
              >
                {charging ? "Procesando..." : "Confirmar Pago"}
              </button>
            )}
          </div>

          {splitMode && mesaConsumos.length > 0 && (
            <div className="flex flex-col gap-[6px]">
              <span className="text-[#6b7280] text-[10px] uppercase tracking-wide text-center">
                Cobrar solo una persona (una factura)
              </span>
              <div className="flex flex-wrap gap-[6px] justify-center">
                {Array.from({ length: splitParts }, (_, i) => i + 1).map((p) => {
                  const n = (splitGroups?.get(p) ?? []).length;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void createSplitInvoices(p)}
                      disabled={charging || loading || n === 0}
                      className="px-3 py-2 bg-[#383838] hover:bg-[#444] disabled:opacity-40 text-white text-[11px] font-bold rounded-[8px] border-none cursor-pointer transition-colors"
                    >
                      Solo P{p}
                      {n > 0 ? ` (${n})` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
