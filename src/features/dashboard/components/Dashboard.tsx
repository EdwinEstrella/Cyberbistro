import { useState, useEffect, useRef } from "react";
import svgPaths from "../../../imports/svg-qgatbhef3k";
import { insforgeClient } from "../../../shared/lib/insforge";

interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
}

interface MesaBasic {
  id: number;
  numero: number;
  estado: string;
}

interface CartItem {
  plato: Plato;
  cantidad: number;
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
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [mesas, setMesas] = useState<MesaBasic[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [selectedMesa, setSelectedMesa] = useState<MesaBasic | null>(null);
  const [mesaOpen, setMesaOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitParts, setSplitParts] = useState(2);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [kitchenClosed, setKitchenClosed] = useState(false);
  const mesaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      insforgeClient.database
        .from("platos")
        .select("*")
        .eq("disponible", true)
        .order("categoria"),
      insforgeClient.database
        .from("mesas")
        .select("id,numero,estado")
        .eq("fusionada", false)
        .order("numero"),
    ]).then(([platosRes, mesasRes]) => {
      if (!platosRes.error && platosRes.data) setPlatos(platosRes.data as Plato[]);
      if (!mesasRes.error && mesasRes.data) setMesas(mesasRes.data as MesaBasic[]);
    });
  }, []);

  // Close mesa popup on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (mesaRef.current && !mesaRef.current.contains(e.target as Node)) {
        setMesaOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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

  async function sendToKitchen() {
    if (!selectedMesa || cart.length === 0) return;
    setSending(true);
    setKitchenClosed(false);

    // Split cart: items that go to kitchen vs items served directly
    const kitchenItems = cart.filter((i) => i.plato.va_a_cocina !== false);

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

      const { error } = await insforgeClient.database.from("comandas").insert([
        {
          mesa_id: selectedMesa.id,
          mesa_numero: selectedMesa.numero,
          estado: "pendiente",
          items,
          notas: null,
        },
      ]);

      if (error) {
        setSending(false);
        return;
      }
    }

    setCart([]);
    setSentOk(true);
    setTimeout(() => setSentOk(false), 3000);
    setSending(false);
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
    setSplitOpen(false);
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
          <div className="flex items-center justify-between">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px] uppercase">
              Pedido Actual
            </span>

            {/* Mesa selector */}
            <div className="relative" ref={mesaRef}>
              <button
                onClick={() => setMesaOpen((o) => !o)}
                className="flex items-center gap-[6px] rounded-[6px] px-[10px] py-[4px] cursor-pointer border-none transition-all"
                style={{
                  backgroundColor: selectedMesa
                    ? "#ff784d"
                    : "rgba(72,72,71,0.3)",
                }}
              >
                <span
                  className="font-['Inter',sans-serif] font-bold text-[11px] uppercase"
                  style={{
                    color: selectedMesa ? "#460f00" : "#adaaaa",
                  }}
                >
                  {selectedMesa
                    ? `Mesa ${String(selectedMesa.numero).padStart(2, "0")}`
                    : "Elegir mesa"}
                </span>
                <span
                  className="text-[8px]"
                  style={{ color: selectedMesa ? "#460f00" : "#adaaaa" }}
                >
                  ▾
                </span>
              </button>

              {mesaOpen && (
                <div className="absolute right-0 top-[110%] z-50 bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[12px] p-[12px] shadow-xl w-[220px]">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.8px] uppercase block mb-[10px]">
                    Seleccionar mesa
                  </span>
                  <div className="grid grid-cols-4 gap-[6px] max-h-[200px] overflow-y-auto">
                    {mesas.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedMesa(m);
                          setMesaOpen(false);
                        }}
                        className="rounded-[8px] py-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[13px] cursor-pointer border-none transition-all"
                        style={{
                          backgroundColor:
                            selectedMesa?.id === m.id
                              ? "#ff906d"
                              : m.estado === "ocupada"
                              ? "rgba(255,113,108,0.15)"
                              : "rgba(38,38,38,0.8)",
                          color:
                            selectedMesa?.id === m.id
                              ? "#460f00"
                              : m.estado === "ocupada"
                              ? "#ff716c"
                              : "white",
                          border:
                            m.estado === "libre"
                              ? "1px solid rgba(89,238,80,0.2)"
                              : "1px solid transparent",
                        }}
                      >
                        {String(m.numero).padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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

            {/* Separar cuenta button */}
            <button
              onClick={() => setSplitOpen(true)}
              className="w-full flex items-center justify-center gap-[8px] py-[10px] rounded-[10px] font-['Inter',sans-serif] font-bold text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none transition-all"
              style={{
                backgroundColor: "rgba(89,238,80,0.08)",
                border: "1px solid rgba(89,238,80,0.2)",
                color: "#59ee50",
              }}
            >
              ⊞ Separar Cuenta
            </button>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-[10px]">
              <button className="flex gap-[6px] items-center justify-center py-[12px] rounded-[12px] border-2 border-[#59ee50] bg-transparent cursor-pointer">
                <svg className="w-[13px] h-[12px]" fill="none" viewBox="0 0 15 13.5">
                  <path d={svgPaths.p18098d80} fill="#59EE50" />
                </svg>
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[11px] tracking-[1px] uppercase">
                  Imprimir
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
              disabled={!selectedMesa}
              className="w-full flex gap-[10px] items-center justify-center py-[14px] rounded-[12px] bg-[#ff906d] border-none cursor-pointer disabled:opacity-50 transition-opacity"
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

      {/* SEPARAR CUENTA MODAL */}
      {splitOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSplitOpen(false); }}
        >
          <div className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[20px] p-[28px] w-[380px] flex flex-col gap-[20px] shadow-xl">
            <div className="flex items-center justify-between">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px]">
                Separar Cuenta
              </span>
              <button
                onClick={() => setSplitOpen(false)}
                className="text-[#6b7280] bg-transparent border-none cursor-pointer text-[20px] hover:text-white transition-colors leading-none"
              >
                ×
              </button>
            </div>

            {/* Total */}
            <div className="bg-[#131313] rounded-[12px] p-[16px] flex justify-between items-center">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px] tracking-[0.8px] uppercase">
                Total de la cuenta
              </span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[18px]">
                {RD(total)}
              </span>
            </div>

            {/* Parts selector */}
            <div className="flex flex-col gap-[12px]">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.8px] uppercase">
                Dividir en
              </span>
              <div className="flex items-center justify-center gap-[16px]">
                <button
                  onClick={() => setSplitParts((p) => Math.max(2, p - 1))}
                  className="bg-[#262626] border border-[rgba(72,72,71,0.3)] rounded-[12px] size-[44px] flex items-center justify-center font-bold text-white text-[20px] cursor-pointer border-none transition-colors hover:bg-[#333]"
                >
                  −
                </button>
                <div className="text-center">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[36px]">
                    {splitParts}
                  </span>
                  <div className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] uppercase tracking-[0.5px]">
                    personas
                  </div>
                </div>
                <button
                  onClick={() => setSplitParts((p) => Math.min(12, p + 1))}
                  className="bg-[#262626] border border-[rgba(72,72,71,0.3)] rounded-[12px] size-[44px] flex items-center justify-center font-bold text-white text-[20px] cursor-pointer border-none transition-colors hover:bg-[#333]"
                >
                  +
                </button>
              </div>
            </div>

            {/* Per person amount */}
            <div
              className="rounded-[16px] p-[20px] flex flex-col items-center gap-[4px]"
              style={{ backgroundColor: "rgba(89,238,80,0.06)", border: "1px solid rgba(89,238,80,0.15)" }}
            >
              <span className="font-['Inter',sans-serif] text-[#59ee50] text-[11px] tracking-[0.8px] uppercase">
                Cada persona paga
              </span>
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#59ee50] text-[28px]">
                {RD(perPerson)}
              </span>
            </div>

            {/* Items breakdown */}
            <div className="bg-[#131313] rounded-[12px] p-[14px] flex flex-col gap-[6px]">
              {cart.map((item) => (
                <div key={item.plato.id} className="flex justify-between">
                  <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px]">
                    {item.cantidad}× {item.plato.nombre}
                  </span>
                  <span className="font-['Inter',sans-serif] text-white text-[12px]">
                    {RD((item.plato.precio * item.cantidad) / splitParts)} c/u
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-[10px]">
              <button
                onClick={printSplit}
                className="flex-1 bg-[#262626] border border-[rgba(72,72,71,0.3)] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:border-[rgba(255,144,109,0.3)] hover:text-white transition-colors"
              >
                Imprimir comprobantes
              </button>
              <button
                onClick={() => setSplitOpen(false)}
                className="flex-1 bg-[#ff906d] rounded-[12px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[12px] tracking-[0.5px] uppercase cursor-pointer border-none"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}