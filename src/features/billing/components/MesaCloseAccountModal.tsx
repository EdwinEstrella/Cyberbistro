import { useState, useEffect, useRef } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { ensureAuthSessionFresh } from "../../../shared/hooks/useAuth";
import { buildFacturaReceiptHtml } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { openCashDrawerForSale, printThermalHtml } from "../../../shared/lib/thermalPrint";
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
import { enqueueLocalWrite, getDeviceId, getLocalFirstStatusSnapshot, isLocalFirstEnabled, LOCAL_NCF_RESERVED_PAYLOAD_FLAG, readLocalMirror, readLocalOutbox, resolveNcfForNewInvoiceLocalFirst } from "../../../shared/lib/localFirst";
import { getNextFacturaNumber } from "../../../shared/lib/invoiceNumber";
import { closeKitchenComandasForMesaLocalFirst } from "../../pos/lib/localFirstMutations";
import { cacheLogoFromUrl } from "../../../shared/lib/logoCache";
import { isDesktopCloudUnavailable } from "../../../shared/lib/cloudAvailability";
import { useSucursal } from "../../../app/context/SucursalContext";
import { CustomerSelect } from "../../clientes/components/CustomerSelect";
import type { Customer } from "../../clientes/lib/customers";

const ITBIS = 0.18;

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
  sucursal_id?: string | null;
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
  mesaNumero: number,
  sucursalId: string | null
): Promise<MesaConsumoRow[]> {
  if (!sucursalId) return [];
  try {
    const snapshot = await getLocalFirstStatusSnapshot(tenantId);
    const shouldTrustLocal =
      snapshot.status === "history_complete" ||
      snapshot.status === "ready_history_syncing" ||
      (typeof navigator !== "undefined" && !navigator.onLine) ||
      (await isDesktopCloudUnavailable());

    if (shouldTrustLocal) {
      const localRows = await readLocalMirror<MesaConsumoRow>(tenantId, "consumos");
      const mesaRows = localRows
        .filter((row) => row.mesa_numero === mesaNumero && row.sucursal_id === sucursalId)
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      const localPendingRows = mesaRows.filter((row) => row.estado !== "pagado");

      if ((typeof navigator !== "undefined" && !navigator.onLine) || (await isDesktopCloudUnavailable())) {
        return localPendingRows;
      }

      const mesaRowIds = new Set(mesaRows.map((row) => row.id));
      const outbox = await readLocalOutbox(tenantId);
      const hasPendingMesaWrites = outbox.some((entry) => {
        if (entry.status !== "pending" && entry.status !== "syncing" && entry.status !== "error") return false;
        if (entry.table_name !== "consumos") return false;
        if (mesaRowIds.has(entry.row_id)) return true;
        return Number(entry.payload?.mesa_numero) === mesaNumero && entry.payload?.sucursal_id === sucursalId;
      });

      if (hasPendingMesaWrites) {
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
    .eq("sucursal_id", sucursalId)
    .eq("mesa_numero", mesaNumero)
    .neq("estado", "pagado")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as MesaConsumoRow[];
}

async function groupConsumosForFactura(
  tenantId: string,
  consumos: MesaConsumoRow[],
  itbisRate: number,
  sucursalId: string | null
) {
  const plateIds = [...new Set(consumos.map((consumo) => consumo.plato_id))];
  const categoriaPorPlato = new Map<number, string>();

  if (plateIds.length > 0) {
    const localPlates = await (async () => {
      if (!(await isDesktopCloudUnavailable())) return null;
      return readLocalMirror<{ id: number; categoria?: string | null; sucursal_id?: string | null }>(tenantId, "platos")
        .then(rows => rows.filter(r => r.sucursal_id === sucursalId))
        .catch(() => []);
    })();

    const data = localPlates ?? (await insforgeClient.database
      .from("platos")
      .select("id, categoria")
      .eq("tenant_id", tenantId)
      .eq("sucursal_id", sucursalId)
      .in("id", plateIds)).data;

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
async function cerrarComandasCocinaMesa(tenantId: string, mesaNumero: number, sucursalId: string | null): Promise<void> {
  if (!sucursalId) return;
  const openComandas = isLocalFirstEnabled()
    ? (await readLocalMirror<any>(tenantId, "comandas"))
        .filter((row: any) => row.tenant_id === tenantId && row.mesa_numero === mesaNumero && row.sucursal_id === sucursalId && ["pendiente", "en_preparacion", "listo"].includes(row.estado))
        .map((row: any) => ({ id: row.id }))
    : await (async () => {
        const { data, error } = await insforgeClient.database
          .from("comandas")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("sucursal_id", sucursalId)
          .eq("mesa_numero", mesaNumero)
          .in("estado", ["pendiente", "en_preparacion", "listo"]);

        if (error) {
          console.warn("MesaCloseAccountModal: no se pudieron cerrar comandas de cocina:", error);
          return [];
        }
        return ((data as Array<{ id: string }> | null) ?? []).map((row) => ({ id: row.id }));
      })();

  const deviceId = await getDeviceId();
  await closeKitchenComandasForMesaLocalFirst({
    tenantId,
    mesaNumero,
    deviceId,
    listOpenComandas: async () => openComandas,
  });
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
  const { activeSucursalId } = useSucursal();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [mesaConsumos, setMesaConsumos] = useState<MesaConsumoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [charging, setCharging] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "efectivo" | "tarjeta" | "digital" | "transferencia" | "fiado"
  >("efectivo");
  const [ncfFiscalActive, setNcfFiscalActive] = useState(false);
  const [selectedNcfType, setSelectedNcfType] = useState<NcfBCode>(DEFAULT_NCF_B_CODE);
  const [clientRnc, setClientRnc] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  /** En modo dividir: cada línea de consumo va a una persona 1..splitParts (ítem completo, no se parte el monto). */
  const [personByConsumoId, setPersonByConsumoId] = useState<Record<string, number>>({});
  const [splitParts, setSplitParts] = useState(2);

  useEffect(() => {
    if (!open) {
      setSplitMode(false);
      setPersonByConsumoId({});
      setPaymentMethod("efectivo");
      setClientRnc("");
      setSelectedCustomer(null);
      setCashReceivedInput("");
      return;
    }
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    void loadTableConsumption(tenantId, mesaNumero, activeSucursalId).then((rows) => {
      if (!cancelled) {
        setMesaConsumos(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, mesaNumero, activeSucursalId]);

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

      if (localMode || !navigator.onLine) {
        const allFacturas = await readLocalMirror<any>(tenantId, "facturas").catch(() => []);
        factura = allFacturas.find((f: any) => f.id === facturaId);

        const allTenants = await readLocalMirror<any>(tenantId, "tenants").catch(() => []);
        tenant = allTenants.find((t: any) => t.id === tenantId);
      } else {
        try {
          const { data: factData, error: facturaError } = await insforgeClient.database
            .from("facturas")
            .select("*")
            .eq("id", facturaId)
            .eq("tenant_id", tenantId)
            .single();
          if (facturaError) throw facturaError;
          factura = factData;

          const { data: tenantData, error: tenantError } = await insforgeClient.database
            .from("tenants")
            .select("nombre_negocio, rnc, direccion, telefono, logo_url, logo_size_px, logo_offset_x, logo_offset_y")
            .eq("id", tenantId)
            .single();
          if (tenantError) throw tenantError;
          tenant = tenantData;
        } catch {
          const allFacturas = await readLocalMirror<any>(tenantId, "facturas").catch(() => []);
          factura = allFacturas.find((f: any) => f.id === facturaId);

          const allTenants = await readLocalMirror<any>(tenantId, "tenants").catch(() => []);
          tenant = allTenants.find((t: any) => t.id === tenantId);
        }
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
    void cacheLogoFromUrl(tenant.logo_url);
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

  async function openCashDrawerSafely() {
    const res = await openCashDrawerForSale();
    if (!res.ok && res.error) {
      console.warn("Apertura de caja:", res.error);
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

  /**
   * Emite una factura por grupo de persona. Cada factura obtiene su propio NCF (secuencia +1 por factura).
   * `mode === "all"`: todas las personas con ítems. `mode === n`: solo persona n.
   */
  async function createSplitInvoices(mode: "all" | number) {
    if (!tenantId) return;
    if (paymentMethod === "fiado" && !selectedCustomer) {
      alert("Para registrar una venta al fiado, es obligatorio seleccionar un cliente.");
      return;
    }
    // Ensure there is an open operational cycle before creating invoices
    const cycleOpen = await hasOpenCycle(tenantId, activeSucursalId);
    if (!cycleOpen) {
      alert("No hay un ciclo operativo abierto. Inicie un ciclo antes de cobrar.");
      return;
    }

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

    const normalizedClientRnc = clientRnc.trim() || selectedCustomer?.document_id?.trim() || "";
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

    const paidConsumoIds = new Set<string>();
    try {
      const deviceId = await getDeviceId();
      let nextFacturaNumber = await getNextFacturaNumber(tenantId);
      let cashDrawerOpened = false;
      const reservedNcfByPerson = new Map<number, Awaited<ReturnType<typeof resolveNcfForNewInvoiceLocalFirst>>>();

      if (ncfFiscalActive) {
        for (const personIndex of order) {
          let reservedNcf: Awaited<ReturnType<typeof resolveNcfForNewInvoiceLocalFirst>> = null;
          try {
            reservedNcf = await resolveNcfForNewInvoiceLocalFirst(tenantId, selectedNcfType);
          } catch (err) {
            alert(err instanceof Error ? err.message : "No se pudo reservar NCF fiscal. No se emitió la factura.");
            return;
          }
          if (!reservedNcf) {
            alert("No se pudo reservar NCF fiscal. No se emitió la factura.");
            return;
          }
          reservedNcfByPerson.set(personIndex, reservedNcf);
        }
      }

      for (const personIndex of order) {
        const consumosToInvoice = groups.get(personIndex)!;
        if (consumosToInvoice.length === 0) continue;

        const { facturaItems, subtotal, itbis, total } = await groupConsumosForFactura(
          tenantId,
          consumosToInvoice,
          itbisRate,
          activeSucursalId
        );

        const ncfPart = ncfFiscalActive ? reservedNcfByPerson.get(personIndex) ?? null : null;

        const localFacturaId = crypto.randomUUID();
        const now = new Date().toISOString();
        const insertRow: Record<string, unknown> = {
          id: localFacturaId,
          tenant_id: tenantId,
          sucursal_id: activeSucursalId,
          numero_factura: nextFacturaNumber++,
          mesa_numero: mesaNumero,
          estado: paymentMethod === "fiado" ? "pendiente" : "pagada",
          metodo_pago: paymentMethod,
          subtotal,
          itbis,
          propina: 0,
          total,
          items: facturaItems,
          notas: `Mesa ${mesaNumero} — Persona ${personIndex} de ${splitParts} (${consumosToInvoice.length} líneas)`,
          pagada_at: paymentMethod === "fiado" ? null : now,
          monto_recibido: null,
          cambio_devuelto: null,
          created_at: now,
          updated_at: now,
        };
        if (ncfPart) {
          insertRow.ncf = ncfPart.ncf;
          insertRow.ncf_tipo = ncfPart.ncf_tipo;
          if (ncfPart.reservationSource === "local_mirror") {
            insertRow[LOCAL_NCF_RESERVED_PAYLOAD_FLAG] = true;
          }
        }
        if (normalizedClientRnc !== "") {
          insertRow.cliente_rnc = normalizedClientRnc;
        }
        if (selectedCustomer) {
          insertRow.customer_id = selectedCustomer.id;
          insertRow.cliente_nombre = selectedCustomer.name;
          if (selectedCustomer.document_id?.trim()) {
            insertRow.cliente_rnc = selectedCustomer.document_id.trim();
          }
        }

        await enqueueLocalWrite({
          tenantId,
          tableName: "facturas",
          rowId: localFacturaId,
          op: "insert",
          payload: insertRow,
          deviceId,
        });

        if (paymentMethod === "fiado" && selectedCustomer) {
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
              customer_id: selectedCustomer.id,
              monto_total: total,
              monto_pagado: 0.00,
              fecha_emision: now,
              fecha_vencimiento: dueDate.toISOString(),
              estado: "pendiente",
              observacion: `Venta fiada parcial POS (Mesa ${mesaNumero}, Persona ${personIndex})`,
              created_at: now,
              updated_at: now,
            },
            deviceId,
          });
        }

        if (!cashDrawerOpened) {
          await openCashDrawerSafely();
          cashDrawerOpened = true;
        }

        if (ncfPart && !ncfPart.sequenceReservedAtomically) {
          await incrementTenantNcfSequence(tenantId, ncfPart.tipoCodigo, ncfPart.usedSequence);
        }

        await printFactura(localFacturaId, Number(insertRow.numero_factura));

        for (const consumo of consumosToInvoice) {
          await enqueueLocalWrite({
            tenantId,
            tableName: "consumos",
            rowId: consumo.id,
            op: "update",
            payload: {
              mesa_numero: consumo.mesa_numero ?? mesaNumero,
              estado: "pagado",
              factura_id: localFacturaId,
              updated_at: new Date().toISOString(),
            },
            deviceId,
          });
          paidConsumoIds.add(consumo.id);
        }
      }
    } finally {
      setCharging(false);
    }

    const updatedConsumos = mesaConsumos.filter((consumo) => !paidConsumoIds.has(consumo.id));
    setMesaConsumos(updatedConsumos);
    await onSettled?.(updatedConsumos);

    if (updatedConsumos.length === 0) {
      await cerrarComandasCocinaMesa(tenantId, mesaNumero, activeSucursalId);
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
    if (paymentMethod === "fiado" && !selectedCustomer) {
      alert("Para registrar una venta al fiado, es obligatorio seleccionar un cliente.");
      return;
    }
    const cycleOpen = await hasOpenCycle(tenantId, activeSucursalId);
    if (!cycleOpen) {
      alert("No hay un ciclo operativo abierto. Inicie un ciclo antes de cobrar.");
      return;
    }
    if (mesaConsumos.length === 0) {
      alert("No hay consumos pendientes para cobrar");
      return;
    }

    const normalizedClientRnc = clientRnc.trim() || selectedCustomer?.document_id?.trim() || "";
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
      itbisRate,
      activeSucursalId
    );
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
    if (ncfFiscalActive) {
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
    const now = new Date().toISOString();
    const facturaData: Record<string, unknown> = {
      id: localFacturaId,
      tenant_id: tenantId,
      sucursal_id: activeSucursalId,
      numero_factura: nextFacturaNumber,
      metodo_pago: paymentMethod,
      estado: paymentMethod === "fiado" ? "pendiente" : "pagada",
      subtotal,
      itbis,
      propina: 0,
      total,
      items: facturaItems,
      monto_recibido: cashReceived.amount,
      cambio_devuelto: cashReceived.change,
      pagada_at: paymentMethod === "fiado" ? null : now,
      created_at: now,
      updated_at: now,
      mesa_numero: mesaNumero,
      notas: `Mesa ${mesaNumero}`,
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
    if (selectedCustomer) {
      facturaData.customer_id = selectedCustomer.id;
      facturaData.cliente_nombre = selectedCustomer.name;
      if (selectedCustomer.document_id?.trim()) {
        facturaData.cliente_rnc = selectedCustomer.document_id.trim();
      }
    }

    await enqueueLocalWrite({
      tenantId,
      tableName: "facturas",
      rowId: localFacturaId,
      op: "insert",
      payload: facturaData,
      deviceId,
    });

    if (paymentMethod === "fiado" && selectedCustomer) {
      const cxcId = crypto.randomUUID();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days default
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
          customer_id: selectedCustomer.id,
          monto_total: total,
          monto_pagado: cashReceived.amount ?? 0.00,
          fecha_emision: now,
          fecha_vencimiento: dueDate.toISOString(),
          estado: "pendiente",
          observacion: `Registrada automáticamente desde POS (Mesa ${mesaNumero}, Factura #${nextFacturaNumber})`,
          created_at: now,
          updated_at: now,
        },
        deviceId,
      });
    }

    await openCashDrawerSafely();

    if (ncfPart && !ncfPart.sequenceReservedAtomically) {
      await incrementTenantNcfSequence(tenantId, ncfPart.tipoCodigo, ncfPart.usedSequence);
    }

    await printFactura(localFacturaId, nextFacturaNumber);

    for (const consumo of consumosToBill) {
      await enqueueLocalWrite({
        tenantId,
        tableName: "consumos",
        rowId: consumo.id,
        op: "update",
        payload: {
          mesa_numero: consumo.mesa_numero ?? mesaNumero,
          estado: "pagado",
          factura_id: localFacturaId,
          updated_at: new Date().toISOString(),
        },
        deviceId,
      });
    }

    const paidConsumoIds = new Set(consumosToBill.map((consumo) => consumo.id));
    const restantes = mesaConsumos.filter((consumo) => !paidConsumoIds.has(consumo.id));
    setMesaConsumos(restantes);
    await onSettled?.(restantes);

    if (restantes.length === 0) {
      await cerrarComandasCocinaMesa(tenantId, mesaNumero, activeSucursalId);
    }

    setCharging(false);
    setSplitMode(false);
    setPersonByConsumoId({});
    setCashReceivedInput("");

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-all duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mesa-close-title"
        aria-describedby="mesa-close-description"
        className="bg-[#121212] border border-zinc-800 rounded-[24px] shadow-[0px_0px_50px_rgba(255,144,109,0.15)] w-full max-w-5xl max-h-[95vh] md:max-h-[85vh] flex flex-col overflow-hidden relative"
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 right-0 w-80 h-40 bg-[radial-gradient(ellipse_at_top_right,rgba(255,144,109,0.08),transparent)] pointer-events-none rounded-[24px]" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900 shrink-0 relative z-10">
          <div>
            <h2 id="mesa-close-title" className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[22px] tracking-[0.5px] flex items-center gap-2">
              <span className="text-[#ff906d]">●</span> Cobrar Mesa {mesaNumero}
            </h2>
            {loading ? (
              <p id="mesa-close-description" className="text-zinc-500 text-[13px] mt-0.5 font-['Inter',sans-serif]">Cargando cuenta…</p>
            ) : mesaConsumos.length > 0 ? (
              <p id="mesa-close-description" className="text-zinc-400 text-[13px] mt-0.5 font-['Inter',sans-serif] flex items-center gap-1.5">
                <span className="px-2 py-0.5 text-[11px] font-bold bg-zinc-800 text-zinc-300 rounded-full">{mesaConsumos.length}</span>
                items pendientes
              </p>
            ) : (
              <p id="mesa-close-description" className="text-zinc-500 text-[13px] mt-0.5 font-['Inter',sans-serif]">Sin líneas pendientes</p>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de cobro de mesa"
            className="text-zinc-400 bg-transparent border-none cursor-pointer text-[26px] hover:text-white transition-colors leading-none w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-900"
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto md:overflow-hidden p-6 relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
          
          {/* Left Column: Items, Split breakdown, and Totals */}
          <div className="md:col-span-7 flex flex-col gap-4 md:overflow-hidden h-full">
            {/* Split Account Switcher */}
            {mesaConsumos.length > 1 && (
              <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 transition-all hover:border-zinc-800 shrink-0">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔄</span>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px]">Dividir cuenta</span>
                  </div>
                  <span className="text-zinc-500 text-[11px] font-['Inter',sans-serif]">
                    Asigná consumos a diferentes personas (facturas independientes)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSplitMode(!splitMode);
                    if (!splitMode) setPersonByConsumoId({});
                  }}
                  className={`px-5 py-2.5 rounded-xl font-['Space_Grotesk',sans-serif] font-bold text-[13px] tracking-wide transition-all shadow-md active:scale-95 ${
                    splitMode 
                      ? "bg-[#ff906d] text-[#5b1600] hover:bg-[#ff8059]" 
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                  }`}
                >
                  {splitMode ? "Activado" : "Activar"}
                </button>
              </div>
            )}

            {/* Split controls if splitMode is active */}
            {splitMode && mesaConsumos.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl p-4 flex flex-col gap-4 shrink-0">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 text-[13px] font-medium font-['Inter',sans-serif]">Personas:</span>
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
                      <button
                        type="button"
                        onClick={() => setSplitParts((p) => Math.max(2, p - 1))}
                        aria-label="Reducir número de personas"
                        className="w-[30px] h-[30px] bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center justify-center font-bold text-[16px] transition-colors active:scale-90"
                      >
                        −
                      </button>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] min-w-[36px] text-center">
                        {splitParts}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSplitParts((p) => Math.min(12, p + 1))}
                        aria-label="Aumentar número de personas"
                        className="w-[30px] h-[30px] bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center justify-center font-bold text-[16px] transition-colors active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={assignRoundRobinByItems}
                      className="px-3.5 py-2 bg-[#59ee50]/10 border border-[#59ee50]/30 hover:bg-[#59ee50]/20 text-[#59ee50] text-[12px] font-bold rounded-xl transition-all active:scale-95"
                    >
                      Repartir en ronda
                    </button>
                    <button
                      type="button"
                      onClick={() => assignAllToPerson(1)}
                      className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[12px] font-bold rounded-xl transition-all active:scale-95"
                    >
                      Todo a P1
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Items List Wrapper */}
            <div className="flex-1 flex flex-col min-h-0">
              <span className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[1px] mb-2 px-1">
                Detalle del Consumo
              </span>
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5 custom-scrollbar">
                {mesaConsumos.map((consumo) => {
                  const activePerson = personIndexForConsumo(consumo);
                  return (
                    <div
                      key={consumo.id}
                      className={`rounded-xl p-3 bg-zinc-900/40 border transition-all hover:bg-zinc-900/60 ${
                        splitMode 
                          ? "border-zinc-800/80 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" 
                          : "border-zinc-800/40 flex items-center justify-between"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-[28px] h-[28px] rounded-lg bg-zinc-800 border border-zinc-800 flex items-center justify-center font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] mt-0.5">
                          {consumo.cantidad}
                        </div>
                        <div>
                          <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[14px]">
                            {consumo.nombre}
                          </div>
                          <div className="text-zinc-500 text-[12px] font-['Inter',sans-serif] mt-0.5">
                            RD$ {Number(consumo.precio_unitario).toFixed(2)} c/u
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between lg:justify-end gap-4">
                        <div className="text-right shrink-0">
                          <span className="text-[#ff906d] font-['Space_Grotesk',sans-serif] font-bold text-[14px]">
                            RD$ {Number(consumo.subtotal).toFixed(2)}
                          </span>
                        </div>

                        {splitMode && (
                          <div className="flex items-center gap-1.5 shrink-0 bg-zinc-950 p-1 rounded-xl border border-zinc-800/60">
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
                                  className={`w-[28px] h-[28px] rounded-lg font-['Space_Grotesk',sans-serif] font-bold text-[12px] border-none cursor-pointer transition-all active:scale-90 ${
                                    on
                                      ? "bg-[#ff906d] text-[#5b1600] shadow-[0_0_8px_rgba(255,144,109,0.3)]"
                                      : "bg-zinc-800/60 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                                  }`}
                                >
                                  P{pn}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Split billing summary per person */}
            {splitMode && splitGroups != null && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-2 shrink-0">
                <span className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[11px] uppercase tracking-[1px] mb-1">
                  Resumen de División
                </span>
                <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {Array.from({ length: splitParts }, (_, i) => i + 1).map((p) => {
                    const rows = splitGroups.get(p) ?? [];
                    if (rows.length === 0) return null;
                    const st = rows.reduce((s, c) => s + Number(c.subtotal), 0);
                    const itb = st * itbisRate;
                    return (
                      <div key={p} className="flex justify-between items-center gap-4 bg-zinc-900/30 rounded-lg p-2 border border-zinc-900/50">
                        <span className="font-['Space_Grotesk',sans-serif] font-bold text-zinc-300 text-[12px]">
                          Persona {p} <span className="text-zinc-500 font-normal">({rows.length} items)</span>
                        </span>
                        <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[13px] text-right">
                          {RD(st + itb)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main Totals Card */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-3 shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,144,109,0.03),transparent)] pointer-events-none" />
              <div className="flex justify-between items-center relative z-10">
                <span className="font-['Inter',sans-serif] text-zinc-500 text-[13px]">Subtotal</span>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-zinc-300 text-[14px]">{RD(calcSubtotal)}</span>
              </div>
              <div className="flex justify-between items-center relative z-10">
                <span className="font-['Inter',sans-serif] text-zinc-500 text-[13px]">
                  {itbisRate > 0 ? "ITBIS (18%)" : "ITBIS (no incluido)"}
                </span>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-zinc-300 text-[14px]">{RD(calcItbis)}</span>
              </div>
              <div className="h-[1px] bg-zinc-900 my-1 relative z-10" />
              <div className="flex justify-between items-end relative z-10">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-zinc-400 text-[14px]">
                  {splitMode ? "TOTAL MESA" : "TOTAL COBRAR"}
                </span>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[24px] leading-none tracking-tight">
                  {RD(calcTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Customer, NCF, Payment Methods, Received and Actions */}
          <div className="md:col-span-5 flex flex-col gap-5 md:overflow-y-auto pr-1 h-full custom-scrollbar md:border-l md:border-zinc-900 md:pl-6">
            
            {/* Customer Selector Card */}
            <div className="flex flex-col gap-2 shrink-0">
              <span className="text-zinc-500 font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[1px] px-1">
                Cliente
              </span>
              <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl p-3">
                <CustomerSelect
                  tenantId={tenantId}
                  value={selectedCustomer}
                  onChange={(customer) => {
                    setSelectedCustomer(customer);
                    if (customer?.document_id) setClientRnc(customer.document_id);
                  }}
                  compact
                />
              </div>
            </div>

            {/* NCF Selection Cards */}
            {ncfFiscalActive && (
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
                      value={clientRnc}
                      onChange={(e) => setClientRnc(e.target.value)}
                      placeholder="RNC del cliente (obligatorio)"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-['Inter',sans-serif] text-white text-[13px] outline-none focus:border-[#ff906d]/50 transition-colors"
                    />
                  </div>
                )}
                <span className="font-['Inter',sans-serif] text-zinc-500 text-[11px] leading-relaxed">
                  ※ Si divides la cuenta, todas las facturas de esta ronda usarán este tipo de NCF.
                </span>
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
                    { value: "fiado" as const, label: "Fiado", icon: "🤝" },
                  ] as const
                ).map((method) => {
                  const active = paymentMethod === method.value;
                  return (
                    <button
                      type="button"
                      key={method.value}
                      onClick={() => setPaymentMethod(method.value)}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl cursor-pointer border transition-all active:scale-95 justify-start ${
                        active
                          ? "bg-[#ff906d] border-[#ff906d] text-[#5b1600] shadow-[0_4px_12px_rgba(255,144,109,0.2)] font-bold"
                          : "bg-zinc-900/50 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <span className="text-[18px]">{method.icon}</span>
                      <span className="font-['Space_Grotesk',sans-serif] text-[12px] uppercase tracking-[0.5px]">
                        {method.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cash Calculator Section */}
            {(paymentMethod === "efectivo" || paymentMethod === "fiado") && !splitMode && (
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
                      {RD(
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
            <div className="flex flex-col gap-3 mt-2 pb-2 shrink-0">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl py-3.5 font-['Space_Grotesk',sans-serif] font-bold text-zinc-400 text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:border-zinc-700 hover:text-white transition-all active:scale-95"
                >
                  Cancelar
                </button>

                {splitMode ? (
                  <button
                    type="button"
                    onClick={() => void createSplitInvoices("all")}
                    disabled={charging || loading || personsWithItems.length === 0}
                    className="flex-1 bg-[#ff906d] rounded-xl py-3.5 font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff8059] transition-all shadow-md active:scale-95"
                  >
                    {charging
                      ? "Procesando..."
                      : personsWithItems.length <= 1
                        ? "Emitir factura"
                        : `Emitir ${personsWithItems.length} facturas`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void createInvoice()}
                    disabled={charging || loading || mesaConsumos.length === 0}
                    className="flex-1 bg-[#59ee50] rounded-xl py-3.5 font-['Space_Grotesk',sans-serif] font-bold text-[#0e0e0e] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#4cd444] transition-all shadow-[0_4px_12px_rgba(89,238,80,0.2)] active:scale-95"
                  >
                    {charging ? "Procesando..." : "Confirmar Pago"}
                  </button>
                )}
              </div>

              {/* Individual Person Billing in Split Mode */}
              {splitMode && mesaConsumos.length > 0 && (
                <div className="flex flex-col gap-2 bg-zinc-900/10 border border-zinc-800/30 rounded-xl p-3 mt-1">
                  <span className="text-zinc-500 text-[10px] font-['Space_Grotesk',sans-serif] font-bold uppercase tracking-[1.5px] text-center block mb-1">
                    Cobrar solo una persona (factura individual)
                  </span>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {Array.from({ length: splitParts }, (_, i) => i + 1).map((p) => {
                      const n = (splitGroups?.get(p) ?? []).length;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => void createSplitInvoices(p)}
                          disabled={charging || loading || n === 0}
                          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-[11px] font-bold font-['Space_Grotesk',sans-serif] rounded-lg border border-zinc-700/40 cursor-pointer transition-all active:scale-90"
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
      </div>
    </div>
  );


}
