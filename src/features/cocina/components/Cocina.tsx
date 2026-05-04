import { useState, useEffect, useRef, useCallback } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useCocinaRealtimeSync } from "../useCocinaRealtimeSync";
import { buildComandaReceiptHtml, type TenantReceiptInfo } from "../../../shared/lib/receiptTemplates";
import { getThermalPrintSettings } from "../../../shared/lib/thermalStorage";
import { printThermalHtml } from "../../../shared/lib/thermalPrint";

interface ComandaItem {
  nombre: string;
  cantidad: number;
  precio: number;
  /** Categoría del plato (p. ej. Bebidas, Entradas); comandas antiguas pueden no tenerla */
  categoria?: string;
  notas?: string;
}

interface Comanda {
  id: string;
  numero_comanda: number;
  mesa_id: string | null;
  mesa_numero: number | null;
  estado: "pendiente" | "en_preparacion" | "listo" | "entregado";
  items: ComandaItem[];
  notas: string | null;
  creado_por: string | null;
  created_at: string;
}

export function Cocina() {
  const { tenantId, loading: authLoading } = useAuth();
  const [cocinaActiva, setCocinaActiva] = useState(true);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const tenantReceiptRef = useRef<TenantReceiptInfo | null>(null);

  const reloadComandas = useCallback(async () => {
    if (!tenantId) return;
    const { data, error } = await insforgeClient.database
      .from("comandas")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("estado", ["pendiente", "en_preparacion", "listo"])
      .order("created_at", { ascending: true });
    if (!error && data) {
      setComandas(data as Comanda[]);
    }
  }, [tenantId]);

  const applyCocinaActivaFromRealtime = useCallback((activa: boolean) => {
    setCocinaActiva(activa);
  }, []);

  useCocinaRealtimeSync(tenantId, reloadComandas, applyCocinaActivaFromRealtime);

  useEffect(() => {
    if (authLoading) return;
    if (!tenantId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      const [estadoRes, comandasRes, tenantRes] = await Promise.all([
        insforgeClient.database
          .from("cocina_estado")
          .select("*")
          .eq("tenant_id", tenantId)
          .limit(1),
        insforgeClient.database
          .from("comandas")
          .select("*")
          .eq("tenant_id", tenantId)
          .in("estado", ["pendiente", "en_preparacion", "listo"])
          .order("created_at", { ascending: true }),
        insforgeClient.database
          .from("tenants")
          .select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda")
          .eq("id", tenantId)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      if (!estadoRes.error && estadoRes.data?.[0]) {
        setCocinaActiva(estadoRes.data[0].activa);
      }
      if (!comandasRes.error && comandasRes.data) {
        setComandas(comandasRes.data as Comanda[]);
      }
      if (!tenantRes.error && tenantRes.data) {
        const t = tenantRes.data as {
          nombre_negocio: string | null;
          rnc: string | null;
          direccion: string | null;
          telefono: string | null;
          logo_url: string | null;
          moneda?: string | null;
        };
        tenantReceiptRef.current = {
          nombre_negocio: t.nombre_negocio,
          rnc: t.rnc,
          direccion: t.direccion,
          telefono: t.telefono,
          logo_url: t.logo_url,
          moneda: t.moneda ?? null,
        };
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantId]);

  async function toggleCocina() {
    if (!tenantId) return;
    setToggling(true);
    const newActiva = !cocinaActiva;

    const { data: existing, error: selectError } = await insforgeClient.database
      .from("cocina_estado")
      .select("*")
      .eq("tenant_id", tenantId)
      .limit(1);

    if (selectError) {
      console.error("Error checking cocina_estado:", selectError);
      alert("Error al verificar estado de cocina: " + selectError.message);
      setToggling(false);
      return;
    }

    let error;
    if (existing && existing.length > 0) {
      const result = await insforgeClient.database
        .from("cocina_estado")
        .update({ activa: newActiva, changed_at: new Date().toISOString() })
        .eq("id", existing[0].id);
      error = result.error;
    } else {
      const result = await insforgeClient.database
        .from("cocina_estado")
        .insert({
          activa: newActiva,
          changed_at: new Date().toISOString(),
          tenant_id: tenantId,
        });
      error = result.error;
    }

    if (error) {
      console.error("Error updating cocina_estado:", error);
      alert("Error al cambiar estado de cocina: " + error.message);
    } else {
      setCocinaActiva(newActiva);
    }
    setToggling(false);
  }

  async function advanceComanda(id: string, nextEstado: Comanda["estado"]) {
    const { error } = await insforgeClient.database
      .from("comandas")
      .update({ estado: nextEstado })
      .eq("id", id);
    if (!error) {
      if (nextEstado === "listo" && tenantId) {
        await insforgeClient.database
          .from("consumos")
          .update({ estado: "listo", updated_at: new Date().toISOString() })
          .eq("comanda_id", id)
          .eq("tenant_id", tenantId)
          .eq("estado", "enviado_cocina");
      }
      if (nextEstado === "entregado") {
        setComandas((prev) => prev.filter((c) => c.id !== id));
      } else {
        setComandas((prev) =>
          prev.map((c) => (c.id === id ? { ...c, estado: nextEstado } : c))
        );
      }
    }
  }

  const printComandaThermal = useCallback(
    async (comanda: Comanda) => {
      let tenant = tenantReceiptRef.current;
      if (!tenant && tenantId) {
        const { data } = await insforgeClient.database
          .from("tenants")
          .select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda")
          .eq("id", tenantId)
          .maybeSingle();
        if (data) {
          const t = data as {
            nombre_negocio: string | null;
            rnc: string | null;
            direccion: string | null;
            telefono: string | null;
            logo_url: string | null;
            moneda?: string | null;
          };
          tenant = {
            nombre_negocio: t.nombre_negocio,
            rnc: t.rnc,
            direccion: t.direccion,
            telefono: t.telefono,
            logo_url: t.logo_url,
            moneda: t.moneda ?? null,
          };
          tenantReceiptRef.current = tenant;
        }
      }
      if (!tenant) {
        alert("No se pudieron cargar los datos del negocio para imprimir la comanda.");
        return;
      }
      const paperWidthMm = getThermalPrintSettings().paperWidthMm;
      const html = buildComandaReceiptHtml(
        tenant,
        {
          id: comanda.id,
          numero_comanda: comanda.numero_comanda,
          mesa_numero: comanda.mesa_numero,
          items: comanda.items.map((i) => ({
            nombre: i.nombre,
            cantidad: i.cantidad,
            precio: i.precio,
            categoria: i.categoria,
            notas: i.notas,
          })),
          notas: comanda.notas,
          created_at: comanda.created_at,
        },
        paperWidthMm
      );
      const res = await printThermalHtml(html);
      if (!res.ok && res.error) {
        console.warn("Impresión comanda (cocina):", res.error);
      }
    },
    [tenantId]
  );

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
      <div className="flex-1 flex items-center justify-center bg-background">
        <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[16px]">
          Cargando comandas...
        </span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <p className="font-['Inter',sans-serif] text-muted-foreground text-[14px] text-center">
          Iniciá sesión con una cuenta vinculada a un negocio para ver la cocina.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-[32px] py-[14px] sm:py-[20px] gap-[12px] border-b border-black dark:border-white/10">
        <div className="flex items-center gap-[16px]">
          <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[28px]">
            Cocina
          </h1>
          <div
            className="flex gap-[6px] items-center px-[12px] py-[4px] rounded-full border border-black dark:border-white/10 bg-card"
          >
            <div
              className="rounded-full size-[8px]"
              style={{ backgroundColor: cocinaActiva ? "#59ee50" : "#ff716c" }}
            />
            <span
              className="font-['Space_Grotesk',sans-serif] text-[10px] tracking-[0.5px] uppercase font-bold text-foreground"
            >
              {cocinaActiva ? "En Vivo" : "Cerrada"}
            </span>
          </div>
        </div>

        <button
          onClick={toggleCocina}
          disabled={toggling}
          className={`flex gap-[8px] items-center px-[24px] py-[10px] rounded-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[14px] transition-all cursor-pointer border border-black dark:border-white/10 disabled:opacity-50 ${cocinaActiva ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
        >
          {toggling
            ? "Actualizando..."
            : cocinaActiva
            ? "Cerrar Cocina"
            : "Abrir Cocina"}
        </button>
      </div>

      {!cocinaActiva && (
        <div className="mx-[32px] mt-[16px] bg-destructive/5 border border-destructive/20 rounded-[12px] px-[20px] py-[12px]">
          <span className="font-['Inter',sans-serif] text-destructive text-[13px]">
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
              className="min-w-[280px] flex-1 flex flex-col bg-card rounded-[20px] border border-black dark:border-white/10 overflow-hidden shadow-sm"
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-[20px] py-[14px] border-b border-black dark:border-white/10 bg-muted/30">
                <div className="flex items-center gap-[8px]">
                  <div
                    className="rounded-full size-[8px]"
                    style={{ backgroundColor: col.color }}
                  />
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[13px] uppercase tracking-wide">
                    {col.title}
                  </span>
                </div>
                <div
                  className="rounded-full size-[20px] flex items-center justify-center border border-black/10 dark:border-white/10"
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
              <div className="flex-1 overflow-y-auto flex flex-col gap-[10px] p-[14px] bg-background/50">
                {items.length === 0 && (
                  <div className="flex-1 flex items-center justify-center py-[40px]">
                    <span className="font-['Inter',sans-serif] text-muted-foreground text-[12px]">
                      Sin comandas
                    </span>
                  </div>
                )}
                {items.map((comanda) => (
                  <div
                    key={comanda.id}
                    className="bg-card rounded-[14px] border border-black dark:border-white/10 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                  >
                    {/* Card header */}
                    <div className="px-[14px] py-[10px] border-b border-black/10 dark:border-white/5 flex items-center justify-between bg-muted/10">
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-primary text-[13px]">
                        #{String(comanda.numero_comanda).padStart(4, "0")}
                      </span>
                      <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] font-bold uppercase">
                        {comanda.mesa_numero != null && comanda.mesa_numero !== 0
                          ? `Mesa ${comanda.mesa_numero}`
                          : "Para llevar"}
                      </span>
                    </div>

                    {/* Items */}
                    <div className="px-[14px] py-[10px] flex flex-col gap-[6px]">
                      {comanda.items.map((item, i) => (
                        <div key={i} className="flex flex-col gap-[2px]">
                          <div className="flex justify-between gap-[8px]">
                            <span className="font-['Inter',sans-serif] text-foreground text-[12px] font-medium">
                              {item.cantidad}×{" "}
                              {item.categoria ? (
                                <span className="text-muted-foreground text-[10px]">[{item.categoria}] </span>
                              ) : null}
                              {item.nombre}
                            </span>
                          </div>
                          {item.notas && (
                            <span className="font-['Inter',sans-serif] text-muted-foreground text-[10px] italic bg-muted/20 px-2 py-1 rounded">
                              ↳ {item.notas}
                            </span>
                          )}
                        </div>
                      ))}
                      {comanda.notas && (
                        <div className="mt-[6px] bg-primary/5 border border-primary/10 rounded-[8px] px-[10px] py-[6px]">
                          <span className="font-['Inter',sans-serif] text-primary text-[10px] font-bold uppercase tracking-tight">
                            {comanda.notas}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="px-[14px] py-[10px] border-t border-black/10 dark:border-white/5 flex gap-[8px] bg-muted/5">
                      <button
                        type="button"
                        onClick={() => void printComandaThermal(comanda)}
                        className="flex-1 bg-muted rounded-[8px] py-[7px] font-['Inter',sans-serif] text-foreground text-[10px] tracking-[0.5px] uppercase font-bold cursor-pointer border border-black/10 dark:border-white/10 hover:bg-muted/80 transition-colors"
                      >
                        Imprimir
                      </button>
                      <button
                        onClick={() => advanceComanda(comanda.id, col.next)}
                        className="flex-1 rounded-[8px] py-[7px] font-['Inter',sans-serif] text-[10px] tracking-[0.5px] uppercase font-bold cursor-pointer border border-black/10 dark:border-white/10 transition-colors"
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
