import { useState, useEffect } from "react";
import { X, Plus, AlertCircle, Building2 } from "lucide-react";
import { toast } from "sonner";
import type { Menu, MenuLink } from "../lib/types";
import { listCustomers, type Customer } from "../../clientes/lib/customers";
import { createMenuLink, createMenu, normalizeRepoError } from "../lib/menuLinksRepo";
import { getBusinessToday } from "../lib/menuBusinessDate";
import { getMondayOfWeek } from "../lib/menuSchedule";
import { DatePicker } from "../../../shared/ui/date-picker";

interface NewLinkDialogProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  sucursalId?: string | null;
  menus: Menu[];
  onCreated: (newLink: MenuLink) => void;
  onRefreshMenus: () => Promise<void>;
}

export function NewLinkDialog({
  open,
  onClose,
  tenantId,
  sucursalId,
  menus,
  onCreated,
  onRefreshMenus,
}: NewLinkDialogProps) {
  const [label, setLabel] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  const [allowExtras, setAllowExtras] = useState(false);

  // Quick new menu creation inline
  const [creatingNewMenu, setCreatingNewMenu] = useState(false);
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuMode, setNewMenuMode] = useState<"recurring" | "weekly">("recurring");
  const [newMenuWeekStart, setNewMenuWeekStart] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setSelectedCustomerId("");
    setSelectedMenuId(menus[0]?.id ?? "");
    setAllowExtras(false);
    setCreatingNewMenu(false);
    setNewMenuName("");
    setNewMenuMode("recurring");
    setNewMenuWeekStart(getMondayOfWeek(getBusinessToday()));
    setError("");

    setLoadingCustomers(true);
    listCustomers(tenantId)
      .then((data) => {
        setCustomers(data);
        if (data.length > 0) setSelectedCustomerId(data[0].id);
      })
      .catch((err) => {
        console.warn("Error al cargar clientes:", err);
      })
      .finally(() => setLoadingCustomers(false));
  }, [open, tenantId, menus]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sucursalId) {
      setError("Seleccioná una sucursal antes de crear un link.");
      return;
    }

    if (!label.trim()) {
      setError("La etiqueta del link es obligatoria.");
      return;
    }

    if (!selectedCustomerId) {
      setError("Debes seleccionar una empresa o cliente.");
      return;
    }

    let menuId = selectedMenuId;

    setSaving(true);
    setError("");

    try {
      // If user selected to create a new menu inline
      if (creatingNewMenu) {
        if (!newMenuName.trim()) {
          setError("El nombre del nuevo menú es obligatorio.");
          setSaving(false);
          return;
        }

        const createdMenu = await createMenu({
          tenantId,
          sucursalId,
          name: newMenuName.trim(),
          scheduleMode: newMenuMode,
          weekStart: newMenuMode === "weekly" ? newMenuWeekStart : null,
        });
        menuId = createdMenu.id;
        await onRefreshMenus();
      }

      if (!menuId) {
        setError("Debes seleccionar o crear un menú para este link.");
        setSaving(false);
        return;
      }

      const newLink = await createMenuLink({
        tenantId,
        sucursalId,
        menuId,
        label: label.trim(),
        linkType: "company",
        customerId: selectedCustomerId,
        allowExtras,
      });

      toast.success("Link de menú corporativo creado exitosamente.");
      onCreated(newLink);
      onClose();
    } catch (err: unknown) {
      const normalized = normalizeRepoError(err, "No se pudo crear el link.");
      setError(normalized.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl p-6 flex flex-col gap-5 text-card-foreground max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Cerrar"
        >
          <X className="size-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold font-['Space_Grotesk'] text-foreground">Nuevo link de menú</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Genera un enlace de menú digital para una empresa con horarios y reglas específicas.
          </p>
        </div>

        {!sucursalId && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
            <AlertCircle className="size-4 shrink-0" />
            <span>Seleccioná una sucursal antes de crear un link.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Label input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Etiqueta o nombre del link
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. Almuerzo Empresa Alfa, Sucursal Norte, etc."
              className="w-full px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Company customer picker (always required) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="size-3.5" />
              Empresa asignada (requerida)
            </label>
            {loadingCustomers ? (
              <div className="text-xs text-muted-foreground py-2">Cargando empresas...</div>
            ) : customers.length === 0 ? (
              <div className="text-xs text-amber-500 py-1 flex items-center gap-1">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>No se encontraron empresas. Registra un cliente primero en la sección Clientes.</span>
              </div>
            ) : (
              <select
                value={selectedCustomerId}
                required
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                <option value="" disabled>Selecciona una empresa...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.document_id ? `(${c.document_id})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Menu picker or create new menu */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Menú asignado
              </label>
              <button
                type="button"
                onClick={() => setCreatingNewMenu((prev) => !prev)}
                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="size-3.5" />
                {creatingNewMenu ? "Elegir existente" : "Crear nuevo menú"}
              </button>
            </div>

            {creatingNewMenu ? (
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Nombre del menú</label>
                  <input
                    type="text"
                    value={newMenuName}
                    onChange={(e) => setNewMenuName(e.target.value)}
                    placeholder="Ej. Menú Ejecutivo Semanal"
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-muted-foreground">Tipo de horario</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewMenuMode("recurring")}
                      className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        newMenuMode === "recurring"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Recurrente semanal
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMenuMode("weekly")}
                      className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        newMenuMode === "weekly"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Semana específica
                    </button>
                  </div>
                </div>

                {newMenuMode === "weekly" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-muted-foreground">
                      Fecha del lunes de inicio
                    </label>
                    <DatePicker
                      aria-label="Fecha del lunes de inicio"
                      value={newMenuWeekStart}
                      onChange={(selected) => {
                        if (!selected) return;
                        setNewMenuWeekStart(getMondayOfWeek(selected));
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <select
                value={selectedMenuId}
                onChange={(e) => setSelectedMenuId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                {menus.length === 0 ? (
                  <option value="">No hay menús. Crea uno arriba.</option>
                ) : (
                  menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.schedule_mode === "weekly" ? "Semanal" : "Recurrente"})
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Extras toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">Permitir platos extras</span>
              <span className="text-[11px] text-muted-foreground">
                Habilita platos con costo adicional marcados como "Extra" en el catálogo.
              </span>
            </div>
            <input
              type="checkbox"
              id="allowExtrasToggle"
              checked={allowExtras}
              onChange={(e) => setAllowExtras(e.target.checked)}
              className="size-4 accent-primary rounded cursor-pointer"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="py-2.5 px-4 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !sucursalId || customers.length === 0}
              className="py-2.5 px-6 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shadow-md"
            >
              {saving ? "Creando..." : "Crear link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
