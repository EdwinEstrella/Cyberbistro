import { useState, useEffect, useRef } from "react";
import svgPaths from "../../../imports/svg-qgatbhef3k";
import { insforgeClient } from "../../../shared/lib/insforge";
import { MESAS_CONFIG } from "../../tables/config/mesas";
import { useAuth } from "../../../shared/hooks/useAuth";

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
  mesa_id: string;
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

const RD = (n: number) =>
  "RD$ " + n.toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const CAT_COLORS: Record<string, string> = {
  Hamburguesas: "#ff6aa0",
  Bebidas: "#59ee50",
  Sushi: "#ff906d",
  Pastas: "#ffd06d",
  Postres: "#ff784d",
  Entradas: "#adaaaa",
  General: "#6b7280",
};

function catColor(cat: string) {
  return CAT_COLORS[cat] ?? "#adaaaa";
}

const tickerItems = [
  { text: "Sistema de punto de venta CyberBistro OS", color: "#adaaaa" },
  { text: "● Cocina en vivo: activa", color: "#59ee50" },
  { text: "Seleccioná una mesa y agregá platos al pedido", color: "#adaaaa" },
  { text: "● Enviá a cocina con un clic", color: "#ff906d" },
];

export function Dashboard() {
  const { tenantId, loading: authLoading } = useAuth();
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
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "tarjeta" | "digital">("efectivo");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConsumosModal, setShowConsumosModal] = useState(false);
  const [showMesaDropdown, setShowMesaDropdown] = useState(false);
  const [mesaConsumos, setMesaConsumos] = useState<Consumo[]>([]);
  const [splitMode, setSplitMode] = useState(false);
  const [selectedConsumos, setSelectedConsumos] = useState<Set<string>>(new Set());
  const [splitParts, setSplitParts] = useState(2);
  const [isTakeout, setIsTakeout] = useState(false);

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
        .from("mesas_deuda")
        .select("*")
        .eq("tenant_id", tenantId),
    ]).then(([platosRes, estadosRes, deudaRes]) => {
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

      if (!deudaRes.error && deudaRes.data && deudaRes.data.length > 0) {
        // Actualizar deuda de mesas
        const deudaMap = new Map(deudaRes.data.map((d: any) => [d.id.toString(), d]));
        setMesas((prev) =>
          prev.map((m) => {
            const deuda = deudaMap.get(m.id);
            if (deuda) {
              return {
                ...m,
                deuda_pendiente: deuda.deuda_pendiente ?? 0,
                items_pendientes: deuda.items_pendientes ?? 0,
              };
            }
            return m;
          })
        );
      }
    });
  }, []);

  const categories = [
    "Todos",
    ...Array.from(new Set(platos.map((p) => p.categoria))),
  ];
  const filtered =
    activeCategory === "Todos"
      ? platos
      : platos.filter((p) => p.categoria === activeCategory);

  const subtotal = cart.reduce((s, i) => s + i.plato.precio * i.cantidad, 0);
  const itbis = subtotal * ITBIS;
  const total = subtotal + itbis;
  const perPerson = splitParts > 0 ? total / splitParts : total;

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
    if (mesa.estado === 'ocupada') return; // Ya está ocupada

    const { error } = await insforgeClient.database
      .from("mesas_estado")
      .upsert({ id: mesa.id, estado: 'ocupada' }, { onConflict: "id" });

    if (!error) {
      setMesas((prev) =>
        prev.map((m) =>
          m.id === mesa.id ? { ...m, estado: 'ocupada' } : m
        )
      );
    }
  }

  // Verificar si una mesa se puede liberar (sin deuda)
  async function canFreeMesa(mesa: MesaBasic): Promise<boolean> {
    // Obtener deuda actualizada de la vista
    const { data, error } = await insforgeClient.database
      .from("mesas_deuda")
      .select("deuda_pendiente")
      .eq("id", mesa.id)
      .single();

    if (error || !data) return true; // Si hay error, permitimos liberar
    return data.deuda_pendiente === 0;
  }

  // Liberar mesa (marcar como libre)
  async function freeMesa(mesa: MesaBasic) {
    const canFree = await canFreeMesa(mesa);

    if (!canFree) {
      alert(`⚠️ La mesa ${mesa.numero} tiene deuda pendiente. Cobrar antes de liberar.`);
      return;
    }

    const { error } = await insforgeClient.database
      .from("mesas_estado")
      .upsert({ id: mesa.id, estado: 'libre' }, { onConflict: "id" });

    if (!error) {
      setMesas((prev) =>
        prev.map((m) =>
          m.id === mesa.id ? { ...m, estado: 'libre', deuda_pendiente: 0, items_pendientes: 0 } : m
        )
      );
      if (selectedMesa?.id === mesa.id) {
        setSelectedMesa(null);
        setCart([]);
      }
    }
  }

  // Cargar consumos de una mesa
  async function loadTableConsumption(mesaId: string): Promise<Consumo[]> {
    const { data, error } = await insforgeClient.database
      .from("consumos")
      .select("*")
      .eq("mesa_id", mesaId)
      .neq("estado", "pagado")
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as Consumo[];
  }

  // Actualizar deuda de una mesa en el estado local
  async function refreshMesaDebt(mesaId: string) {
    const { data, error } = await insforgeClient.database
      .from("mesas_deuda")
      .select("*")
      .eq("id", mesaId)
      .single();

    if (!error && data) {
      setMesas((prev) =>
        prev.map((m) =>
          m.id === mesaId
            ? { ...m, deuda_pendiente: data.deuda_pendiente, items_pendientes: data.items_pendientes }
            : m
        )
      );
    }
  }

  // Funciones para cuentas separadas
  function toggleConsumoSelection(consumoId: string) {
    setSelectedConsumos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(consumoId)) {
        newSet.delete(consumoId);
      } else {
        newSet.add(consumoId);
      }
      return newSet;
    });
  }

  function selectAllConsumos() {
    setSelectedConsumos(new Set(mesaConsumos.map((c) => c.id)));
  }

  function clearConsumoSelection() {
    setSelectedConsumos(new Set());
  }

  async function createPartialInvoice() {
    if (!selectedMesa || selectedConsumos.size === 0) {
      alert("Selecciona al menos un item para cobrar");
      return;
    }

    setCharging(true);

    // Obtener los consumos seleccionados
    const consumosToInvoice = mesaConsumos.filter((c) =>
      selectedConsumos.has(c.id)
    );

    // Agrupar items por plato_id para la factura
    const groupedItems = consumosToInvoice.reduce((acc, consumo) => {
      const key = consumo.plato_id;
      if (!acc[key]) {
        acc[key] = {
          plato_id: consumo.plato_id,
          nombre: consumo.nombre,
          cantidad: 0,
          precio_unitario: consumo.precio_unitario,
          subtotal: 0,
        };
      }
      acc[key].cantidad += consumo.cantidad;
      acc[key].subtotal += consumo.subtotal;
      return acc;
    }, {} as Record<number, any>);

    const facturaItems = Object.values(groupedItems);

    // Calcular totales
    const subtotal = consumosToInvoice.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const itbis = subtotal * ITBIS;
    const total = subtotal + itbis;

    // Crear factura parcial
    const { data: factura, error: facturaError } = await insforgeClient.database
      .from("facturas")
      .insert([
        {
          tenant_id: tenantId,
          mesa_id: selectedMesa.id,
          mesa_numero: selectedMesa.numero,
          metodo_pago: paymentMethod,
          estado: "pagada",
          subtotal,
          itbis,
          propina: 0,
          total,
          items: facturaItems,
          notas: `Cuenta parcial (${selectedConsumos.size} items)`,
          pagada_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (facturaError || !factura) {
      console.error("Error al crear factura parcial:", facturaError);
      alert(`Error al procesar el pago: ${facturaError?.message || "Error desconocido"}`);
      setCharging(false);
      return;
    }

    // Imprimir factura térmica
    await printFactura(factura.id, factura.numero_factura);

    // Marcar SOLO los consumos seleccionados como pagados
    const consumoIds = Array.from(selectedConsumos);
    const { error: updateError } = await insforgeClient.database
      .from("consumos")
      .update({
        estado: "pagado",
        factura_id: factura.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", consumoIds);

    if (updateError) {
      console.error("Error al marcar consumos como pagados:", updateError);
    }

    // Limpiar selección actual
    const clearedIds = Array.from(selectedConsumos);
    setSelectedConsumos(new Set());

    // Recargar consumos restantes
    const updatedConsumos = await loadTableConsumption(selectedMesa.id);
    setMesaConsumos(updatedConsumos);
    await refreshMesaDebt(selectedMesa.id);

    setCharging(false);

    // Mostrar éxito y decidir si cerrar o seguir abierto
    if (updatedConsumos.length === 0) {
      // No quedan más items, cerrar todo
      setSplitMode(false);
      setShowPaymentModal(false);
      setChargeOk(true);
      setTimeout(() => setChargeOk(false), 3000);
    } else {
      // Quedan items pendientes, mantener modal abierto
      alert(`✅ Cuenta parcial cobrada (${clearedIds.length} items).\n\nQuedan ${updatedConsumos.length} items pendientes por cobrar.`);
    }
  }

  function splitConsumosEqually() {
    if (mesaConsumos.length === 0) return;

    const itemsPerPerson = Math.ceil(mesaConsumos.length / splitParts);

    // Distribuir items equitativamente
    const newSelection = new Set<string>();
    mesaConsumos.forEach((consumo, index) => {
      if (index < itemsPerPerson) {
        newSelection.add(consumo.id);
      }
    });

    setSelectedConsumos(newSelection);
  }

  // Calcular totales basados en selección
  function calculateTotals() {
    const consumosToBill = splitMode && selectedConsumos.size > 0
      ? mesaConsumos.filter((c) => selectedConsumos.has(c.id))
      : mesaConsumos;

    const subtotal = consumosToBill.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const itbis = subtotal * ITBIS;
    const total = subtotal + itbis;

    return { subtotal, itbis, total };
  }

  async function printFactura(facturaId: string, numeroFactura: number) {
    // Obtener detalles de la factura
    const { data: factura, error: facturaError } = await insforgeClient.database
      .from("facturas")
      .select("*")
      .eq("id", facturaId)
      .single();

    if (facturaError || !factura) {
      console.error("Error al obtener factura:", facturaError);
      return;
    }

    // Obtener información del tenant (negocio) usando tenant_id de la factura
    const { data: tenant } = await insforgeClient.database
      .from("tenants")
      .select("*")
      .eq("id", factura.tenant_id)
      .single();

    if (!tenant) {
      console.error("Error: No se encontró información del tenant");
      return;
    }

    const empresaNombre = tenant.nombre_negocio || "CyberBistro";
    const empresaRNC = tenant.rnc || "";
    const empresaDireccion = tenant.direccion || "";
    const empresaTelefono = tenant.telefono || "";

    // Generar HTML de la factura térmica
    const itemsHtml = factura.items
      .map((item: any) => `
        <tr>
          <td style="padding:2px 0">${item.cantidad}x ${item.nombre}</td>
          <td style="text-align:right;padding:2px 0">RD$ ${Number(item.precio_unitario).toFixed(2)}</td>
        </tr>
      `)
      .join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Factura #${String(numeroFactura).padStart(6, "0")}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      width: 76mm;
      margin: 0;
      padding: 2mm;
    }
    h1 { text-align: center; font-size: 14px; margin: 0 0 2px; font-weight: bold; }
    .center { text-align: center; }
    .divider { border: none; border-top: 1px dashed #000; margin: 4px 0; }
    .double-divider { border: none; border-top: 3px double #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    .header-row td { padding: 1px 0; font-size: 10px; }
    .total { font-weight: bold; font-size: 13px; }
    .footer { text-align: center; font-size: 9px; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>${empresaNombre}</h1>
  ${empresaRNC ? `<div class="center" style="font-size: 10px;">RNC: ${empresaRNC}</div>` : ""}
  ${empresaDireccion ? `<div class="center" style="font-size: 9px;">${empresaDireccion}</div>` : ""}
  ${empresaTelefono ? `<div class="center" style="font-size: 9px;">Tel: ${empresaTelefono}</div>` : ""}
  <div class="divider"></div>
  <table>
    <tr class="header-row">
      <td>Factura:</td>
      <td style="text-align:right;">#${String(numeroFactura).padStart(6, "0")}</td>
    </tr>
    <tr class="header-row">
      <td>Fecha:</td>
      <td style="text-align:right;">${new Date(factura.pagada_at || factura.created_at).toLocaleString("es-DO")}</td>
    </tr>
    <tr class="header-row">
      <td>Mesa:</td>
      <td style="text-align:right;">${factura.mesa_numero}</td>
    </tr>
    <tr class="header-row">
      <td>Método:</td>
      <td style="text-align:right;">${factura.metodo_pago.toUpperCase()}</td>
    </tr>
  </table>

  <div class="double-divider"></div>

  <table>
    <thead>
      <tr style="border-bottom: 1px solid #000;">
        <th style="text-align:left; padding: 4px 0;">CANT.</th>
        <th style="text-align:left; padding: 4px 0;">DESCRIPCIÓN</th>
        <th style="text-align:right; padding: 4px 0;">PRECIO</th>
      </tr>
    </thead>
    <tbody>
      ${factura.items.map((item: any) => `
        <tr>
          <td style="padding: 2px 0;">${item.cantidad}</td>
          <td style="padding: 2px 0;">${item.nombre}</td>
          <td style="text-align:right; padding: 2px 0;">RD$ ${Number(item.subtotal).toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="double-divider"></div>

  <table>
    <tr>
      <td>Subtotal:</td>
      <td style="text-align:right;">RD$ ${Number(factura.subtotal).toFixed(2)}</td>
    </tr>
    <tr>
      <td>ITBIS (18%):</td>
      <td style="text-align:right;">RD$ ${Number(factura.itbis).toFixed(2)}</td>
    </tr>
    <tr class="total">
      <td>TOTAL:</td>
      <td style="text-align:right;">RD$ ${Number(factura.total).toFixed(2)}</td>
    </tr>
  </table>

  ${factura.notas ? `<div class="divider"></div><div style="font-size: 10px;"><b>Nota:</b> ${factura.notas}</div>` : ""}

  <div class="double-divider"></div>

  <div class="footer">
    <div>¡Gracias por su visita!</div>
    <div style="margin-top: 2px;">Exonerase de valor según Ley 253-12</div>
  </div>

  <div class="divider"></div>
  <div class="center" style="font-size: 8px;">
    ${new Date().toLocaleString("es-DO")}
  </div>

  <script>window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 500); }</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=340,height=700");
    if (w) {
      w.document.write(html);
      w.document.close();
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
      const { data: estadoData } = await insforgeClient.database
        .from("cocina_estado")
        .select("activa")
        .limit(1);

      if (estadoData?.[0]?.activa === false) {
        setKitchenClosed(true);
        setSending(false);
        return;
      }

      const items = kitchenItems.map((i) => ({
        nombre: i.plato.nombre,
        cantidad: i.cantidad,
        precio: i.plato.precio,
      }));

      const { data, error } = await insforgeClient.database.from("comandas").insert([
        {
          mesa_id: selectedMesa.id,
          mesa_numero: selectedMesa.numero,
          estado: "pendiente",
          items,
          notas: null,
        },
      ]).select().single();

      if (error) {
        console.error("Error al crear comanda:", error);
        alert(`Error al crear comanda: ${error.message}`);
        setSending(false);
        return;
      }

      comandaId = data?.id || null;
    }

    // Crear consumos para TODOS los items (cocina + directo)
    const consumosToInsert = [
      // Items de cocina
      ...kitchenItems.map((i) => ({
        mesa_id: selectedMesa.id,
        comanda_id: comandaId,
        plato_id: i.plato.id,
        nombre: i.plato.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.plato.precio,
        subtotal: i.plato.precio * i.cantidad,
        tipo: 'cocina' as const,
        estado: 'enviado_cocina' as const,
      })),
      // Items directos (bebidas, etc)
      ...directItems.map((i) => ({
        mesa_id: selectedMesa.id,
        comanda_id: null,
        plato_id: i.plato.id,
        nombre: i.plato.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.plato.precio,
        subtotal: i.plato.precio * i.cantidad,
        tipo: 'directo' as const,
        estado: 'entregado' as const, // Los items directos ya están entregados
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

    // Actualizar deuda de la mesa
    await refreshMesaDebt(selectedMesa.id);
  }

  async function openPaymentModal() {
    if (selectedMesa) {
      // Hay mesa seleccionada, abrir modal de pago normal
      // Cargar consumos de la mesa
      const consumos = await loadTableConsumption(selectedMesa.id);
      setMesaConsumos(consumos);
      setShowPaymentModal(true);
      return;
    }

    // No hay mesa seleccionada
    if (isTakeout) {
      // Modo para llevar activado
      if (cart.length === 0) {
        alert("No hay items en el carrito para cobrar.");
        return;
      }
      // Abrir modal para llevar
      setShowPaymentModal(true);
      return;
    }

    // No hay mesa seleccionada y no es takeout
    alert("⚠️ No hay ninguna mesa seleccionada.\n\n• Seleccioná una mesa, o\n• Activá 'Para llevar' para cobrar sin mesa");
  }

  async function createInvoice() {
    let consumosToBill: typeof mesaConsumos | typeof cart;

    if (selectedMesa) {
      // Cobrar con mesa seleccionada - usar consumos
      if (mesaConsumos.length === 0) {
        alert("No hay consumos pendientes para cobrar");
        return;
      }
      consumosToBill = mesaConsumos;
    } else {
      // Cobrar sin mesa - usar carrito actual
      if (cart.length === 0) {
        alert("No hay items para cobrar");
        return;
      }

      // Convertir cart a formato similar a consumos
      consumosToBill = cart.map((item) => ({
        id: crypto.randomUUID(), // ID temporal
        mesa_id: null,
        comanda_id: null,
        plato_id: item.plato.id,
        nombre: item.plato.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.plato.precio,
        subtotal: item.plato.precio * item.cantidad,
        tipo: item.plato.va_a_cocina !== false ? 'cocina' : 'directo',
        estado: 'pagado' as const,
        factura_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }

    setCharging(true);

    // Agrupar items por plato_id para la factura
    const groupedItems = consumosToBill.reduce((acc, consumo) => {
      const key = consumo.plato_id;
      if (!acc[key]) {
        acc[key] = {
          plato_id: consumo.plato_id,
          nombre: consumo.nombre,
          cantidad: 0,
          precio_unitario: consumo.precio_unitario,
          subtotal: 0,
        };
      }
      acc[key].cantidad += consumo.cantidad;
      acc[key].subtotal += consumo.subtotal;
      return acc;
    }, {} as Record<number, any>);

    const facturaItems = Object.values(groupedItems);

    // Calcular totales
    const subtotal = consumosToBill.reduce((sum, c) => sum + Number(c.subtotal), 0);
    const itbis = subtotal * ITBIS;
    const total = subtotal + itbis;

    // Crear factura (con o sin mesa según corresponda)
    const facturaData: any = {
      tenant_id: tenantId,
      metodo_pago: paymentMethod,
      estado: "pagada",
      subtotal,
      itbis,
      propina: 0,
      total,
      items: facturaItems,
      pagada_at: new Date().toISOString(),
    };

    // Agregar info de mesa solo si existe
    if (selectedMesa) {
      facturaData.mesa_id = selectedMesa.id;
      facturaData.mesa_numero = selectedMesa.numero;
      facturaData.notas = `Mesa ${selectedMesa.numero}`;
    } else {
      facturaData.mesa_id = null;
      facturaData.mesa_numero = null;
      facturaData.notas = "Para llevar";
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

    // Imprimir factura térmica
    await printFactura(factura.id, factura.numero_factura);

    // Si había mesa seleccionada, marcar consumos como pagados
    if (selectedMesa) {
      const consumoIds = consumosToBill.map((c) => c.id);
      const { error: updateError } = await insforgeClient.database
        .from("consumos")
        .update({
          estado: "pagado",
          factura_id: factura.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", consumoIds);

      if (updateError) {
        console.error("Error al marcar consumos como pagados:", updateError);
      }

      await refreshMesaDebt(selectedMesa.id);
    }

    // Limpiar y mostrar éxito
    setCart([]);
    setMesaConsumos([]);
    setChargeOk(true);
    setTimeout(() => setChargeOk(false), 3000);
    setShowPaymentModal(false);
    setCharging(false);
  }

  function printSplit() {
    const rows = cart
      .map(
        (i) =>
          `<tr><td>${i.cantidad}× ${i.plato.nombre}</td><td style="text-align:right">RD$ ${(
            (i.plato.precio * i.cantidad) /
            splitParts
          ).toFixed(2)}</td></tr>`
      )
      .join("");

    const pages = Array.from({ length: splitParts }, (_, idx) => `
      <div style="font-family:monospace;font-size:12px;width:72mm;padding:4mm;${idx > 0 ? "page-break-before:always" : ""}">
        <div style="text-align:center;font-weight:bold;font-size:14px">SEPARAR CUENTA</div>
        <div style="text-align:center">Mesa ${selectedMesa?.numero ?? "?"}</div>
        <div style="text-align:center">Persona ${idx + 1} de ${splitParts}</div>
        <hr style="border-top:1px dashed;border-bottom:none">
        <table style="width:100%">${rows}</table>
        <hr style="border-top:1px dashed;border-bottom:none">
        <table style="width:100%">
          <tr style="font-weight:bold"><td>TOTAL</td><td style="text-align:right">RD$ ${perPerson.toFixed(2)}</td></tr>
        </table>
      </div>
    `).join("");

    const w = window.open("", "_blank", "width=340,height=600");
    if (w) {
      w.document.write(
        `<!DOCTYPE html><html><head><style>@page{size:80mm auto;margin:0}body{margin:0}</style></head><body>${pages}<script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script></body></html>`
      );
      w.document.close();
    }
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

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0e0e0e]">
        <div className="text-center">
          <div className="text-[#ff7346] font-['Space_Grotesk',sans-serif] text-[20px] mb-4">
            No autenticado
          </div>
          <div className="text-[#adaaaa] font-['Inter',sans-serif] text-[14px]">
            Por favor inicia sesión
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-[24px] lg:gap-[32px] p-4 sm:p-[32px] flex-1 overflow-y-auto lg:overflow-hidden min-h-0">
      {/* LEFT: Menu */}
      <div className="lg:flex-1 flex flex-col gap-[24px] min-w-0 lg:overflow-auto">
        {/* Ticker */}
        <div className="bg-[#131313] py-[8px] border-b border-[rgba(255,144,109,0.1)] overflow-hidden shrink-0">
          <div className="flex gap-[48px]">
            {tickerItems.map((item, i) => (
              <span
                key={i}
                className="font-['Space_Grotesk',sans-serif] text-[10px] tracking-[2px] uppercase whitespace-nowrap"
                style={{ color: item.color }}
              >
                {item.text}
              </span>
            ))}
          </div>
        </div>

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
        ) : (
          <div className="grid gap-[16px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {filtered.map((plato) => {
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
                      {RD(plato.precio)}
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
                              await markMesaAsOccupied(mesa);
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
              className={`flex items-center gap-[8px] rounded-[6px] px-[10px] py-[4px] cursor-pointer border-none transition-all ${
                isTakeout ? "bg-[#59ee50]" : "bg-[rgba(72,72,71,0.3)]"
              }`}
            >
              <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 15 13.5">
                <path
                  d={svgPaths.p18098d80}
                  fill={isTakeout ? "#0e0e0e" : "#adaaaa"}
                />
              </svg>
              <span
                className={`font-['Inter',sans-serif] font-bold text-[10px] uppercase ${
                  isTakeout ? "text-[#0e0e0e]" : "text-[#adaaaa]"
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

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-[20px] flex flex-col gap-[16px] min-h-0">
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-[32px] gap-[8px]">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] text-center">
                Seleccioná una mesa y hacé clic en los platos para agregarlos.
              </span>
            </div>
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
                      {RD(item.plato.precio * item.cantidad)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals & Actions */}
        {cart.length > 0 && (
          <div className="backdrop-blur-[6px] bg-[rgba(38,38,38,0.8)] border-t border-[rgba(72,72,71,0.2)] rounded-b-[16px] px-[20px] py-[20px] flex flex-col gap-[16px] shrink-0">
            {/* Totals */}
            <div className="flex flex-col gap-[6px]">
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[1px] uppercase">
                  Subtotal
                </span>
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[1px] uppercase">
                  {RD(subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[1px] uppercase">
                  ITBIS (18%)
                </span>
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[1px] uppercase">
                  {RD(itbis)}
                </span>
              </div>
              <div className="border-t border-[rgba(72,72,71,0.15)] pt-[8px] flex items-center justify-between">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] uppercase">
                  Total
                </span>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[20px]">
                  {RD(total)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-[10px]">
              <button
                onClick={() => window.location.hash = "/billing"}
                className="flex gap-[6px] items-center justify-center py-[12px] rounded-[12px] border-2 border-[#59ee50] bg-transparent cursor-pointer hover:bg-[rgba(89,238,80,0.1)] transition-colors"
              >
                <svg className="w-[13px] h-[12px]" fill="none" viewBox="0 0 15 13.5">
                  <path d={svgPaths.p18098d80} fill="#59EE50" />
                </svg>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[11px] tracking-[1px] uppercase">
                  Venta
                </span>
              </button>
              <button
                onClick={sendToKitchen}
                disabled={sending || !selectedMesa}
                className="flex gap-[6px] items-center justify-center py-[12px] rounded-[12px] border-2 bg-transparent cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  borderColor: selectedMesa ? "#59ee50" : "rgba(72,72,71,0.4)",
                  color: selectedMesa ? "#59ee50" : "#6b7280",
                }}
              >
                <svg className="w-[10px] h-[13px]" fill="none" viewBox="0 0 11.25 15">
                  <path d={svgPaths.p30f20700} fill={selectedMesa ? "#59EE50" : "#6B7280"} />
                </svg>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[11px] tracking-[1px] uppercase">
                  {sending ? "Enviando..." : "Cocina"}
                </span>
              </button>
            </div>

            <button
              onClick={openPaymentModal}
              className="w-full flex gap-[10px] items-center justify-center py-[14px] rounded-[12px] bg-[#ff906d] border-none cursor-pointer transition-opacity hover:bg-[#ff784d]"
            >
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[14px] tracking-[2px] uppercase">
                Cobrar {RD(total)}
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
                Carrito vacío
              </span>
            </div>
          </div>
        )}
      </div>

      {/* PAGO MODAL */}
      {showPaymentModal && selectedMesa && (() => {
        const { subtotal: calcSubtotal, itbis: calcItbis, total: calcTotal } = calculateTotals();
        return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPaymentModal(false); }}
        >
          <div className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[20px] p-[28px] w-[700px] max-h-[90vh] overflow-y-auto flex flex-col gap-[20px] shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px]">
                  Cobrar Mesa {selectedMesa.numero}
                </span>
                {mesaConsumos.length > 0 && (
                  <div className="text-[#adaaaa] text-[12px] mt-1">
                    {mesaConsumos.length} items pendientes
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSplitMode(false);
                  setSelectedConsumos(new Set());
                }}
                className="text-[#6b7280] bg-transparent border-none cursor-pointer text-[20px] hover:text-white transition-colors leading-none"
              >
                ×
              </button>
            </div>

            {/* Toggle división de cuenta */}
            {mesaConsumos.length > 1 && (
              <div className="flex items-center justify-between bg-[#262626] rounded-[12px] p-[12px]">
                <div className="flex items-center gap-[8px]">
                  <span className="text-white text-[14px]">🔄</span>
                  <span className="font-['Inter',sans-serif] text-white text-[13px]">
                    Dividir cuenta
                  </span>
                  <span className="text-[#adaaaa] text-[11px]">(solo si el cliente lo solicita)</span>
                </div>
                <button
                  onClick={() => {
                    setSplitMode(!splitMode);
                    if (!splitMode) {
                      setSelectedConsumos(new Set());
                    }
                  }}
                  className={`px-4 py-2 rounded-[8px] font-['Inter',sans-serif] font-bold text-[12px] transition-all ${
                    splitMode
                      ? "bg-[#ff906d] text-[#5b1600]"
                      : "bg-[#383838] text-[#adaaaa]"
                  }`}
                >
                  {splitMode ? "Activado" : "Activar"}
                </button>
              </div>
            )}

            {/* Controles de división */}
            {splitMode && mesaConsumos.length > 0 && (
              <div className="bg-[#262626] rounded-[12px] p-[12px] flex flex-col gap-[12px]">
                <div className="flex items-center justify-between">
                  <span className="font-['Inter',sans-serif] text-white text-[13px]">
                    Selecciona items que va a pagar esta persona
                  </span>
                  <div className="flex gap-[8px]">
                    <button
                      onClick={selectAllConsumos}
                      className="px-3 py-1 bg-[#383838] hover:bg-[#444] text-white text-[11px] rounded-[6px] transition-colors"
                    >
                      Todos
                    </button>
                    <button
                      onClick={clearConsumoSelection}
                      className="px-3 py-1 bg-[#383838] hover:bg-[#444] text-white text-[11px] rounded-[6px] transition-colors"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-[12px]">
                  <span className="text-[#adaaaa] text-[12px]">Dividir entre:</span>
                  <div className="flex items-center gap-[8px]">
                    <button
                      onClick={() => setSplitParts((p) => Math.max(2, p - 1))}
                      className="w-[32px] h-[32px] bg-[#383838] hover:bg-[#444] text-white rounded-[8px] flex items-center justify-center font-bold text-[14px] transition-colors"
                    >
                      −
                    </button>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] min-w-[40px] text-center">
                      {splitParts}
                    </span>
                    <button
                      onClick={() => setSplitParts((p) => Math.min(12, p + 1))}
                      className="w-[32px] h-[32px] bg-[#383838] hover:bg-[#444] text-white rounded-[8px] flex items-center justify-center font-bold text-[14px] transition-colors"
                    >
                      +
                    </button>
                    <span className="text-[#adaaaa] text-[12px]">personas</span>
                  </div>
                  <button
                    onClick={splitConsumosEqually}
                    className="ml-auto px-4 py-2 bg-[#59ee50] hover:bg-[#4cd444] text-[#0e0e0e] text-[12px] font-bold rounded-[8px] transition-colors"
                  >
                    Dividir equitativamente
                  </button>
                </div>
              </div>
            )}

            {/* Lista de consumos (para seleccionar en modo split) */}
            {splitMode && mesaConsumos.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto flex flex-col gap-[6px]">
                {mesaConsumos.map((consumo) => {
                  const isSelected = selectedConsumos.has(consumo.id);
                  return (
                    <div
                      key={consumo.id}
                      onClick={() => toggleConsumoSelection(consumo.id)}
                      className={`rounded-[8px] p-[10px] flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#ff906d]/20 border-2 border-[#ff906d]"
                          : "bg-[#262626] border-2 border-transparent hover:border-[rgba(255,144,109,0.3)]"
                      }`}
                    >
                      <div className="flex items-center gap-[10px]">
                        <div
                          className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-[#ff906d] border-[#ff906d]"
                              : "border-[#6b7280]"
                          }`}
                        >
                          {isSelected && <span className="text-[#5b1600] text-[12px] font-bold">✓</span>}
                        </div>
                        <div>
                          <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px]">
                            {consumo.cantidad}× {consumo.nombre}
                          </div>
                          <div className="text-[#adaaaa] text-[11px]">
                            RD$ {Number(consumo.precio_unitario).toFixed(2)} c/u
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px]">
                          RD$ {Number(consumo.subtotal).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Totales */}
            <div className="bg-[#131313] rounded-[12px] p-[14px] flex flex-col gap-[8px]">
              {splitMode && selectedConsumos.size > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px]">
                      Seleccionado ({selectedConsumos.size} items)
                    </span>
                    <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px]">
                      {RD(mesaConsumos.filter((c) => selectedConsumos.has(c.id)).reduce((sum, c) => sum + Number(c.subtotal), 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                      Restante ({mesaConsumos.length - selectedConsumos.size} items)
                    </span>
                    <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                      {RD(mesaConsumos.filter((c) => !selectedConsumos.has(c.id)).reduce((sum, c) => sum + Number(c.subtotal), 0))}
                    </span>
                  </div>
                  <div className="border-t border-[rgba(72,72,71,0.3)] my-[4px]"></div>
                </>
              )}

              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                  Subtotal
                </span>
                <span className="font-['Inter',sans-serif] text-white text-[11px]">
                  {RD(calcSubtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                  ITBIS (18%)
                </span>
                <span className="font-['Inter',sans-serif] text-white text-[11px]">
                  {RD(calcItbis)}
                </span>
              </div>
              <div className="border-t border-[rgba(72,72,71,0.15)] pt-[6px] flex justify-between">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px]">
                  {splitMode && selectedConsumos.size > 0 ? "TOTAL PARCIAL" : "TOTAL"}
                </span>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[14px]">
                  {RD(calcTotal)}
                </span>
              </div>
            </div>

            {/* Método de pago */}
            <div className="flex flex-col gap-[12px]">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                Método de pago
              </span>
              <div className="grid grid-cols-3 gap-[8px]">
                {[
                  { value: "efectivo" as const, label: "Efectivo", icon: "💵" },
                  { value: "tarjeta" as const, label: "Tarjeta", icon: "💳" },
                  { value: "digital" as const, label: "Digital", icon: "📱" },
                ].map((method) => (
                  <button
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

            {/* Actions */}
            <div className="flex gap-[10px]">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSplitMode(false);
                  setSelectedConsumos(new Set());
                }}
                className="flex-1 bg-[#262626] border border-[rgba(72,72,71,0.3)] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:border-[rgba(255,144,109,0.3)] hover:text-white transition-colors"
              >
                Cancelar
              </button>

              {splitMode && selectedConsumos.size > 0 ? (
                <button
                  onClick={createPartialInvoice}
                  disabled={charging}
                  className="flex-1 bg-[#ff906d] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#5b1600] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 hover:bg-[#ff784d] transition-opacity"
                >
                  {charging ? "Procesando..." : `Cobrar ${selectedConsumos.size} items`}
                </button>
              ) : (
                <button
                  onClick={createInvoice}
                  disabled={charging}
                  className="flex-1 bg-[#59ee50] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#0e0e0e] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none disabled:opacity-50 transition-opacity"
                >
                  {charging ? "Procesando..." : "Confirmar Pago"}
                </button>
              )}
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
                    Total pendiente: RD$ {mesaConsumos.reduce((sum, c) => sum + Number(c.subtotal), 0).toFixed(2)}
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
                          className={`text-[10px] px-2 py-0.5 rounded ${
                            consumo.tipo === "cocina"
                              ? "bg-[#ff906d]/20 text-[#ff906d]"
                              : "bg-[#59ee50]/20 text-[#59ee50]"
                          }`}
                        >
                          {consumo.tipo === "cocina" ? "🍳 Cocina" : "🥤 Directo"}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded ${
                            consumo.estado === "pagado"
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
                        RD$ {Number(consumo.subtotal).toFixed(2)}
                      </div>
                      <div className="text-[#adaaaa] text-[11px]">
                        RD$ {Number(consumo.precio_unitario).toFixed(2)} c/u
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