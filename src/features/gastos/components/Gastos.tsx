import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ReceiptText, RefreshCw, Sparkles, Tag, Trash2, WalletCards } from "lucide-react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { getLocalFirstStatusSnapshot, readLocalMirror, enqueueLocalWrite, getDeviceId } from "../../../shared/lib/localFirst";

interface CategoriaGasto {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  activa: boolean;
}

interface GastoRow {
  id: string;
  tenant_id: string;
  category_id: string | null;
  cycle_id: string | null;
  descripcion: string;
  proveedor: string | null;
  monto: number;
  metodo_pago: string | null;
  fecha_gasto: string;
  notas: string | null;
}

interface CicloAbierto {
  id: string;
  cycle_number: number;
  opened_at: string;
}

const SUGERENCIAS_CATEGORIA = [
  { nombre: "Inventario", descripcion: "Compra de insumos, bebidas, comida y materia prima.", color: "#22c55e" },
  { nombre: "Servicios", descripcion: "Luz, agua, internet, gas y mantenimiento mensual.", color: "#38bdf8" },
  { nombre: "Nómina", descripcion: "Pagos al personal, adelantos y bonos.", color: "#f97316" },
  { nombre: "Delivery", descripcion: "Transporte, combustible, comisiones y mensajería.", color: "#a855f7" },
  { nombre: "Mantenimiento", descripcion: "Reparaciones, utensilios, equipos y limpieza.", color: "#eab308" },
  { nombre: "Administrativo", descripcion: "Papelería, bancos, permisos y gestión.", color: "#64748b" },
];

const METODOS_PAGO = ["efectivo", "tarjeta", "transferencia", "digital"];

const RD = (n: number) =>
  "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function todayInputValue(): string {
  const n = new Date();
  const offset = n.getTimezoneOffset();
  const local = new Date(n.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

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

export function Gastos() {
  const { tenantId, user, loading: authLoading } = useAuth();
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [cicloAbierto, setCicloAbierto] = useState<CicloAbierto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [categoriaForm, setCategoriaForm] = useState({ nombre: "", descripcion: "", color: "#ff906d" });
  const [gastoForm, setGastoForm] = useState({
    descripcion: "",
    monto: "",
    category_id: "",
    proveedor: "",
    metodo_pago: "efectivo",
    fecha_gasto: todayInputValue(),
    notas: "",
  });

  const cargar = useCallback(async () => {
    if (!tenantId) {
      setCategorias([]);
      setGastos([]);
      setCicloAbierto(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const snapshot = await getLocalFirstStatusSnapshot(tenantId);
      const localMode = snapshot.status === "history_complete" || snapshot.status === "ready_history_syncing";

      const [categoriasData, gastosData, ciclosData] = await Promise.all([
        localMode
          ? readLocalMirror<CategoriaGasto>(tenantId, "gasto_categorias")
          : insforgeClient.database.from("gasto_categorias").select("id, nombre, descripcion, color, activa").eq("tenant_id", tenantId).eq("activa", true).order("nombre", { ascending: true }).then(r => r.data ?? []),
        localMode
          ? readLocalMirror<GastoRow>(tenantId, "gastos")
          : insforgeClient.database.from("gastos").select("*").eq("tenant_id", tenantId).order("fecha_gasto", { ascending: false }).limit(80).then(r => r.data ?? []),
        localMode
          ? readLocalMirror<CicloAbierto>(tenantId, "cierres_operativos")
          : insforgeClient.database.from("cierres_operativos").select("id, cycle_number, opened_at, closed_at").eq("tenant_id", tenantId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1).then(r => r.data ?? []),
      ]);

      setCategorias(localMode ? (categoriasData as CategoriaGasto[]).filter(c => c.activa) : (categoriasData as CategoriaGasto[]));
      
      const gList = localMode ? (gastosData as GastoRow[]).sort((a, b) => new Date(b.fecha_gasto).getTime() - new Date(a.fecha_gasto).getTime()).slice(0, 80) : (gastosData as GastoRow[]);
      setGastos(gList);
      
      const openCycle = localMode ? (ciclosData as any[]).filter(c => !c.closed_at).sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0] ?? null : (ciclosData as any[])[0] ?? null;
      setCicloAbierto(openCycle);
    } catch (err: any) {
      setMessage(err.message);
    }

    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (authLoading) return;
    void cargar();
  }, [authLoading, cargar]);

  const categoriaPorId = useMemo(() => {
    return new Map(categorias.map((cat) => [cat.id, cat]));
  }, [categorias]);

  const resumen = useMemo(() => {
    const now = Date.now();
    const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const totalMes = gastos
      .filter((gasto) => new Date(gasto.fecha_gasto).getTime() >= startMonth)
      .reduce((sum, gasto) => sum + Number(gasto.monto), 0);
    const total24h = gastos
      .filter((gasto) => new Date(gasto.fecha_gasto).getTime() >= now - 24 * 60 * 60 * 1000)
      .reduce((sum, gasto) => sum + Number(gasto.monto), 0);
    const totalCiclo = cicloAbierto
      ? gastos
          .filter((gasto) => gasto.cycle_id === cicloAbierto.id)
          .reduce((sum, gasto) => sum + Number(gasto.monto), 0)
      : 0;
    return { totalMes, total24h, totalCiclo, cantidad: gastos.length };
  }, [gastos, cicloAbierto]);

  const categoriasSugeridas = useMemo(() => {
    const existentes = new Set(categorias.map((cat) => cat.nombre.trim().toLowerCase()));
    return SUGERENCIAS_CATEGORIA.filter((cat) => !existentes.has(cat.nombre.toLowerCase()));
  }, [categorias]);

  async function crearCategoria(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    const nombre = normalizeName(categoriaForm.nombre);
    if (!nombre) return;

    setSaving(true);
    setMessage("");
    try {
      const id = crypto.randomUUID();
      await enqueueLocalWrite({
        tenantId,
        tableName: "gasto_categorias",
        rowId: id,
        op: "insert",
        payload: { id, tenant_id: tenantId, nombre, descripcion: categoriaForm.descripcion.trim() || null, color: categoriaForm.color, activa: true },
        deviceId: await getDeviceId(),
      });
      setCategoriaForm({ nombre: "", descripcion: "", color: "#ff906d" });
      await cargar();
    } catch (err: any) {
      setMessage(err.message);
    }
    setSaving(false);
  }

  async function crearCategoriaSugerida(cat: (typeof SUGERENCIAS_CATEGORIA)[number]) {
    if (!tenantId) return;
    setSaving(true);
    setMessage("");
    try {
      const id = crypto.randomUUID();
      await enqueueLocalWrite({
        tenantId,
        tableName: "gasto_categorias",
        rowId: id,
        op: "insert",
        payload: { id, tenant_id: tenantId, nombre: cat.nombre, descripcion: cat.descripcion, color: cat.color, activa: true },
        deviceId: await getDeviceId(),
      });
      await cargar();
    } catch (err: any) {
      setMessage(err.message);
    }
    setSaving(false);
  }

  async function registrarGasto(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    const descripcion = normalizeName(gastoForm.descripcion);
    const monto = Number(gastoForm.monto);
    if (!descripcion || !Number.isFinite(monto) || monto <= 0) {
      setMessage("Completa la descripción y un monto válido.");
      return;
    }
    if (!cicloAbierto) {
      setMessage("Abre un ciclo operativo antes de registrar gastos.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const id = crypto.randomUUID();
      await enqueueLocalWrite({
        tenantId,
        tableName: "gastos",
        rowId: id,
        op: "insert",
        payload: {
          id,
          tenant_id: tenantId,
          category_id: gastoForm.category_id || null,
          cycle_id: cicloAbierto.id,
          descripcion,
          proveedor: gastoForm.proveedor.trim() || null,
          monto,
          metodo_pago: gastoForm.metodo_pago || null,
          fecha_gasto: new Date(gastoForm.fecha_gasto).toISOString(),
          notas: gastoForm.notas.trim() || null,
          created_by_auth_user_id: user?.id ?? null,
        },
        deviceId: await getDeviceId(),
      });
      setGastoForm({
        descripcion: "",
        monto: "",
        category_id: gastoForm.category_id,
        proveedor: "",
        metodo_pago: gastoForm.metodo_pago,
        fecha_gasto: todayInputValue(),
        notas: "",
      });
      await cargar();
      setMessage(`Gasto registrado en ciclo #${cicloAbierto.cycle_number}.`);
    } catch (err: any) {
      setMessage(err.message);
    }
    setSaving(false);
  }

  async function eliminarGasto(gasto: GastoRow) {
    if (!tenantId) return;
    const ok = window.confirm(`Eliminar gasto "${gasto.descripcion}" por ${RD(gasto.monto)}?`);
    if (!ok) return;
    setSaving(true);
    setMessage("");
    try {
      await enqueueLocalWrite({
        tenantId,
        tableName: "gastos",
        rowId: gasto.id,
        op: "delete",
        deviceId: await getDeviceId(),
      });
      await cargar();
    } catch (err: any) {
      setMessage(err.message);
    }
    setSaving(false);
  }

  if (authLoading || loading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Cargando gastos...</div>;
  }

  if (!tenantId) {
    return <div className="flex-1 flex items-center justify-center p-6 text-muted-foreground">Tu usuario no está vinculado a un negocio.</div>;
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8 lg:p-10 overflow-y-auto">
      <div className="max-w-[1500px] mx-auto flex flex-col gap-7">
        <section className="rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="text-primary text-[11px] font-bold uppercase tracking-[0.25em]">Control operativo</div>
              <h1 className="font-['Space_Grotesk',sans-serif] text-3xl sm:text-4xl font-bold text-foreground">Gastos</h1>
              <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
                Registra salidas del negocio, categoriza compras y vincula automáticamente los gastos al ciclo abierto.
              </p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 min-w-[240px]">
              <div className="text-[10px] uppercase tracking-widest text-primary font-bold">Ciclo actual</div>
              <div className="mt-1 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground">
                {cicloAbierto ? `#${cicloAbierto.cycle_number}` : "Sin ciclo"}
              </div>
              <div className="text-xs text-muted-foreground">
                {cicloAbierto ? `Gastos: ${RD(resumen.totalCiclo)}` : "Abre un ciclo para registrar gastos"}
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4 text-sm font-medium text-primary">
            {message}
          </div>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: "Gasto del ciclo", value: RD(resumen.totalCiclo), icon: WalletCards },
            { label: "Últimas 24h", value: RD(resumen.total24h), icon: ReceiptText },
            { label: "Mes actual", value: RD(resumen.totalMes), icon: RefreshCw },
            { label: "Registros", value: resumen.cantidad, icon: Tag },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="rounded-[18px] border border-black/10 dark:border-white/5 bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{kpi.label}</div>
                  <Icon size={18} className="text-primary" />
                </div>
                <div className="mt-4 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-foreground tabular-nums">{kpi.value}</div>
              </div>
            );
          })}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
          <div className="flex flex-col gap-6">
            <form onSubmit={registrarGasto} className="rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h2 className="font-['Space_Grotesk',sans-serif] text-xl font-bold text-foreground">Registrar gasto</h2>
                <button type="submit" disabled={saving || !cicloAbierto} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-primary-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-50">
                  <Plus size={16} />
                  Guardar
                </button>
              </div>
              {!cicloAbierto && (
                <div className="mb-4 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
                  No hay ciclo abierto. Los gastos se registran solo dentro de un ciclo operativo.
                </div>
              )}

              <div className="space-y-4">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Descripción</span>
                  <input value={gastoForm.descripcion} onChange={(e) => setGastoForm((f) => ({ ...f, descripcion: e.target.value }))} className="mt-1 w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary" placeholder="Ej. Compra de vegetales" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Monto</span>
                    <input type="number" min="0" step="0.01" value={gastoForm.monto} onChange={(e) => setGastoForm((f) => ({ ...f, monto: e.target.value }))} className="mt-1 w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary" placeholder="0.00" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Método</span>
                    <select value={gastoForm.metodo_pago} onChange={(e) => setGastoForm((f) => ({ ...f, metodo_pago: e.target.value }))} className="mt-1 w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary">
                      {METODOS_PAGO.map((metodo) => <option key={metodo} value={metodo}>{metodo}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Categoría</span>
                  <select value={gastoForm.category_id} onChange={(e) => setGastoForm((f) => ({ ...f, category_id: e.target.value }))} className="mt-1 w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary">
                    <option value="">Sin categoría</option>
                    {categorias.map((cat) => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Proveedor opcional</span>
                  <input value={gastoForm.proveedor} onChange={(e) => setGastoForm((f) => ({ ...f, proveedor: e.target.value }))} className="mt-1 w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary" placeholder="Ej. Mercado Central" />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Fecha</span>
                  <input type="datetime-local" value={gastoForm.fecha_gasto} onChange={(e) => setGastoForm((f) => ({ ...f, fecha_gasto: e.target.value }))} className="mt-1 w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Notas</span>
                  <textarea value={gastoForm.notas} onChange={(e) => setGastoForm((f) => ({ ...f, notas: e.target.value }))} className="mt-1 min-h-[86px] w-full resize-none rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary" placeholder="Detalle interno, factura, responsable..." />
                </label>
              </div>
            </form>

            <form onSubmit={crearCategoria} className="rounded-[24px] border border-black/10 dark:border-white/10 bg-card p-6 shadow-sm">
              <h2 className="font-['Space_Grotesk',sans-serif] text-xl font-bold text-foreground mb-5">Categorías</h2>
              <div className="space-y-3">
                <input value={categoriaForm.nombre} onChange={(e) => setCategoriaForm((f) => ({ ...f, nombre: e.target.value }))} className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary" placeholder="Nueva categoría" />
                <input value={categoriaForm.descripcion} onChange={(e) => setCategoriaForm((f) => ({ ...f, descripcion: e.target.value }))} className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground outline-none focus:border-primary" placeholder="Descripción opcional" />
                <div className="flex items-center gap-3">
                  <input type="color" value={categoriaForm.color} onChange={(e) => setCategoriaForm((f) => ({ ...f, color: e.target.value }))} className="h-11 w-14 rounded-xl border border-border bg-muted p-1" aria-label="Color de categoría" />
                  <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-muted px-4 py-3 text-foreground text-xs font-bold uppercase tracking-widest hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50">Crear categoría</button>
                </div>
              </div>

              {categoriasSugeridas.length > 0 && (
                <div className="mt-6">
                  <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                    <Sparkles size={14} className="text-primary" />
                    Sugeridas
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {categoriasSugeridas.map((cat) => (
                      <button key={cat.nombre} type="button" onClick={() => void crearCategoriaSugerida(cat)} className="rounded-full border border-black/10 dark:border-white/10 bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50" style={{ boxShadow: `inset 0 -2px 0 ${cat.color}` }}>
                        {cat.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </div>

          <div className="rounded-[24px] border border-black/10 dark:border-white/10 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <h2 className="font-['Space_Grotesk',sans-serif] text-xl font-bold text-foreground">Historial de gastos</h2>
                <p className="text-xs text-muted-foreground">Últimos registros del negocio.</p>
              </div>
              <button onClick={() => void cargar()} className="inline-flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-foreground hover:bg-black/5 dark:hover:bg-white/10">
                <RefreshCw size={15} />
                Actualizar
              </button>
            </div>
            <div className="divide-y divide-border">
              {gastos.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">Aún no hay gastos registrados.</div>
              ) : (
                gastos.map((gasto) => {
                  const cat = gasto.category_id ? categoriaPorId.get(gasto.category_id) : null;
                  return (
                    <div key={gasto.id} className="grid grid-cols-1 gap-4 px-6 py-5 hover:bg-muted/30 transition-colors lg:grid-cols-[1fr_180px_140px_44px] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">{gasto.descripcion}</span>
                          {cat && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ backgroundColor: cat.color }}>
                              {cat.nombre}
                            </span>
                          )}
                          {gasto.cycle_id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">Con ciclo</span>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(gasto.fecha_gasto)}
                          {gasto.proveedor ? ` · ${gasto.proveedor}` : ""}
                          {gasto.metodo_pago ? ` · ${gasto.metodo_pago}` : ""}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">{gasto.notas || "Sin notas"}</div>
                      <div className="font-['Space_Grotesk',sans-serif] text-xl font-bold text-foreground tabular-nums lg:text-right">{RD(gasto.monto)}</div>
                      <button onClick={() => void eliminarGasto(gasto)} className="inline-flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
