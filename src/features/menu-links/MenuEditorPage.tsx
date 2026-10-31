import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Save,
  Copy,
  Trash2,
  Calendar,
  AlertTriangle,
  Search,
  Sparkles,
  WifiOff,
  RefreshCw,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../shared/hooks/useAuth";
import { supabase } from "../../shared/lib/supabase";
import { ConfirmModal } from "../../shared/components/ConfirmModal";
import type { Menu, MenuItem, CatalogDish, ScheduleMode } from "./lib/types";
import {
  fetchMenuById,
  updateMenu,
  deleteMenu,
  duplicateMenu,
  saveMenuItemsDiff,
  fetchSoldOutForDate,
  normalizeRepoError,
} from "./lib/menuLinksRepo";
import { computeMenuItemsDiff, type DraftMenuItem } from "./lib/menuItemsDiff";
import {
  formatWeekRange,
  isWeekPast,
  getMondayOfWeek,
  validateMenuSchedule,
  validateWeekdays,
} from "./lib/menuSchedule";
import { getBusinessToday, getBusinessIsoDow } from "./lib/menuBusinessDate";
import { MenuDishRow, type MenuDishDraft } from "./components/MenuDishRow";
import { SoldOutTodayPanel } from "./components/SoldOutTodayPanel";

export function MenuEditorPage() {
  const { menuId } = useParams<{ menuId: string }>();
  const navigate = useNavigate();
  const { tenantId } = useAuth();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [existingItems, setExistingItems] = useState<MenuItem[]>([]);
  const [catalogDishes, setCatalogDishes] = useState<CatalogDish[]>([]);
  const [soldOutPlatoIds, setSoldOutPlatoIds] = useState<Set<number>>(new Set());

  // Form draft state
  const [menuName, setMenuName] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("recurring");
  const [weekStart, setWeekStart] = useState("");

  // Map of dish drafts: plato_id -> draft
  const [dishDrafts, setDishDrafts] = useState<Map<number, MenuDishDraft>>(new Map());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Duplicate dialog state
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateToNextWeek, setDuplicateToNextWeek] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  // Delete modal state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [, setDeleting] = useState(false);

  const businessToday = getBusinessToday();
  const todayDow = getBusinessIsoDow();

  if (!tenantId) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-0 bg-background text-muted-foreground text-sm font-['Space_Grotesk']">
        Inicia sesión para editar el menú.
      </div>
    );
  }

  const loadAll = useCallback(async () => {
    if (!tenantId || !menuId) return;
    setLoading(true);
    setError(null);

    try {
      const [{ menu: m, items }, dishesRes, soldOutIds] = await Promise.all([
        fetchMenuById(menuId),
        supabase
          .from("platos")
          .select("id, nombre, precio, categoria, disponible, va_a_cocina, is_extra")
          .eq("tenant_id", tenantId)
          .order("categoria")
          .order("nombre"),
        fetchSoldOutForDate(tenantId, businessToday),
      ]);

      setMenu(m);
      setMenuName(m.name);
      setScheduleMode(m.schedule_mode);
      setWeekStart(m.week_start ?? getMondayOfWeek(businessToday));
      setExistingItems(items);
      setSoldOutPlatoIds(new Set(soldOutIds));

      const dishes = (dishesRes.data ?? []) as CatalogDish[];
      setCatalogDishes(dishes);

      // Build drafts map
      const itemsByPlatoId = new Map(items.map((i) => [i.plato_id, i]));
      const drafts = new Map<number, MenuDishDraft>();

      dishes.forEach((d) => {
        const item = itemsByPlatoId.get(d.id);
        drafts.set(d.id, {
          included: Boolean(item),
          weekdays: item?.weekdays ? [...item.weekdays] : [1, 2, 3, 4, 5, 6, 7],
          sort_order: item?.sort_order ?? 0,
          display_name: item?.display_name ?? "",
        });
      });

      setDishDrafts(drafts);
    } catch (err: unknown) {
      const normalized = normalizeRepoError(err, "No se pudo cargar la información del menú.");
      setError(normalized.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, menuId, businessToday]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleDishDraftChange = useCallback((platoId: number, updated: Partial<MenuDishDraft>) => {
    setDishDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(platoId) ?? {
        included: false,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        sort_order: 0,
        display_name: "",
      };
      next.set(platoId, { ...current, ...updated });
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!menuId || !tenantId) return;

    if (!menuName.trim()) {
      toast.error("El nombre del menú es requerido.");
      return;
    }

    const scheduleValidation = validateMenuSchedule({
      schedule_mode: scheduleMode,
      week_start: scheduleMode === "weekly" ? weekStart : null,
    });

    if (!scheduleValidation.valid) {
      toast.error(scheduleValidation.error ?? "Configuración de horario inválida.");
      return;
    }

    // Build draft items list of included dishes
    const draftItemsList: DraftMenuItem[] = [];
    for (const [platoId, draft] of dishDrafts.entries()) {
      if (draft.included) {
        const weekdaysValidation = validateWeekdays(draft.weekdays);
        if (!weekdaysValidation.valid) {
          const dishName = catalogDishes.find((d) => d.id === platoId)?.nombre ?? `Plato #${platoId}`;
          toast.error(`Error en "${dishName}": ${weekdaysValidation.error}`);
          return;
        }

        draftItemsList.push({
          plato_id: platoId,
          weekdays: draft.weekdays,
          sort_order: draft.sort_order,
          display_name: draft.display_name.trim() || null,
        });
      }
    }

    setSaving(true);
    try {
      // 1. Update menu metadata
      const updatedMenu = await updateMenu(menuId, {
        name: menuName.trim(),
        schedule_mode: scheduleMode,
        week_start: scheduleMode === "weekly" ? weekStart : null,
      });
      setMenu(updatedMenu);

      // 2. Compute diff and persist menu_items
      const diff = computeMenuItemsDiff(existingItems, draftItemsList);
      await saveMenuItemsDiff(menuId, tenantId, diff);

      // 3. Reload items
      const { items } = await fetchMenuById(menuId);
      setExistingItems(items);

      toast.success("Menú guardado exitosamente.");
    } catch (err: unknown) {
      const normalized = normalizeRepoError(err, "No se pudo guardar el menú.");
      toast.error(normalized.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDuplicate = () => {
    if (!menu) return;
    setDuplicateName(`${menu.name} (Copia)`);
    setDuplicateToNextWeek(menu.schedule_mode === "weekly");
    setDuplicateOpen(true);
  };

  const handleConfirmDuplicate = async () => {
    if (!menuId || !tenantId) return;
    if (!duplicateName.trim()) {
      toast.error("El nombre del menú duplicado es requerido.");
      return;
    }

    setDuplicating(true);
    try {
      const duplicated = await duplicateMenu(menuId, tenantId, {
        newName: duplicateName.trim(),
        nextWeek: duplicateToNextWeek,
      });
      toast.success("Menú duplicado con éxito.");
      setDuplicateOpen(false);
      navigate(`/menu-links/menus/${duplicated.id}`);
    } catch (err: unknown) {
      const normalized = normalizeRepoError(err, "No se pudo duplicar el menú.");
      toast.error(normalized.message);
    } finally {
      setDuplicating(false);
    }
  };

  const handleDeleteMenu = async () => {
    if (!menuId) return;
    setDeleting(true);
    try {
      await deleteMenu(menuId);
      toast.success("Menú eliminado exitosamente.");
      setConfirmDeleteOpen(false);
      navigate("/menu-links");
    } catch (err: unknown) {
      const normalized = normalizeRepoError(err, "No se pudo eliminar el menú.");
      toast.error(normalized.message);
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  // Group dishes into regular dishes (grouped by category) and extras
  const { regularGrouped, extrasList } = useMemo(() => {
    const regular: Record<string, CatalogDish[]> = {};
    const extras: CatalogDish[] = [];

    const term = search.toLowerCase().trim();

    catalogDishes.forEach((d) => {
      if (term && !d.nombre.toLowerCase().includes(term) && !d.categoria.toLowerCase().includes(term)) {
        return;
      }

      if (d.is_extra) {
        extras.push(d);
      } else {
        const cat = d.categoria || "General";
        if (!regular[cat]) regular[cat] = [];
        regular[cat].push(d);
      }
    });

    return { regularGrouped: regular, extrasList: extras };
  }, [catalogDishes, search]);

  // Dishes included in menu that are active today (for "Agotado hoy" panel)
  const dishesToday = useMemo(() => {
    const list: Array<{ plato: CatalogDish; displayName?: string | null }> = [];
    catalogDishes.forEach((d) => {
      const draft = dishDrafts.get(d.id);
      if (draft?.included && draft.weekdays.includes(todayDow)) {
        list.push({ plato: d, displayName: draft.display_name });
      }
    });
    return list;
  }, [catalogDishes, dishDrafts, todayDow]);

  const isWeekly = scheduleMode === "weekly";
  const isPast = isWeekly && weekStart ? isWeekPast(weekStart, businessToday) : false;

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 bg-background text-muted-foreground gap-3">
        <RefreshCw className="size-6 animate-spin text-primary" />
        <span className="text-xs font-semibold">Cargando editor del menú...</span>
      </div>
    );
  }

  if (error && !menu) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 bg-background p-6 gap-4">
        <WifiOff className="size-8 text-destructive" />
        <p className="text-base font-bold text-foreground">{error}</p>
        <button
          onClick={() => void loadAll()}
          className="py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-card/70 backdrop-blur-sm flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/menu-links")}
            className="p-2 rounded-xl border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Volver a Links de menú"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Editor de Menú
              </span>
              {isWeekly && isPast && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <AlertTriangle className="size-3" />
                  Vencido
                </span>
              )}
            </div>
            <input
              type="text"
              value={menuName}
              onChange={(e) => setMenuName(e.target.value)}
              placeholder="Nombre del menú"
              className="text-lg sm:text-xl font-bold font-['Space_Grotesk'] text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors px-0 py-0.5"
            />
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenDuplicate}
            className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <Copy className="size-4 text-muted-foreground" />
            Duplicar menú
          </button>

          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="p-2 rounded-xl border border-destructive/20 bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors cursor-pointer"
            title="Eliminar menú"
          >
            <Trash2 className="size-4" />
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer shadow-md"
          >
            <Save className="size-4" />
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6 min-h-0">
        {/* Schedule Mode Card */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            <h3 className="text-sm font-bold font-['Space_Grotesk'] text-foreground">
              Programación y vigencia
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mode selection buttons */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Modo de repetición
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode("recurring")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                    scheduleMode === "recurring"
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Recurrente (se repite cada semana)
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode("weekly")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                    scheduleMode === "weekly"
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Semanal (solo una semana)
                </button>
              </div>
            </div>

            {/* Week picker (shown when scheduleMode === 'weekly') */}
            {scheduleMode === "weekly" && (
              <div className="flex flex-col gap-1.5 animate-in fade-in duration-150">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Semana del menú (inicia en lunes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={weekStart}
                    onChange={(e) => {
                      const selected = e.target.value;
                      if (!selected) return;
                      // Enforce Monday storage
                      const monday = getMondayOfWeek(selected);
                      setWeekStart(monday);
                    }}
                    className="flex-1 px-3 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                  <div className="px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs font-semibold text-foreground shrink-0">
                    {formatWeekRange(weekStart)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* "Agotado hoy" panel */}
        <SoldOutTodayPanel
          tenantId={tenantId}
          dishesToday={dishesToday}
          soldOutPlatoIds={soldOutPlatoIds}
          onToggleSoldOut={(platoId, isSoldOut) => {
            setSoldOutPlatoIds((prev) => {
              const next = new Set(prev);
              if (isSoldOut) next.add(platoId);
              else next.delete(platoId);
              return next;
            });
          }}
        />

        {/* Dishes Selection Section */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="size-4 text-primary" />
              <h3 className="text-base font-bold font-['Space_Grotesk'] text-foreground">
                Platos de la carta
              </h3>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar plato o categoría..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Grouped regular dishes */}
          {Object.keys(regularGrouped).length === 0 && extrasList.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-dashed border-border">
              No se encontraron platos en el catálogo.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(regularGrouped).map(([category, dishes]) => (
                <div key={category} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 pb-1 border-b border-border/80">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {category}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70 font-mono">
                      ({dishes.length})
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {dishes.map((plato) => {
                      const draft = dishDrafts.get(plato.id) ?? {
                        included: false,
                        weekdays: [1, 2, 3, 4, 5, 6, 7],
                        sort_order: 0,
                        display_name: "",
                      };
                      return (
                        <MenuDishRow
                          key={plato.id}
                          plato={plato}
                          draft={draft}
                          onChange={(updated) => handleDishDraftChange(plato.id, updated)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Extras Section */}
              {extrasList.length > 0 && (
                <div className="flex flex-col gap-2.5 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 pb-1 border-b border-border/80">
                    <Sparkles className="size-3.5 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      Extras y Adiciones
                    </span>
                    <span className="text-[10px] text-muted-foreground/70 font-mono">
                      ({extrasList.length})
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {extrasList.map((plato) => {
                      const draft = dishDrafts.get(plato.id) ?? {
                        included: false,
                        weekdays: [1, 2, 3, 4, 5, 6, 7],
                        sort_order: 0,
                        display_name: "",
                      };
                      return (
                        <MenuDishRow
                          key={plato.id}
                          plato={plato}
                          draft={draft}
                          onChange={(updated) => handleDishDraftChange(plato.id, updated)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Duplicate Menu Modal */}
      {duplicateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-6 flex flex-col gap-4 text-card-foreground">
            <div>
              <h3 className="text-lg font-bold font-['Space_Grotesk'] text-foreground">Duplicar menú</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Crea una copia de este menú y todos sus platos configurados.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase">Nombre del nuevo menú</label>
              <input
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {menu?.schedule_mode === "weekly" && (
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/30 border border-border cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={duplicateToNextWeek}
                  onChange={(e) => setDuplicateToNextWeek(e.target.checked)}
                  className="size-4 rounded border-border text-primary focus:ring-primary"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">A la semana siguiente (+7 días)</span>
                  <span className="text-[10px] text-muted-foreground">
                    Programa el nuevo menú para iniciar el siguiente lunes.
                  </span>
                </div>
              </label>
            )}

            <div className="flex gap-2.5 mt-2">
              <button
                type="button"
                onClick={handleConfirmDuplicate}
                disabled={duplicating}
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer shadow-md"
              >
                {duplicating ? "Duplicando..." : "Confirmar y Abrir"}
              </button>
              <button
                type="button"
                onClick={() => setDuplicateOpen(false)}
                disabled={duplicating}
                className="py-2.5 px-4 rounded-xl bg-muted text-muted-foreground font-bold text-xs uppercase tracking-wider hover:text-foreground cursor-pointer border border-border"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Menu Confirmation */}
      <ConfirmModal
        open={confirmDeleteOpen}
        title="Eliminar menú"
        message={`¿Estás seguro de eliminar el menú "${menu?.name}"? Si está asignado a uno o más links, la eliminación será bloqueada.`}
        variant="danger"
        onConfirm={handleDeleteMenu}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
