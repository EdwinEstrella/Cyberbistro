import { useState, useEffect, useRef } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";

interface ComandaItem {
  nombre: string;
  cantidad: number;
  precio: number;
  notas?: string;
}

interface Comanda {
  id: number;
  numero_comanda: number;
  mesa_id: number | null;
  mesa_numero: number;
  estado: "pendiente" | "en_preparacion" | "listo" | "entregado";
  items: ComandaItem[];
  notas: string | null;
  creado_por: string | null;
  created_at: string;
}

function printComanda(comanda: Comanda, empresaNombre: string) {
  const itemsHtml = comanda.items
    .map(
      (item) => `
      <tr>
        <td style="padding:2px 0">${item.cantidad}x ${item.nombre}</td>
        <td style="text-align:right;padding:2px 0">$${(item.precio * item.cantidad).toFixed(2)}</td>
      </tr>
      ${item.notas ? `<tr><td colspan="2" style="font-size:10px;color:#666;padding:0 0 6px 12px">↳ ${item.notas}</td></tr>` : ""}
    `
    )
    .join("");

  const total = comanda.items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: monospace; font-size: 12px; width: 72mm; margin: 0; }
    h1 { text-align: center; font-size: 15px; margin: 0 0 2px; }
    .center { text-align: center; }
    .divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    .total { font-weight: bold; font-size: 14px; }
  </style>
</head>
<body>
  <h1>${empresaNombre}</h1>
  <div class="center">COMANDA #${String(comanda.numero_comanda).padStart(4, "0")}</div>
  <div class="center">Mesa ${comanda.mesa_numero}</div>
  <hr class="divider">
  <table>${itemsHtml}</table>
  <hr class="divider">
  <table>
    <tr class="total">
      <td>TOTAL</td>
      <td style="text-align:right">$${total.toFixed(2)}</td>
    </tr>
  </table>
  ${comanda.notas ? `<hr class="divider"><div><b>Notas:</b> ${comanda.notas}</div>` : ""}
  <hr class="divider">
  <div class="center" style="font-size:10px">${new Date(comanda.created_at).toLocaleString("es-DO")}</div>
  <script>window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 500); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=340,height=600");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export function Cocina() {
  const [cocinaActiva, setCocinaActiva] = useState(true);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const empresaNombreRef = useRef("CyberBistro");

  useEffect(() => {
    async function load() {
      const [estadoRes, comandasRes, configRes] = await Promise.all([
        insforgeClient.database.from("cocina_estado").select("*").limit(1),
        insforgeClient.database
          .from("comandas")
          .select("*")
          .in("estado", ["pendiente", "en_preparacion", "listo"])
          .order("created_at", { ascending: true }),
        insforgeClient.database
          .from("configuracion")
          .select("valor")
          .eq("clave", "nombre_empresa")
          .limit(1),
      ]);

      if (!estadoRes.error && estadoRes.data?.[0]) {
        setCocinaActiva(estadoRes.data[0].activa);
      }
      if (!comandasRes.error && comandasRes.data) {
        setComandas(comandasRes.data as Comanda[]);
      }
      if (!configRes.error && configRes.data?.[0]) {
        empresaNombreRef.current = configRes.data[0].valor;
      }
      setLoading(false);
    }
    load();
  }, []);

  async function toggleCocina() {
    setToggling(true);
    const newActiva = !cocinaActiva;
    const { error } = await insforgeClient.database
      .from("cocina_estado")
      .update({ activa: newActiva, changed_at: new Date().toISOString() })
      .eq("id", 1);
    if (!error) setCocinaActiva(newActiva);
    setToggling(false);
  }

  async function advanceComanda(id: number, nextEstado: Comanda["estado"]) {
    const { error } = await insforgeClient.database
      .from("comandas")
      .update({ estado: nextEstado })
      .eq("id", id);
    if (!error) {
      if (nextEstado === "entregado") {
        setComandas((prev) => prev.filter((c) => c.id !== id));
      } else {
        setComandas((prev) =>
          prev.map((c) => (c.id === id ? { ...c, estado: nextEstado } : c))
        );
      }
    }
  }

  const columns = [
    {
      key: "pendiente" as const,
      title: "Pendientes",
      color: "#ff906d",
      next: "en_preparacion" as const,
      nextLabel: "Iniciar",
    },
    {
      key: "en_preparacion" as const,
      title: "En Preparación",
      color: "#ffd06d",
      next: "listo" as const,
      nextLabel: "Listo",
    },
    {
      key: "listo" as const,
      title: "Listos para entregar",
      color: "#59ee50",
      next: "entregado" as const,
      nextLabel: "Entregado",
    },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[16px]">
          Cargando comandas...
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-[32px] py-[14px] sm:py-[20px] gap-[12px] border-b border-[rgba(72,72,71,0.2)]">
        <div className="flex items-center gap-[16px]">
          <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[28px]">
            Cocina
          </h1>
          <div
            className="flex gap-[6px] items-center px-[12px] py-[4px] rounded-full"
            style={{
              backgroundColor: cocinaActiva
                ? "rgba(89,238,80,0.1)"
                : "rgba(255,113,108,0.1)",
            }}
          >
            <div
              className="rounded-full size-[8px]"
              style={{ backgroundColor: cocinaActiva ? "#59ee50" : "#ff716c" }}
            />
            <span
              className="font-['Space_Grotesk',sans-serif] text-[10px] tracking-[0.5px] uppercase font-bold"
              style={{ color: cocinaActiva ? "#59ee50" : "#ff716c" }}
            >
              {cocinaActiva ? "En Vivo" : "Cerrada"}
            </span>
          </div>
        </div>

        <button
          onClick={toggleCocina}
          disabled={toggling}
          className="flex gap-[8px] items-center px-[24px] py-[10px] rounded-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[14px] transition-all cursor-pointer border-none disabled:opacity-50"
          style={{
            backgroundColor: cocinaActiva
              ? "rgba(255,113,108,0.12)"
              : "rgba(89,238,80,0.12)",
            color: cocinaActiva ? "#ff716c" : "#59ee50",
          }}
        >
          {toggling
            ? "Actualizando..."
            : cocinaActiva
            ? "Cerrar Cocina"
            : "Abrir Cocina"}
        </button>
      </div>

      {!cocinaActiva && (
        <div className="mx-[32px] mt-[16px] bg-[rgba(255,113,108,0.05)] border border-[rgba(255,113,108,0.2)] rounded-[12px] px-[20px] py-[12px]">
          <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">
            La cocina está cerrada. No se pueden tomar nuevos pedidos desde las
            mesas.
          </span>
        </div>
      )}

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto flex gap-[16px] px-4 sm:px-[32px] py-[24px]">
        {columns.map((col) => {
          const items = comandas.filter((c) => c.estado === col.key);
          return (
            <div
              key={col.key}
              className="min-w-[220px] flex-1 flex flex-col bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] overflow-hidden"
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-[20px] py-[14px] border-b border-[rgba(72,72,71,0.15)]">
                <div className="flex items-center gap-[8px]">
                  <div
                    className="rounded-full size-[8px]"
                    style={{ backgroundColor: col.color }}
                  />
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px]">
                    {col.title}
                  </span>
                </div>
                <div
                  className="rounded-full size-[20px] flex items-center justify-center"
                  style={{ backgroundColor: `${col.color}20` }}
                >
                  <span
                    className="font-['Inter',sans-serif] font-bold text-[10px]"
                    style={{ color: col.color }}
                  >
                    {items.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-[10px] p-[14px]">
                {items.length === 0 && (
                  <div className="flex-1 flex items-center justify-center py-[40px]">
                    <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
                      Sin comandas
                    </span>
                  </div>
                )}
                {items.map((comanda) => (
                  <div
                    key={comanda.id}
                    className="bg-[#1a1a1a] rounded-[14px] border border-[rgba(72,72,71,0.2)] overflow-hidden"
                  >
                    {/* Card header */}
                    <div className="px-[14px] py-[10px] border-b border-[rgba(72,72,71,0.1)] flex items-center justify-between">
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d] text-[13px]">
                        #{String(comanda.numero_comanda).padStart(4, "0")}
                      </span>
                      <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px]">
                        Mesa {comanda.mesa_numero}
                      </span>
                    </div>

                    {/* Items */}
                    <div className="px-[14px] py-[10px] flex flex-col gap-[4px]">
                      {comanda.items.map((item, i) => (
                        <div key={i}>
                          <div className="flex justify-between gap-[8px]">
                            <span className="font-['Inter',sans-serif] text-white text-[12px]">
                              {item.cantidad}× {item.nombre}
                            </span>
                          </div>
                          {item.notas && (
                            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[10px] italic">
                              ↳ {item.notas}
                            </span>
                          )}
                        </div>
                      ))}
                      {comanda.notas && (
                        <div className="mt-[6px] bg-[rgba(255,144,109,0.05)] rounded-[8px] px-[10px] py-[6px]">
                          <span className="font-['Inter',sans-serif] text-[#ff906d] text-[10px]">
                            {comanda.notas}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="px-[14px] py-[10px] border-t border-[rgba(72,72,71,0.1)] flex gap-[8px]">
                      <button
                        onClick={() =>
                          printComanda(comanda, empresaNombreRef.current)
                        }
                        className="flex-1 bg-[#262626] rounded-[8px] py-[7px] font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.5px] uppercase font-bold cursor-pointer border-none hover:bg-[#2e2e2e] transition-colors"
                      >
                        Imprimir
                      </button>
                      <button
                        onClick={() => advanceComanda(comanda.id, col.next)}
                        className="flex-1 rounded-[8px] py-[7px] font-['Inter',sans-serif] text-[10px] tracking-[0.5px] uppercase font-bold cursor-pointer border-none transition-colors"
                        style={{
                          backgroundColor: `${col.color}20`,
                          color: col.color,
                        }}
                      >
                        {col.nextLabel}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
