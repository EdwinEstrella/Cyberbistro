import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Plus, RefreshCw, Layers, ClipboardList, Flame, Trash2, ArrowUpDown } from "lucide-react";
import { NewInsumoModal } from "./NewInsumoModal";
import { insforgeClient } from "../../../shared/lib/insforge";
import { formatPresentationStock } from "../../../shared/lib/presentationUnits";
import { useAuth } from "../../../shared/hooks/useAuth";
import { readLocalMirror, enqueueLocalWrite, getDeviceId, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { useSucursal } from "../../../app/context/SucursalContext";
import { ConfirmModal } from "../../../shared/components/ConfirmModal";

interface InsumoRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  nombre: string;
  categoria: string;
  unidad_base: string;
  stock_actual: number;
  stock_minimo: number;
  costo_promedio: number;
  activo: boolean;
  ml_por_botella: number | null;
  costo_compra: number | null;
}

interface MovimientoRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  producto_id: string;
  tipo: 'entrada' | 'salida' | 'consumo' | 'merma' | 'ajuste' | 'transferencia';
  cantidad: number;
  stock_antes: number;
  stock_despues: number;
  costo_unitario: number;
  motivo: string | null;
  referencia: string | null;
  fecha: string;
  usuario_id: string | null;
}

interface RecetaRow {
  id: string;
  tenant_id: string;
  plato_id: number;
  insumo_id: string;
  cantidad: number;
  unidad: string;
}

interface PlatoRow {
  id: number;
  nombre: string;
  categoria: string | null;
  precio: number;
}

interface ProduccionRow {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  fecha: string;
  area: string;
  producto_id: string;
  cantidad_usada: number;
  responsable: string | null;
  observacion: string | null;
}


const UNIDADES_MEDIDA = ["ml", "g", "unidad", "oz", "libra", "litro", "galón"];

const RD = (n: number) =>
  "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateTimeFormatter = new Intl.DateTimeFormat("es-DO", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function Inventario() {
  const { tenantId, user, plan, loading: authLoading } = useAuth();
  const { activeSucursalId } = useSucursal();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!plan || (plan !== "profesional" && plan !== "empresarial"))) {
      navigate("/dashboard", { replace: true });
    }
  }, [plan, authLoading, navigate]);

  const [activeTab, setActiveTab] = useState<'insumos' | 'recetas' | 'movimientos' | 'cierre'>('insumos');
  
  // Data State
  const [insumos, setInsumos] = useState<InsumoRow[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoRow[]>([]);
  const [recetas, setRecetas] = useState<RecetaRow[]>([]);
  const [platos, setPlatos] = useState<PlatoRow[]>([]);
  const [producciones, setProducciones] = useState<ProduccionRow[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modals & Selected Items
  const [showInsumoModal, setShowInsumoModal] = useState(false);
  const [selectedPlatoId, setSelectedPlatoId] = useState<number | "">("");

  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; onConfirm: () => void, title?: string, variant?: "danger" | "primary" }>({ open: false, message: "", onConfirm: () => {} });
  const showConfirm = (message: string, onConfirm: () => void, title = "Confirmar", variant: "danger" | "primary" = "danger") => setConfirmState({ open: true, message, onConfirm, title, variant });


  const [recetaForm, setRecetaForm] = useState({
    insumo_id: "",
    cantidad: "",
    unidad: "ml",
  });

  const [movimientoForm, setMovimientoForm] = useState({
    producto_id: "",
    tipo: "entrada" as MovimientoRow['tipo'],
    cantidad: "",
    costo_unitario: "",
    motivo: "",
    referencia: "",
  });

  const [cierreForm, setCierreForm] = useState({
    producto_id: "",
    area: "Freidora #1",
    cantidad_usada: "",
    responsable: "",
    observacion: "",
  });

  const cargarDatos = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const [useLocalInsumos, useLocalMovs, useLocalRecetas, useLocalPlatos, useLocalProd] = await Promise.all([
        shouldReadLocalFirst(tenantId, ["productos_inventario"]),
        shouldReadLocalFirst(tenantId, ["inventario_movimientos"]),
        shouldReadLocalFirst(tenantId, ["recetas"]),
        shouldReadLocalFirst(tenantId, ["platos"]),
        shouldReadLocalFirst(tenantId, ["produccion_cocina"]),
      ]);

      const [insumosData, movsData, recetasData, platosData, prodData] = await Promise.all([
        useLocalInsumos
          ? readLocalMirror<InsumoRow>(tenantId, "productos_inventario").then(rows => rows.filter(r => r.sucursal_id === activeSucursalId))
          : insforgeClient.database.from("productos_inventario").select("*").eq("tenant_id", tenantId).eq("sucursal_id", activeSucursalId).eq("activo", true).order("nombre", { ascending: true }).then(r => r.data ?? []),
        useLocalMovs
          ? readLocalMirror<MovimientoRow>(tenantId, "inventario_movimientos").then(rows => rows.filter(r => r.sucursal_id === activeSucursalId))
          : insforgeClient.database.from("inventario_movimientos").select("*").eq("tenant_id", tenantId).eq("sucursal_id", activeSucursalId).order("fecha", { ascending: false }).limit(60).then(r => r.data ?? []),
        useLocalRecetas
          ? readLocalMirror<RecetaRow>(tenantId, "recetas")
          : insforgeClient.database.from("recetas").select("*").eq("tenant_id", tenantId).then(r => r.data ?? []),
        useLocalPlatos
          ? readLocalMirror<PlatoRow>(tenantId, "platos")
          : insforgeClient.database.from("platos").select("id, nombre, categoria, precio").eq("tenant_id", tenantId).then(r => r.data ?? []),
        useLocalProd
          ? readLocalMirror<ProduccionRow>(tenantId, "produccion_cocina").then(rows => rows.filter(r => r.sucursal_id === activeSucursalId))
          : insforgeClient.database.from("produccion_cocina").select("*").eq("tenant_id", tenantId).eq("sucursal_id", activeSucursalId).order("fecha", { ascending: false }).limit(40).then(r => r.data ?? []),
      ]);

      setInsumos(useLocalInsumos ? (insumosData as InsumoRow[]).filter(i => i.activo) : (insumosData as InsumoRow[]));
      setMovimientos(useLocalMovs ? (movsData as MovimientoRow[]).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 60) : (movsData as MovimientoRow[]));
      setRecetas(recetasData as RecetaRow[]);
      setPlatos((platosData as PlatoRow[]).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setProducciones(useLocalProd ? (prodData as ProduccionRow[]).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 40) : (prodData as ProduccionRow[]));
      
      if (platosData.length > 0 && selectedPlatoId === "") {
        setSelectedPlatoId(platosData[0].id);
      }
    } catch (err: any) {
      setMessage(err.message || "Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeSucursalId]);

  useEffect(() => {
    if (authLoading) return;
    void cargarDatos();
  }, [authLoading, cargarDatos]);

  const insumosMap = useMemo(() => {
    return new Map(insumos.map((i) => [i.id, i]));
  }, [insumos]);

  const activeRecipes = useMemo(() => {
    if (selectedPlatoId === "") return [];
    return recetas.filter(r => r.plato_id === selectedPlatoId);
  }, [selectedPlatoId, recetas]);

  const costoTotalReceta = useMemo(() => {
    return activeRecipes.reduce((acc, item) => {
      const insumo = insumosMap.get(item.insumo_id);
      const costoInsumo = insumo ? (Number(insumo.costo_promedio) || 0) : 0;
      return acc + (Number(item.cantidad) || 0) * costoInsumo;
    }, 0);
  }, [activeRecipes, insumosMap]);



  async function crearMovimiento(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    const { producto_id, tipo, cantidad, costo_unitario, motivo, referencia } = movimientoForm;
    if (!producto_id) {
      setMessage("Selecciona un insumo");
      return;
    }
    const cantNum = Number(cantidad);
    if (!cantNum || cantNum <= 0) {
      setMessage("La cantidad debe ser mayor a cero");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMsg("");

    try {
      const insumo = insumosMap.get(producto_id);
      if (!insumo) throw new Error("Insumo no encontrado");

      const costo = Number(costo_unitario) || insumo.costo_promedio;
      const stockAntes = insumo.stock_actual;
      
      // Calculate new stock
      let stockDespues = stockAntes;
      if (tipo === "entrada") stockDespues += cantNum;
      else stockDespues -= cantNum;

      const movId = crypto.randomUUID();
      
      // Update insumo stock first
      await enqueueLocalWrite({
        tenantId,
        tableName: "productos_inventario",
        rowId: producto_id,
        op: "update",
        payload: {
          ...insumo,
          stock_actual: stockDespues,
          costo_promedio: tipo === "entrada" && stockDespues > 0 
            ? ((stockAntes * insumo.costo_promedio) + (cantNum * costo)) / stockDespues
            : insumo.costo_promedio
        },
        deviceId: await getDeviceId(),
      });

      // Write movement log
      await enqueueLocalWrite({
        tenantId,
        tableName: "inventario_movimientos",
        rowId: movId,
        op: "insert",
        payload: {
          id: movId,
          tenant_id: tenantId,
          sucursal_id: activeSucursalId,
          producto_id,
          tipo,
          cantidad: cantNum,
          stock_antes: stockAntes,
          stock_despues: stockDespues,
          costo_unitario: costo,
          motivo: motivo.trim() || null,
          referencia: referencia.trim() || null,
          fecha: new Date().toISOString(),
          usuario_id: user?.id || null,
        },
        deviceId: await getDeviceId(),
      });

      setMovimientoForm({
        producto_id: "",
        tipo: "entrada",
        cantidad: "",
        costo_unitario: "",
        motivo: "",
        referencia: "",
      });
      setSuccessMsg("Movimiento registrado con éxito.");
      await cargarDatos();
    } catch (err: any) {
      setMessage(err.message || "Error al guardar movimiento");
    } finally {
      setSaving(false);
    }
  }

  async function agregarIngrediente(e: FormEvent) {
    e.preventDefault();
    if (!tenantId || selectedPlatoId === "") return;
    const { insumo_id, cantidad, unidad } = recetaForm;
    if (!insumo_id) {
      setMessage("Selecciona un ingrediente");
      return;
    }
    const cantNum = Number(cantidad);
    if (!cantNum || cantNum <= 0) {
      setMessage("La cantidad debe ser mayor a cero");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMsg("");

    try {
      const id = crypto.randomUUID();
      await enqueueLocalWrite({
        tenantId,
        tableName: "recetas",
        rowId: id,
        op: "insert",
        payload: {
          id,
          tenant_id: tenantId,
          plato_id: Number(selectedPlatoId),
          insumo_id,
          cantidad: cantNum,
          unidad,
        },
        deviceId: await getDeviceId(),
      });

      setRecetaForm({ insumo_id: "", cantidad: "", unidad: "ml" });
      setSuccessMsg("Ingrediente agregado a la receta.");
      await cargarDatos();
    } catch (err: any) {
      setMessage(err.message || "Error al agregar ingrediente");
    } finally {
      setSaving(false);
    }
  }

  function eliminarIngrediente(id: string) {
    if (!tenantId) return;
    
    showConfirm("¿Estás seguro de que deseas eliminar este ingrediente de la receta?", async () => {
      setSaving(true);
      setMessage("");

      try {
        await enqueueLocalWrite({
          tenantId,
          tableName: "recetas",
          rowId: id,
          op: "delete",
          payload: { id },
          deviceId: await getDeviceId(),
        });

        setSuccessMsg("Ingrediente eliminado.");
        await cargarDatos();
      } catch (err: any) {
        setMessage(err.message || "Error al eliminar ingrediente");
      } finally {
        setSaving(false);
      }
    }, "Eliminar Ingrediente");
  }

  async function registrarCierreCocina(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    const { producto_id, area, cantidad_usada, responsable, observacion } = cierreForm;
    if (!producto_id) {
      setMessage("Selecciona la materia prima (ej: Aceite)");
      return;
    }
    const cantNum = Number(cantidad_usada);
    if (!cantNum || cantNum <= 0) {
      setMessage("Ingresá un volumen válido en ml o gramos");
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccessMsg("");

    try {
      const insumo = insumosMap.get(producto_id);
      if (!insumo) throw new Error("Insumo no encontrado");

      const stockAntes = insumo.stock_actual;
      const stockDespues = stockAntes - cantNum;
      
      const prodId = crypto.randomUUID();
      const movId = crypto.randomUUID();

      // Update insumo stock (decrements)
      await enqueueLocalWrite({
        tenantId,
        tableName: "productos_inventario",
        rowId: producto_id,
        op: "update",
        payload: {
          ...insumo,
          stock_actual: stockDespues
        },
        deviceId: await getDeviceId(),
      });

      // Write produccion_cocina row
      await enqueueLocalWrite({
        tenantId,
        tableName: "produccion_cocina",
        rowId: prodId,
        op: "insert",
        payload: {
          id: prodId,
          tenant_id: tenantId,
          sucursal_id: activeSucursalId,
          fecha: new Date().toISOString(),
          area,
          producto_id,
          cantidad_usada: cantNum,
          responsable: responsable.trim() || null,
          observacion: observacion.trim() || null,
        },
        deviceId: await getDeviceId(),
      });

      // Log the movement as "consumo"
      await enqueueLocalWrite({
        tenantId,
        tableName: "inventario_movimientos",
        rowId: movId,
        op: "insert",
        payload: {
          id: movId,
          tenant_id: tenantId,
          sucursal_id: activeSucursalId,
          producto_id,
          tipo: "consumo",
          cantidad: cantNum,
          stock_antes: stockAntes,
          stock_despues: stockDespues,
          costo_unitario: insumo.costo_promedio,
          motivo: `Cierre de cocina / Jornada en ${area}`,
          referencia: "Cierre Cocina",
          fecha: new Date().toISOString(),
          usuario_id: user?.id || null,
        },
        deviceId: await getDeviceId(),
      });

      setCierreForm({
        producto_id: "",
        area: "Freidora #1",
        cantidad_usada: "",
        responsable: "",
        observacion: "",
      });
      setSuccessMsg("Consumo e insumos registrados en el Cierre de Cocina.");
      await cargarDatos();
    } catch (err: any) {
      setMessage(err.message || "Error al registrar cierre de cocina");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full gap-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px] uppercase tracking-[0.5px] flex items-center gap-2">
            Modulo de Inventario <Layers className="size-[20px] text-[#ff906d]" />
          </span>
        </div>
        <button
          onClick={() => void cargarDatos()}
          className="bg-[#262626] hover:bg-[#333] border border-[rgba(72,72,71,0.35)] rounded-[10px] p-2 text-[#adaaaa] hover:text-white transition-colors"
          title="Recargar datos"
        >
          <RefreshCw className={`size-[18px] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[rgba(72,72,71,0.2)] p-1 gap-2 overflow-x-auto w-full shrink-0">
        <button
          onClick={() => setActiveTab('insumos')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 shrink-0 ${
            activeTab === 'insumos'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <Layers className="size-[15px]" />
          Maestro de Insumos
        </button>
        <button
          onClick={() => setActiveTab('recetas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 shrink-0 ${
            activeTab === 'recetas'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <ClipboardList className="size-[15px]" />
          Fórmulas de Recetas
        </button>
        <button
          onClick={() => setActiveTab('movimientos')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 shrink-0 ${
            activeTab === 'movimientos'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <ArrowUpDown className="size-[15px]" />
          Movimientos / Ajustes
        </button>
        <button
          onClick={() => setActiveTab('cierre')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase tracking-[0.5px] border cursor-pointer transition-all duration-200 shrink-0 ${
            activeTab === 'cierre'
              ? 'bg-[rgba(255,144,109,0.12)] border-[#ff906d] text-[#ff906d] shadow-[0_0_12px_rgba(255,144,109,0.1)]'
              : 'bg-transparent border-transparent text-[#adaaaa] hover:text-white'
          }`}
        >
          <Flame className="size-[15px]" />
          Cierre de Cocina / Aceite
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div className="bg-[rgba(255,113,108,0.06)] border border-[rgba(255,113,108,0.22)] rounded-[12px] px-4 py-3">
          <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">{message}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-[rgba(89,238,80,0.06)] border border-[rgba(89,238,80,0.22)] rounded-[12px] px-4 py-3">
          <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">Cargando módulo de inventario...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* TAB 1: Maestro Insumos */}
          {activeTab === 'insumos' && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase tracking-[0.5px]">
                  Listado de Materias Primas ({insumos.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowInsumoModal(true)}
                  className="bg-[#ff906d] rounded-[10px] px-3.5 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none flex items-center gap-1.5 transition-transform hover:scale-[1.02] active:scale-95"
                >
                  <Plus className="size-[14px]" strokeWidth={3} /> Nuevo Insumo
                </button>
              </div>

              {insumos.length === 0 ? (
                <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-12 text-center">
                  <p className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">
                    No tenés insumos agregados al inventario de materias primas. Empezá agregando tu primer producto como "Aceite vegetal" o "Papas".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {insumos.map((insumo) => {
                    const isLow = insumo.stock_actual <= insumo.stock_minimo;
                    return (
                      <div
                        key={insumo.id}
                        className="bg-[#131313] border border-[rgba(72,72,71,0.18)] hover:border-[rgba(255,144,109,0.22)] rounded-[16px] p-4 flex flex-col gap-3 relative transition-all duration-300 group"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-['Inter',sans-serif] text-[10px] text-[#6b7280] uppercase tracking-[0.5px]">
                              {insumo.categoria}
                            </span>
                            <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] mt-0.5 group-hover:text-[#ff906d] transition-colors">
                              {insumo.nombre}
                            </h4>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.5px] font-['Space_Grotesk',sans-serif] ${
                            isLow
                              ? 'bg-[rgba(255,113,108,0.12)] text-[#ff716c]'
                              : 'bg-[rgba(89,238,80,0.12)] text-[#59ee50]'
                          }`}>
                            {isLow ? "Bajo Stock" : "Ok"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 bg-[#171717] rounded-[10px] p-2.5">
                          <div className="flex flex-col">
                            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[9px] uppercase">Stock Actual</span>
                            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] mt-0.5">
                              {insumo.unidad_base === "ml" && insumo.ml_por_botella && insumo.ml_por_botella > 0
                                ? formatPresentationStock(insumo.stock_actual, insumo.ml_por_botella)
                                : `${insumo.stock_actual} ${insumo.unidad_base}`}
                            </span>
                            {insumo.unidad_base === "ml" && insumo.ml_por_botella && insumo.ml_por_botella > 0 && (
                              <span className="font-['Inter',sans-serif] text-[9px] text-[#6b7280] mt-0.5">
                                ({insumo.stock_actual} ml)
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[9px] uppercase">Mínimo</span>
                            <span className="font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[13px] mt-0.5">
                              {insumo.unidad_base === "ml" && insumo.ml_por_botella && insumo.ml_por_botella > 0
                                ? formatPresentationStock(insumo.stock_minimo, insumo.ml_por_botella)
                                : `${insumo.stock_minimo} ${insumo.unidad_base}`}
                            </span>
                          </div>
                        </div>

                        {insumo.unidad_base === "ml" && insumo.ml_por_botella && insumo.ml_por_botella > 0 ? (
                          <div className="flex flex-col gap-1 pt-1 border-t border-[rgba(72,72,71,0.1)] text-[11px] font-['Inter',sans-serif] text-[#adaaaa]">
                            {insumo.costo_compra !== null && insumo.costo_compra > 0 && (
                              <div className="flex justify-between items-center">
                                <span>Costo Botella:</span>
                                <span className="font-bold text-white">{RD(insumo.costo_compra)}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center">
                              <span>Costo Promedio (ml):</span>
                              <span className="font-bold text-white">RD$ {insumo.costo_promedio.toFixed(4)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center text-[11px] font-['Inter',sans-serif] text-[#adaaaa] pt-1 border-t border-[rgba(72,72,71,0.1)]">
                            <span>Costo Promedio:</span>
                            <span className="font-bold text-white">{RD(insumo.costo_promedio)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Fórmulas de Recetas */}
          {activeTab === 'recetas' && (
            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
              {/* Left Column: Platos selector */}
              <aside className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[20px] p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase">
                    Elegí un Plato de la Carta
                  </span>
                  <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px]">
                    Seleccioná el producto vendido para armar su receta e insumos asociados.
                  </span>
                </div>

                <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
                  {platos.map((plato) => {
                    const count = recetas.filter(r => r.plato_id === plato.id).length;
                    const isSelected = selectedPlatoId === plato.id;
                    return (
                      <button
                        key={plato.id}
                        type="button"
                        onClick={() => setSelectedPlatoId(plato.id)}
                        className={`w-full rounded-[12px] border p-3 text-left transition-colors cursor-pointer flex justify-between items-center ${
                          isSelected
                            ? "bg-[rgba(255,144,109,0.1)] border-[#ff906d]"
                            : "bg-[#101010] border-[rgba(72,72,71,0.15)] hover:border-[rgba(255,144,109,0.22)]"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-['Space_Grotesk',sans-serif] text-[13.5px] font-bold text-white">
                            {plato.nombre}
                          </div>
                          <div className="mt-0.5 truncate font-['Inter',sans-serif] text-[10px] text-[#6b7280] uppercase">
                            {plato.categoria || "General"} • {RD(plato.precio)}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold ${
                          count > 0 ? 'bg-[#ff906d] text-black' : 'bg-[#262626] text-[#6b7280]'
                        }`}>
                          {count} {count === 1 ? 'insumo' : 'insumos'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* Right Column: Recipe details & form */}
              {selectedPlatoId !== "" && (
                <section className="flex flex-col gap-5 bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[20px] p-6">
                  {/* Selected Plate details */}
                  <div className="flex justify-between items-start pb-4 border-b border-[rgba(72,72,71,0.15)]">
                    <div>
                      <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] uppercase">
                        Receta e Insumos de Venta
                      </span>
                      <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[20px] mt-0.5">
                        {platos.find(p => p.id === selectedPlatoId)?.nombre}
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
                    {/* Ingredients list */}
                    <div className="flex flex-col gap-4">
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] uppercase tracking-[0.5px]">
                        Ingredientes Definidos
                      </span>

                      {activeRecipes.length === 0 ? (
                        <div className="bg-[#181818] rounded-[14px] p-8 text-center text-[#6b7280] font-['Inter',sans-serif] text-[12px] border border-dashed border-[rgba(72,72,71,0.22)]">
                          Este plato no tiene insumos ni recetas asociadas. El stock no se descontará en ventas hasta que asocies materias primas.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          <div className="overflow-hidden rounded-[12px] border border-[rgba(72,72,71,0.18)]">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="bg-[#1a1a1a] text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa]">
                                  <th className="px-4 py-3">Insumo / Ingrediente</th>
                                  <th className="px-4 py-3">Cantidad por venta</th>
                                  <th className="px-4 py-3">Unidad</th>
                                  <th className="px-4 py-3 text-right">Costo Insumo</th>
                                  <th className="px-4 py-3 w-[70px]"></th>
                                </tr>
                              </thead>
                              <tbody className="font-['Inter',sans-serif] text-[13px] text-white">
                                {activeRecipes.map((item) => {
                                  const insumo = insumosMap.get(item.insumo_id);
                                  return (
                                    <tr key={item.id} className="border-t border-[rgba(72,72,71,0.14)]">
                                      <td className="px-4 py-2.5 font-bold">{insumo?.nombre || "Cargando..."}</td>
                                      <td className="px-4 py-2.5">{item.cantidad}</td>
                                      <td className="px-4 py-2.5 font-['Space_Grotesk',sans-serif] text-[12px] text-[#ff906d] font-bold uppercase">{item.unidad}</td>
                                      <td className="px-4 py-2.5 text-right font-['Space_Grotesk',sans-serif] font-bold text-white">
                                        {insumo ? RD(item.cantidad * insumo.costo_promedio) : "-"}
                                      </td>
                                      <td className="px-4 py-2.5 text-right">
                                        <button
                                          type="button"
                                          disabled={saving}
                                          onClick={() => eliminarIngrediente(item.id)}
                                          className="bg-[rgba(255,113,108,0.1)] border border-[rgba(255,113,108,0.25)] hover:bg-[#ff716c] hover:text-black rounded-[8px] p-2 text-[#ff716c] cursor-pointer transition-colors"
                                        >
                                          <Trash2 className="size-[14px]" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {(() => {
                            const precioPlato = platos.find(p => p.id === selectedPlatoId)?.precio || 0;
                            const margenBruto = precioPlato - costoTotalReceta;
                            const margenPorcentual = precioPlato > 0 ? (margenBruto / precioPlato) * 100 : 0;
                            return (
                              <div className="bg-[#181818] border border-[rgba(255,144,109,0.15)] rounded-[16px] p-4 flex flex-col gap-3">
                                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px] uppercase tracking-[0.5px]">
                                  Resumen Financiero del Plato
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                  <div className="bg-[#111] border border-[rgba(72,72,71,0.15)] rounded-[10px] p-2.5 flex flex-col">
                                    <span className="font-['Inter',sans-serif] text-[#6b7280] text-[8.5px] uppercase tracking-[0.5px]">Costo Receta</span>
                                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] mt-0.5">
                                      {RD(costoTotalReceta)}
                                    </span>
                                  </div>
                                  <div className="bg-[#111] border border-[rgba(72,72,71,0.15)] rounded-[10px] p-2.5 flex flex-col">
                                    <span className="font-['Inter',sans-serif] text-[#6b7280] text-[8.5px] uppercase tracking-[0.5px]">Precio Venta</span>
                                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] mt-0.5">
                                      {RD(precioPlato)}
                                    </span>
                                  </div>
                                  <div className="bg-[#111] border border-[rgba(72,72,71,0.15)] rounded-[10px] p-2.5 flex flex-col">
                                    <span className="font-['Inter',sans-serif] text-[#6b7280] text-[8.5px] uppercase tracking-[0.5px]">Margen Bruto</span>
                                    <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[13px] mt-0.5 ${margenBruto >= 0 ? "text-[#59ee50]" : "text-[#ff716c]"}`}>
                                      {RD(margenBruto)}
                                    </span>
                                  </div>
                                  <div className="bg-[#111] border border-[rgba(72,72,71,0.15)] rounded-[10px] p-2.5 flex flex-col">
                                    <span className="font-['Inter',sans-serif] text-[#6b7280] text-[8.5px] uppercase tracking-[0.5px]">Margen (%)</span>
                                    <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[13px] mt-0.5 ${margenPorcentual >= 30 ? "text-[#59ee50]" : margenPorcentual >= 15 ? "text-[#ff906d]" : "text-[#ff716c]"}`}>
                                      {margenPorcentual.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Add ingredient Form */}
                    <div className="bg-[#181818] border border-[rgba(72,72,71,0.18)] rounded-[16px] p-4 flex flex-col gap-4 self-start">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[13px] uppercase">
                          Asociar Insumo
                        </span>
                        <span className="font-['Inter',sans-serif] text-[#6b7280] text-[10px]">
                          Vincular materia prima al plato.
                        </span>
                      </div>

                      <form onSubmit={agregarIngrediente} className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Materia Prima *</label>
                          <select
                            value={recetaForm.insumo_id}
                            onChange={(e) => setRecetaForm(prev => ({ ...prev, insumo_id: e.target.value }))}
                            className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none"
                          >
                            <option value="">Selecciona ingrediente</option>
                            {insumos.map(i => (
                              <option key={i.id} value={i.id}>{i.nombre} ({i.unidad_base})</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1.5">
                            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Cantidad *</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Ej: 50"
                              value={recetaForm.cantidad}
                              onChange={(e) => setRecetaForm(prev => ({ ...prev, cantidad: e.target.value }))}
                              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Medida *</label>
                            <select
                              value={recetaForm.unidad}
                              onChange={(e) => setRecetaForm(prev => ({ ...prev, unidad: e.target.value }))}
                              className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12px] outline-none"
                            >
                              {UNIDADES_MEDIDA.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={saving}
                          className="bg-[#ff906d] rounded-[10px] py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none disabled:opacity-50 mt-2"
                        >
                          {saving ? "Asociando..." : "Asociar a Receta"}
                        </button>
                      </form>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* TAB 3: Movimientos / Ajustes */}
          {activeTab === 'movimientos' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
              {/* History list */}
              <div className="flex flex-col gap-4">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase tracking-[0.5px]">
                  Historial de Movimientos de Inventario
                </span>

                {movimientos.length === 0 ? (
                  <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[20px] p-12 text-center text-[#6b7280] font-['Inter',sans-serif] text-[13px]">
                    No se registran movimientos en el inventario. Registrá una entrada o ajuste.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[16px] border border-[rgba(72,72,71,0.18)]">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#1a1a1a] text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa]">
                          <th className="px-4 py-3">Fecha</th>
                          <th className="px-4 py-3">Insumo</th>
                          <th className="px-4 py-3">Operación</th>
                          <th className="px-4 py-3">Cantidad</th>
                          <th className="px-4 py-3">Stock Final</th>
                          <th className="px-4 py-3">Motivo / Referencia</th>
                        </tr>
                      </thead>
                      <tbody className="font-['Inter',sans-serif] text-[12.5px] text-white">
                        {movimientos.map((row) => {
                          const insumo = insumosMap.get(row.producto_id);
                          return (
                            <tr key={row.id} className="border-t border-[rgba(72,72,71,0.14)] hover:bg-[#151515] transition-colors">
                              <td className="px-4 py-2.5 text-[#adaaaa]">{formatDateTime(row.fecha)}</td>
                              <td className="px-4 py-2.5 font-bold">{insumo?.nombre || "Cargando..."}</td>
                              <td className="px-4 py-2.5 capitalize">
                                <span className={`px-2 py-0.5 rounded-[5px] text-[9.5px] font-bold ${
                                  row.tipo === 'entrada'
                                    ? 'bg-[rgba(89,238,80,0.12)] text-[#59ee50]'
                                    : row.tipo === 'merma'
                                    ? 'bg-[rgba(255,113,108,0.12)] text-[#ff716c]'
                                    : 'bg-[rgba(72,72,71,0.3)] text-[#adaaaa]'
                                }`}>
                                  {row.tipo}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-['Space_Grotesk',sans-serif] font-bold">
                                {row.tipo === 'entrada' ? '+' : '-'}{row.cantidad}
                              </td>
                              <td className="px-4 py-2.5 text-[#adaaaa] font-['Space_Grotesk',sans-serif]">
                                {row.stock_despues} {insumo?.unidad_base}
                              </td>
                              <td className="px-4 py-2.5 text-[#adaaaa] truncate max-w-[200px]" title={row.motivo || ""}>
                                {row.motivo || row.referencia || "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Add movement Form */}
              <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[20px] p-5 flex flex-col gap-4 self-start">
                <div className="flex flex-col gap-0.5">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase">
                    Registrar Movimiento
                  </span>
                  <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px]">
                    Ingresá entradas de compras, mermas de almacén o ajustes manuales.
                  </span>
                </div>

                <form onSubmit={crearMovimiento} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Materia Prima *</label>
                    <select
                      value={movimientoForm.producto_id}
                      onChange={(e) => setMovimientoForm(prev => ({ ...prev, producto_id: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                    >
                      <option value="">Selecciona insumo</option>
                      {insumos.map(i => (
                        <option key={i.id} value={i.id}>{i.nombre} ({i.stock_actual} {i.unidad_base} actual)</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Tipo de Operación *</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMovimientoForm(prev => ({ ...prev, tipo: 'entrada' }))}
                        className={`flex-1 py-2 px-3 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[10px] uppercase tracking-[0.5px] border cursor-pointer transition-colors ${
                          movimientoForm.tipo === 'entrada'
                            ? 'bg-[rgba(89,238,80,0.12)] border-[#59ee50] text-[#59ee50]'
                            : 'bg-[#111] border-[rgba(72,72,71,0.22)] text-[#adaaaa]'
                        }`}
                      >
                        Entrada (+)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovimientoForm(prev => ({ ...prev, tipo: 'merma' }))}
                        className={`flex-1 py-2 px-3 rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[10px] uppercase tracking-[0.5px] border cursor-pointer transition-colors ${
                          movimientoForm.tipo === 'merma'
                            ? 'bg-[rgba(255,113,108,0.12)] border-[#ff716c] text-[#ff716c]'
                            : 'bg-[#111] border-[rgba(72,72,71,0.22)] text-[#adaaaa]'
                        }`}
                      >
                        Merma / Salida (-)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Cantidad *</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Ej: 500"
                        value={movimientoForm.cantidad}
                        onChange={(e) => setMovimientoForm(prev => ({ ...prev, cantidad: e.target.value }))}
                        className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Costo Unitario</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Promedio"
                        value={movimientoForm.costo_unitario}
                        onChange={(e) => setMovimientoForm(prev => ({ ...prev, costo_unitario: e.target.value }))}
                        className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Motivo / Nota *</label>
                    <input
                      type="text"
                      placeholder="Ej: Compra a distribuidor / Aceite vencido"
                      value={movimientoForm.motivo}
                      onChange={(e) => setMovimientoForm(prev => ({ ...prev, motivo: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Referencia / Factura</label>
                    <input
                      type="text"
                      placeholder="Factura #123 (opcional)"
                      value={movimientoForm.referencia}
                      onChange={(e) => setMovimientoForm(prev => ({ ...prev, referencia: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#ff906d] rounded-[10px] py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none disabled:opacity-50 mt-2"
                  >
                    {saving ? "Procesando..." : "Registrar Movimiento"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: Cierre de Cocina / Freidora */}
          {activeTab === 'cierre' && (
            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
              {/* Left Column: Form */}
              <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[20px] p-5 flex flex-col gap-4 self-start">
                <div className="flex flex-col gap-0.5">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase">
                    Cargar Consumo de Jornada
                  </span>
                  <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px]">
                    Usa esta planilla para registrar el aceite vegetal o insumos cargados y gastados en la freidora/estaciones.
                  </span>
                </div>

                <form onSubmit={registrarCierreCocina} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Materia Prima *</label>
                    <select
                      value={cierreForm.producto_id}
                      onChange={(e) => setCierreForm(prev => ({ ...prev, producto_id: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                    >
                      <option value="">Selecciona insumo insumo</option>
                      {insumos.map(i => (
                        <option key={i.id} value={i.id}>{i.nombre} ({i.stock_actual} {i.unidad_base} actual)</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Estación / Área *</label>
                    <select
                      value={cierreForm.area}
                      onChange={(e) => setCierreForm(prev => ({ ...prev, area: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                    >
                      <option value="Freidora #1">Freidora #1</option>
                      <option value="Freidora #2">Freidora #2</option>
                      <option value="Plancha / Caliente">Plancha / Caliente</option>
                      <option value="Cocina General">Cocina General</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Cantidad consumida / perdida *</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Ej: 2500 (en unidad base)"
                      value={cierreForm.cantidad_usada}
                      onChange={(e) => setCierreForm(prev => ({ ...prev, cantidad_usada: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Responsable del Turno</label>
                    <input
                      type="text"
                      placeholder="Ej: Chef Juan"
                      value={cierreForm.responsable}
                      onChange={(e) => setCierreForm(prev => ({ ...prev, responsable: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[9.5px] uppercase tracking-[0.5px]">Observaciones / Ajustes</label>
                    <input
                      type="text"
                      placeholder="Ej: Pérdida por cambio de aceite de freidora"
                      value={cierreForm.observacion}
                      onChange={(e) => setCierreForm(prev => ({ ...prev, observacion: e.target.value }))}
                      className="bg-[#111] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-3 py-2 font-['Inter',sans-serif] text-white text-[12.5px] outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#ff906d] rounded-[10px] py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[11px] uppercase cursor-pointer border-none disabled:opacity-50 mt-2"
                  >
                    {saving ? "Cargando..." : "Registrar en Cocina"}
                  </button>
                </form>
              </div>

              {/* Right Column: History list */}
              <div className="flex flex-col gap-4">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase tracking-[0.5px]">
                  Cierres y Producciones de Cocina Recientes
                </span>

                {producciones.length === 0 ? (
                  <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[20px] p-12 text-center text-[#6b7280] font-['Inter',sans-serif] text-[13px]">
                    No hay cierres de cocina o consumos registrados de freidora.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[16px] border border-[rgba(72,72,71,0.18)]">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#1a1a1a] text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa]">
                          <th className="px-4 py-3">Fecha</th>
                          <th className="px-4 py-3">Estación / Área</th>
                          <th className="px-4 py-3">Materia Prima</th>
                          <th className="px-4 py-3">Cantidad Usada</th>
                          <th className="px-4 py-3">Responsable</th>
                          <th className="px-4 py-3">Observación</th>
                        </tr>
                      </thead>
                      <tbody className="font-['Inter',sans-serif] text-[12.5px] text-white">
                        {producciones.map((row) => {
                          const insumo = insumosMap.get(row.producto_id);
                          return (
                            <tr key={row.id} className="border-t border-[rgba(72,72,71,0.14)] hover:bg-[#151515] transition-colors">
                              <td className="px-4 py-2.5 text-[#adaaaa]">{formatDateTime(row.fecha)}</td>
                              <td className="px-4 py-2.5 font-bold text-white">{row.area}</td>
                              <td className="px-4 py-2.5 text-[#adaaaa]">{insumo?.nombre || "Cargando..."}</td>
                              <td className="px-4 py-2.5 font-['Space_Grotesk',sans-serif] font-bold text-[#ff906d]">
                                {row.cantidad_usada} {insumo?.unidad_base}
                              </td>
                              <td className="px-4 py-2.5 text-white">{row.responsable || "-"}</td>
                              <td className="px-4 py-2.5 text-[#adaaaa] truncate max-w-[200px]" title={row.observacion || ""}>
                                {row.observacion || "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* NEW INSUMO MODAL */}
      <NewInsumoModal
        isOpen={showInsumoModal}
        onClose={() => setShowInsumoModal(false)}
        tenantId={tenantId}
        activeSucursalId={activeSucursalId}
        userId={user?.id || null}
        onSuccess={(msg) => {
          setSuccessMsg(msg);
          void cargarDatos();
        }}
        onError={(msg) => {
          setMessage(msg);
        }}
      />
      
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title ?? "Confirmar"}
        message={confirmState.message}
        onConfirm={() => {
          confirmState.onConfirm();
          setConfirmState(s => ({ ...s, open: false }));
        }}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
        variant={confirmState.variant}
      />
    </div>
  );
}
