import { useState, useEffect, useMemo } from "react";
import { Navigate, useNavigate } from "react-router";
import QRCode from "qrcode";
import { ExternalLink } from "lucide-react";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useSucursal } from "../../../app/context/SucursalContext";
import { useTenantCurrency } from "../../../shared/hooks/useTenantCurrency";
import { buildStaffProvisioningRecoveryMessage } from "./staffProvisioning";
import {
  DEFAULT_MENU_CATEGORY_SUGGESTIONS,
  normalizeCategoryName,
  suggestCategoryColor,
  sortCategoriesForTabs,
} from "../../../shared/lib/menuCategories";
import { loadCantidadMesas, saveCantidadMesas } from "../../../shared/lib/tenantMesasSettings";
import {
  enqueueLocalWrite,
  getDeviceId,
  readLocalMirror,
  shouldReadLocalFirst,
} from "../../../shared/lib/localFirst";
import {
  countActiveUsersByRole,
  extractTenantUserLimitConfig,
  getLimitForRole,
  type TenantUserLimitConfig,
} from "../../../shared/lib/tenantUserLimits";
import { ConfirmModal } from "../../../shared/components/ConfirmModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/select";

const STAFF_ROLES = [
  { value: "cajera", label: "Cajera / Venta" },
  { value: "mesero", label: "Camarera" },
  { value: "cocina", label: "Cocina" },
] as const;

interface TenantUserRow {
  id: string;
  email: string;
  rol: string;
  nombre: string | null;
  activo: boolean | null;
  auth_user_id: string | null;
}

interface TenantRow {
  id: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// PLATOS (CARTA) PANEL
// ─────────────────────────────────────────────
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

type FormMode = "add" | "edit" | null;

function createTemporaryIntegerId(existingIds: Iterable<number>): number {
  const usedIds = new Set(existingIds);
  const maxPostgresInteger = 2_147_483_647;
  let candidate = -Math.max(1, Date.now() % maxPostgresInteger);

  while (usedIds.has(candidate)) {
    candidate = candidate <= -maxPostgresInteger ? -1 : candidate - 1;
  }

  return candidate;
}

function normalizeCartaData(tenantId: string, sucursalId: string, platos: Plato[], categories: MenuCategoryRow[]) {
  return {
    platos: platos
      .filter((plato) => String((plato as any).tenant_id ?? tenantId) === tenantId)
      .filter((plato) => (plato.sucursal_id ?? sucursalId) === sucursalId)
      .sort((a, b) => String(a.categoria ?? "").localeCompare(String(b.categoria ?? ""))),
    categories: categories
      .filter((category) => category.tenant_id === tenantId)
      .sort((a, b) => (a.sort_order - b.sort_order) || a.nombre.localeCompare(b.nombre)),
  };
}

async function loadCartaData(tenantId: string, sucursalId: string): Promise<{
  platos: Plato[];
  categories: MenuCategoryRow[];
}> {
  const useLocalRead = await shouldReadLocalFirst(tenantId, ["platos", "menu_categories"]);
  if (useLocalRead) {
    const [platos, categories] = await Promise.all([
      readLocalMirror<Plato>(tenantId, "platos"),
      readLocalMirror<MenuCategoryRow>(tenantId, "menu_categories"),
    ]);
    const localData = normalizeCartaData(tenantId, sucursalId, platos, categories);
    if (localData.platos.length > 0 || !navigator.onLine) {
      return localData;
    }
  }

  const [platosRes, categoriesRes] = await Promise.all([
    insforgeClient.database
      .from("platos")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("sucursal_id", sucursalId)
      .order("categoria"),
    insforgeClient.database
      .from("menu_categories")
      .select("id, tenant_id, nombre, color, sort_order, sucursal_id")
      .eq("tenant_id", tenantId)
      .eq("sucursal_id", sucursalId)
      .order("sort_order")
      .order("nombre"),
  ]);

  if (platosRes.error || categoriesRes.error) {
    const [platos, categories] = await Promise.all([
      readLocalMirror<Plato>(tenantId, "platos").catch(() => []),
      readLocalMirror<MenuCategoryRow>(tenantId, "menu_categories").catch(() => []),
    ]);
    return normalizeCartaData(tenantId, sucursalId, platos, categories);
  }

  return {
    platos: (platosRes.data ?? []) as Plato[],
    categories: (categoriesRes.data ?? []) as MenuCategoryRow[],
  };
}

function CartaPanel() {
  const { tenantId, loading: authLoading } = useAuth();
  const { activeSucursalId, loading: sucursalLoading } = useSucursal();
  const { formatMoney, currencySymbol } = useTenantCurrency();
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [form, setForm] = useState({ nombre: "", precio: "", categoria: "General", disponible: true, va_a_cocina: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("Todos");

  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; onConfirm: () => void, title?: string, variant?: "danger" | "primary" }>({ open: false, message: "", onConfirm: () => {} });
  const showConfirm = (message: string, onConfirm: () => void, title = "Confirmar", variant: "danger" | "primary" = "danger") => setConfirmState({ open: true, message, onConfirm, title, variant });

  useEffect(() => {
    if (authLoading || sucursalLoading) return;
    if (!tenantId || !activeSucursalId) {
      setPlatos([]);
      setMenuCategories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadCartaData(tenantId, activeSucursalId)
      .then(({ platos, categories }) => {
        setPlatos(platos);
        setMenuCategories(categories);
      })
      .catch((err) => {
        console.error("Error al cargar carta:", err);
        setError(err?.message || "No se pudo cargar la carta.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [tenantId, activeSucursalId, authLoading, sucursalLoading]);

  const selected = platos.find((p) => p.id === selectedId) ?? null;
  const categoryOrder = menuCategories.map((category) => category.nombre);
  const categoryColorMap = useMemo(
    () => new Map(menuCategories.map((category) => [category.nombre, category.color])),
    [menuCategories]
  );
  const categoryOptions = categoryOrder.length > 0
    ? sortCategoriesForTabs(categoryOrder, categoryOrder)
    : sortCategoriesForTabs(["General", ...platos.map((p) => p.categoria)]);
  const categories = ["Todos", ...sortCategoriesForTabs([...categoryOptions, ...platos.map((p) => p.categoria)], categoryOptions)];
  const getCatColor = (cat: string) => categoryColorMap.get(cat) ?? suggestCategoryColor(cat);
  const filtered = activeFilter === "Todos" ? platos : platos.filter((p) => p.categoria === activeFilter);

  function openAdd() {
    setForm({ nombre: "", precio: "", categoria: categoryOptions[0] ?? "General", disponible: true, va_a_cocina: true });
    setSelectedId(null);
    setMode("add");
    setError("");
  }

  function openEdit(p: Plato) {
    setSelectedId(p.id);
    setForm({ nombre: p.nombre, precio: String(p.precio), categoria: p.categoria, disponible: p.disponible, va_a_cocina: p.va_a_cocina !== false });
    setMode("edit");
    setError("");
  }

  async function ensureCategoryExists(nombre: string, color = suggestCategoryColor(nombre)) {
    if (!tenantId || !activeSucursalId) return null;
    const normalized = normalizeCategoryName(nombre);
    const existing = menuCategories.find((category) => category.nombre.toLowerCase() === normalized.toLowerCase());
    if (existing) return existing;

    const row: MenuCategoryRow = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      nombre: normalized,
      color,
      sort_order: menuCategories.length,
      sucursal_id: activeSucursalId,
    };
    await enqueueLocalWrite({
      tenantId,
      tableName: "menu_categories",
      rowId: row.id,
      op: "insert",
      payload: { ...row },
      deviceId: await getDeviceId(),
    });
    setMenuCategories((prev) => [...prev, row]);
    return row;
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setError("El nombre es requerido."); return; }
    const precio = parseFloat(form.precio);
    if (isNaN(precio) || precio < 0) { setError("Precio inválido."); return; }
    if (!tenantId) {
      setError("No hay restaurante asociado a la sesión.");
      return;
    }
    if (!activeSucursalId) {
      setError("No hay sucursal activa para guardar este plato.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await ensureCategoryExists(form.categoria, getCatColor(form.categoria));
    } catch (err: any) {
      console.error("Error al asegurar categoria:", err);
      setError(`Error: ${err.message || "No se pudo preparar la categoría"}`);
      setSaving(false);
      return;
    }

    if (mode === "add") {
      const localId = createTemporaryIntegerId(platos.map((plato) => plato.id));
      const payload = {
        id: localId,
        nombre: form.nombre.trim(),
        precio,
        categoria: form.categoria,
        disponible: form.disponible,
        va_a_cocina: form.va_a_cocina,
        tenant_id: tenantId,
        sucursal_id: activeSucursalId,
      };
      try {
        await enqueueLocalWrite({
          tenantId,
          tableName: "platos",
          rowId: String(localId),
          op: "insert",
          payload,
          deviceId: await getDeviceId(),
        });
        setPlatos((prev) => [...prev, payload as Plato]);
        setMode(null);
        setSelectedId(null);
      } catch (err: any) {
        console.error("Error al crear plato:", err);
        setError(`Error: ${err.message || "No se pudo crear el plato"}`);
        setSaving(false);
        return;
      }
    } else if (mode === "edit" && selectedId) {
      const payload = {
        nombre: form.nombre.trim(),
        precio,
        categoria: form.categoria,
        disponible: form.disponible,
        va_a_cocina: form.va_a_cocina
      };
      try {
        await enqueueLocalWrite({
          tenantId,
          tableName: "platos",
          rowId: String(selectedId),
          op: "update",
          payload,
          deviceId: await getDeviceId(),
        });
      } catch (err: any) {
        console.error("Error al actualizar plato:", err);
        setError(`Error: ${err.message || "No se pudo actualizar el plato"}`);
        setSaving(false);
        return;
      }
      setPlatos((prev) => prev.map((p) => p.id === selectedId ? { ...p, nombre: form.nombre.trim(), precio, categoria: form.categoria, disponible: form.disponible, va_a_cocina: form.va_a_cocina } : p));
      setMode(null);
      setSelectedId(null);
    }
    setSaving(false);
  }

  function handleDelete(id: number) {
    if (!tenantId) return;
    const plato = platos.find((p) => p.id === id);
    if (!plato) return;
    
    showConfirm(`¿Estás seguro de eliminar "${plato.nombre}"? Esta acción no se puede deshacer.`, async () => {
      try {
        await enqueueLocalWrite({
          tenantId: tenantId!,
          tableName: "platos",
          rowId: String(id),
          op: "delete",
          deviceId: await getDeviceId(),
        });
      } catch (deletePlatoError: any) {
        alert(`Error al eliminar el plato: ${deletePlatoError.message}`);
        return;
      }

      setPlatos((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) { setSelectedId(null); setMode(null); }
    }, "Eliminar Plato");
  }

  if (loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando carta...</div>;

  const CELL = 140;
  const GAP = 10;

  return (
    <div className="flex-1 flex overflow-hidden min-h-0 bg-background transition-colors duration-300">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-[12px] px-4 sm:px-[24px] py-[12px] sm:py-[16px] border-b border-black/10 dark:border-white/10 shrink-0">
          <div className="flex gap-[8px] overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className="px-[14px] py-[6px] rounded-[8px] shrink-0 font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.5px] uppercase border border-black/5 dark:border-white/5 cursor-pointer transition-all bg-muted text-muted-foreground hover:text-foreground"
                style={{
                  backgroundColor: activeFilter === cat ? "var(--primary)" : undefined,
                  color: activeFilter === cat ? "var(--primary-foreground)" : undefined,
                }}
              >{cat}</button>
            ))}
          </div>
          <button
            onClick={openAdd}
            className="bg-primary text-primary-foreground rounded-[10px] px-[16px] py-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] tracking-[0.5px] uppercase border-none cursor-pointer shrink-0 shadow-lg"
          >
            + Nuevo Plato
          </button>
        </div>

        <div className="flex-1 overflow-auto p-[20px]">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-[40px] text-muted-foreground font-['Inter'] text-[12px]">Sin platos en esta categoría.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${CELL}px)`, gap: `${GAP}px` }}>
              {filtered.map((plato) => {
                const isSelected = selectedId === plato.id && mode === "edit";
                const cc = getCatColor(plato.categoria);
                return (
                  <div
                    key={plato.id}
                    onClick={() => openEdit(plato)}
                    className="bg-card rounded-[12px] border border-black/10 dark:border-white/10 cursor-pointer flex flex-col items-start justify-between p-[12px] transition-all relative overflow-hidden"
                    style={{
                      borderTop: `3px solid ${cc}`,
                      opacity: plato.disponible ? 1 : 0.4,
                      boxShadow: isSelected ? "0 0 16px var(--primary-alpha)" : undefined,
                      borderColor: isSelected ? "var(--primary)" : undefined,
                    }}
                  >
                    <div className="flex flex-col gap-[4px] w-full">
                      <div className="flex items-center gap-[4px] flex-wrap">
                        <div className="rounded-[4px] px-[5px] py-[2px] border border-black/5" style={{ backgroundColor: `${cc}15` }}>
                          <span className="font-['Inter',sans-serif] font-bold text-[8px] tracking-[0.8px] uppercase" style={{ color: cc }}>{plato.categoria}</span>
                        </div>
                        {!plato.va_a_cocina && (
                          <div className="rounded-[4px] px-[5px] py-[2px] bg-green-500/10 border border-green-500/20">
                            <span className="font-['Inter',sans-serif] font-bold text-[8px] tracking-[0.5px] uppercase text-green-600 dark:text-green-400">Directo</span>
                          </div>
                        )}
                      </div>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[12px] uppercase leading-tight line-clamp-2">{plato.nombre}</span>
                    </div>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px]" style={{ color: cc }}>{formatMoney(plato.precio)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {mode !== null && (
        <div className="w-[320px] shrink-0 bg-sidebar border-l border-black/10 dark:border-white/10 flex flex-col p-[24px] gap-[16px] overflow-y-auto shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[18px]">{mode === "add" ? "Nuevo Plato" : "Editar Plato"}</span>
            <button onClick={() => { setMode(null); setSelectedId(null); }} className="text-muted-foreground bg-transparent border-none cursor-pointer text-[20px] hover:text-foreground transition-colors">×</button>
          </div>
          <div className="h-px bg-black/5 dark:bg-white/5" />
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-[8px] px-[12px] py-[8px] text-destructive text-[12px] font-medium">{error}</div>}
          
          <div className="space-y-4">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Nombre</label>
              <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="input-field" placeholder="Nombre del plato" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">{`Precio (${currencySymbol})`}</label>
              <input type="number" step="0.01" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Categoría</label>
              <Select value={form.categoria} onValueChange={val => setForm(f => ({ ...f, categoria: val }))}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Disponible</span>
              <button onClick={() => setForm(f => ({ ...f, disponible: !f.disponible }))} className={`rounded-full px-[12px] py-[5px] text-[10px] font-bold uppercase transition-all cursor-pointer border ${form.disponible ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400" : "bg-muted border-border text-muted-foreground"}`}>{form.disponible ? "Sí" : "No"}</button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col"><span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Cocina</span><span className="text-[9px] text-muted-foreground/60">¿Pasa por pedido de cocina?</span></div>
              <button onClick={() => setForm(f => ({ ...f, va_a_cocina: !f.va_a_cocina }))} className={`rounded-full px-[12px] py-[5px] text-[10px] font-bold uppercase transition-all cursor-pointer border ${form.va_a_cocina ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"}`}>{form.va_a_cocina ? "Sí" : "No"}</button>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-black/5 dark:border-white/5">
            <button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground rounded-xl py-3.5 font-bold uppercase text-[12px] tracking-widest shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer">{saving ? "Guardando..." : "Guardar Plato"}</button>
            {mode === "edit" && selected && (
              <button onClick={() => handleDelete(selected.id)} className="bg-destructive/10 text-destructive rounded-xl py-3.5 font-bold uppercase text-[12px] tracking-widest hover:bg-destructive/20 transition-all border border-destructive/20 cursor-pointer">Eliminar Plato</button>
            )}
          </div>
        </div>
      )}
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
      <style>{`
        .input-field {
          width: 100%;
          background-color: var(--muted);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 14px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: var(--primary);
          background-color: transparent;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// USUARIOS PANEL
// ─────────────────────────────────────────────
function CategoriasPanel() {
  const { tenantId, loading: authLoading } = useAuth();
  const { activeSucursalId, loading: sucursalLoading } = useSucursal();
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryColorDraft, setCategoryColorDraft] = useState("#ff906d");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; onConfirm: () => void, title?: string, variant?: "danger" | "primary" }>({ open: false, message: "", onConfirm: () => {} });
  const showConfirm = (message: string, onConfirm: () => void, title = "Confirmar", variant: "danger" | "primary" = "danger") => setConfirmState({ open: true, message, onConfirm, title, variant });

  useEffect(() => {
    if (authLoading || sucursalLoading) return;
    if (!tenantId || !activeSucursalId) {
      setPlatos([]);
      setMenuCategories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadCartaData(tenantId, activeSucursalId)
      .then(({ platos, categories }) => {
        setPlatos(platos);
        setMenuCategories(categories);
      })
      .catch((err) => {
        console.error("Error al cargar categorias:", err);
        setError(err?.message || "No se pudieron cargar las categorias.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [tenantId, activeSucursalId, authLoading, sucursalLoading]);

  const categoryOrder = menuCategories.map((category) => category.nombre);
  const categoryOptions = categoryOrder.length > 0
    ? sortCategoriesForTabs(categoryOrder, categoryOrder)
    : sortCategoriesForTabs(["General", ...platos.map((p) => p.categoria)]);
  const categorySuggestions = sortCategoriesForTabs(
    [
      ...DEFAULT_MENU_CATEGORY_SUGGESTIONS,
      ...platos.map((p) => p.categoria),
    ].filter((name) => !categoryOptions.some((created) => created.toLowerCase() === normalizeCategoryName(name).toLowerCase())),
    DEFAULT_MENU_CATEGORY_SUGGESTIONS
  );

  function assignedCountFor(categoryName: string) {
    return platos.filter((plato) => plato.categoria === categoryName).length;
  }

  function resetForm() {
    setEditingCategoryId(null);
    setCategoryDraft("");
    setCategoryColorDraft("#ff906d");
    setError("");
  }

  function startEditCategory(category: MenuCategoryRow) {
    setEditingCategoryId(category.id);
    setCategoryDraft(category.nombre);
    setCategoryColorDraft(category.color);
    setError("");
  }

  async function ensureCategoryExists(nombre: string, color = suggestCategoryColor(nombre)) {
    if (!tenantId || !activeSucursalId) return null;
    const normalized = normalizeCategoryName(nombre);
    const existing = menuCategories.find((category) => category.nombre.toLowerCase() === normalized.toLowerCase());
    if (existing) return existing;

    const row: MenuCategoryRow = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      nombre: normalized,
      color,
      sort_order: menuCategories.length,
      sucursal_id: activeSucursalId,
    };
    try {
      await enqueueLocalWrite({
        tenantId,
        tableName: "menu_categories",
        rowId: row.id,
        op: "insert",
        payload: { ...row },
        deviceId: await getDeviceId(),
      });
    } catch (insertError: any) {
      setError(insertError?.message || "No se pudo crear la categoria.");
      return null;
    }
    setMenuCategories((prev) => [...prev, row]);
    return row;
  }

  async function handleSaveCategory() {
    if (!tenantId) return;
    const nombre = normalizeCategoryName(categoryDraft);
    if (!nombre) {
      setError("Escribe un nombre de categoría.");
      return;
    }
    const duplicated = menuCategories.some(
      (category) => category.id !== editingCategoryId && category.nombre.toLowerCase() === nombre.toLowerCase()
    );
    if (duplicated) {
      setError("Ya existe una categoría con ese nombre.");
      return;
    }

    setSaving(true);
    setError("");

    if (editingCategoryId) {
      const current = menuCategories.find((category) => category.id === editingCategoryId);
      const updatedCategory = current
        ? { ...current, nombre, color: categoryColorDraft }
        : { id: editingCategoryId, tenant_id: tenantId, nombre, color: categoryColorDraft, sort_order: menuCategories.length };
      try {
        await enqueueLocalWrite({
          tenantId,
          tableName: "menu_categories",
          rowId: editingCategoryId,
          op: "update",
          payload: { nombre, color: categoryColorDraft },
          deviceId: await getDeviceId(),
        });
      } catch (updateError: any) {
        setError(updateError?.message || "No se pudo actualizar la categoria.");
        setSaving(false);
        return;
      }
      if (current && current.nombre !== nombre) {
        try {
          const deviceId = await getDeviceId();
          await Promise.all(platos
            .filter((plato) => plato.categoria === current.nombre)
            .map((plato) => enqueueLocalWrite({
              tenantId,
              tableName: "platos",
              rowId: String(plato.id),
              op: "update",
              payload: { categoria: nombre },
              deviceId,
            })));
        } catch (platosError: any) {
          setError(`Categoria guardada, pero no se pudieron actualizar los platos: ${platosError.message}`);
          setSaving(false);
          return;
        }
        setPlatos((prev) => prev.map((plato) => plato.categoria === current.nombre ? { ...plato, categoria: nombre } : plato));
      }
      setMenuCategories((prev) => prev.map((category) => category.id === editingCategoryId ? updatedCategory : category));
      resetForm();
      setSaving(false);
      return;
    }

    const created = await ensureCategoryExists(nombre, categoryColorDraft);
    if (created) resetForm();
    setSaving(false);
  }

  async function handleDeleteCategory(category: MenuCategoryRow) {
    if (!tenantId) return;
    const assignedCount = assignedCountFor(category.nombre);
    
    const executeDelete = async () => {
      try {
        await enqueueLocalWrite({
          tenantId: tenantId!,
          tableName: "menu_categories",
          rowId: category.id,
          op: "delete",
          deviceId: await getDeviceId(),
        });
        setMenuCategories((prev) => prev.filter((c) => c.id !== category.id));
      } catch (err: any) {
        setError(err.message);
      }
    };

    if (assignedCount > 0) {
      if (category.nombre === "General") {
        setError("No puedes eliminar General mientras tenga platos asignados.");
        return;
      }
      showConfirm(`Eliminar "${category.nombre}"?\n\n${assignedCount} plato(s) pasarán a General.`, async () => {
        await ensureCategoryExists("General", "#a1a1aa");
        try {
          const deviceId = await getDeviceId();
          await Promise.all(platos
            .filter((plato) => plato.categoria === category.nombre)
            .map((plato) => enqueueLocalWrite({
              tenantId: tenantId!,
              tableName: "platos",
              rowId: String(plato.id),
              op: "update",
              payload: { categoria: "General" },
              deviceId,
            })));
        } catch (platosError: any) {
          setError(platosError.message);
          return;
        }
        setPlatos((prev) => prev.map((plato) => plato.categoria === category.nombre ? { ...plato, categoria: "General" } : plato));
        await executeDelete();
      }, "Eliminar Categoría");
    } else {
      showConfirm(`Eliminar categoría "${category.nombre}"?`, executeDelete, "Eliminar Categoría");
    }
  }

  async function handleUseSuggestion(name: string) {
    const normalized = normalizeCategoryName(name);
    const created = await ensureCategoryExists(normalized, suggestCategoryColor(normalized));
    if (created) resetForm();
  }

  if (loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando categorías...</div>;

  return (
    <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-8 transition-colors duration-300">
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-['Space_Grotesk'] text-2xl font-bold text-foreground">Categorías</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Organiza la carta de este restaurante sin afectar otros negocios.</p>
            </div>
            <span className="rounded-full border border-black/10 bg-card px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground dark:border-white/10">
              {menuCategories.length} creadas
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {menuCategories.map((category) => {
              const assignedCount = assignedCountFor(category.nombre);
              return (
                <div key={category.id} className="rounded-[14px] border border-black/10 bg-card p-4 shadow-sm dark:border-white/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-1 size-4 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                      <div className="min-w-0">
                        <div className="font-['Space_Grotesk'] text-[16px] font-bold uppercase leading-tight text-foreground">
                          {category.nombre}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {assignedCount} plato{assignedCount === 1 ? "" : "s"} asignado{assignedCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => startEditCategory(category)} className="rounded-[8px] border border-black/10 bg-muted px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground cursor-pointer dark:border-white/10">
                        Editar
                      </button>
                      <button type="button" onClick={() => void handleDeleteCategory(category)} className="rounded-[8px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-destructive cursor-pointer">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {categorySuggestions.length > 0 && (
            <div className="rounded-[16px] border border-black/10 bg-card p-4 dark:border-white/10">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sugeridas</div>
              <div className="flex flex-wrap gap-2">
                {categorySuggestions.slice(0, 14).map((name) => (
                  <button key={name} type="button" onClick={() => void handleUseSuggestion(name)} className="rounded-full border border-black/10 bg-muted px-3 py-2 text-[11px] font-bold text-muted-foreground cursor-pointer hover:text-foreground dark:border-white/10">
                    + {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-fit rounded-[18px] border border-black/10 bg-card p-5 shadow-sm dark:border-white/10">
          <div className="mb-4">
            <h3 className="font-['Space_Grotesk'] text-lg font-bold text-foreground">
              {editingCategoryId ? "Editar categoría" : "Nueva categoría"}
            </h3>
            <p className="mt-1 text-[12px] text-muted-foreground">El nombre se usará en la carta, POS, cocina y facturación.</p>
          </div>
          {error && (
            <div className="mb-4 rounded-[10px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nombre</label>
              <input
                type="text"
                value={categoryDraft}
                onChange={(e) => {
                  setCategoryDraft(e.target.value);
                  if (!editingCategoryId) setCategoryColorDraft(suggestCategoryColor(e.target.value));
                }}
                className="input-field"
                placeholder="Ej. Parrilla"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={categoryColorDraft} onChange={(e) => setCategoryColorDraft(e.target.value)} className="h-[44px] w-[58px] rounded-[12px] border border-border bg-transparent p-1 cursor-pointer" aria-label="Color de categoría" />
                <div className="flex-1 rounded-[12px] border border-black/10 bg-muted px-3 py-2 text-[12px] font-bold text-foreground dark:border-white/10">
                  {categoryColorDraft}
                </div>
              </div>
            </div>
            <button type="button" onClick={() => void handleSaveCategory()} disabled={saving} className="rounded-xl bg-primary py-3 font-bold uppercase tracking-widest text-primary-foreground border-none cursor-pointer disabled:opacity-50">
              {saving ? "Guardando..." : editingCategoryId ? "Guardar cambios" : "Crear categoría"}
            </button>
            {editingCategoryId && (
              <button type="button" onClick={resetForm} className="rounded-xl border border-black/10 bg-muted py-3 font-bold uppercase tracking-widest text-muted-foreground cursor-pointer dark:border-white/10">
                Cancelar edición
              </button>
            )}
          </div>
        </div>
      </div>
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
      <style>{`
        .input-field {
          width: 100%;
          background-color: var(--muted);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 14px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: var(--primary);
          background-color: transparent;
        }
      `}</style>
    </div>
  );
}

function UsuariosPanel() {
  const { tenantId, tenantUser, user } = useAuth();
  const [teamUsers, setTeamUsers] = useState<TenantUserRow[]>([]);
  const [tenantLimitConfig, setTenantLimitConfig] = useState<TenantUserLimitConfig>({
    userLimitEnabled: false,
    adminUserLimit: null,
    cajeraUserLimit: null,
    cocinaUserLimit: null,
    meseroUserLimit: null,
  });
  const [listLoading, setListLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<(typeof STAFF_ROLES)[number]["value"]>("cajera");
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; onConfirm: () => void, title?: string, variant?: "danger" | "primary" }>({ open: false, message: "", onConfirm: () => {} });
  const showConfirm = (message: string, onConfirm: () => void, title = "Confirmar", variant: "danger" | "primary" = "danger") => setConfirmState({ open: true, message, onConfirm, title, variant });

  async function loadUsers() {
    if (!tenantId) return;
    setListLoading(true);
    const [usersRes, tenantRes] = await Promise.all([
      insforgeClient.database.from("tenant_users").select("id, email, rol, nombre, activo, auth_user_id").eq("tenant_id", tenantId).order("email"),
      insforgeClient.database.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    ]);
    if (!usersRes.error && usersRes.data) setTeamUsers(usersRes.data as TenantUserRow[]);
    if (!tenantRes.error && tenantRes.data) setTenantLimitConfig(extractTenantUserLimitConfig(tenantRes.data as TenantRow));
    setListLoading(false);
  }

  useEffect(() => { void loadUsers(); }, [tenantId]);

  function handleDeleteUser(row: TenantUserRow) {
    if (!tenantId || (row.auth_user_id === user?.id)) return;
    
    showConfirm(`¿Eliminar completamente el acceso de «${row.email}» y todo lo relacionado?`, async () => {
      setDeletingId(row.id);
      
      const { error } = await insforgeClient.database.rpc("cloudix_owner_delete_staff_user", {
        p_tenant_user_id: row.id,
      });
      
      setDeletingId(null);
      if (error) {
        alert(`Error al eliminar: ${error.message}`);
      } else {
        await loadUsers();
      }
    }, "Eliminar Usuario");
  }

  async function handleCreate() {
    if (!email.trim() || !password.trim()) { setError("Completa todos los campos."); return; }
    if (!tenantId || !tenantUser?.email) return;
    setCreating(true); setError(""); setSuccess("");
    
    const staffEmail = email.trim();
    const currentForRole = countActiveUsersByRole(teamUsers, rol);
    const roleLimit = getLimitForRole(tenantLimitConfig, rol);
    if (roleLimit !== null && currentForRole >= roleLimit) {
      setError(`Límite de usuarios (${roleLimit}) alcanzado para este rol.`);
      setCreating(false); return;
    }

    const tempClient = (await import("@insforge/sdk")).createClient({
      baseUrl: import.meta.env.VITE_INSFORGE_BASE_URL || "https://restaurante.azokia.com",
      anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDAxMzF9.OQwbEoWPtw-inbXdU3D7c39RZn3c87FJ-HvMBF_jrn4",
      isServerMode: true
    });

    const { data: signData, error: authError } = await tempClient.auth.signUp({ email: staffEmail, password });
    if (authError) { setError((authError as any).message); setCreating(false); return; }

    const newUserId = (signData as any)?.user?.id;

    const { error: insertError } = await insforgeClient.database.from("tenant_users").insert([{ auth_user_id: newUserId, tenant_id: tenantId, email: staffEmail, password_hash: "MANAGED_BY_AUTH", rol, nombre: nombre.trim() || null, activo: true }]);
    
    if (insertError) {
      setError(buildStaffProvisioningRecoveryMessage({
        email: staffEmail,
        authUserId: newUserId,
        cause: insertError.message,
      }));
      setCreating(false);
      return;
    }

    setSuccess(`Usuario creado.`); setEmail(""); setPassword(""); setNombre(""); await loadUsers();
    setCreating(false);
  }

  return (
    <div className="flex-1 p-4 sm:p-8 bg-background transition-colors duration-300 overflow-y-auto">
      <div className="max-w-[1000px] mx-auto grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 items-start">
        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm h-fit">
          <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground mb-1">Equipo de Trabajo</h2>
          <p className="text-muted-foreground text-[13px] mb-6">Gestión de accesos para cajeras y personal de cocina.</p>
          
          {listLoading ? <div className="py-10 text-center text-muted-foreground text-sm">Cargando...</div> : (
            <div className="overflow-x-auto rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
               <table className="w-full text-left border-collapse">
                  <thead className="bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                     <tr><th className="px-4 py-3">Email / Usuario</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3 text-right">Acción</th></tr>
                  </thead>
                  <tbody className="text-[13px] divide-y divide-black/5 dark:divide-white/5">
                     {teamUsers.map(u => (
                        <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                           <td className="px-4 py-4"><div className="text-foreground font-medium">{u.email}</div><div className="text-[11px] text-muted-foreground">{u.nombre || "Sin nombre"}</div></td>
                           <td className="px-4 py-4 uppercase text-[11px] font-bold text-primary">{u.rol}</td>
                           <td className="px-4 py-4 text-right">
                              <button onClick={() => void handleDeleteUser(u)} disabled={deletingId === u.id || u.auth_user_id === user?.id} className="text-destructive/60 hover:text-destructive font-bold text-[11px] uppercase tracking-widest border-none bg-transparent cursor-pointer disabled:opacity-20 transition-colors">Eliminar</button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm h-fit flex flex-col gap-6">
           <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Crear Acceso</h2>
           {success && <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-600 dark:text-green-400 text-sm">{success}</div>}
           {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-destructive text-sm">{error}</div>}
           
           <div className="space-y-4">
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Rol</label>
                <Select value={rol} onValueChange={val => setRol(val as any)}>
                   <SelectTrigger className="rounded-xl">
                     <SelectValue placeholder="Seleccionar rol" />
                   </SelectTrigger>
                   <SelectContent className="rounded-xl">
                     {STAFF_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                   </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Nombre</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="input-field" placeholder="Ej. Juan - Caja" />
              </div>
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="email@negocio.com" />
              </div>
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="Mín. 6 caracteres" />
              </div>
           </div>
           <button onClick={handleCreate} disabled={creating} className="bg-primary text-primary-foreground rounded-xl py-3.5 font-bold uppercase text-[12px] tracking-widest shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer mt-2">{creating ? "Creando..." : "Registrar Miembro"}</button>
          </div>
          <ChangePasswordCard />
        </div>
      </div>
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
      <style>{`
        .input-field {
          width: 100%;
          background-color: var(--muted);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 14px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: var(--primary);
          background-color: transparent;
        }
      `}</style>
    </div>
  );
}

function ChangePasswordCard() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email || !currentPassword || !newPassword) {
      setError("Completá ambos campos");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: signInError } = await insforgeClient.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setError("La contraseña actual es incorrecta");
        setLoading(false);
        return;
      }

      const { error: updateError } = await insforgeClient.database.rpc("cloudix_update_my_password", {
        p_new_password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || "Error al actualizar contraseña");
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch (err: any) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm h-fit flex flex-col gap-6">
      <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Cambiar Contraseña</h2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-6">
        Ingresá tu contraseña actual para verificar tu identidad y luego elegí la nueva.
      </p>
      
      <form onSubmit={handleChangePassword} className="flex flex-col gap-4 max-w-md">
        {error && (
          <div className="bg-[rgba(255,115,70,0.1)] border border-[#ff7346] rounded-[6px] sm:rounded-[8px] p-2 sm:p-3 text-[#ff7346] text-xs font-medium text-center animate-shake">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-[rgba(89,238,80,0.08)] border border-[rgba(89,238,80,0.25)] rounded-[6px] sm:rounded-[8px] p-2 sm:p-3 text-[#59ee50] text-xs font-medium text-center">
            Contraseña actualizada correctamente
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Contraseña Actual</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="input-field"
            placeholder="••••••••••••"
          />
        </div>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Nueva Contraseña</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-field"
            placeholder="••••••••••••"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading || !currentPassword || !newPassword}
          className="bg-primary text-primary-foreground rounded-xl py-3 font-bold uppercase text-[11px] tracking-[0.2em] shadow-sm hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer mt-2"
        >
          {loading ? "Actualizando..." : "Actualizar Contraseña"}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// PANEL DE MESAS
// ─────────────────────────────────────────────
function MesasPanel() {
  const { tenantId } = useAuth();
  const [cantidad, setCantidad] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    loadCantidadMesas(tenantId).then(val => { setCantidad(val); setLoading(false); });
  }, [tenantId]);

  async function handleSave() {
    if (!tenantId) return;
    if (cantidad < 1 || cantidad > 100) { alert("Máximo 100 mesas."); return; }
    setSaving(true);
    const { error } = await saveCantidadMesas(tenantId, cantidad);
    setSaving(false);
    if (error) alert(error.message); else alert("Configuración guardada.");
  }

  if (loading) return <div className="p-10 text-muted-foreground font-['Space_Grotesk'] text-center">Cargando...</div>;

  return (
    <div className="flex-1 p-4 sm:p-10 bg-background transition-colors duration-300 overflow-y-auto">
      <div className="max-w-[520px] mx-auto bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-10 shadow-sm flex flex-col gap-8">
        <div className="space-y-2">
           <h2 className="font-['Space_Grotesk'] text-2xl font-bold text-foreground">Gestión de Mesas</h2>
           <p className="text-muted-foreground text-sm leading-relaxed">Define la cantidad total de mesas para tu salón. El sistema ajustará la distribución automáticamente.</p>
        </div>
        <div className="flex flex-col gap-6">
           <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Cantidad de Mesas</label>
              <input type="number" value={cantidad} onChange={e => setCantidad(parseInt(e.target.value) || 1)} className="input-field text-lg font-bold" />
           </div>
           <button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground rounded-xl py-4 font-bold uppercase text-[12px] tracking-widest shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer">{saving ? "Guardando..." : "Guardar Distribución"}</button>
        </div>
      </div>
      <style>{`
        .input-field {
          width: 100%;
          background-color: var(--muted);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 16px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: var(--primary);
          background-color: transparent;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// DIGITAL MENU PANEL
// ─────────────────────────────────────────────
function DigitalMenuPanel() {
  const { tenantId, plan } = useAuth();
  const { activeSucursalId } = useSucursal();
  const [settings, setSettings] = useState<any>(null);
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [dishSearch, setDishSearch] = useState("");

  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#f97316");

  const [editingPlato, setEditingPlato] = useState<any | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const [confirmState, setConfirmState] = useState<{ open: boolean; message: string; onConfirm: () => void, title?: string, variant?: "danger" | "primary" }>({ open: false, message: "", onConfirm: () => {} });

  useEffect(() => {
    if (!tenantId) return;
    const currentTenantId: string = tenantId;

    async function loadData() {
      try {
        setLoading(true);
        const platosLocal = await readLocalMirror<Plato>(currentTenantId, "platos");
        const filteredPlatos = platosLocal.filter(p => !p.sucursal_id || p.sucursal_id === activeSucursalId);
        setPlatos(filteredPlatos);

        const settingsLocal = await readLocalMirror<any>(currentTenantId, "digital_menu_settings");
        const tenantSettings = settingsLocal.find((s: any) => s.tenant_id === currentTenantId && (!s.sucursal_id || s.sucursal_id === activeSucursalId));

        if (tenantSettings) {
          setSettings(tenantSettings);
          setEnabled(tenantSettings.enabled || false);
          setSlug(tenantSettings.public_slug || "");
          setTitle(tenantSettings.title || "");
          setDescription(tenantSettings.description || "");
          setLogoUrl(tenantSettings.logo_url || "");
          setBannerUrl(tenantSettings.banner_url || "");
          setAccentColor(tenantSettings.theme?.accentColor || "#f97316");
        } else {
          setSlug(`restaurante-${currentTenantId.slice(0, 8)}`);
        }

        const itemsLocal = await readLocalMirror<any>(currentTenantId, "digital_menu_items");
        setMenuItems(itemsLocal.filter((mi: any) => mi.tenant_id === currentTenantId));
      } catch (err: any) {
        console.error("Error loading digital menu settings:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [tenantId, activeSucursalId]);

  const resolvedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
  
  const qrUrl = plan === "profesional" || plan === "empresarial"
    ? `https://claudix-app.azokia.com/#/menu/${resolvedSlug}`
    : `https://claudix-app.azokia.com`;

  useEffect(() => {
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, { width: 256, margin: 2 })
      .then((url: string) => setQrCodeDataUrl(url))
      .catch((err: Error | unknown) => console.error(err));
  }, [qrUrl]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (plan === "basico") return;

    if (!resolvedSlug) {
      setError("El slug público es obligatorio.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const isEdit = !!settings;
      const settingsId = settings?.id || crypto.randomUUID();

      const payload = {
        id: settingsId,
        tenant_id: tenantId,
        sucursal_id: activeSucursalId || null,
        enabled,
        public_slug: resolvedSlug,
        title: title.trim() || null,
        description: description.trim() || null,
        logo_url: logoUrl.trim() || null,
        banner_url: bannerUrl.trim() || null,
        theme: { accentColor },
        updated_at: new Date().toISOString()
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "digital_menu_settings",
        rowId: settingsId,
        op: isEdit ? "update" : "insert",
        payload,
        deviceId: await getDeviceId(),
      });

      // Also sync the menu_url to the tenants table for receipt printing
      await enqueueLocalWrite({
        tenantId,
        tableName: "tenants",
        rowId: tenantId,
        op: "update",
        payload: { id: tenantId, menu_url: enabled ? `https://claudix-app.azokia.com/#/menu/${resolvedSlug}` : null, updated_at: new Date().toISOString() },
        deviceId: await getDeviceId(),
      });

      setSettings(payload);
      setSuccess("Configuración del menú digital guardada.");
    } catch (err: any) {
      console.error("Error saving settings:", err);
      setError(`Error: ${err.message || "No se pudo guardar la configuración"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDishVisibility = async (platoId: number, visible: boolean) => {
    if (!tenantId || plan === "basico") return;

    try {
      setError("");
      const existingItem = menuItems.find((mi: any) => mi.plato_id === platoId);
      const itemId = existingItem?.id || crypto.randomUUID();

      const payload = {
        id: itemId,
        tenant_id: tenantId,
        plato_id: platoId,
        visible,
        display_name: existingItem?.display_name || null,
        description: existingItem?.description || null,
        image_url: existingItem?.image_url || null,
        sort_order: existingItem?.sort_order || 0,
        updated_at: new Date().toISOString()
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "digital_menu_items",
        rowId: itemId,
        op: existingItem ? "update" : "insert",
        payload,
        deviceId: await getDeviceId(),
      });

      setMenuItems(prev => {
        const other = prev.filter(mi => mi.plato_id !== platoId);
        return [...other, payload];
      });
    } catch (err: any) {
      console.error("Error updating visibility:", err);
      setError(`Error: ${err.message || "No se pudo actualizar visibilidad"}`);
    }
  };

  const handleUpdateDishCustomFields = async () => {
    if (!tenantId || !editingPlato || plan === "basico") return;

    try {
      setError("");
      setSuccess("");

      const platoId = editingPlato.id;
      const existingItem = menuItems.find((mi: any) => mi.plato_id === platoId);
      const itemId = existingItem?.id || crypto.randomUUID();

      const payload = {
        id: itemId,
        tenant_id: tenantId,
        plato_id: platoId,
        visible: existingItem ? existingItem.visible : true,
        display_name: editDisplayName.trim() || null,
        description: editDescription.trim() || null,
        image_url: editImageUrl.trim() || null,
        sort_order: existingItem?.sort_order || 0,
        updated_at: new Date().toISOString()
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "digital_menu_items",
        rowId: itemId,
        op: existingItem ? "update" : "insert",
        payload,
        deviceId: await getDeviceId(),
      });

      setMenuItems(prev => {
        const other = prev.filter(mi => mi.plato_id !== platoId);
        return [...other, payload];
      });
      setSuccess(`Plato "${editingPlato.nombre}" personalizado con éxito.`);
      setEditingPlato(null);
    } catch (err: any) {
      console.error("Error updating plate custom fields:", err);
      setError(`Error: ${err.message || "No se pudo guardar la personalización"}`);
    }
  };

  const handleOpenEditPlato = (plato: any) => {
    const custom = menuItems.find((mi: any) => mi.plato_id === plato.id);
    setEditingPlato(plato);
    setEditDisplayName(custom?.display_name || plato.nombre);
    setEditDescription(custom?.description || "");
    setEditImageUrl(custom?.image_url || "");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${tenantId}/platos/${editingPlato.id}-${Date.now()}.${fileExt}`;

      const { error } = await insforgeClient.storage
        .from('configuracion')
        .upload(fileName, file);

      if (error) {
        window.alert("Error al subir la imagen: " + error.message);
        console.error(error);
        return;
      }
      const publicUrl = insforgeClient.storage
        .from('configuracion')
        .getPublicUrl(fileName);

      setEditImageUrl(publicUrl as unknown as string);
    } catch (err) {
      console.error("Upload error:", err);
      window.alert("Error inesperado al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  const filteredPlatosList = useMemo(() => {
    return platos.filter((p: any) => 
      p.nombre.toLowerCase().includes(dishSearch.toLowerCase()) || 
      p.categoria.toLowerCase().includes(dishSearch.toLowerCase())
    );
  }, [platos, dishSearch]);

  const handleDownloadQR = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement("a");
    link.href = qrCodeDataUrl;
    link.download = `qr-menu-${resolvedSlug || "azokia"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrUrl)
      .then(() => alert("¡Enlace copiado al portapapeles!"))
      .catch(err => console.error(err));
  };

  if (loading) return <div className="p-10 text-muted-foreground font-['Space_Grotesk'] text-center">Cargando configuración...</div>;

  const isBasic = plan === "basico";

  return (
    <div className="flex-1 p-4 sm:p-8 bg-background overflow-y-auto relative">
      {isBasic && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl p-4 mb-6 flex flex-col gap-2">
          <h3 className="font-bold text-sm">🔒 Módulo Exclusivo Plan Profesional</h3>
          <p className="text-xs leading-relaxed">Estás usando el plan Básico de Azokia. En este plan, tu código QR apunta al sitio general de Azokia. Actualiza a Profesional para configurar tu menú digital administrable con tu propio link y recibir pedidos de clientes finales en tiempo real.</p>
        </div>
      )}

      {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 mb-6 text-sm">{error}</div>}
      {success && <div className="bg-green-500/10 border border-green-500/20 text-green-500 rounded-xl p-4 mb-6 text-sm">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 flex flex-col gap-6 relative">
          {isBasic && <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] z-10 rounded-[24px] pointer-events-none" />}
          
          <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 shadow-sm">
            <h3 className="font-['Space_Grotesk'] text-lg font-bold text-foreground mb-4">Configuración del Menú</h3>
            <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <label className="text-sm font-semibold">Activar Menú Digital</label>
                <input 
                  type="checkbox" 
                  checked={enabled} 
                  disabled={isBasic}
                  onChange={e => setEnabled(e.target.checked)}
                  className="w-5 h-5 rounded accent-primary cursor-pointer disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Link del Restaurante (Slug)</label>
                <div className="flex items-center bg-muted border border-border rounded-xl px-3 py-2 text-sm text-muted-foreground">
                  <span className="select-none opacity-60 shrink-0">https://claudix-app.azokia.com/#/menu/</span>
                  <input 
                    type="text" 
                    placeholder="mi-restaurante"
                    disabled={isBasic}
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    className="bg-transparent border-none text-foreground w-full focus:outline-none ml-0.5"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Título Público</label>
                <input 
                  type="text" 
                  placeholder="Ej. Cyberbistro Bella Vista"
                  disabled={isBasic}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Descripción del Negocio</label>
                <textarea 
                  placeholder="Ej. Las mejores hamburguesas artesanales de Santo Domingo..."
                  disabled={isBasic}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="input-field resize-none"
                />
              </div>


              <button 
                type="submit" 
                disabled={saving || isBasic}
                className="bg-primary text-primary-foreground rounded-xl py-3 font-bold uppercase text-[11px] tracking-widest shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer mt-2"
              >
                {saving ? "Guardando..." : "Guardar Configuración"}
              </button>
            </form>
          </div>

          <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 shadow-sm flex flex-col items-center text-center gap-4">
            <h3 className="font-['Space_Grotesk'] text-sm font-bold text-foreground self-start mb-1">
              {isBasic ? "Código QR General Azokia" : "Código QR del Menú Digital"}
            </h3>
            {qrCodeDataUrl ? (
              <div className="bg-white p-3 rounded-2xl border border-black/5 flex items-center justify-center shadow-inner">
                <img src={qrCodeDataUrl} alt="QR Code" className="w-48 h-48 object-contain" />
              </div>
            ) : (
              <div className="w-48 h-48 rounded-2xl bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground">Generando QR...</div>
            )}
            <div className="flex flex-col gap-1.5 w-full">
              <span className="text-xs font-semibold text-primary break-all">{qrUrl}</span>
              <p className="text-[11px] text-muted-foreground">Escaneá o compartí este enlace para acceder al menú.</p>
            </div>
            <div className="flex gap-3 w-full mt-2">
              <button 
                onClick={handleCopyLink} 
                className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-2.5 rounded-xl font-bold text-xs border border-border cursor-pointer transition-colors"
              >
                Copiar Enlace
              </button>
              <button 
                onClick={handleDownloadQR} 
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-bold text-xs border-none cursor-pointer hover:opacity-90 transition-all"
              >
                Descargar QR
              </button>
            </div>
            <div className="w-full mt-1">
              <a 
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`¡Hola! Acá te comparto nuestro menú digital:\n${qrUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-[#25D366]/10 text-[#25D366] font-bold py-2.5 rounded-xl hover:bg-[#25D366]/20 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                Compartir Menú por WhatsApp
              </a>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col gap-6 relative">
          {isBasic && <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] z-10 rounded-[24px] pointer-events-none" />}

          <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 shadow-sm flex flex-col gap-4 min-h-[500px]">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="font-['Space_Grotesk'] text-lg font-bold text-foreground">Carta de Platos en Web</h3>
                <p className="text-xs text-muted-foreground">Controlá qué platos son visibles en internet y personalizá sus fotos y descripciones.</p>
              </div>
              <input 
                type="text" 
                placeholder="Buscar plato o categoría..."
                value={dishSearch}
                onChange={e => setDishSearch(e.target.value)}
                className="input-field py-2 px-4 text-xs max-w-[200px]"
              />
            </div>

            <div className="flex-1 overflow-x-auto animate-[fadeIn_0.2s_ease-out]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground uppercase font-bold tracking-wider">
                    <th className="pb-3 pl-2">Plato</th>
                    <th className="pb-3">Categoría</th>
                    <th className="pb-3 text-right">Precio</th>
                    <th className="pb-3 text-center">Visible</th>
                    <th className="pb-3 text-center pr-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredPlatosList.map((plato) => {
                    const custom = menuItems.find((mi: any) => mi.plato_id === plato.id);
                    const isVisible = custom ? custom.visible : plato.disponible;
                    const isCustomized = custom && (custom.display_name || custom.description || custom.image_url);

                    return (
                      <tr key={plato.id} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3.5 pl-2 font-semibold">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-foreground truncate max-w-[180px]">{custom?.display_name || plato.nombre}</span>
                            {isCustomized && <span className="text-[10px] text-primary font-medium">Personalizado</span>}
                          </div>
                        </td>
                        <td className="py-3.5 text-muted-foreground">{plato.categoria}</td>
                        <td className="py-3.5 text-right font-bold">{new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(plato.precio)}</td>
                        <td className="py-3.5 text-center">
                          <input 
                            type="checkbox" 
                            checked={isVisible}
                            disabled={isBasic}
                            onChange={e => handleToggleDishVisibility(plato.id, e.target.checked)}
                            className="w-4 h-4 rounded accent-primary cursor-pointer disabled:opacity-50"
                          />
                        </td>
                        <td className="py-3.5 text-center pr-2">
                          <button
                            onClick={() => handleOpenEditPlato(plato)}
                            disabled={isBasic}
                            className="bg-muted hover:bg-muted-foreground/15 text-foreground px-3 py-1.5 rounded-lg border border-border text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-50"
                          >
                            Personalizar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {editingPlato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 max-w-[500px] w-full shadow-xl flex flex-col gap-6">
            <div>
              <h3 className="font-['Space_Grotesk'] text-lg font-bold text-foreground">Personalizar Plato en Web</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Editá los detalles públicos para tu menú digital. El plato original en el POS no cambiará.</p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Nombre Público</label>
                <input 
                  type="text" 
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  className="input-field"
                  placeholder={editingPlato.nombre}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Descripción del Plato</label>
                <textarea 
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="input-field resize-none"
                  placeholder="Detallá los ingredientes o preparación..."
                  rows={3}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Foto del Plato</label>
                <div className="flex items-center gap-4">
                  {editImageUrl && (
                    <img src={editImageUrl} alt="Plato" className="w-16 h-16 object-contain rounded shadow-sm border border-border bg-black/5" />
                  )}
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="input-field cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  />
                  {uploadingImage && <span className="text-sm text-muted-foreground animate-pulse">Subiendo...</span>}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-2">
              <button 
                onClick={() => setEditingPlato(null)}
                className="flex-1 bg-muted hover:bg-muted/80 text-foreground py-3 rounded-xl font-bold text-xs border border-border cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleUpdateDishCustomFields}
                className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-bold text-xs border-none cursor-pointer hover:opacity-90 transition-all"
              >
                Guardar Personalización
              </button>
            </div>
          </div>
        </div>
      )}
      
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

// ─────────────────────────────────────────────
// MAIN PANEL (tabs after unlock)
// ─────────────────────────────────────────────
type Tab = "usuarios" | "carta" | "categorias" | "mesas" | "digitalMenu";

function SoportePanel() {
  const [activeTab, setActiveTab] = useState<Tab>("carta");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-[32px] pt-[20px] pb-0 border-b border-black/10 dark:border-white/10 shrink-0">
        <div className="flex items-end gap-6">
          <h1 className="font-['Space_Grotesk'] font-bold text-foreground text-2xl pb-4">Panel Soporte</h1>
          <div className="flex gap-1">
            {(["carta", "usuarios", "mesas", "categorias", "digitalMenu"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-4 font-['Space_Grotesk'] font-bold text-[13px] tracking-widest uppercase border-b-2 transition-all bg-transparent cursor-pointer ${activeTab === tab ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
              >
                {tab === "carta" ? "Carta" : tab === "usuarios" ? "Usuarios" : tab === "mesas" ? "Mesas" : tab === "categorias" ? "Categorías" : "Menú Digital"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === "carta" ? <CartaPanel /> : activeTab === "mesas" ? <MesasPanel /> : activeTab === "categorias" ? <CategoriasPanel /> : activeTab === "digitalMenu" ? <DigitalMenuPanel /> : (
          <>
            <UsuariosPanel />
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export function Soporte() {
  const navigate = useNavigate();
  const { loading, isAuthenticated, rol } = useAuth();

  if (loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (rol !== "admin") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-background">
        <h2 className="font-['Space_Grotesk'] font-bold text-foreground text-2xl text-center max-w-md">Acceso Restringido</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md leading-relaxed">El módulo de Soporte está reservado para la administración del negocio. Si eres el dueño, asegúrate de estar usando tu cuenta principal.</p>
        <button onClick={() => navigate("/dashboard")} className="bg-primary text-primary-foreground rounded-xl px-8 py-3 font-bold uppercase text-[12px] tracking-widest shadow-lg hover:opacity-90 transition-all border-none cursor-pointer">Volver al Panel</button>
      </div>
    );
  }

  return <SoportePanel />;
}
